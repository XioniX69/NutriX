/* =========================================================================
   NUTRIX — Cloudflare Worker (worker/worker.js)
   • AI-расчёт КБЖУ через OpenRouter (openai/gpt-4o-mini)
   • Телеметрия и админ-статистика (X-Telegram-Init-Data HMAC-SHA256)
   • Полный API режима «Семья» на Cloudflare D1 (только реальные юзеры NutriX)
   • Telegram Bot уведомления от маскота Нико (достижения с анти-спамом 1/день,
     «Ужин готов», срочный дозаказ в магазине, inline-кнопка «Отбить пять»)
   ========================================================================= */

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data"
};

function jsonRes(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
    });
}

function getTodayDateStr() {
    return new Date().toISOString().slice(0, 10);
}

function randomCode(len = 6) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => chars[b % chars.length]).join("");
}

/* =========================================================================
   ВЕРИФИКАЦИЯ TELEGRAM INIT DATA (HMAC-SHA256)
   ========================================================================= */
async function hmacSha256(keyBytes, dataStr) {
    const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dataStr));
    return new Uint8Array(sig);
}

function toHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTelegramInitData(initData, botToken) {
    if (!initData || !botToken) return null;
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get("hash");
        if (!hash) return null;
        params.delete("hash");

        const entries = Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

        const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
        const computed = toHex(await hmacSha256(secretKey, dataCheckString));
        if (computed !== hash.toLowerCase()) return null;

        const userStr = params.get("user");
        if (!userStr) return null;
        const user = JSON.parse(userStr);
        if (!user?.id) return null;
        return {
            id: Number(user.id),
            first_name: String(user.first_name || "Участник").slice(0, 40),
            username: String(user.username || "").slice(0, 40)
        };
    } catch (e) {
        return null;
    }
}

/* =========================================================================
   TELEGRAM BOT API (УВЕДОМЛЕНИЯ ОТ МАСКОТА НИКО)
   ========================================================================= */
async function sendTelegramMessage(env, chatId, text, replyMarkup = null) {
    if (!env.TELEGRAM_BOT_TOKEN || !chatId) return false;
    try {
        const body = {
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
        };
        if (replyMarkup) body.reply_markup = replyMarkup;
        const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function answerCallbackQuery(env, callbackQueryId, text = "") {
    if (!env.TELEGRAM_BOT_TOKEN || !callbackQueryId) return;
    try {
        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: callbackQueryId, text })
        });
    } catch (e) {}
}

function escapeHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/* =========================================================================
   ХЕЛПЕРЫ ДЛЯ D1 СЕМЬИ
   ========================================================================= */
async function getUserFamilyRow(db, tgId) {
    return await db.prepare(`
        SELECT f.*, m.role AS my_role, m.share_wins AS my_share_wins
        FROM family_members m
        JOIN families f ON f.id = m.family_id
        WHERE m.tg_id = ?
        LIMIT 1
    `).bind(tgId).first();
}

