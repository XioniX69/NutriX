/* =========================================================================
   NUTRIX — src/family.js
   Модуль режима «Семья»:
   • Только реальные пользователи Telegram NutriX (рост через инвайт-ссылки)
   • Приватность по умолчанию (вес/BF%/талия никогда не уходят в семью)
   • «Одна кастрюля — разные порции» + пересчёт в граммы и визуальные доли
   • Пересечение пищевых ограничений участников на общих слотах
   • Голосование за ужин, статус «Ем вне дома», дежурство, «Ужин готов»
   • Семейная корзина с live-синхронизацией, срочным дозаказом и Co-op серией
   • Уведомления от маскота Нико о достижениях участников
   ========================================================================= */

import {
    getTodayStr,
    getDateStrForWeekDay,
    toRawStoreGrams
} from "./math.js";

import {
    tg,
    store,
    appState,
    getWorkerUrl,
    getWorkerHeaders,
    getCurrentTgUserId,
    getDayTypeTargets,
    syncSelectedDayMeals,
    saveState
} from "./storage.js";

const FAMILY_CACHE_KEY = "nutrix_family_cache_v1";
const PENDING_INVITE_KEY = "nutrix_pending_family_invite";

export const FAMILY_SLOT_LABELS = {
    breakfast: "Завтрак",
    lunch: "Обед",
    snack: "Полдник / Перекус",
    dinner: "Ужин"
};

export const familyStore = {
    family: null,
    botUsername: "",
    pendingInviteCode: null,
    loading: false,
    lastError: "",
    lastSyncAt: 0,
    notifiedStreaks: {}
};

const famHooks = {
    scaleMasterRecipeToMeal: null,
    rebuildGroceryList: null,
    onFamilyChanged: null,
    onToast: null
};

export function registerFamilyHooks(partial) {
    Object.assign(famHooks, partial);
}

/* =========================================================================
   КЭШ И ДЕТЕКЦИЯ ДИПЛИНКА ПРИГЛАШЕНИЯ (startapp=fam_CODE)
   ========================================================================= */
export function loadCachedFamily() {
    try {
        const raw = localStorage.getItem(FAMILY_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id) {
                familyStore.family = parsed;
            }
        }
        const pending = localStorage.getItem(PENDING_INVITE_KEY);
        if (pending) familyStore.pendingInviteCode = pending;
    } catch (e) {}
}

function persistCachedFamily(fam) {
    familyStore.family = fam || null;
    familyStore.lastSyncAt = Date.now();
    try {
        if (fam) localStorage.setItem(FAMILY_CACHE_KEY, JSON.stringify(fam));
        else localStorage.removeItem(FAMILY_CACHE_KEY);
    } catch (e) {}
    if (!fam && store.groceryScope === "family") {
        store.groceryScope = "personal";
    }
}

export function detectFamilyInviteParam() {
    let rawParam = "";
    try {
        rawParam = tg?.initDataUnsafe?.start_param || "";
    } catch (e) {}
    if (!rawParam) {
        try {
            const sp = new URLSearchParams(window.location.search);
            rawParam = sp.get("startapp") || sp.get("tgWebAppStartParam") || "";
        } catch (e) {}
    }
    const m = /^fam_([A-Za-z0-9]{4,12})$/i.exec(String(rawParam || "").trim());
    if (m) {
        const code = m[1].toUpperCase();
        familyStore.pendingInviteCode = code;
        try { localStorage.setItem(PENDING_INVITE_KEY, code); } catch (e) {}
        return code;
    }
    return familyStore.pendingInviteCode || null;
}

export function clearPendingFamilyInvite() {
    familyStore.pendingInviteCode = null;
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch (e) {}
}

/* =========================================================================
   БАЗОВЫЕ ПРОВЕРКИ И СЕЛЕКТОРЫ СЕМЬИ
   ========================================================================= */
export function isFamilyActive() {
    return Boolean(familyStore.family && familyStore.family.id);
}

