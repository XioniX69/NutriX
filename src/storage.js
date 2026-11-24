/* =========================================================================
   NUTRIX — src/storage.js
   Состояние приложения (appState), IndexedDB MasterDB v4, парсеры JSON,
   localStorage, календарные логи, Telegram CloudStorage и Worker/OFF API.
   ========================================================================= */

import {
    WEEK_DAYS,
    MAX_SAVED_CUSTOM_MEALS,
    EMBEDDED_MASTER_V4,
    SUBSTITUTIONS_V4,
    byteLengthUtf8,
    formatDateYmd,
    getTodayStr,
    getTodayDayIndex,
    getWeekStartDateStr,
    getDateStrForWeekDay,
    calculateTargets,
    reconcileMealMacros,
    scaleTargetsToKcal,
    computeMealWeightsFromIngredients
} from "./math.js";

export const tg = window.Telegram?.WebApp || null;
if (tg) {
    try { tg.ready(); tg.expand(); } catch (e) {}
}

export const ADMIN_TG_IDS = [1696224717];
export const DEFAULT_WORKER_URL = "https://nutrix.zaharshitov222.workers.dev";
export const STORAGE_KEY = "nutrix_v8_state";
export const WORKER_STORAGE_KEY = "nutrix_worker_url";
export const IDB_NAME = "NutriX_MasterDB_v4";
export const IDB_STORE = "recipes";

export const store = {
    MASTER_RECIPES_DB: EMBEDDED_MASTER_V4.slice(),
    DYNAMIC_SUBS_V4: [],
    selectedDayIndex: getTodayDayIndex(),
    groceryPeriod: 3,
    hideCheckedGroceries: false,
    detailWeightMode: "raw",
    detailPortionMult: 1,
    variationSeed: 0,
    activeDetailMealId: null
};

export const appState = {
    user: null,
    targets: null,
    activeTargets: null,
    idealTargets: null,
    adaptation: null,
    adaptiveOffsetKcal: 0,
    lastAutoAdjustDate: null,
    weekStartDate: getWeekStartDateStr(),
    dateLogs: {},
    weekPlan: [],
    meals: [],
    groceryList: {},
    groceryReusePct: 0,
    optimizeOverlap: true,
    checkedGroceries: {},
    customGroceries: [],
    savedCustomMeals: [],
    pinnedSlots: {},
    waterLog: {},
    waterHistory: {},
    dailyHistory: {},
    checkIns: [],
    startedAt: getTodayStr(),
    lastUpdated: getTodayStr(),
    updatedAt: 0,
    streakDays: 0,
    theme: "auto"
};

// Dependency hooks wired once from src/main.js to keep module graph strictly acyclic
const hooks = {
    scaleMasterRecipeToMeal: null,
    rebuildGroceryList: null,
    generateWeeklyPlanOptimized: null,
    rebuildUneatenMealsForWeek: null,
    onDbUpdated: null,
    onCloudRehydrated: null,
    onApplyTheme: null,
    onToast: null
};

export function registerStorageHooks(partial) {
    Object.assign(hooks, partial);
}

export function haptic(style = "light") {
    try { tg?.HapticFeedback?.impactOccurred?.(style); } catch (e) {}
}

export function hapticSelect() {
    try { tg?.HapticFeedback?.selectionChanged?.(); } catch (e) {}
}

export const NutriXPerf = {
    init() {
        const cores = navigator.hardwareConcurrency || 4;
        const lowMem = (navigator.deviceMemory || 4) <= 2;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        if (cores <= 4 || lowMem || reduced) {
            document.documentElement.classList.add("nx-low-power");
        }
    },
    notify(type = "success") {
        try {
            if (tg?.HapticFeedback?.notificationOccurred) tg.HapticFeedback.notificationOccurred(type);
            else haptic("medium");
        } catch (e) {}
    }
};

export function getWorkerUrl() {
    try { return (localStorage.getItem(WORKER_STORAGE_KEY) || DEFAULT_WORKER_URL).trim(); }
    catch (e) { return DEFAULT_WORKER_URL; }
}

export function setWorkerUrl(val) {
    if (val) {
        try { localStorage.setItem(WORKER_STORAGE_KEY, val.trim()); } catch (e) {}
    }
}

export function getWorkerHeaders(withJson = true) {
    const headers = {
        "X-Telegram-Init-Data": tg?.initData || ""
    };
    if (withJson) headers["Content-Type"] = "application/json";
    return headers;
}

export function getCurrentTgUserId() {
    return tg?.initDataUnsafe?.user?.id || null;
}

export function isOwnerAdmin() {
    const uid = getCurrentTgUserId();
    return Boolean(uid && ADMIN_TG_IDS.includes(Number(uid)));
}

export function normalizeThemeId(themeId) {
    return ["auto", "obsidian", "daylight"].includes(themeId) ? themeId : "obsidian";
}

export function resolveEffectiveTheme(themeId) {
    if (themeId === "daylight") return "daylight";
    if (themeId === "obsidian") return "obsidian";
    if (themeId === "auto") {
        if (tg?.colorScheme === "light") return "daylight";
        if (tg?.colorScheme === "dark") return "obsidian";
        const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
        return prefersLight ? "daylight" : "obsidian";
    }
    return "obsidian";
}

/* =========================================================================
   INDEXEDDB + ДЕКОДЕРЫ БАЗЫ V4
   ========================================================================= */