async function buildFamilySnapshot(db, familyId, myTgId, botUsername = "") {
    const fam = await db.prepare(`SELECT * FROM families WHERE id = ?`).bind(familyId).first();
    if (!fam) return null;

    const [membersRes, sharedRes, eatOutRes, voteRes, checksRes, urgentRes] = await Promise.all([
        db.prepare(`
            SELECT tg_id, first_name, username, role, daily_kcal, meals_count,
                   preferences_text, streak_days, share_wins, grocery_contrib_json,
                   in_store_since, last_day_done_date, joined_at
            FROM family_members WHERE family_id = ? ORDER BY joined_at ASC
        `).bind(familyId).all(),
        db.prepare(`
            SELECT day_index, slot_key, recipe_id, dish_title, cook_tg_id, cook_name, updated_at
            FROM family_shared_meals WHERE family_id = ?
        `).bind(familyId).all(),
        db.prepare(`
            SELECT date_str, slot_key, tg_id FROM family_eating_out
            WHERE family_id = ? AND date_str >= ?
        `).bind(familyId, new Date(Date.now() - 86400000).toISOString().slice(0, 10)).all(),
        db.prepare(`
            SELECT * FROM family_dinner_votes
            WHERE family_id = ? AND status = 'open'
            ORDER BY created_at DESC LIMIT 1
        `).bind(familyId).first(),
        db.prepare(`
            SELECT item_key, checked, actor_tg_id, actor_name, updated_at
            FROM family_grocery_checks WHERE family_id = ?
        `).bind(familyId).all(),
        db.prepare(`
            SELECT id, name, note, added_by_tg_id, added_by_name, checked, created_at, updated_at
            FROM family_grocery_urgent WHERE family_id = ? ORDER BY created_at DESC LIMIT 40
        `).bind(familyId).all()
    ]);

    const now = Date.now();
    const members = (membersRes.results || []).map(m => ({
        tgId: m.tg_id,
        firstName: m.first_name,
        username: m.username || "",
        role: m.role,
        dailyKcal: m.daily_kcal,
        mealsCount: m.meals_count,
        preferencesText: m.preferences_text || "",
        streakDays: m.streak_days || 0,
        shareWins: Boolean(m.share_wins),
        inStore: Boolean(m.in_store_since && (now - m.in_store_since) < 3 * 3600 * 1000),
        lastDayDoneDate: m.last_day_done_date || "",
        groceryContrib: safeJsonParse(m.grocery_contrib_json, [])
    }));

    const sharedMeals = {};
    (sharedRes.results || []).forEach(r => {
        sharedMeals[`${r.day_index}:${r.slot_key}`] = {
            dayIndex: r.day_index,
            slotKey: r.slot_key,
            recipeId: r.recipe_id,
            dishTitle: r.dish_title,
            cookTgId: r.cook_tg_id || null,
            cookName: r.cook_name || "",
            updatedAt: r.updated_at
        };
    });

    const eatingOut = {};
    (eatOutRes.results || []).forEach(r => {
        const k = `${r.date_str}:${r.slot_key}`;
        if (!eatingOut[k]) eatingOut[k] = [];
        eatingOut[k].push(r.tg_id);
    });

    const groceryChecks = {};
    (checksRes.results || []).forEach(r => {
        if (r.checked) {
            groceryChecks[r.item_key] = {
                checked: true,
                actorTgId: r.actor_tg_id,
                actorName: r.actor_name,
                updatedAt: r.updated_at
            };
        }
    });

    const activeVote = voteRes ? {
        id: voteRes.id,
        dayIndex: voteRes.day_index,
        slotKey: voteRes.slot_key,
        status: voteRes.status,
        candidates: safeJsonParse(voteRes.candidates_json, []),
        votes: safeJsonParse(voteRes.votes_json, {}),
        createdBy: voteRes.created_by,
        createdAt: voteRes.created_at
    } : null;

    const cleanBot = (botUsername || "").replace(/^@/, "");
    return {
        id: fam.id,
        name: fam.name,
        inviteCode: fam.invite_code,
        inviteLink: cleanBot ? `https://t.me/${cleanBot}/app?startapp=fam_${fam.invite_code}` : "",
        ownerTgId: fam.owner_tg_id,
        myTgId,
        sharedSlots: safeJsonParse(fam.shared_slots_json, ["dinner"]),
        coopStreak: fam.coop_streak || 0,
        lastCoopDate: fam.last_coop_date || null,
        members,
        sharedMeals,
        eatingOut,
        activeVote,
        groceryChecks,
        urgentItems: (urgentRes.results || []).map(u => ({
            id: u.id,
            name: u.name,
            note: u.note || "",
            addedByTgId: u.added_by_tg_id,
            addedByName: u.added_by_name,
            checked: Boolean(u.checked),
            createdAt: u.created_at
        })),
        serverTime: now
    };
}

function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
}

/* =========================================================================
   УВЕДОМЛЕНИЯ НИКО О ДОСТИЖЕНИЯХ СЕМЬИ (С ЛИМИТОМ 1/ДЕНЬ НА ПОЛУЧАТЕЛЯ)
   ========================================================================= */