export function getMyFamilyMember() {
    const fam = familyStore.family;
    if (!fam?.members?.length) return null;
    const myId = Number(fam.myTgId || getCurrentTgUserId());
    return fam.members.find(m => Number(m.tgId) === myId) || fam.members[0] || null;
}

export function isFamilyOwner() {
    const fam = familyStore.family;
    const myId = Number(fam?.myTgId || getCurrentTgUserId());
    return Boolean(fam && myId && Number(fam.ownerTgId) === myId);
}

export function isSlotSharedInFamily(slotKey) {
    if (!isFamilyActive() || !slotKey) return false;
    return Array.isArray(familyStore.family.sharedSlots)
        && familyStore.family.sharedSlots.includes(slotKey);
}

export function getEatingOutIds(dateStr, slotKey) {
    const fam = familyStore.family;
    if (!fam?.eatingOut) return [];
    return Array.isArray(fam.eatingOut[`${dateStr}:${slotKey}`])
        ? fam.eatingOut[`${dateStr}:${slotKey}`].map(Number)
        : [];
}

export function isMeEatingOut(dateStr, slotKey) {
    const fam = familyStore.family;
    if (!fam) return false;
    const myId = Number(fam.myTgId || getCurrentTgUserId());
    return getEatingOutIds(dateStr, slotKey).includes(myId);
}

export function getActiveParticipantsForSlot(dateStr, slotKey) {
    const fam = familyStore.family;
    if (!fam?.members?.length) return [];
    const outIds = getEatingOutIds(dateStr, slotKey);
    return fam.members.filter(m => m.role !== "shopper_only" && !outIds.includes(Number(m.tgId)));
}

export function getSharedMealInfo(dayIdx, slotKey) {
    const fam = familyStore.family;
    if (!fam?.sharedMeals) return null;
    return fam.sharedMeals[`${dayIdx}:${slotKey}`] || null;
}

export function getFamilyInviteLink() {
    const fam = familyStore.family;
    if (!fam?.inviteCode) return "";
    if (fam.inviteLink) return fam.inviteLink;
    const bot = (familyStore.botUsername || "").replace(/^@/, "");
    return bot ? `https://t.me/${bot}/app?startapp=fam_${fam.inviteCode}` : "";
}

/**
 * Пересечение пищевых ограничений всех активных участников семьи для общих слотов.
 * Возвращает объединённую строку preferencesText — recipeMatchesUserConstraints()
 * автоматически исключит продукты, запрещённые хотя бы одному участнику.
 */
export function getMergedFamilyPreferences(slotKey) {
    const own = (appState.user?.preferencesText || "").trim();
    if (!isSlotSharedInFamily(slotKey)) return own;
    const fam = familyStore.family;
    if (!fam?.members?.length) return own;
    const parts = [own];
    fam.members.forEach(m => {
        if (m.role === "shopper_only") return;
        const p = (m.preferencesText || "").trim();
        if (p) parts.push(p);
    });
    return parts.filter(Boolean).join(", ");
}

function formatVisualFraction(shareRatio) {
    if (shareRatio >= 0.72) return "~3/4 кастрюли";
    if (shareRatio >= 0.62) return "~2/3 кастрюли";
    if (shareRatio >= 0.56) return "~3/5 кастрюли";
    if (shareRatio >= 0.45) return "~1/2 кастрюли";
    if (shareRatio >= 0.36) return "~2/5 кастрюли";
    if (shareRatio >= 0.28) return "~1/3 кастрюли";
    return "~1/4 кастрюли";
}

/**
 * Расчёт «Одна кастрюля — разные порции» для паспорта блюда.
 * Возвращает множитель общего веса кастрюли относительно моей личной порции
 * и точную раскладку по тарелкам (в граммах готового блюда и визуальных долях).
 */