function openDbIdb() {
    return new Promise((resolve) => {
        if (!window.indexedDB) return resolve(null);
        try {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
    });
}

async function loadMasterDbFromIndexedDb() {
    try {
        const db = await openDbIdb();
        if (!db) return null;
        return await new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, "readonly");
            const req = tx.objectStore(IDB_STORE).get("master_pack");
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) { return null; }
}

export async function saveMasterDbToIndexedDb(recipesArr, subsArr = []) {
    try {
        const db = await openDbIdb();
        if (!db) return;
        await new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).put({ recipes: recipesArr, subs: subsArr }, "master_pack");
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch (e) {}
}

function decodeBitmask(mask, refList) {
    const out = [];
    for (let i = 0; i < refList.length; i++) {
        if (mask & (1 << i)) out.push(refList[i]);
    }
    return out;
}

export function parseLiteMasterJson(lite) {
    if (!lite || lite.v !== "4-lite" || !Array.isArray(lite.r)) return null;
    const depts = lite.depts || [];
    const meals = lite.meals || ["Завтрак", "Обед", "Ужин", "Перекус", "Десерт"];
    const states = lite.states || ["сырой", "варёный", "запечённый", "жареный"];
    const goals = lite.goals || [];
    const diets = lite.diets || [];
    const algs = lite.algs || [];
    const ingDict = lite.ings || [];
    const stepDict = lite.steps || [];

    if (Array.isArray(lite.subs) && lite.subs.length) {
        store.DYNAMIC_SUBS_V4 = lite.subs.map(s => ({
            source: s[0], target: s[1], ratio: s[2] || 1.0,
            dKcal: s[3] || 0, dP: s[4] || 0, dF: s[5] || 0, dC: s[6] || 0,
            eq: s[7] === "high" ? "1:1 Точная" : (s[7] === "partial" ? "Близкая" : "Альтернатива"),
            note: s[8] || ""
        }));
    }

    return lite.r.map((row, idx) => {
        const nut = row[9] || [350, 320, 400, 25, 12, 40, 5];
        const ingredients = (row[10] || []).map(tup => {
            const meta = ingDict[tup[0]] || ["Продукт", 3, 1.0, ""];
            return {
                name: meta[0],
                dept: depts[meta[1]] || "Бакалея и крупы",
                yieldFactor: meta[2] || 1.0,
                alt: meta[3] || "",
                amount_g: tup[1] || 50,
                state: states[tup[2]] || "сырой"
            };
        });
        const weights = computeMealWeightsFromIngredients(ingredients);
        const stepsStructured = (row[11] || []).map((sIdx, i) => {
            const full = stepDict[sIdx] || "";
            const sp = full.indexOf(":");
            return {
                step_number: i + 1,
                stage_name: sp > 0 ? full.slice(0, sp) : `Этап ${i + 1}`,
                duration_min: 5,
                temperature_c: row[4] || 100,
                instruction: sp > 0 ? full.slice(sp + 1).trim() : full
            };
        });
        const totalMin = row[3] || 18;
        const prepMin = Math.max(3, Math.round(totalMin * 0.3));
        return {
            recipe_id: row[13] || `RCP-${String(idx + 1).padStart(5, "0")}`,
            title_ru: row[0],
            short_description: `Блюдо категории «${row[2] || "Сбалансированное питание"}».`,
            meal_type: meals[row[1]] || "Обед",
            primary_category_ru: row[2] || "Спортивное питание",
            cuisine: "Российская домашняя",
            total_time_min: totalMin,
            prep_time_min: prepMin,
            cook_time_min: Math.max(0, totalMin - prepMin),
            cooking_temperature_c: row[4] || 100,
            shelf_life_hours: row[5] || 48,
            goal_tags_ru: decodeBitmask(row[6] || 0, goals),
            dietary_tags_ru: decodeBitmask(row[7] || 0, diets),
            allergens_ru: decodeBitmask(row[8] || 0, algs),
            nutrition: {
                raw_total_weight_g: weights.rawWeightG || nut[0],
                cooked_total_weight_g: weights.cookedWeightG || nut[1],
                serving_weight_g: weights.cookedWeightG || nut[1],
                serving_kcal: nut[2],
                serving_protein_g: nut[3],
                serving_fat_g: nut[4],
                serving_carbs_g: nut[5],
                serving_fiber_g: nut[6]
            },
            ingredients,
            steps_structured: stepsStructured,
            serving_recommendation: row[12] || ""
        };
    });
}