async function dispatchNikoAchievement(env, db, fam, actor, eventType, payload = {}) {
    const today = getTodayDateStr();
    const others = await db.prepare(`
        SELECT tg_id, first_name FROM family_members
        WHERE family_id = ? AND tg_id != ?
    `).bind(fam.id, actor.id).all();

    const recipients = others.results || [];
    if (!recipients.length) return 0;

    let text = "";
    let btnLabel = "Отбить пять";
    let cbData = `hf:${actor.id}:${eventType}`;

    if (eventType === "streak") {
        const days = Number(payload.days) || 3;
        text = `<b>Нико · NutriX</b>\n${escapeHtml(actor.first_name)} держит ритм уже <b>${days} дн. подряд</b>. Отличная стабильность в семье «${escapeHtml(fam.name)}»!`;
    } else if (eventType === "grocery_done") {
        const periodLbl = payload.periodLabel || "ближайшие дни";
        text = `<b>Нико · NutriX</b>\n${escapeHtml(actor.first_name)} закрыл(а) семейную закупку на ${escapeHtml(periodLbl)} — на кухне снова полный комплект.`;
        btnLabel = "Сказать спасибо";
        cbData = `thx:${actor.id}:grocery`;
    } else if (eventType === "coop_day") {
        const streak = Number(payload.coopStreak) || 1;
        text = `<b>Нико · NutriX</b>\nВся семья «${escapeHtml(fam.name)}» сегодня на 100% в плане! Общая серия: <b>${streak} дн.</b>`;
    } else if (eventType === "day_done") {
        text = `<b>Нико · NutriX</b>\n${escapeHtml(actor.first_name)} закрыл(а) сегодняшний план питания на 100%.`;
    } else {
        return 0;
    }

    let sent = 0;
    for (const r of recipients) {
        // Жёсткий анти-спам: максимум 1 пуш о чужом достижении в сутки на получателя
        const already = await db.prepare(`
            SELECT id FROM family_achievement_pushes
            WHERE recipient_tg_id = ? AND date_str = ? LIMIT 1
        `).bind(r.tg_id, today).first();
        if (already) continue;

        const ok = await sendTelegramMessage(env, r.tg_id, text, {
            inline_keyboard: [[{ text: btnLabel, callback_data: cbData }]]
        });
        if (ok) {
            await db.prepare(`
                INSERT INTO family_achievement_pushes (id, family_id, actor_tg_id, recipient_tg_id, event_type, date_str, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(crypto.randomUUID(), fam.id, actor.id, r.tg_id, eventType, today, Date.now()).run();
            sent++;
        }
    }
    return sent;
}

/* =========================================================================
   AI-РАСЧЁТ КБЖУ (OPENROUTER)
   ========================================================================= */
async function handleAiNutrition(request, env) {
    const body = await request.json().catch(() => ({}));
    const desc = String(body.food_description || "").trim();
    if (!desc) return jsonRes({ error: "food_description required" }, 400);
    if (!env.OPENROUTER_API_KEY) return jsonRes({ error: "OPENROUTER_API_KEY missing" }, 503);

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "Ты нутрициолог. Верни строго JSON без пояснений: {\"kcal\": number, \"protein\": number, \"fat\": number, \"carbs\": number} для указанного блюда/продукта с учётом бренда и веса."
                },
                { role: "user", content: desc }
            ]
        })
    });

    if (!res.ok) return jsonRes({ error: "AI upstream error" }, 502);
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    const parsed = safeJsonParse(raw, {});
    return jsonRes({
        kcal: Math.round(Number(parsed.kcal) || 320),
        protein: Math.round(Number(parsed.protein) || 16),
        fat: Math.round(Number(parsed.fat) || 12),
        carbs: Math.round(Number(parsed.carbs) || 34)
    });
}

/* =========================================================================
   ГЛАВНЫЙ ROUTER WORKER
   ========================================================================= */
export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, "") || "/";

        // 1. Telegram Bot Webhook (обработка inline-кнопок «Отбить пять» и «Сказать спасибо»)
        if (path === "/bot/webhook" && request.method === "POST") {
            const update = await request.json().catch(() => ({}));
            const cq = update?.callback_query;
            if (cq?.data) {
                const fromName = cq.from?.first_name || "Участник семьи";
                const parts = String(cq.data).split(":");
                const action = parts[0];
                const targetTgId = Number(parts[1]);
                if (targetTgId && targetTgId !== cq.from?.id) {
                    const replyText = action === "thx"
                        ? `<b>Нико · NutriX</b>\n${escapeHtml(fromName)} передал(а) тебе спасибо за семейную закупку!`
                        : `<b>Нико · NutriX</b>\n${escapeHtml(fromName)} отбил(а) тебе пять за отличный результат!`;
                    await sendTelegramMessage(env, targetTgId, replyText);
                }
                await answerCallbackQuery(env, cq.id, action === "thx" ? "Спасибо отправлено!" : "Пять передано!");
            }
            return jsonRes({ ok: true });
        }

        // 2. Корневой AI-расчёт КБЖУ
        if (path === "/" && request.method === "POST") {
            return handleAiNutrition(request, env);
        }

        // 3. Телеметрия /ping
        if (path === "/ping" && request.method === "POST") {
            const body = await request.json().catch(() => ({}));
            const tgId = Number(body.tg_id);
            if (env.DB && tgId) {
                await env.DB.prepare(`
                    INSERT INTO telemetry_users (tg_id, platform, db_count, last_seen)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(tg_id) DO UPDATE SET platform=excluded.platform, db_count=excluded.db_count, last_seen=excluded.last_seen
                `).bind(tgId, String(body.platform || "web"), Number(body.db_count) || 0, Date.now()).run();
            }
            return jsonRes({ ok: true });
        }

        // 4. Админ-статистика (строго с проверкой HMAC initData)
        if (path === "/admin/stats" && request.method === "GET") {
            const tgUser = await verifyTelegramInitData(request.headers.get("X-Telegram-Init-Data"), env.TELEGRAM_BOT_TOKEN);
            const admins = String(env.ADMIN_TG_IDS || "1696224717").split(",").map(s => Number(s.trim()));
            if (!tgUser || !admins.includes(tgUser.id)) {
                return jsonRes({ error: "Unauthorized" }, 403);
            }
            if (!env.DB) return jsonRes({ online_5m: 1, total_users: 1, ai_requests: 0 });
            const fiveMinAgo = Date.now() - 5 * 60 * 1000;
            const online = await env.DB.prepare(`SELECT COUNT(*) AS c FROM telemetry_users WHERE last_seen >= ?`).bind(fiveMinAgo).first();
            const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM telemetry_users`).first();
            return jsonRes({
                online_5m: online?.c || 1,
                total_users: total?.c || 1,
                ai_requests: 0
            });
        }

        // 5. Все эндпоинты /family/* требуют реального авторизованного пользователя Telegram NutriX
        if (path.startsWith("/family/")) {
            if (!env.DB) return jsonRes({ error: "D1 database (DB) is not configured" }, 503);

            const tgUser = await verifyTelegramInitData(request.headers.get("X-Telegram-Init-Data"), env.TELEGRAM_BOT_TOKEN);
            if (!tgUser) {
                return jsonRes({ error: "Требуется авторизация через Telegram Mini App" }, 401);
            }

            const db = env.DB;
            const botUser = env.BOT_USERNAME || "";
            const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
            const now = Date.now();

            // GET /family/me
            if (path === "/family/me" && request.method === "GET") {
                const row = await getUserFamilyRow(db, tgUser.id);
                if (!row) return jsonRes({ family: null, botUsername: botUser });
                const snapshot = await buildFamilySnapshot(db, row.id, tgUser.id, botUser);
                return jsonRes({ family: snapshot, botUsername: botUser });
            }

            // POST /family/create
            if (path === "/family/create" && request.method === "POST") {
                const existing = await getUserFamilyRow(db, tgUser.id);
                if (existing) {
                    const snap = await buildFamilySnapshot(db, existing.id, tgUser.id, botUser);
                    return jsonRes({ family: snap });
                }
                const name = String(body.name || "Моя семья").trim().slice(0, 32) || "Моя семья";
                const sharedSlots = Array.isArray(body.sharedSlots) && body.sharedSlots.length
                    ? body.sharedSlots.filter(s => ["breakfast", "lunch", "snack", "dinner"].includes(s))
                    : ["dinner"];
                const famId = crypto.randomUUID();
                const code = randomCode(6);

                await db.prepare(`
                    INSERT INTO families (id, name, invite_code, owner_tg_id, shared_slots_json, coop_streak, created_at)
                    VALUES (?, ?, ?, ?, ?, 0, ?)
                `).bind(famId, name, code, tgUser.id, JSON.stringify(sharedSlots), now).run();

                await db.prepare(`
                    INSERT INTO family_members (family_id, tg_id, first_name, username, role, daily_kcal, meals_count, preferences_text, streak_days, share_wins, joined_at, updated_at)
                    VALUES (?, ?, ?, ?, 'owner', ?, ?, ?, ?, 1, ?, ?)
                `).bind(
                    famId, tgUser.id, tgUser.first_name, tgUser.username,
                    Math.max(1000, Math.min(6000, Number(body.dailyKcal) || 2000)),
                    Number(body.mealsCount) || 4,
                    String(body.preferencesText || "").slice(0, 200),
                    Number(body.streakDays) || 0,
                    now, now
                ).run();

                const snap = await buildFamilySnapshot(db, famId, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/join (только реальный Telegram-пользователь NutriX)
            if (path === "/family/join" && request.method === "POST") {
                const code = String(body.inviteCode || "").trim().toUpperCase().replace(/^FAM_/, "");
                if (!code || code.length < 4) return jsonRes({ error: "Неверный код приглашения" }, 400);

                const fam = await db.prepare(`SELECT * FROM families WHERE invite_code = ?`).bind(code).first();
                if (!fam) return jsonRes({ error: "Семья по этому коду не найдена" }, 404);

                const prev = await getUserFamilyRow(db, tgUser.id);
                if (prev && prev.id !== fam.id) {
                    return jsonRes({ error: "Сначала выйди из текущей семьи, чтобы вступить в новую" }, 409);
                }

                const countRow = await db.prepare(`SELECT COUNT(*) AS c FROM family_members WHERE family_id = ?`).bind(fam.id).first();
                if (!prev && (countRow?.c || 0) >= 6) {
                    return jsonRes({ error: "В семье уже максимум участников (6)" }, 409);
                }

                if (!prev) {
                    await db.prepare(`
                        INSERT INTO family_members (family_id, tg_id, first_name, username, role, daily_kcal, meals_count, preferences_text, streak_days, share_wins, joined_at, updated_at)
                        VALUES (?, ?, ?, ?, 'member', ?, ?, ?, ?, 1, ?, ?)
                    `).bind(
                        fam.id, tgUser.id, tgUser.first_name, tgUser.username,
                        Math.max(1000, Math.min(6000, Number(body.dailyKcal) || 2000)),
                        Number(body.mealsCount) || 4,
                        String(body.preferencesText || "").slice(0, 200),
                        Number(body.streakDays) || 0,
                        now, now
                    ).run();

                    // Нико уведомляет владельца о новом участнике
                    await sendTelegramMessage(
                        env,
                        fam.owner_tg_id,
                        `<b>Нико · NutriX</b>\n${escapeHtml(tgUser.first_name)} присоединился(ась) к семье «${escapeHtml(fam.name)}». Общие блюда и корзина уже синхронизируются!`
                    );
                }

                const snap = await buildFamilySnapshot(db, fam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // Для остальных роутов пользователь должен уже состоять в семье
            const myFam = await getUserFamilyRow(db, tgUser.id);
            if (!myFam) return jsonRes({ error: "Ты не состоишь в семье" }, 404);

            // POST /family/leave
            if (path === "/family/leave" && request.method === "POST") {
                await db.prepare(`DELETE FROM family_members WHERE family_id = ? AND tg_id = ?`).bind(myFam.id, tgUser.id).run();
                const left = await db.prepare(`SELECT tg_id FROM family_members WHERE family_id = ? ORDER BY joined_at ASC LIMIT 1`).bind(myFam.id).first();
                if (!left) {
                    await db.prepare(`DELETE FROM families WHERE id = ?`).bind(myFam.id).run();
                } else if (myFam.owner_tg_id === tgUser.id) {
                    await db.prepare(`UPDATE families SET owner_tg_id = ? WHERE id = ?`).bind(left.tg_id, myFam.id).run();
                    await db.prepare(`UPDATE family_members SET role = 'owner' WHERE family_id = ? AND tg_id = ?`).bind(myFam.id, left.tg_id).run();
                }
                return jsonRes({ family: null });
            }

            // POST /family/remove-member (только владелец)
            if (path === "/family/remove-member" && request.method === "POST") {
                if (myFam.owner_tg_id !== tgUser.id) return jsonRes({ error: "Только создатель семьи может удалять участников" }, 403);
                const targetId = Number(body.targetTgId);
                if (!targetId || targetId === tgUser.id) return jsonRes({ error: "Некорректный участник" }, 400);
                await db.prepare(`DELETE FROM family_members WHERE family_id = ? AND tg_id = ?`).bind(myFam.id, targetId).run();
                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/settings
            if (path === "/family/settings" && request.method === "POST") {
                if (body.name && myFam.owner_tg_id === tgUser.id) {
                    await db.prepare(`UPDATE families SET name = ? WHERE id = ?`).bind(String(body.name).trim().slice(0, 32), myFam.id).run();
                }
                if (Array.isArray(body.sharedSlots)) {
                    const cleanSlots = body.sharedSlots.filter(s => ["breakfast", "lunch", "snack", "dinner"].includes(s));
                    await db.prepare(`UPDATE families SET shared_slots_json = ? WHERE id = ?`).bind(JSON.stringify(cleanSlots), myFam.id).run();
                }
                if (typeof body.shareWins === "boolean") {
                    await db.prepare(`UPDATE family_members SET share_wins = ?, updated_at = ? WHERE family_id = ? AND tg_id = ?`)
                        .bind(body.shareWins ? 1 : 0, now, myFam.id, tgUser.id).run();
                }
                if (body.myRole && ["member", "shopper_only"].includes(body.myRole) && myFam.owner_tg_id !== tgUser.id) {
                    await db.prepare(`UPDATE family_members SET role = ?, updated_at = ? WHERE family_id = ? AND tg_id = ?`)
                        .bind(body.myRole, now, myFam.id, tgUser.id).run();
                }
                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/sync-profile (строго без веса/BF%/талии!)
            if (path === "/family/sync-profile" && request.method === "POST") {
                const kcal = Math.max(1000, Math.min(6000, Number(body.dailyKcal) || 2000));
                const mealsCount = Number(body.mealsCount) || 4;
                const prefs = String(body.preferencesText || "").slice(0, 200);
                const streak = Number(body.streakDays) || 0;
                const contrib = Array.isArray(body.groceryContrib) ? body.groceryContrib.slice(0, 120) : [];
                const dayDoneDate = body.todayCompleted ? getTodayDateStr() : "";

                await db.prepare(`
                    UPDATE family_members
                    SET first_name = ?, daily_kcal = ?, meals_count = ?, preferences_text = ?,
                        streak_days = ?, grocery_contrib_json = ?, last_day_done_date = CASE WHEN ? != '' THEN ? ELSE last_day_done_date END,
                        updated_at = ?
                    WHERE family_id = ? AND tg_id = ?
                `).bind(
                    tgUser.first_name, kcal, mealsCount, prefs, streak,
                    JSON.stringify(contrib), dayDoneDate, dayDoneDate, now, myFam.id, tgUser.id
                ).run();

                // Проверяем общий Co-op Streak (все активные участники закрыли сегодняшний день)
                if (dayDoneDate) {
                    const active = await db.prepare(`
                        SELECT tg_id, last_day_done_date FROM family_members
                        WHERE family_id = ? AND role != 'shopper_only'
                    `).bind(myFam.id).all();
                    const list = active.results || [];
                    if (list.length >= 2 && list.every(m => m.last_day_done_date === dayDoneDate) && myFam.last_coop_date !== dayDoneDate) {
                        const nextStreak = (myFam.coop_streak || 0) + 1;
                        await db.prepare(`UPDATE families SET coop_streak = ?, last_coop_date = ? WHERE id = ?`)
                            .bind(nextStreak, dayDoneDate, myFam.id).run();
                        await dispatchNikoAchievement(env, db, myFam, tgUser, "coop_day", { coopStreak: nextStreak });
                    }
                }

                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/shared-meals (синхронизация общего рецепта или дежурного повара)
            if (path === "/family/shared-meals" && request.method === "POST") {
                const dayIndex = Math.max(0, Math.min(6, Number(body.dayIndex) || 0));
                const slotKey = String(body.slotKey || "dinner");
                const recipeId = String(body.recipeId || "");
                const dishTitle = String(body.dishTitle || "").slice(0, 140);
                const cookTgId = body.toggleCook ? (body.setCook ? tgUser.id : null) : (body.cookTgId ?? null);
                const cookName = body.toggleCook ? (body.setCook ? tgUser.first_name : "") : String(body.cookName || "");

                if (recipeId && dishTitle) {
                    await db.prepare(`
                        INSERT INTO family_shared_meals (family_id, day_index, slot_key, recipe_id, dish_title, cook_tg_id, cook_name, updated_by, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(family_id, day_index, slot_key) DO UPDATE SET
                            recipe_id = excluded.recipe_id,
                            dish_title = excluded.dish_title,
                            cook_tg_id = COALESCE(excluded.cook_tg_id, family_shared_meals.cook_tg_id),
                            cook_name = CASE WHEN excluded.cook_tg_id IS NOT NULL THEN excluded.cook_name ELSE family_shared_meals.cook_name END,
                            updated_by = excluded.updated_by,
                            updated_at = excluded.updated_at
                    `).bind(myFam.id, dayIndex, slotKey, recipeId, dishTitle, cookTgId, cookName, tgUser.id, now).run();
                } else if (body.toggleCook) {
                    await db.prepare(`
                        UPDATE family_shared_meals SET cook_tg_id = ?, cook_name = ?, updated_at = ?
                        WHERE family_id = ? AND day_index = ? AND slot_key = ?
                    `).bind(cookTgId, cookName, now, myFam.id, dayIndex, slotKey).run();
                }

                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/eating-out
            if (path === "/family/eating-out" && request.method === "POST") {
                const dateStr = String(body.dateStr || getTodayDateStr()).slice(0, 10);
                const slotKey = String(body.slotKey || "dinner");
                const isOut = Boolean(body.isOut);

                if (isOut) {
                    await db.prepare(`
                        INSERT OR REPLACE INTO family_eating_out (family_id, date_str, slot_key, tg_id, created_at)
                        VALUES (?, ?, ?, ?, ?)
                    `).bind(myFam.id, dateStr, slotKey, tgUser.id, now).run();
                } else {
                    await db.prepare(`
                        DELETE FROM family_eating_out WHERE family_id = ? AND date_str = ? AND slot_key = ? AND tg_id = ?
                    `).bind(myFam.id, dateStr, slotKey, tgUser.id).run();
                }
                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/vote/start
            if (path === "/family/vote/start" && request.method === "POST") {
                const dayIndex = Math.max(0, Math.min(6, Number(body.dayIndex) || 0));
                const slotKey = String(body.slotKey || "dinner");
                const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 5) : [];
                if (candidates.length < 2) return jsonRes({ error: "Нужно минимум 2 варианта блюд" }, 400);

                await db.prepare(`UPDATE family_dinner_votes SET status = 'applied' WHERE family_id = ? AND status = 'open'`).bind(myFam.id).run();
                const voteId = crypto.randomUUID();
                await db.prepare(`
                    INSERT INTO family_dinner_votes (id, family_id, day_index, slot_key, status, candidates_json, votes_json, created_by, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'open', ?, '{}', ?, ?, ?)
                `).bind(voteId, myFam.id, dayIndex, slotKey, JSON.stringify(candidates), tgUser.id, now, now).run();

                const others = await db.prepare(`SELECT tg_id FROM family_members WHERE family_id = ? AND tg_id != ?`).bind(myFam.id, tgUser.id).all();
                for (const r of (others.results || [])) {
                    await sendTelegramMessage(
                        env,
                        r.tg_id,
                        `<b>Нико · Голосование за ужин</b>\n${escapeHtml(tgUser.first_name)} предложил(а) выбрать общее блюдо в NutriX (${candidates.length} варианта). Зайди проголосовать!`
                    );
                }

                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/vote/cast
            if (path === "/family/vote/cast" && request.method === "POST") {
                const voteId = String(body.voteId || "");
                const recipeId = String(body.recipeId || "");
                const score = [-1, 1, 2].includes(Number(body.score)) ? Number(body.score) : 1;

                const voteRow = await db.prepare(`SELECT * FROM family_dinner_votes WHERE id = ? AND family_id = ?`).bind(voteId, myFam.id).first();
                if (!voteRow) return jsonRes({ error: "Голосование не найдено" }, 404);

                const votes = safeJsonParse(voteRow.votes_json, {});
                if (!votes[String(tgUser.id)]) votes[String(tgUser.id)] = {};
                votes[String(tgUser.id)][recipeId] = score;

                await db.prepare(`UPDATE family_dinner_votes SET votes_json = ?, updated_at = ? WHERE id = ?`)
                    .bind(JSON.stringify(votes), now, voteId).run();

                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/vote/apply
            if (path === "/family/vote/apply" && request.method === "POST") {
                const voteId = String(body.voteId || "");
                const winnerRecipeId = String(body.recipeId || "");
                const winnerTitle = String(body.dishTitle || "").slice(0, 140);

                const voteRow = await db.prepare(`SELECT * FROM family_dinner_votes WHERE id = ? AND family_id = ?`).bind(voteId, myFam.id).first();
                if (!voteRow) return jsonRes({ error: "Голосование не найдено" }, 404);

                await db.prepare(`UPDATE family_dinner_votes SET status = 'applied', updated_at = ? WHERE id = ?`).bind(now, voteId).run();
                await db.prepare(`
                    INSERT INTO family_shared_meals (family_id, day_index, slot_key, recipe_id, dish_title, updated_by, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(family_id, day_index, slot_key) DO UPDATE SET
                        recipe_id = excluded.recipe_id,
                        dish_title = excluded.dish_title,
                        updated_by = excluded.updated_by,
                        updated_at = excluded.updated_at
                `).bind(myFam.id, voteRow.day_index, voteRow.slot_key, winnerRecipeId, winnerTitle, tgUser.id, now).run();

                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/grocery/sync (галочки, срочные товары, статус «Я в магазине»)
            if (path === "/family/grocery/sync" && request.method === "POST") {
                if (typeof body.inStore === "boolean") {
                    const ts = body.inStore ? now : 0;
                    await db.prepare(`UPDATE family_members SET in_store_since = ?, updated_at = ? WHERE family_id = ? AND tg_id = ?`)
                        .bind(ts, now, myFam.id, tgUser.id).run();
                    if (body.inStore) {
                        const others = await db.prepare(`SELECT tg_id FROM family_members WHERE family_id = ? AND tg_id != ?`).bind(myFam.id, tgUser.id).all();
                        for (const r of (others.results || [])) {
                            await sendTelegramMessage(
                                env,
                                r.tg_id,
                                `<b>Нико · NutriX</b>\n${escapeHtml(tgUser.first_name)} сейчас в магазине. Нужно что-то захватить? Добавь товар в семейную корзину — он сразу появится сверху.`
                            );
                        }
                    }
                }

                if (body.toggleCheck && body.itemKey) {
                    const key = String(body.itemKey).slice(0, 120);
                    const checked = body.checked ? 1 : 0;
                    await db.prepare(`
                        INSERT INTO family_grocery_checks (family_id, item_key, checked, actor_tg_id, actor_name, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(family_id, item_key) DO UPDATE SET
                            checked = excluded.checked,
                            actor_tg_id = excluded.actor_tg_id,
                            actor_name = excluded.actor_name,
                            updated_at = excluded.updated_at
                    `).bind(myFam.id, key, checked, tgUser.id, tgUser.first_name, now).run();
                }

                if (body.clearChecks) {
                    await db.prepare(`DELETE FROM family_grocery_checks WHERE family_id = ?`).bind(myFam.id).run();
                    await db.prepare(`DELETE FROM family_grocery_urgent WHERE family_id = ? AND checked = 1`).bind(myFam.id).run();
                }

                if (body.addUrgent && body.name) {
                    const name = String(body.name).trim().slice(0, 80);
                    const note = String(body.note || "").trim().slice(0, 100);
                    await db.prepare(`
                        INSERT INTO family_grocery_urgent (id, family_id, name, note, added_by_tg_id, added_by_name, checked, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                    `).bind(crypto.randomUUID(), myFam.id, name, note, tgUser.id, tgUser.first_name, now, now).run();

                    const shoppers = await db.prepare(`
                        SELECT tg_id FROM family_members
                        WHERE family_id = ? AND tg_id != ? AND in_store_since > ?
                    `).bind(myFam.id, tgUser.id, now - 3 * 3600 * 1000).all();
                    for (const s of (shoppers.results || [])) {
                        await sendTelegramMessage(
                            env,
                            s.tg_id,
                            `<b>Нико · Дозаказ в корзину</b>\n${escapeHtml(tgUser.first_name)} просит захватить: <b>${escapeHtml(name)}</b>${note ? ` (${escapeHtml(note)})` : ""}`
                        );
                    }
                }

                if (body.toggleUrgentId) {
                    await db.prepare(`
                        UPDATE family_grocery_urgent SET checked = ?, updated_at = ?
                        WHERE id = ? AND family_id = ?
                    `).bind(body.checked ? 1 : 0, now, String(body.toggleUrgentId), myFam.id).run();
                }

                const snap = await buildFamilySnapshot(db, myFam.id, tgUser.id, botUser);
                return jsonRes({ family: snap });
            }

            // POST /family/notify/dinner-ready
            if (path === "/family/notify/dinner-ready" && request.method === "POST") {
                const dishTitle = String(body.dishTitle || "Общий ужин").slice(0, 140);
                const portions = Array.isArray(body.portions) ? body.portions : [];
                let sent = 0;

                for (const p of portions) {
                    const targetId = Number(p.tgId);
                    if (!targetId || targetId === tgUser.id) continue;
                    const portionText = p.grams ? `Твоя порция — <b>${Math.round(p.grams)} г</b> (${p.pct}%).` : "";
                    const ok = await sendTelegramMessage(
                        env,
                        targetId,
                        `<b>Нико · Ужин готов</b>\n${escapeHtml(tgUser.first_name)} приготовил(а): <b>${escapeHtml(dishTitle)}</b>.\n${portionText}`,
                        { inline_keyboard: [[{ text: "Сказать спасибо", callback_data: `thx:${tgUser.id}:dinner` }]] }
                    );
                    if (ok) sent++;
                }
                return jsonRes({ ok: true, sent });
            }

            // POST /family/notify/achievement
            if (path === "/family/notify/achievement" && request.method === "POST") {
                if (!myFam.my_share_wins) return jsonRes({ ok: true, sent: 0, skipped: "share_wins_off" });
                const sent = await dispatchNikoAchievement(env, db, myFam, tgUser, String(body.eventType || ""), body);
                return jsonRes({ ok: true, sent });
            }

            return jsonRes({ error: "Unknown family endpoint" }, 404);
        }

        return jsonRes({ error: "Not found" }, 404);
    }
};