export function computeFamilyPortionSplit(meal, dayIdx) {
    if (!meal || meal.isOffPlan || !isSlotSharedInFamily(meal.slotKey)) return null;
    const fam = familyStore.family;
    if (!fam?.members?.length) return null;

    const dateStr = getDateStrForWeekDay(dayIdx, appState.weekStartDate);
    const participants = getActiveParticipantsForSlot(dateStr, meal.slotKey);
    const outIds = getEatingOutIds(dateStr, meal.slotKey);
    const eatingOutMembers = fam.members.filter(m => outIds.includes(Number(m.tgId)));

    if (participants.length < 2) {
        return {
            canScalePot: false,
            participants,
            eatingOutMembers,
            potMultiplier: 1,
            totalCookedG: Number(meal.cookedWeightG) || 300,
            totalRawG: Number(meal.rawWeightG) || 340,
            splits: participants.map(m => ({
                tgId: m.tgId,
                firstName: m.firstName,
                isMe: Number(m.tgId) === Number(fam.myTgId || getCurrentTgUserId()),
                sharePct: 100,
                cookedGrams: Number(meal.cookedWeightG) || 300,
                visualFraction: "вся порция"
            }))
        };
    }

    const myId = Number(fam.myTgId || getCurrentTgUserId());
    const myKcal = Number(appState.activeTargets?.dailyKcal || appState.targets?.dailyKcal || 2000);
    const totalKcal = participants.reduce((sum, m) => {
        const k = Number(m.tgId) === myId ? myKcal : (Number(m.dailyKcal) || 2000);
        return sum + Math.max(1000, k);
    }, 0);

    const myMember = participants.find(m => Number(m.tgId) === myId);
    const refKcal = myMember ? Math.max(1000, myKcal) : Math.max(1000, Number(participants[0].dailyKcal) || 2000);
    const potMultiplier = Math.max(1, Math.min(6, Number((totalKcal / refKcal).toFixed(2))));

    const baseCooked = Number(meal.cookedWeightG) || 300;
    const baseRaw = Number(meal.rawWeightG) || 340;
    const totalCookedG = Math.round(baseCooked * potMultiplier);
    const totalRawG = Math.round(baseRaw * potMultiplier);

    const splits = participants.map(m => {
        const k = Number(m.tgId) === myId ? myKcal : (Number(m.dailyKcal) || 2000);
        const ratio = Math.max(1000, k) / Math.max(1, totalKcal);
        return {
            tgId: m.tgId,
            firstName: m.firstName,
            isMe: Number(m.tgId) === myId,
            sharePct: Math.round(ratio * 100),
            cookedGrams: Math.round(totalCookedG * ratio),
            visualFraction: formatVisualFraction(ratio)
        };
    });

    return {
        canScalePot: true,
        participants,
        eatingOutMembers,
        potMultiplier,
        totalCookedG,
        totalRawG,
        splits
    };
}

/**
 * Применяет общие блюда семьи к несъеденным слотам локального appState.weekPlan,
 * масштабируя их под личные калории текущего пользователя.
 */
export function applySharedMealsToLocalWeek() {
    const fam = familyStore.family;
    if (!fam?.sharedMeals || !Array.isArray(appState.weekPlan) || appState.weekPlan.length !== 7) return false;
    if (!famHooks.scaleMasterRecipeToMeal) return false;

    let changed = false;
    appState.weekPlan.forEach((dayObj, dIdx) => {
        (dayObj.meals || []).forEach((meal, mIdx) => {
            if (meal.eaten || meal.isOffPlan || meal.isExtra) return;
            if (!isSlotSharedInFamily(meal.slotKey)) return;
            const shared = fam.sharedMeals[`${dIdx}:${meal.slotKey}`];
            if (!shared?.recipeId) return;
            if (meal.recipeId === shared.recipeId) return;

            const master = store.MASTER_RECIPES_DB.find(r => r.recipe_id === shared.recipeId);
            if (!master) return;
            const scaled = famHooks.scaleMasterRecipeToMeal(master, meal.name, meal.slotKey, meal.id, meal.kcal);
            dayObj.meals[mIdx] = scaled;
            changed = true;
        });
    });

    if (changed) {
        syncSelectedDayMeals();
        famHooks.rebuildGroceryList?.();
    }
    return changed;
}