export function parseRelationalMasterJson(json) {
    if (!json?.tables?.recipes) return null;
    const nutMap = {};
    (json.tables.nutrition || []).forEach(n => { nutMap[n.recipe_id] = n; });
    const ingCat = {};
    (json.tables.ingredients || []).forEach(i => { ingCat[i.ingredient_id] = i; });
    const ingByRcp = {};
    (json.tables.recipe_ingredients || []).forEach(ri => {
        (ingByRcp[ri.recipe_id] ||= []).push(ri);
    });
    if (Array.isArray(json.tables.ingredient_substitutions)) {
        store.DYNAMIC_SUBS_V4 = json.tables.ingredient_substitutions.map(s => ({
            source: s.source_name_ru, target: s.target_name_ru, ratio: s.conversion_ratio || 1.0,
            dKcal: s.delta_kcal_per_100g || 0, dP: s.delta_protein_g || 0,
            dF: s.delta_fat_g || 0, dC: s.delta_carbs_g || 0,
            eq: s.equivalence_level === "high" ? "1:1 Точная" : "Близкая", note: s.dietary_benefit || ""
        }));
    }
    return json.tables.recipes.map(r => {
        const n = nutMap[r.recipe_id] || {};
        const ingredients = (ingByRcp[r.recipe_id] || []).map(ri => ({
            name: ri.ingredient_name_ru,
            amount_g: ri.amount_g || 50,
            state: ri.product_state || "сырой",
            yieldFactor: ingCat[ri.ingredient_id]?.yield_factor_when_cooked || 1.0,
            dept: "Бакалея и крупы",
            alt: ri.alternatives_ru || ""
        }));
        const weights = computeMealWeightsFromIngredients(ingredients);
        return {
            recipe_id: r.recipe_id,
            title_ru: r.title_ru,
            short_description: r.short_description || "",
            meal_type: r.meal_type || "Обед",
            primary_category_ru: r.primary_category_ru || "Спортивное питание",
            cuisine: r.cuisine || "Сбалансированная",
            prep_time_min: r.prep_time_min || 6,
            cook_time_min: r.cook_time_min || 12,
            total_time_min: r.total_time_min || 18,
            cooking_temperature_c: r.cooking_temperature_c || 100,
            shelf_life_hours: r.shelf_life_hours || 36,
            goal_tags_ru: r.goal_tags_ru || [],
            dietary_tags_ru: r.dietary_tags_ru || [],
            allergens_ru: r.allergens_ru || [],
            serving_recommendation: r.serving_recommendation || "",
            nutrition: {
                raw_total_weight_g: weights.rawWeightG || n.raw_total_weight_g || 350,
                cooked_total_weight_g: weights.cookedWeightG || n.cooked_total_weight_g || 320,
                serving_weight_g: weights.cookedWeightG || n.serving_weight_g || 320,
                serving_kcal: n.serving_kcal || 400,
                serving_protein_g: n.serving_protein_g || 25,
                serving_fat_g: n.serving_fat_g || 12,
                serving_carbs_g: n.serving_carbs_g || 40,
                serving_fiber_g: n.serving_fiber_g || 5
            },
            ingredients,
            steps_structured: r.steps_structured || []
        };
    });
}

export async function tryAutoFetchMasterDb(notifyUser = false) {
    const paths = [
        "./nutrix_db_lite_2000.json",
        "./nutrix_db_lite_2500.json",
        "./sports_nutrition_db_master_1_2500.json"
    ];
    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (!res.ok) continue;
            const json = await res.json();
            const parsed = json?.v === "4-lite" ? parseLiteMasterJson(json) : parseRelationalMasterJson(json);
            if (parsed && parsed.length > 0) {
                store.MASTER_RECIPES_DB = parsed;
                await saveMasterDbToIndexedDb(parsed, store.DYNAMIC_SUBS_V4);
                hooks.onDbUpdated?.();
                CloudSync.rehydratePendingWeek();
                if (notifyUser) hooks.onToast?.(`База обновлена: ${parsed.length} рецептов`);
                return true;
            }
        } catch (e) {}
    }
    if (notifyUser) hooks.onToast?.("Файл базы не найден в корне GitHub");
    return false;
}

export async function initMasterDatabase() {
    const cached = await loadMasterDbFromIndexedDb();
    if (cached?.recipes?.length > EMBEDDED_MASTER_V4.length) {
        store.MASTER_RECIPES_DB = cached.recipes;
        if (Array.isArray(cached.subs) && cached.subs.length) store.DYNAMIC_SUBS_V4 = cached.subs;
        hooks.onDbUpdated?.();
        CloudSync.rehydratePendingWeek();
        return true;
    }
    hooks.onDbUpdated?.();
    return await tryAutoFetchMasterDb(false);
}

/* =========================================================================
   ТРЕНИРОВОЧНЫЕ ДНИ, СТАТИСТИКА ДНЯ, КАЛЕНДАРНЫЕ ЛОГИ И СЕРИЯ
   ========================================================================= */
export function getTrainingDaysMap() {
    if (!appState.user) return {};
    if (!appState.user.trainingDays) {
        const sp = appState.user.sportType || "none";
        appState.user.trainingDays = sp === "none"
            ? {}
            : { 0: sp === "team" ? "sport" : "strength", 2: sp === "team" ? "sport" : "strength", 4: sp === "team" ? "sport" : "strength" };
    }
    return appState.user.trainingDays;
}

export function getDayTypeTargets(dayIdx) {
    const base = appState.activeTargets || appState.targets;
    if (!base) return { dayType: "rest", dailyKcal: 2000, protein: 120, fat: 65, carbs: 230 };
    const map = getTrainingDaysMap();
    const trainIndices = Object.keys(map).map(Number).filter(i => map[i] && map[i] !== "rest");
    const nTrain = trainIndices.length;
    const nRest = 7 - nTrain;
    const dayType = map[dayIdx] || "rest";

    if (nTrain === 0 || nRest === 0) return Object.assign({ dayType }, base);

    let trainBonus = Math.min(320, Math.round(base.dailyKcal * 0.10));
    let restCut = Math.round((trainBonus * nTrain) / nRest);
    const maxCut = Math.round(base.dailyKcal * 0.12);
    if (restCut > maxCut) {
        restCut = maxCut;
        trainBonus = Math.round((restCut * nRest) / nTrain);
    }

    const p = base.protein;
    const isTrain = dayType !== "rest";
    const f = isTrain ? Math.max(Math.round((base.dailyKcal * 0.18) / 9), base.fat - 6) : base.fat + 5;
    const targetK = isTrain ? base.dailyKcal + trainBonus : base.dailyKcal - restCut;
    const c = Math.max(50, Math.round((targetK - p * 4 - f * 9) / 4));
    return Object.assign({}, base, { dayType, dailyKcal: (p * 4) + (f * 9) + (c * 4), protein: p, fat: f, carbs: c });
}

export function getDayNutritionStats(dayIdx) {
    const dayObj = appState.weekPlan?.[dayIdx];
    const meals = dayObj?.meals || [];
    const dayT = getDayTypeTargets(dayIdx);

    const sum = (arr) => arr.reduce((a, m) => {
        a.kcal += Number(m.kcal) || 0;
        a.protein += Number(m.protein) || 0;
        a.fat += Number(m.fat) || 0;
        a.carbs += Number(m.carbs) || 0;
        return a;
    }, { kcal: 0, protein: 0, fat: 0, carbs: 0 });

    const eatenMeals = meals.filter(m => m.eaten);
    const plannedMeals = meals.filter(m => !m.isOffPlan);
    const eaten = sum(eatenMeals);
    const planned = sum(plannedMeals);

    // Единый источник правды: goal ВСЕГДА строго из научного dayT
    const goal = {
        kcal: Math.max(1, Number(dayT.dailyKcal) || 1800),
        protein: Math.max(1, Number(dayT.protein) || 100),
        fat: Math.max(1, Number(dayT.fat) || 60),
        carbs: Math.max(1, Number(dayT.carbs) || 180)
    };

    const diffKcal = eaten.kcal - goal.kcal;
    const isOver = diffKcal > 0;
    const overKcal = isOver ? diffKcal : 0;
    const remainingKcal = isOver ? 0 : Math.abs(diffKcal);
    const rawPctKcal = Math.round((eaten.kcal / goal.kcal) * 100);

    return {
        dayType: dayT.dayType || "rest",
        eaten,
        planned,
        goal,
        eatenCount: eatenMeals.length,
        isOver,
        overKcal,
        remainingKcal,
        rawPctKcal,
        pctKcal: Math.min(100, rawPctKcal)
    };
}

export function syncSelectedDayMeals() {
    if (appState.weekPlan?.[store.selectedDayIndex]) {
        appState.meals = appState.weekPlan[store.selectedDayIndex].meals;
    }
}

export function syncDateLogForDay(dayIdx) {
    if (!appState.dateLogs) appState.dateLogs = {};
    const dayObj = appState.weekPlan?.[dayIdx];
    if (!dayObj) return;
    const dateStr = getDateStrForWeekDay(dayIdx, appState.weekStartDate);
    const meals = dayObj.meals || [];
    const eatenMealIds = meals.filter(m => m.eaten && !m.isOffPlan).map(m => m.id);
    const offPlanMeals = meals.filter(m => m.isOffPlan).map(m => ({
        id: m.id,
        dishTitle: m.dishTitle,
        kcal: m.kcal,
        protein: m.protein,
        fat: m.fat,
        carbs: m.carbs,
        rawWeightG: m.rawWeightG || 200,
        cookedWeightG: m.cookedWeightG || 200
    }));

    if (eatenMealIds.length || offPlanMeals.length) {
        appState.dateLogs[dateStr] = { eatenMealIds, offPlanMeals };
    } else {
        delete appState.dateLogs[dateStr];
    }

    const keys = Object.keys(appState.dateLogs).sort();
    while (keys.length > 30) delete appState.dateLogs[keys.shift()];
}

export function recordDaySnapshot(dayIdx, dateStr) {
    if (!appState.startedAt) appState.startedAt = getTodayStr();
    if (!appState.dailyHistory) appState.dailyHistory = {};
    const st = getDayNutritionStats(dayIdx);
    appState.dailyHistory[dateStr] = {
        date: dateStr,
        eatenKcal: st.eaten.kcal,
        goalKcal: st.goal.kcal,
        p: st.eaten.protein,
        f: st.eaten.fat,
        c: st.eaten.carbs,
        eatenCount: st.eatenCount,
        waterL: Number(appState.waterLog?.[dateStr] || 0)
    };
}

export function recalculateStreakDays() {
    const hist = appState.dailyHistory || {};
    const today = new Date();
    const todayStr = formatDateYmd(today);

    const isCompletedDay = (dStr) => {
        const rec = hist[dStr];
        if (!rec) return false;
        return (Number(rec.eatenCount) || 0) >= 1 || (Number(rec.eatenKcal) || 0) > 0;
    };

    let streak = 0;
    const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (isCompletedDay(todayStr)) {
        streak = 1;
        cursor.setDate(cursor.getDate() - 1);
    } else {
        cursor.setDate(cursor.getDate() - 1);
    }

    for (let i = 0; i < 365; i++) {
        const dStr = formatDateYmd(cursor);
        if (isCompletedDay(dStr)) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        } else {
            break;
        }
    }

    appState.streakDays = streak;
    return streak;
}