/**
 * Собирает компактный вклад текущего пользователя в семейную корзину (сырой вес по продуктам)
 * для отправки на Worker без раскрытия личных биометрических данных.
 */
export function buildMyGroceryContribForWorker(daysIndices = null) {
    if (!Array.isArray(appState.weekPlan) || !appState.weekPlan.length) return [];
    const indices = Array.isArray(daysIndices) && daysIndices.length ? daysIndices : [0, 1, 2, 3, 4, 5, 6];
    const map = {};

    indices.forEach(dIdx => {
        const dayObj = appState.weekPlan[dIdx];
        if (!dayObj) return;
        const dateStr = getDateStrForWeekDay(dIdx, appState.weekStartDate);
        (dayObj.meals || []).forEach(meal => {
            if (meal.isOffPlan || meal.isCustom) return;
            if (isSlotSharedInFamily(meal.slotKey) && isMeEatingOut(dateStr, meal.slotKey)) return;
            (meal.ingredients || []).forEach(ing => {
                if (!ing?.name || ing.dept === "Собственные блюда") return;
                const cleanKey = ing.name
                    .replace(/\s*\((?:варёный|запечённый|жареный|отварной|свежий)[^)]*\)/gi, "")
                    .trim();
                const g = toRawStoreGrams(ing);
                if (g <= 0) return;
                if (!map[cleanKey]) map[cleanKey] = { n: cleanKey, d: ing.dept || "Бакалея и крупы", g: 0 };
                map[cleanKey].g += g;
            });
        });
    });

    return Object.values(map).map(x => ({ n: x.n, d: x.d, g: Math.round(x.g) })).slice(0, 110);
}

/* =========================================================================
   HTTP-КЛИЕНТ ДЛЯ CLOUDFLARE WORKER (/family/*)
   ========================================================================= */
async function familyApiRequest(endpoint, method = "GET", body = null) {
    const base = getWorkerUrl().replace(/\/$/, "");
    if (!base) return { ok: false, error: "URL воркера не настроен" };
    if (!tg?.initData) {
        return { ok: false, offlineOrWeb: true, error: "Открой NutriX в Telegram, чтобы подключить режим «Семья»" };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
        const res = await fetch(`${base}${endpoint}`, {
            method,
            headers: getWorkerHeaders(method === "POST"),
            body: method === "POST" ? JSON.stringify(body || {}) : undefined,
            signal: ctrl.signal
        });
        clearTimeout(timer);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, status: res.status, error: data.error || `Ошибка сервера (${res.status})` };
        }
        return { ok: true, data };
    } catch (e) {
        clearTimeout(timer);
        return { ok: false, error: "Нет связи с сервером NutriX" };
    }
}

function handleFamilySnapshotResponse(res, silent = false) {
    if (!res.ok) {
        familyStore.lastError = res.error || "";
        if (!silent && res.error) famHooks.onToast?.(res.error);
        return false;
    }
    if (res.data?.botUsername) familyStore.botUsername = res.data.botUsername;
    if ("family" in (res.data || {})) {
        persistCachedFamily(res.data.family);
        if (res.data.family) {
            applySharedMealsToLocalWeek();
        }
        famHooks.rebuildGroceryList?.();
        famHooks.onFamilyChanged?.();
    }
    familyStore.lastError = "";
    return true;
}

export async function fetchFamilyState(silent = true) {
    familyStore.loading = true;
    const res = await familyApiRequest("/family/me", "GET");
    familyStore.loading = false;
    return handleFamilySnapshotResponse(res, silent);
}