export function recordTodaySnapshot() {
    const todayIdx = getTodayDayIndex();
    const todayStr = getTodayStr();
    syncDateLogForDay(todayIdx);
    recordDaySnapshot(todayIdx, todayStr);
    recalculateStreakDays();
}

export function ensureCurrentWeekRollover() {
    const currentMonday = getWeekStartDateStr();
    if (!appState.weekStartDate) {
        appState.weekStartDate = currentMonday;
        return false;
    }
    if (appState.weekStartDate === currentMonday) return false;

    if (Array.isArray(appState.weekPlan) && appState.weekPlan.length === 7) {
        appState.weekPlan.forEach((dayObj, dIdx) => {
            const oldDateStr = getDateStrForWeekDay(dIdx, appState.weekStartDate);
            const hasActivity = (dayObj.meals || []).some(m => m.eaten || m.isOffPlan);
            if (hasActivity) {
                syncDateLogForDay(dIdx);
                recordDaySnapshot(dIdx, oldDateStr);
            }
        });

        appState.weekPlan.forEach(dayObj => {
            dayObj.meals = (dayObj.meals || [])
                .filter(m => !m.isOffPlan)
                .map(m => Object.assign({}, m, { eaten: false }));
        });
    }

    appState.weekStartDate = currentMonday;
    appState.lastUpdated = getTodayStr();
    recalculateStreakDays();
    return true;
}

/* =========================================================================
   TELEGRAM CLOUDSTORAGE + LOCALSTORAGE
   ========================================================================= */
export const CloudSync = {
    _pendingCompactWeek: null,
    MAX_VALUE_BYTES: 4000,

    isSupported() {
        return Boolean(tg?.initData && tg?.CloudStorage && typeof tg.CloudStorage.getItems === "function");
    },

    hydrateCompactWeek(cw) {
        if (!Array.isArray(cw) || cw.length !== 7) return { hydrated: false, missingIds: 0 };
        let missingIds = 0;
        const builtWeek = WEEK_DAYS.map((dm, dIdx) => ({
            dayIndex: dIdx,
            short: dm.short,
            full: dm.full,
            meals: (cw[dIdx] || []).map((row, mIdx) => {
                const mealId = `day_${dIdx}_meal_${mIdx + 1}`;
                if (row[0] === 1) {
                    return {
                        id: mealId,
                        name: row[1],
                        dishTitle: row[2],
                        kcal: row[3],
                        protein: row[4],
                        fat: row[5],
                        carbs: row[6],
                        eaten: Boolean(row[7]),
                        isCustom: true,
                        isOffPlan: Boolean(row[8]),
                        recipeId: row[8] ? "AI-ZG" : "CUSTOM",
                        slotKey: "snack",
                        prepTime: "Свой",
                        rawWeightG: 200,
                        cookedWeightG: 200,
                        ingredients: [{ name: row[2], weight: 200, dept: "Собственные блюда", state: "готовый", yieldFactor: 1.0 }],
                        stepsStructured: []
                    };
                }
                const master = store.MASTER_RECIPES_DB.find(r => r.recipe_id === row[3]);
                if (!master || !hooks.scaleMasterRecipeToMeal) {
                    missingIds++;
                    return null;
                }
                const sc = hooks.scaleMasterRecipeToMeal(master, row[1], row[2], mealId, row[4]);
                sc.eaten = Boolean(row[5]);
                return sc;
            })
        }));

        if (missingIds > 0) return { hydrated: false, missingIds };
        return { hydrated: true, missingIds: 0, weekPlan: builtWeek };
    },

    rehydratePendingWeek() {
        if (!this._pendingCompactWeek) return false;
        const res = this.hydrateCompactWeek(this._pendingCompactWeek);
        if (!res.hydrated) return false;

        appState.weekPlan = res.weekPlan;
        this._pendingCompactWeek = null;
        ensureCurrentWeekRollover();
        syncSelectedDayMeals();
        hooks.rebuildGroceryList?.();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (e) {}
        hooks.onCloudRehydrated?.();
        return true;
    },

    packState() {
        const profilePayload = {
            v: 9,
            ts: appState.updatedAt || Date.now(),
            u: appState.user,
            t: appState.activeTargets || appState.targets,
            it: appState.idealTargets,
            ad: appState.adaptation,
            ao: appState.adaptiveOffsetKcal || 0,
            la: appState.lastAutoAdjustDate || null,
            th: normalizeThemeId(appState.theme || "auto"),
            gp: store.groceryPeriod,
            oo: appState.optimizeOverlap !== false,
            st: appState.streakDays || 0,
            sa: appState.startedAt || getTodayStr(),
            ws: appState.weekStartDate || getWeekStartDateStr(),
            lu: appState.lastUpdated,
            vs: store.variationSeed,
            ps: Object.fromEntries(
                Object.entries(appState.pinnedSlots || {}).map(([slotName, pin]) => [
                    slotName,
                    pin.isCustom
                        ? [1, (pin.dishTitle || "").slice(0, 42), pin.kcal, pin.protein, pin.fat, pin.carbs, pin.weight || 250]
                        : [0, pin.recipeId]
                ])
            )
        };

        const compactWeek = (appState.weekPlan || []).map(d =>
            (d.meals || []).map(m => m.isCustom
                ? [1, m.name, (m.dishTitle || "").slice(0, 42), m.kcal, m.protein, m.fat, m.carbs, m.eaten ? 1 : 0, m.isOffPlan ? 1 : 0]
                : [0, m.name, m.slotKey || "lunch", m.recipeId, m.kcal, m.eaten ? 1 : 0]
            )
        );

        const buildMetaJson = (daysHistLimit, waterDaysLimit, waterHistLimit, checkInsLimit, savedLimit, includeChecked) => {
            const wKeys = Object.keys(appState.waterLog || {}).sort().slice(-waterDaysLimit);
            const recentW = {};
            wKeys.forEach(k => { recentW[k] = appState.waterLog[k]; });

            const hKeys = Object.keys(appState.dailyHistory || {}).sort().slice(-daysHistLimit);
            const recentH = {};
            hKeys.forEach(k => { recentH[k] = appState.dailyHistory[k]; });

            const checkedOnlyTrue = {};
            if (includeChecked) {
                Object.entries(appState.checkedGroceries || {}).forEach(([k, v]) => {
                    if (v) checkedOnlyTrue[k] = 1;
                });
            }

            return JSON.stringify({
                w: recentW,
                wh: (appState.waterHistory?.[getTodayStr()] || []).slice(-waterHistLimit),
                cg: checkedOnlyTrue,
                cu: (appState.customGroceries || []).slice(0, 15),
                ci: (appState.checkIns || []).slice(-checkInsLimit),
                dh: recentH,
                sm: (appState.savedCustomMeals || []).slice(0, savedLimit).map(s => [
                    (s.title || "").slice(0, 42), s.kcal, s.protein, s.fat, s.carbs, s.weight || 250
                ])
            });
        };

        let metaStr = buildMetaJson(14, 7, 10, 12, 15, true);
        if (byteLengthUtf8(metaStr) > this.MAX_VALUE_BYTES) {
            metaStr = buildMetaJson(7, 5, 6, 8, 8, true);
        }
        if (byteLengthUtf8(metaStr) > this.MAX_VALUE_BYTES) {
            metaStr = buildMetaJson(4, 3, 4, 6, 0, false);
        }

        return {
            nx_p: JSON.stringify(profilePayload),
            nx_w: JSON.stringify(compactWeek),
            nx_m: metaStr
        };
    },

    async push() {
        if (!this.isSupported() || !appState.user) return false;
        const badge = document.getElementById("cloud-sync-badge");
        const payload = this.packState();

        for (const [, v] of Object.entries(payload)) {
            if (byteLengthUtf8(v) > this.MAX_VALUE_BYTES) {
                if (badge) badge.innerText = "⚠ Лимит облака";
                return false;
            }
        }

        try {
            const results = await Promise.all(
                Object.entries(payload).map(([k, v]) =>
                    new Promise((res) => {
                        tg.CloudStorage.setItem(k, v, (err, stored) => {
                            res({ key: k, ok: !err && stored !== false, err: err || null });
                        });
                    })
                )
            );
            const failed = results.find(r => !r.ok);
            if (failed) {
                if (badge) badge.innerText = "⚠ Ошибка облака";
                return false;
            }
            if (badge) badge.innerText = "☁️ Синхронизировано";
            return true;
        } catch (e) {
            if (badge) badge.innerText = "⚠ Ошибка облака";
            return false;
        }
    },

    async pull() {
        if (!this.isSupported()) return false;
        try {
            const data = await new Promise(res => {
                tg.CloudStorage.getItems(["nx_p", "nx_w", "nx_m"], (err, vals) => res(err ? null : vals));
            });
            if (!data?.nx_p) return false;
            const p = JSON.parse(data.nx_p);

            if (!appState.user || (p.ts && p.ts >= (appState.updatedAt || 0))) {
                appState.user = p.u;
                if (appState.user && "muscleMass" in appState.user) delete appState.user.muscleMass;
                appState.activeTargets = p.t || calculateTargets(p.u);
                appState.targets = appState.activeTargets;
                appState.idealTargets = p.it || appState.activeTargets;
                appState.adaptation = p.ad || null;
                appState.adaptiveOffsetKcal = p.ao || 0;
                appState.lastAutoAdjustDate = p.la || null;
                appState.theme = normalizeThemeId(p.th || "auto");
                appState.startedAt = p.sa || getTodayStr();
                appState.weekStartDate = p.ws || getWeekStartDateStr();
                appState.lastUpdated = p.lu || getTodayStr();
                appState.updatedAt = p.ts || Date.now();
                appState.optimizeOverlap = p.oo !== false;
                store.groceryPeriod = p.gp || 3;
                store.variationSeed = p.vs || 0;

                appState.pinnedSlots = {};
                if (p.ps && typeof p.ps === "object") {
                    Object.entries(p.ps).forEach(([slotName, arr]) => {
                        if (!Array.isArray(arr)) return;
                        if (arr[0] === 1) {
                            appState.pinnedSlots[slotName] = {
                                isCustom: true, dishTitle: arr[1],
                                kcal: arr[2], protein: arr[3], fat: arr[4], carbs: arr[5], weight: arr[6] || 250
                            };
                        } else if (arr[0] === 0 && arr[1]) {
                            appState.pinnedSlots[slotName] = { isCustom: false, recipeId: arr[1] };
                        }
                    });
                }

                if (data.nx_m) {
                    const m = JSON.parse(data.nx_m);
                    appState.waterLog = m.w || {};
                    appState.waterHistory = { [getTodayStr()]: m.wh || [] };
                    appState.checkedGroceries = m.cg || {};
                    appState.customGroceries = m.cu || [];
                    appState.checkIns = m.ci || [];
                    appState.dailyHistory = m.dh || {};
                    if (Array.isArray(m.sm)) {
                        appState.savedCustomMeals = m.sm.slice(0, MAX_SAVED_CUSTOM_MEALS).map((row, idx) => ({
                            id: `scm_cloud_${idx}_${Date.now()}`,
                            title: row[0], kcal: row[1], protein: row[2], fat: row[3], carbs: row[4], weight: row[5] || 250
                        }));
                    }
                }

                let degradedWeek = false;
                if (data.nx_w) {
                    const cw = JSON.parse(data.nx_w);
                    const hyd = this.hydrateCompactWeek(cw);
                    if (hyd.hydrated) {
                        appState.weekPlan = hyd.weekPlan;
                        this._pendingCompactWeek = null;
                    } else {
                        this._pendingCompactWeek = cw;
                        degradedWeek = true;
                    }
                }

                ensureCurrentWeekRollover();
                recalculateStreakDays();
                syncSelectedDayMeals();
                hooks.rebuildGroceryList?.();

                if (!degradedWeek) {
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (e) {}
                }
                hooks.onApplyTheme?.(appState.theme, false);
                return true;
            }
        } catch (e) {}
        return false;
    }
};