export async function createFamilyApi(name, sharedSlots = ["dinner"]) {
    const targetKcal = appState.activeTargets?.dailyKcal || appState.targets?.dailyKcal || 2000;
    const res = await familyApiRequest("/family/create", "POST", {
        name,
        sharedSlots,
        dailyKcal: targetKcal,
        mealsCount: appState.user?.mealsCount || 4,
        preferencesText: appState.user?.preferencesText || "",
        streakDays: appState.streakDays || 0
    });
    const ok = handleFamilySnapshotResponse(res, false);
    if (ok) {
        store.groceryScope = "family";
        syncMyFamilyProfile(false);
    }
    return ok;
}

export async function joinFamilyApi(inviteCode) {
    const cleanCode = String(inviteCode || "").trim().toUpperCase().replace(/^FAM_/, "");
    if (!cleanCode) {
        famHooks.onToast?.("Введи код приглашения");
        return false;
    }
    const targetKcal = appState.activeTargets?.dailyKcal || appState.targets?.dailyKcal || 2000;
    const res = await familyApiRequest("/family/join", "POST", {
        inviteCode: cleanCode,
        dailyKcal: targetKcal,
        mealsCount: appState.user?.mealsCount || 4,
        preferencesText: appState.user?.preferencesText || "",
        streakDays: appState.streakDays || 0
    });
    const ok = handleFamilySnapshotResponse(res, false);
    if (ok) {
        clearPendingFamilyInvite();
        store.groceryScope = "family";
        syncMyFamilyProfile(false);
    }
    return ok;
}

export async function leaveFamilyApi() {
    const res = await familyApiRequest("/family/leave", "POST", {});
    const ok = handleFamilySnapshotResponse(res, false);
    if (ok) {
        store.groceryScope = "personal";
        store.detailFamilyMode = false;
        stopFamilyGroceryPolling();
    }
    return ok;
}

export async function removeFamilyMemberApi(targetTgId) {
    const res = await familyApiRequest("/family/remove-member", "POST", { targetTgId });
    return handleFamilySnapshotResponse(res, false);
}

export async function updateFamilySettingsApi(patch) {
    const res = await familyApiRequest("/family/settings", "POST", patch);
    return handleFamilySnapshotResponse(res, false);
}

let _profileSyncTimer = null;
export function scheduleFamilyProfileSync(todayCompleted = false) {
    if (!isFamilyActive()) return;
    clearTimeout(_profileSyncTimer);
    _profileSyncTimer = setTimeout(() => syncMyFamilyProfile(todayCompleted), 1100);
}

export async function syncMyFamilyProfile(todayCompleted = false) {
    if (!isFamilyActive() || !appState.user) return false;
    const targetKcal = appState.activeTargets?.dailyKcal || appState.targets?.dailyKcal || 2000;
    const res = await familyApiRequest("/family/sync-profile", "POST", {
        dailyKcal: targetKcal,
        mealsCount: appState.user.mealsCount || 4,
        preferencesText: appState.user.preferencesText || "",
        streakDays: appState.streakDays || 0,
        todayCompleted: Boolean(todayCompleted),
        groceryContrib: buildMyGroceryContribForWorker()
    });
    return handleFamilySnapshotResponse(res, true);
}

export async function syncSharedMealToFamily(dayIdx, slotKey, recipeId, dishTitle, opts = {}) {
    if (!isFamilyActive() || !isSlotSharedInFamily(slotKey)) return false;
    const res = await familyApiRequest("/family/shared-meals", "POST", {
        dayIndex: dayIdx,
        slotKey,
        recipeId,
        dishTitle,
        toggleCook: Boolean(opts.toggleCook),
        setCook: Boolean(opts.setCook)
    });
    return handleFamilySnapshotResponse(res, Boolean(opts.silent));
}

export async function toggleEatingOutApi(dateStr, slotKey) {
    if (!isFamilyActive()) return false;
    const nextOut = !isMeEatingOut(dateStr, slotKey);
    const res = await familyApiRequest("/family/eating-out", "POST", {
        dateStr,
        slotKey,
        isOut: nextOut
    });
    const ok = handleFamilySnapshotResponse(res, false);
    if (ok) syncMyFamilyProfile(false);
    return ok;
}

export async function startDinnerVoteApi(dayIdx, slotKey, candidates) {
    const res = await familyApiRequest("/family/vote/start", "POST", { dayIndex: dayIdx, slotKey, candidates });
    return handleFamilySnapshotResponse(res, false);
}

export async function castDinnerVoteApi(voteId, recipeId, score) {
    const res = await familyApiRequest("/family/vote/cast", "POST", { voteId, recipeId, score });
    return handleFamilySnapshotResponse(res, false);
}

export async function applyDinnerVoteApi(voteId, recipeId, dishTitle) {
    const res = await familyApiRequest("/family/vote/apply", "POST", { voteId, recipeId, dishTitle });
    return handleFamilySnapshotResponse(res, false);
}

export async function syncFamilyGroceryCheckApi(itemKey, checked) {
    if (!isFamilyActive()) return false;
    const res = await familyApiRequest("/family/grocery/sync", "POST", {
        toggleCheck: true,
        itemKey,
        checked: Boolean(checked)
    });
    return handleFamilySnapshotResponse(res, true);
}

export async function addFamilyUrgentItemApi(name, note = "") {
    if (!isFamilyActive()) return false;
    const res = await familyApiRequest("/family/grocery/sync", "POST", {
        addUrgent: true,
        name,
        note
    });
    return handleFamilySnapshotResponse(res, false);
}

export async function toggleFamilyUrgentItemApi(urgentId, checked) {
    if (!isFamilyActive()) return false;
    const res = await familyApiRequest("/family/grocery/sync", "POST", {
        toggleUrgentId: urgentId,
        checked: Boolean(checked)
    });
    return handleFamilySnapshotResponse(res, true);
}

export async function toggleFamilyInStoreApi(inStore) {
    if (!isFamilyActive()) return false;
    const res = await familyApiRequest("/family/grocery/sync", "POST", {
        inStore: Boolean(inStore)
    });
    return handleFamilySnapshotResponse(res, false);
}

export async function clearFamilyGroceryChecksApi() {
    if (!isFamilyActive()) return false;
    const res = await familyApiRequest("/family/grocery/sync", "POST", { clearChecks: true });
    return handleFamilySnapshotResponse(res, true);
}

export async function notifyFamilyDinnerReadyApi(dishTitle, portions) {
    if (!isFamilyActive()) return { ok: false };
    return await familyApiRequest("/family/notify/dinner-ready", "POST", { dishTitle, portions });
}

export async function notifyFamilyAchievementApi(eventType, extra = {}) {
    if (!isFamilyActive()) return false;
    const today = getTodayStr();
    const dedupKey = `${eventType}:${today}:${extra.days || ""}`;
    if (familyStore.notifiedStreaks[dedupKey]) return false;
    familyStore.notifiedStreaks[dedupKey] = true;

    const res = await familyApiRequest("/family/notify/achievement", "POST", Object.assign({ eventType }, extra));
    return Boolean(res.ok);
}

/* =========================================================================
   ЛЁГКИЙ LIVE-POLLING СЕМЕЙНОЙ КОРЗИНЫ (РАЗ В 4.5 СЕК)
   ========================================================================= */
let _familyPollTimer = null;

export function startFamilyGroceryPolling() {
    stopFamilyGroceryPolling();
    if (!isFamilyActive() || !tg?.initData) return;
    _familyPollTimer = setInterval(() => {
        if (document.visibilityState === "visible" && isFamilyActive()) {
            fetchFamilyState(true);
        }
    }, 4500);
}

export function stopFamilyGroceryPolling() {
    if (_familyPollTimer) {
        clearInterval(_familyPollTimer);
        _familyPollTimer = null;
    }
}