let _cloudPushTimer = null;
export function scheduleCloudPush() {
    appState.updatedAt = Date.now();
    clearTimeout(_cloudPushTimer);
    _cloudPushTimer = setTimeout(() => CloudSync.push(), 900);
}

export function saveState() {
    recordTodaySnapshot();
    appState.updatedAt = Date.now();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (e) {}
    scheduleCloudPush();
}

export function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed?.user) return false;
        Object.assign(appState, parsed);
        if (appState.user && "muscleMass" in appState.user) delete appState.user.muscleMass;
        appState.theme = normalizeThemeId(appState.theme || "auto");
        if (!appState.activeTargets && appState.targets) appState.activeTargets = appState.targets;
        if (!appState.idealTargets) appState.idealTargets = appState.activeTargets;
        if (!appState.startedAt) appState.startedAt = getTodayStr();
        if (!appState.weekStartDate) appState.weekStartDate = getWeekStartDateStr();
        if (!appState.dateLogs) appState.dateLogs = {};
        if (!Array.isArray(appState.savedCustomMeals)) appState.savedCustomMeals = [];
        if (!appState.pinnedSlots || typeof appState.pinnedSlots !== "object") appState.pinnedSlots = {};
        if (typeof appState.lastAutoAdjustDate === "undefined") appState.lastAutoAdjustDate = null;
        if (!Array.isArray(appState.checkIns) || !appState.checkIns.length) {
            appState.checkIns = [{ date: appState.startedAt, weight: appState.user.weight }];
        }

        ensureCurrentWeekRollover();
        recalculateStreakDays();

        if (!Array.isArray(appState.weekPlan) || appState.weekPlan.length !== 7) {
            hooks.generateWeeklyPlanOptimized?.();
        }
        syncSelectedDayMeals();
        hooks.rebuildGroceryList?.();
        return true;
    } catch (e) {
        return false;
    }
}

export function applySmoothTargetTransition(newIdealTargets, reasonText = "Обновление замеров") {
    const prevActive = appState.activeTargets || appState.targets;
    appState.idealTargets = newIdealTargets;

    if (!prevActive) {
        const appLvl = Number(appState.user?.appetiteLevel) || 3;
        const factor = (appState.user?.goal !== "cut") ? (appLvl === 1 ? 0.82 : (appLvl === 2 ? 0.88 : 1.0)) : 1.0;
        const startKcal = Math.round(newIdealTargets.dailyKcal * factor);
        appState.activeTargets = scaleTargetsToKcal(newIdealTargets, startKcal);
        appState.targets = appState.activeTargets;
        appState.adaptation = factor < 1.0 ? {
            active: true, reason: "Плавная раскачка аппетита",
            startKcal, targetKcal: newIdealTargets.dailyKcal,
            stepKcal: 90, intervalDays: 4, lastStepDate: getTodayStr()
        } : null;
        return;
    }

    const diff = newIdealTargets.dailyKcal - prevActive.dailyKcal;
    const cap = Math.min(140, Math.round(prevActive.dailyKcal * 0.05));
    if (Math.abs(diff) <= cap) {
        appState.activeTargets = newIdealTargets;
        appState.targets = newIdealTargets;
        appState.adaptation = null;
    } else {
        const nextKcal = prevActive.dailyKcal + (diff > 0 ? cap : -cap);
        appState.activeTargets = scaleTargetsToKcal(newIdealTargets, nextKcal);
        appState.targets = appState.activeTargets;
        appState.adaptation = {
            active: true, reason: reasonText,
            startKcal: prevActive.dailyKcal, targetKcal: newIdealTargets.dailyKcal,
            stepKcal: cap, intervalDays: 4, lastStepDate: getTodayStr()
        };
    }
}

export function checkAndAdvanceAdaptation() {
    const ad = appState.adaptation;
    if (!ad?.active || !appState.idealTargets || !appState.activeTargets) return;
    const daysPassed = Math.floor((new Date(getTodayStr()) - new Date(ad.lastStepDate)) / 86400000);
    if (daysPassed < (ad.intervalDays || 4)) return;

    const diff = appState.idealTargets.dailyKcal - appState.activeTargets.dailyKcal;
    const step = Math.min(Math.abs(diff), ad.stepKcal || 100) * Math.sign(diff);
    const nextKcal = appState.activeTargets.dailyKcal + step;

    appState.activeTargets = scaleTargetsToKcal(appState.idealTargets, nextKcal);
    appState.targets = appState.activeTargets;
    ad.lastStepDate = getTodayStr();

    if (Math.abs(appState.idealTargets.dailyKcal - nextKcal) <= 25) {
        appState.activeTargets = appState.idealTargets;
        appState.targets = appState.idealTargets;
        appState.adaptation = null;
    }
    hooks.rebuildUneatenMealsForWeek?.();
    saveState();
}

/* =========================================================================
   AI WORKER + OPENFOODFACTS + ТЕЛЕМЕТРИЯ (X-TELEGRAM-INIT-DATA)
   ========================================================================= */
export function fallbackEstimateFood(desc) {
    const s = (desc || "").toLowerCase();
    if (/бургер|шаурм|пицц|фри|донер|ролл/.test(s)) return { kcal: 560, protein: 24, fat: 26, carbs: 56 };
    if (/латте|капучино|раф|коктейл/.test(s)) return { kcal: 190, protein: 7, fat: 8, carbs: 22 };
    if (/сырок|шоколад|торт|пирож|печень|батончик/.test(s)) return { kcal: 240, protein: 8, fat: 12, carbs: 26 };
    if (/творог|йогурт|кефир|яйц/.test(s)) return { kcal: 220, protein: 22, fat: 8, carbs: 14 };
    return { kcal: 360, protein: 18, fat: 14, carbs: 40 };
}

export async function calculateFoodWithAI(foodDescription) {
    const url = getWorkerUrl().replace(/\/$/, "");
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        const res = await fetch(url, {
            method: "POST",
            headers: getWorkerHeaders(true),
            body: JSON.stringify({ food_description: foodDescription }),
            signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.ok) {
            const data = await res.json();
            if (data && Number(data.kcal) > 0) {
                return {
                    kcal: Math.round(Number(data.kcal)),
                    protein: Math.round(Number(data.protein) || 12),
                    fat: Math.round(Number(data.fat) || 10),
                    carbs: Math.round(Number(data.carbs) || 30)
                };
            }
        }
    } catch (e) {}
    return fallbackEstimateFood(foodDescription);
}

export async function searchOpenFoodFactsByBrand(productName, brand, weightG) {
    if (!productName) return null;
    try {
        const query = encodeURIComponent(brand ? `${productName} ${brand}` : productName);
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,brands,nutriments`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4500);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return null;

        const data = await res.json();
        const products = (data.products || []).filter(p => p.nutriments && (p.nutriments["energy-kcal_100g"] || p.nutriments["energy-kcal"]));
        if (!products.length) return null;

        const brandLow = (brand || "").toLowerCase();
        const best = (brandLow && products.find(p => (p.brands || "").toLowerCase().includes(brandLow))) || products[0];
        const n = best.nutriments;
        const kcal100 = Number(n["energy-kcal_100g"] || n["energy-kcal"]);
        if (!kcal100 || kcal100 <= 0) return null;

        const g = Number(weightG) > 0 ? Number(weightG) : 100;
        const ratio = g / 100;
        const ex = reconcileMealMacros(
            Math.round(kcal100 * ratio),
            Number(n.proteins_100g || 0) * ratio,
            Number(n.fat_100g || 0) * ratio,
            Number(n.carbohydrates_100g || 0) * ratio
        );
        return Object.assign({
            source: "openfoodfacts",
            matchedLabel: `${best.product_name || productName}${best.brands ? ` (${best.brands})` : ""} · ${g} г`
        }, ex);
    } catch (e) {
        return null;
    }
}

export async function calculateAccurateProductNutrition(productName, brand = "", weightG = null) {
    if (brand && brand.trim().length >= 2) {
        const off = await searchOpenFoodFactsByBrand(productName, brand.trim(), weightG);
        if (off) return off;
    }
    const desc = [productName, brand ? `(производитель: ${brand})` : "", weightG ? `${weightG} г` : ""].filter(Boolean).join(" ");
    const ai = await calculateFoodWithAI(desc);
    return Object.assign({ source: "ai", matchedLabel: brand ? `AI учёл бренд «${brand}»` : "AI расчёт" }, ai);
}

export function sendTelemetryHeartbeat() {
    const uid = getCurrentTgUserId();
    const url = getWorkerUrl().replace(/\/$/, "");
    if (!uid || !url) return;
    fetch(`${url}/ping`, {
        method: "POST",
        headers: getWorkerHeaders(true),
        body: JSON.stringify({
            tg_id: uid,
            platform: tg?.platform || "web",
            db_count: store.MASTER_RECIPES_DB.length
        })
    }).catch(() => {});
}

export function getActiveSubTable() {
    return Array.isArray(store.DYNAMIC_SUBS_V4) && store.DYNAMIC_SUBS_V4.length
        ? store.DYNAMIC_SUBS_V4
        : SUBSTITUTIONS_V4;
}
