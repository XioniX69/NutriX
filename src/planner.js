/* =========================================================================
   NUTRIX v10 — src/planner.js
   Мульти-режимы, разнообразие и ротация белков, оптимизация БЖУ,
   закрепление слотов, Милпреп, конструктор пошагового приготовления
   из nutrix_cooking_guides.json и корзина по пачкам + граммам.
   ========================================================================= */

import {
    WEEK_DAYS,
    MAX_SAVED_CUSTOM_MEALS,
    getTodayDayIndex,
    getWeekStartDateStr,
    reconcileMealMacros,
    inferYieldFactor,
    toRawStoreGrams,
    toCookedPlateGrams,
    computeMealWeightsFromIngredients,
    formatHouseholdMeasure,
    formatRetailPack,
    recipeMatchesUserConstraints
} from "./math.js";

import {
    store,
    appState,
    getDayTypeTargets,
    syncSelectedDayMeals,
    saveState,
    getActiveSubTable
} from "./storage.js";

const EXOTIC_KEYWORDS = ["амарант", "тахини", "сейтан", "артишок", "ткемали", "конопл", "су-вид", "поке", "эдамаме", "чиа", "киноа", "креветк", "кальмар", "парфе", "матча", "страчателл", "краб", "осьминог"];
const SIMPLE_KEYWORDS = ["курин", "индейк", "греч", "рис", "овсян", "яйц", "творог", "говяж", "йогурт", "банан", "хлеб", "минтай", "горбуш", "картофел"];
const BUDGET_KEYWORDS = ["курин", "яйц", "творог", "греч", "овсян", "перлов", "ячнев", "пшен", "минтай", "горбуш", "сайр", "скумбр", "капуст", "огурец", "томат", "морков", "банан", "кефир", "ряженк", "простокваш"];
const PREMIUM_KEYWORDS = ["лосос", "сёмг", "форел", "кревет", "кальмар", "тунец", "авокад", "артишок", "амарант", "тахини", "конопл", "голубик", "кешью", "фисташк", "краб", "осьминог", "гребеш", "страчателл", "муксун", "палтус", "дорадо", "сибас"];

export function getUserPlanModes(user) {
    if (!user) return [];
    if (Array.isArray(user.planModes)) return user.planModes;
    return user.planMode ? [user.planMode] : [];
}

export function getMealDistribution(count) {
    if (count === 3) return [
        { name: "Завтрак", slot: "breakfast", share: 0.30 },
        { name: "Обед",    slot: "lunch",     share: 0.40 },
        { name: "Ужин",    slot: "dinner",    share: 0.30 }
    ];
    if (count === 5) return [
        { name: "Завтрак",        slot: "breakfast", share: 0.24 },
        { name: "Лёгкий перекус", slot: "snack",     share: 0.13 },
        { name: "Обед",           slot: "lunch",     share: 0.28 },
        { name: "Полдник",        slot: "snack",     share: 0.13 },
        { name: "Ужин",           slot: "dinner",    share: 0.22 }
    ];
    return [
        { name: "Завтрак", slot: "breakfast", share: 0.26 },
        { name: "Обед",    slot: "lunch",     share: 0.32 },
        { name: "Полдник", slot: "snack",     share: 0.16 },
        { name: "Ужин",    slot: "dinner",    share: 0.26 }
    ];
}

export function extractMainProteinKey(recipe) {
    const blob = `${recipe?.title_ru || recipe?.dishTitle || ""} ${(recipe?.ingredients || []).map(i => i.name).join(" ")}`.toLowerCase();
    if (/печен/.test(blob)) return "liver";
    if (/желуд/.test(blob)) return "gizzard";
    if (/сердеч|сердц/.test(blob)) return "heart";
    if (/курин|куриц/.test(blob)) return "chicken";
    if (/индейк/.test(blob)) return "turkey";
    if (/говяд|телят|язык/.test(blob)) return "beef";
    if (/кролик|утк|утин/.test(blob)) return "rabbit_duck";
    if (/форел|лосос|сёмг|кижуч|горбуш/.test(blob)) return "red_fish";
    if (/скумбр|сайр/.test(blob)) return "oily_canned_fish";
    if (/минта|хек|треск|судак|сибас|дорад|палтус|камбал|муксун|тунец/.test(blob)) return "white_fish";
    if (/кревет|кальмар|краб|гребеш|осьминог/.test(blob)) return "seafood";
    if (/яйц|омлет|яичн/.test(blob)) return "eggs";
    if (/творог|рикотт|скир|сыр|йогурт|кефир|ряженк|простокваш/.test(blob)) return "dairy";
    if (/тофу|нут|фасоль|чечевиц|горох/.test(blob)) return "plant";
    return "other";
}

export function filterMasterRecipesForUser(slotKey, user, excludeId = null) {
    const slotMap = {
        breakfast: ["Завтрак"],
        lunch: ["Обед"],
        dinner: ["Ужин"],
        snack: ["Перекус", "Десерт", "Завтрак"]
    };
    const allowedTypes = slotMap[slotKey] || ["Обед"];

    const filtered = store.MASTER_RECIPES_DB.filter(r => {
        if (excludeId && r.recipe_id === excludeId) return false;
        if (!allowedTypes.includes(r.meal_type)) return false;
        return recipeMatchesUserConstraints(r, user);
    });
    if (filtered.length > 0) return filtered;

    const anySafe = store.MASTER_RECIPES_DB.filter(r => r.recipe_id !== excludeId && recipeMatchesUserConstraints(r, user));
    if (anySafe.length > 0) return anySafe;

    const byType = store.MASTER_RECIPES_DB.filter(r => allowedTypes.includes(r.meal_type) && r.recipe_id !== excludeId);
    return byType.length ? byType : store.MASTER_RECIPES_DB;
}

export function classifyRecipeComplexity(recipe) {
    const time = Number(recipe.total_time_min) || 20;
    const ingCount = (recipe.ingredients || []).length;
    const text = (recipe.title_ru + " " + (recipe.ingredients || []).map(i => i.name).join(" ")).toLowerCase();
    const exoticHits = EXOTIC_KEYWORDS.filter(k => text.includes(k)).length;
    const simpleHits = SIMPLE_KEYWORDS.filter(k => text.includes(k)).length;
    if (time <= 22 && ingCount <= 5 && exoticHits === 0 && simpleHits >= 1) return "simple";
    if (exoticHits >= 1 || ingCount >= 6) return "exotic";
    return "balanced";
}

export function normalizeIngRoot(name) {
    return (name || "").toLowerCase().replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).join(" ");
}

export function scoreRecipeForUser(recipe, user) {
    let score = 10;
    const style = user?.cuisineStyle || "balanced";
    const appetite = Number(user?.appetiteLevel) || 3;
    const complexity = classifyRecipeComplexity(recipe);

    if (style === "simple") {
        if (complexity === "simple") score += 24;
        else if (complexity === "exotic") score -= 18;
        if ((recipe.total_time_min || 20) <= 18) score += 8;
    } else if (style === "exotic") {
        if (complexity === "exotic") score += 26;
        else if (complexity === "simple") score -= 8;
    }

    const n = recipe.nutrition || {};
    const weight = Math.max(100, Number(n.serving_weight_g) || 320);
    const density = (Number(n.serving_kcal) || 400) / weight;
    const fiber = Number(n.serving_fiber_g) || 4;

    if (appetite <= 2) {
        if (density >= 1.30) score += 14;
        if (/коктейль|смузи|паста|орех|авокад/i.test(recipe.title_ru)) score += 12;
        if (density < 0.85) score -= 10;
    } else if (appetite >= 4) {
        if (density <= 1.15) score += 12;
        if (fiber >= 7) score += 10;
    }

    if (user?.goal === "healthy" && (fiber >= 6 || (recipe.dietary_tags_ru || []).includes("Без сахара"))) score += 8;
    return score;
}

export function scoreRecipeWithModeAndOverlap(
    recipe,
    user,
    activeWindowIngs,
    usedRecipeIdsWeek,
    prevDayRecipeIds = null,
    weekProteinCounts = null,
    todayProteins = null,
    seedHash = 0
) {
    let score = scoreRecipeForUser(recipe, user);
    const modes = getUserPlanModes(user);
    const time = Number(recipe.total_time_min) || 20;
    const text = (recipe.title_ru + " " + (recipe.ingredients || []).map(i => i.name).join(" ")).toLowerCase();
    const pTier = typeof recipe.price_tier === "number" ? recipe.price_tier : 1;

    let matchedModes = 0;

    if (modes.includes("quick")) {
        if (time <= 15) { score += 32; matchedModes++; }
        else if (time <= 20) { score += 18; matchedModes++; }
        else score -= Math.min(35, (time - 20) * 1.3);
    }

    if (modes.includes("budget")) {
        if (pTier === 0) { score += 28; matchedModes++; }
        else if (pTier === 2) score -= 34;
        score += BUDGET_KEYWORDS.filter(k => text.includes(k)).length * 4;
        score -= PREMIUM_KEYWORDS.filter(k => text.includes(k)).length * 12;
    }

    if (modes.includes("mealprep")) {
        if ((recipe.shelf_life_hours || 36) >= 48) { score += 16; matchedModes++; }
    }

    // Синергетический бонус, если блюдо попадает сразу во все активные режимы
    if (modes.length >= 2 && matchedModes >= Math.min(2, modes.length)) {
        score += 18;
    }

    // Сильный анти-повтор рецептов по умолчанию (чтобы рацион не был однообразным)
    if (prevDayRecipeIds && prevDayRecipeIds.has(recipe.recipe_id)) {
        score -= 130;
    } else if (usedRecipeIdsWeek && usedRecipeIdsWeek.has(recipe.recipe_id)) {
        score -= modes.includes("diverse") ? 110 : 75;
    }

    // Ротация главного источника белка в рамках дня и недели
    const pKey = extractMainProteinKey(recipe);
    if (todayProteins && todayProteins.has(pKey) && pKey !== "dairy" && pKey !== "other") {
        score -= 42;
    }
    if (weekProteinCounts && pKey !== "dairy" && pKey !== "other") {
        const cnt = weekProteinCounts.get(pKey) || 0;
        if (cnt >= 2) score -= (cnt - 1) * 26;
    }

    // Аккуратный бонус за общие базовые ингредиенты (не перевешивает анти-повтор!)
    const overlapOn = appState.optimizeOverlap !== false || modes.includes("budget") || modes.includes("mealprep");
    if (overlapOn && activeWindowIngs && activeWindowIngs.size > 0) {
        const roots = (recipe.ingredients || []).map(i => normalizeIngRoot(i.name));
        const shared = roots.filter(r => activeWindowIngs.has(r)).length;
        score += Math.round((shared / Math.max(1, roots.length)) * (modes.includes("diverse") ? 6 : 16));
    }

    // Небольшой детерминированный джиттер по seedHash, чтобы «Обновить день/неделю» реально менял блюда
    if (seedHash) {
        let h = seedHash;
        const idStr = recipe.recipe_id || recipe.title_ru || "";
        for (let i = 0; i < idStr.length; i++) h = ((h * 31) + idStr.charCodeAt(i)) % 997;
        score += (h % 19) - 9;
    }

    return score;
}

export function scaleMasterRecipeToMeal(master, slotName, slotKey, mealId, targetKcal) {
    const n = master.nutrition || {};
    const baseKcal = Math.max(120, Number(n.serving_kcal) || 400);
    const scale = Math.max(0.45, Math.min(2.4, targetKcal / baseKcal));
    const exact = reconcileMealMacros(
        targetKcal,
        (n.serving_protein_g || 25) * scale,
        (n.serving_fat_g || 12) * scale,
        (n.serving_carbs_g || 40) * scale
    );

    const ingredients = (master.ingredients || []).map(i => ({
        name: i.name,
        state: i.state || "сырой",
        dept: i.dept || "Бакалея и крупы",
        yieldFactor: inferYieldFactor(i.name, i.state || "сырой", i.yieldFactor),
        weight: Math.max(5, Math.round((Number(i.amount_g) || 50) * scale)),
        alt: i.alt || ""
    }));

    const weights = computeMealWeightsFromIngredients(ingredients);

    return {
        id: mealId,
        name: slotName,
        slotKey,
        recipeId: master.recipe_id,
        dishTitle: master.title_ru,
        shortDescription: master.short_description || "",
        primaryCategory: master.primary_category_ru || "Сбалансированное питание",
        cuisine: master.cuisine || "Домашняя",
        priceTier: typeof master.price_tier === "number" ? master.price_tier : 1,
        prepTimeMin: master.prep_time_min || 6,
        cookTimeMin: master.cook_time_min || 12,
        prepTime: `${master.total_time_min || 18} мин`,
        cookingTempC: master.cooking_temperature_c || 100,
        dietaryTags: master.dietary_tags_ru || [],
        allergens: master.allergens_ru || [],
        rawWeightG: weights.rawWeightG || Math.round((n.raw_total_weight_g || 350) * scale),
        cookedWeightG: weights.cookedWeightG || Math.round((n.cooked_total_weight_g || 320) * scale),
        shelfLifeHours: master.shelf_life_hours || 36,
        stepsStructured: master.steps_structured || [],
        scienceTip: master.serving_recommendation || "",
        kcal: exact.kcal,
        protein: exact.protein,
        fat: exact.fat,
        carbs: exact.carbs,
        fiber: Math.max(1, Math.round((n.serving_fiber_g || 5) * scale)),
        eaten: false,
        isCustom: false,
        isOffPlan: false,
        isExtra: false,
        ingredients
    };
}

export function scaleMealPortions(meal, factor) {
    const f = Math.max(0.45, Math.min(1.6, factor));
    const nextKcal = Math.max(100, Math.round(meal.kcal * f));
    const ex = reconcileMealMacros(nextKcal, meal.protein * f, meal.fat * f, meal.carbs * f);
    Object.assign(meal, ex);
    (meal.ingredients || []).forEach(i => { i.weight = Math.max(5, Math.round(i.weight * f)); });
    const w = computeMealWeightsFromIngredients(meal.ingredients);
    meal.rawWeightG = w.rawWeightG || Math.round((meal.rawWeightG || 300) * f);
    meal.cookedWeightG = w.cookedWeightG || Math.round((meal.cookedWeightG || 280) * f);
}

export function isSlotPinned(slotName) {
    return Boolean(slotName && appState.pinnedSlots && appState.pinnedSlots[slotName]);
}

export function buildPinnedMealForSlot(pinSpec, slotName, slotKey, mealId, targetKcal) {
    if (!pinSpec) return null;
    if (pinSpec.isCustom) {
        const w = Number(pinSpec.weight) || 250;
        return {
            id: mealId,
            name: slotName,
            slotKey: slotKey || "snack",
            recipeId: "CUSTOM",
            dishTitle: pinSpec.dishTitle,
            shortDescription: "Закреплённое блюдо на все дни недели.",
            primaryCategory: "Мои блюда",
            cuisine: "Своё блюдо",
            prepTime: "Своё",
            kcal: Number(pinSpec.kcal) || 400,
            protein: Number(pinSpec.protein) || 20,
            fat: Number(pinSpec.fat) || 14,
            carbs: Number(pinSpec.carbs) || 42,
            fiber: 3,
            rawWeightG: w,
            cookedWeightG: w,
            shelfLifeHours: 24,
            eaten: false,
            isCustom: true,
            isOffPlan: false,
            isExtra: false,
            isPinned: true,
            ingredients: [{ name: pinSpec.dishTitle, weight: w, state: "готовый", dept: "Собственные блюда", yieldFactor: 1.0 }],
            stepsStructured: []
        };
    }
    const master = store.MASTER_RECIPES_DB.find(r => r.recipe_id === pinSpec.recipeId);
    if (!master) return null;
    const scaled = scaleMasterRecipeToMeal(master, slotName, slotKey, mealId, targetKcal);
    scaled.isPinned = true;
    return scaled;
}

export function evaluateDayMacroPenalty(meals, dayT) {
    const totals = meals.reduce((a, m) => {
        a.p += Number(m.protein) || 0;
        a.f += Number(m.fat) || 0;
        a.c += Number(m.carbs) || 0;
        return a;
    }, { p: 0, f: 0, c: 0 });

    const pErr = Math.abs(totals.p - dayT.protein) / Math.max(1, dayT.protein);
    const fErr = Math.abs(totals.f - dayT.fat) / Math.max(1, dayT.fat);
    const cErr = Math.abs(totals.c - dayT.carbs) / Math.max(1, dayT.carbs);

    const pExcess = Math.max(0, pErr - 0.10) * 12;
    const fExcess = Math.max(0, fErr - 0.15) * 9;
    return (pErr * 3.2) + (fErr * 2.4) + (cErr * 1.0) + pExcess + fExcess;
}

export function optimizeDayMealsForMacros(
    dayIdx,
    dist,
    dayT,
    slotCandidates,
    lockedMealsMap = {},
    seed = 0,
    usedWeek = null
) {
    let acc = 0;
    const slotKcals = dist.map((slotObj, mIdx) => {
        if (lockedMealsMap[mIdx]) {
            acc += lockedMealsMap[mIdx].kcal;
            return lockedMealsMap[mIdx].kcal;
        }
        const isLast = mIdx === dist.length - 1;
        const k = isLast ? Math.max(150, dayT.dailyKcal - acc) : Math.round(dayT.dailyKcal * slotObj.share);
        acc += k;
        return k;
    });

    const chosenInDayIds = new Set(Object.values(lockedMealsMap).map(m => m.recipeId).filter(Boolean));
    const chosenInDayProteins = new Set(Object.values(lockedMealsMap).map(m => extractMainProteinKey(m)));

    const currentMeals = dist.map((slotObj, mIdx) => {
        if (lockedMealsMap[mIdx]) return lockedMealsMap[mIdx];
        const cands = slotCandidates[mIdx] || [];
        // Выбираем первого кандидата, который не повторяется в этом дне и по возможности имеет другой белок
        let pick = cands.find(c => !chosenInDayIds.has(c.recipe_id) && !chosenInDayProteins.has(extractMainProteinKey(c)))
            || cands.find(c => !chosenInDayIds.has(c.recipe_id))
            || cands[(dayIdx + mIdx + seed) % Math.max(1, cands.length)]
            || store.MASTER_RECIPES_DB[0];
        chosenInDayIds.add(pick.recipe_id);
        chosenInDayProteins.add(extractMainProteinKey(pick));
        return scaleMasterRecipeToMeal(pick, slotObj.name, slotObj.slot, `day_${dayIdx}_meal_${mIdx + 1}`, slotKcals[mIdx]);
    });

    let bestPenalty = evaluateDayMacroPenalty(currentMeals, dayT);

    for (let pass = 0; pass < 2; pass++) {
        if (bestPenalty <= 0.16) break;
        for (let mIdx = 0; mIdx < dist.length; mIdx++) {
            if (lockedMealsMap[mIdx]) continue;
            const cands = slotCandidates[mIdx] || [];
            const usedInDay = new Set(currentMeals.filter((_, i) => i !== mIdx).map(m => m.recipeId));
            const otherProteins = new Set(currentMeals.filter((_, i) => i !== mIdx).map(m => extractMainProteinKey(m)));
            let localBestMeal = currentMeals[mIdx];
            let localBestScore = bestPenalty;

            for (let cIdx = 0; cIdx < Math.min(cands.length, 18); cIdx++) {
                const cand = cands[cIdx];
                if (usedInDay.has(cand.recipe_id)) continue;
                const trialMeal = scaleMasterRecipeToMeal(cand, dist[mIdx].name, dist[mIdx].slot, `day_${dayIdx}_meal_${mIdx + 1}`, slotKcals[mIdx]);
                const trialMeals = currentMeals.slice();
                trialMeals[mIdx] = trialMeal;
                const macroPen = evaluateDayMacroPenalty(trialMeals, dayT);
                const weekRepeatPen = (usedWeek && usedWeek.has(cand.recipe_id)) ? 0.55 : 0;
                const sameProtKey = extractMainProteinKey(cand);
                const protPen = (otherProteins.has(sameProtKey) && sameProtKey !== "dairy" && sameProtKey !== "other") ? 0.25 : 0;
                const totalScore = macroPen + weekRepeatPen + protPen + cIdx * 0.01;
                if (totalScore < localBestScore) {
                    localBestScore = totalScore;
                    localBestMeal = trialMeal;
                }
            }
            currentMeals[mIdx] = localBestMeal;
            bestPenalty = evaluateDayMacroPenalty(currentMeals, dayT);
        }
    }

    return currentMeals;
}

export function buildMealsForOneDay(dayIdx, seed = 0) {
    const user = appState.user;
    const dist = getMealDistribution(Number(user.mealsCount) || 4);
    const dayT = getDayTypeTargets(dayIdx);
    const usedWeek = new Set();
    const prevDayIds = new Set();
    const weekProteinCounts = new Map();
    const anchor = new Set();

    // Собираем блюда и белки соседних дней, чтобы обновлённый день не повторял остальную неделю
    (appState.weekPlan || []).forEach((d, idx) => {
        if (idx === dayIdx) return;
        (d.meals || []).forEach(m => {
            if (m.recipeId) {
                usedWeek.add(m.recipeId);
                if (Math.abs(idx - dayIdx) === 1) prevDayIds.add(m.recipeId);
            }
            const pk = extractMainProteinKey(m);
            weekProteinCounts.set(pk, (weekProteinCounts.get(pk) || 0) + 1);
        });
    });

    const lockedMealsMap = {};
    const todayProteins = new Set();

    const slotCandidates = dist.map((slotObj, mIdx) => {
        const pinSpec = appState.pinnedSlots?.[slotObj.name];
        if (pinSpec) {
            const mKcal = Math.max(150, Math.round(dayT.dailyKcal * slotObj.share));
            const pinnedMeal = buildPinnedMealForSlot(pinSpec, slotObj.name, slotObj.slot, `day_${dayIdx}_meal_${mIdx + 1}`, mKcal);
            if (pinnedMeal) {
                lockedMealsMap[mIdx] = pinnedMeal;
                if (pinnedMeal.recipeId) usedWeek.add(pinnedMeal.recipeId);
                todayProteins.add(extractMainProteinKey(pinnedMeal));
                (pinnedMeal.ingredients || []).forEach(i => anchor.add(normalizeIngRoot(i.name)));
                return [];
            }
        }
        const pool = filterMasterRecipesForUser(slotObj.slot, user)
            .sort((a, b) =>
                scoreRecipeWithModeAndOverlap(b, user, anchor, usedWeek, prevDayIds, weekProteinCounts, todayProteins, seed * 17 + dayIdx + mIdx) -
                scoreRecipeWithModeAndOverlap(a, user, anchor, usedWeek, prevDayIds, weekProteinCounts, todayProteins, seed * 17 + dayIdx + mIdx)
            );
        return pool.slice(0, Math.min(pool.length, 22));
    });

    return optimizeDayMealsForMacros(dayIdx, dist, dayT, slotCandidates, lockedMealsMap, seed, usedWeek);
}

export function generateWeeklyPlanOptimized() {
    const user = appState.user;
    if (!user) return;
    const modes = getUserPlanModes(user);
    const isMealPrep = modes.includes("mealprep");
    const dist = getMealDistribution(Number(user.mealsCount) || 4);
    const usedWeek = new Set();
    const weekProteinCounts = new Map();
    const windowAnchors = [new Set(), new Set()];
    const newWeek = [];

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const winIdx = dayIdx <= 2 ? 0 : 1;
        const dayT = getDayTypeTargets(dayIdx);
        const prevMeals = newWeek[dayIdx - 1]?.meals || [];
        const prevDayIds = new Set(prevMeals.map(m => m.recipeId).filter(Boolean));
        const existingMeals = appState.weekPlan?.[dayIdx]?.meals || [];
        const extraToKeep = existingMeals.filter(m => m.isOffPlan || m.isExtra);
        const todayProteins = new Set();

        const lockedMealsMap = {};
        const slotCandidates = dist.map((slotObj, mIdx) => {
            const existing = existingMeals[mIdx];
            if (existing && existing.eaten && !existing.isOffPlan && !existing.isExtra) {
                lockedMealsMap[mIdx] = existing;
                todayProteins.add(extractMainProteinKey(existing));
                return [];
            }

            const pinSpec = appState.pinnedSlots?.[slotObj.name];
            if (pinSpec) {
                const mKcal = Math.max(150, Math.round(dayT.dailyKcal * slotObj.share));
                const pinnedMeal = buildPinnedMealForSlot(pinSpec, slotObj.name, slotObj.slot, `day_${dayIdx}_meal_${mIdx + 1}`, mKcal);
                if (pinnedMeal) {
                    lockedMealsMap[mIdx] = pinnedMeal;
                    todayProteins.add(extractMainProteinKey(pinnedMeal));
                    return [];
                }
            }

            if (isMealPrep && dayIdx % 2 === 1 && prevMeals?.[mIdx] && !prevMeals[mIdx].isCustom && (slotObj.slot === "lunch" || slotObj.slot === "dinner")) {
                const master = store.MASTER_RECIPES_DB.find(r => r.recipe_id === prevMeals[mIdx].recipeId);
                if (master) {
                    const mKcal = Math.max(150, Math.round(dayT.dailyKcal * slotObj.share));
                    lockedMealsMap[mIdx] = scaleMasterRecipeToMeal(master, slotObj.name, slotObj.slot, `day_${dayIdx}_meal_${mIdx + 1}`, mKcal);
                    todayProteins.add(extractMainProteinKey(lockedMealsMap[mIdx]));
                    return [];
                }
            }

            const seedHash = (store.variationSeed + 1) * 37 + dayIdx * 13 + mIdx * 7;
            const pool = filterMasterRecipesForUser(slotObj.slot, user)
                .sort((a, b) =>
                    scoreRecipeWithModeAndOverlap(b, user, windowAnchors[winIdx], usedWeek, prevDayIds, weekProteinCounts, todayProteins, seedHash) -
                    scoreRecipeWithModeAndOverlap(a, user, windowAnchors[winIdx], usedWeek, prevDayIds, weekProteinCounts, todayProteins, seedHash)
                );
            return pool.slice(0, Math.max(1, Math.min(pool.length, 22)));
        });

        const meals = optimizeDayMealsForMacros(dayIdx, dist, dayT, slotCandidates, lockedMealsMap, store.variationSeed, usedWeek);
        meals.forEach(m => {
            if (m.recipeId) usedWeek.add(m.recipeId);
            const pk = extractMainProteinKey(m);
            weekProteinCounts.set(pk, (weekProteinCounts.get(pk) || 0) + 1);
            (m.ingredients || []).forEach(i => windowAnchors[winIdx].add(normalizeIngRoot(i.name)));
        });

        newWeek.push({
            dayIndex: dayIdx,
            short: WEEK_DAYS[dayIdx].short,
            full: WEEK_DAYS[dayIdx].full,
            dayType: dayT.dayType,
            meals: meals.concat(extraToKeep)
        });
    }

    appState.weekPlan = newWeek;
    if (!appState.weekStartDate) appState.weekStartDate = getWeekStartDateStr();
    syncSelectedDayMeals();
    rebuildGroceryList();
    saveState();
}

export function rebuildUneatenMealsForWeek() {
    generateWeeklyPlanOptimized();
}

export function getMealPrepPairInfo(dayIdx, meal) {
    const modes = getUserPlanModes(appState.user);
    if (!modes.includes("mealprep")) return null;
    if (!meal || meal.isCustom || meal.isOffPlan || !meal.recipeId) return null;

    const week = appState.weekPlan || [];
    const checkPartner = (otherIdx) => {
        const otherDay = week[otherIdx];
        if (!otherDay) return null;
        const match = (otherDay.meals || []).find(
            m => !m.isCustom && !m.isOffPlan && m.recipeId === meal.recipeId && m.name === meal.name
        );
        return match ? { otherIdx, partnerMeal: match } : null;
    };

    const preferredIdx = dayIdx % 2 === 0 ? dayIdx + 1 : dayIdx - 1;
    const hit = (preferredIdx >= 0 && preferredIdx < 7 ? checkPartner(preferredIdx) : null)
        || (dayIdx + 1 < 7 ? checkPartner(dayIdx + 1) : null)
        || (dayIdx - 1 >= 0 ? checkPartner(dayIdx - 1) : null);

    if (!hit) return null;

    const firstIdx = Math.min(dayIdx, hit.otherIdx);
    const secondIdx = Math.max(dayIdx, hit.otherIdx);
    return {
        isMealPrep: true,
        firstIdx,
        secondIdx,
        partnerIdx: hit.otherIdx,
        label: `${WEEK_DAYS[firstIdx].short} + ${WEEK_DAYS[secondIdx].short}`
    };
}

export function saveCustomMealToLibrary(entry) {
    if (!entry?.title) return;
    if (!Array.isArray(appState.savedCustomMeals)) appState.savedCustomMeals = [];
    const normTitle = entry.title.trim().toLowerCase();

    appState.savedCustomMeals = appState.savedCustomMeals.filter(
        item => (item.title || "").trim().toLowerCase() !== normTitle
    );
    appState.savedCustomMeals.unshift({
        id: `scm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: entry.title.trim(),
        kcal: Number(entry.kcal) || 400,
        protein: Number(entry.protein) || 20,
        fat: Number(entry.fat) || 14,
        carbs: Number(entry.carbs) || 42,
        weight: Number(entry.weight) || 250
    });

    if (appState.savedCustomMeals.length > MAX_SAVED_CUSTOM_MEALS) {
        appState.savedCustomMeals = appState.savedCustomMeals.slice(0, MAX_SAVED_CUSTOM_MEALS);
    }
}

export function findInlineSubs(ingName, fallbackAlt = "") {
    const table = getActiveSubTable();
    const lower = (ingName || "").toLowerCase();
    const hits = table.filter(s =>
        s.match ? s.match.test(ingName) : lower.includes((s.source || "").toLowerCase().split("(")[0].trim())
    );
    if (hits.length) return hits.slice(0, 2);
    if (fallbackAlt) {
        return fallbackAlt.split(",").slice(0, 2).map(a => ({
            target: a.trim(), ratio: 1.0, dKcal: 0, dP: 0, dF: 0, dC: 0, eq: "Аналог", note: "Рекомендация рецепта"
        })).filter(x => x.target);
    }
    return [];
}

/* =========================================================================
   КОНСТРУКТОР ПОДРОБНОГО ПРИГОТОВЛЕНИЯ ИЗ NUTRIX_COOKING_GUIDES.JSON
   ========================================================================= */
function formatIngQtyForStep(ing, weightMode, mult) {
    if (weightMode === "visual") {
        const m = formatHouseholdMeasure(ing, mult);
        return m.primary;
    }
    const g = weightMode === "cooked"
        ? Math.round(toCookedPlateGrams(ing) * mult)
        : Math.round(toRawStoreGrams(ing) * mult);
    return `${g} г`;
}

export function buildDetailedCookingSteps(meal, weightMode = "raw", mult = 1) {
    // Если у встроенного рецепта (EMBEDDED_MASTER_V4) уже есть авторские шаги — оставляем их
    if (Array.isArray(meal?.stepsStructured) && meal.stepsStructured.length > 0) {
        return meal.stepsStructured;
    }

    const guides = store.COOKING_GUIDES;
    const ings = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
    if (!ings.length || meal?.isCustom) {
        return [{
            step_number: 1,
            stage_name: "Подача",
            duration_min: 2,
            instruction: "Подготовь порцию и подавай к столу."
        }];
    }

    const fmt = (ing) => formatIngQtyForStep(ing, weightMode, mult);
    const matchRule = (list, name) => (list || []).find(r => new RegExp(r.match, "i").test(name || ""));

    const grainItems = [];
    const proteinItems = [];
    const cookedVegItems = [];
    const freshVegItems = [];
    const finisherItems = [];
    const dairyOrFruitBase = [];

    ings.forEach(ing => {
        const n = ing.name || "";
        const gRule = matchRule(guides?.grains, n);
        const pRule = matchRule(guides?.proteins, n);
        const vRule = matchRule(guides?.vegs, n);
        const fRule = matchRule(guides?.finishers, n);

        if (gRule) grainItems.push({ ing, rule: gRule });
        else if (pRule) proteinItems.push({ ing, rule: pRule });
        else if (vRule) {
            if (vRule.cooked) cookedVegItems.push({ ing, rule: vRule });
            else freshVegItems.push({ ing, rule: vRule });
        } else if (fRule && (proteinItems.length || grainItems.length || cookedVegItems.length || /масло|соевый соус|песто|орех|семен|семечк|отруб|урбеч|паста арахис|изюм|кураг|шоколад|какао/i.test(n))) {
            finisherItems.push({ ing, rule: fRule });
        } else {
            dairyOrFruitBase.push(ing);
        }
    });

    const steps = [];
    const pushStep = (stage, durationMin, text) => {
        steps.push({
            step_number: steps.length + 1,
            stage_name: stage,
            duration_min: durationMin,
            instruction: text
        });
    };

    const fillTemplate = (tpl, ing, rule = {}) => {
        return String(tpl || "")
            .replace(/\{name\}/g, (ing.name || "").toLowerCase())
            .replace(/\{qty\}/g, fmt(ing))
            .replace(/\{spices\}/g, rule.spices || "соль, перец, любимые специи");
    };

    const isNoCookMeal = grainItems.length === 0
        && cookedVegItems.length === 0
        && proteinItems.every(p => (p.rule.timeMin || 0) <= 3);

    if (isNoCookMeal) {
        const baseList = [...dairyOrFruitBase, ...proteinItems.map(p => p.ing)].filter(Boolean);
        if (baseList.length) {
            const desc = baseList.map(i => `${i.name.toLowerCase()} (${fmt(i)})`).join(", ");
            pushStep("Подготовь основу", 2, `Выложи в глубокую миску или на тарелку: ${desc}. Фрукты и ягоды предварительно промой и нарежь удобными кусочками.`);
        }
        if (freshVegItems.length) {
            const txt = freshVegItems.map(v => fillTemplate(v.rule.text, v.ing, v.rule)).join(" ");
            pushStep("Нарежь свежие добавки", 2, txt);
        }
        if (finisherItems.length) {
            const fins = finisherItems.map(f => `${f.ing.name.toLowerCase()} (${fmt(f.ing)})`).join(", ");
            pushStep("Добавь топпинги и перемешай", 1, `Добавь сверху ${fins}, аккуратно перемешай и сразу подавай к столу.`);
        } else {
            pushStep("Сборка и подача", 1, "Аккуратно соедини все ингредиенты, при желании добавь щепотку корицы или свежемолотого перца и подавай.");
        }
        return steps;
    }

    // 1. Сначала ставим гарнир (если варится долго)
    grainItems.forEach(({ ing, rule }) => {
        pushStep(rule.stage || "Приготовь гарнир", rule.timeMin || 15, fillTemplate(rule.text, ing, rule));
    });

    // 2. Параллельно готовим основной белок
    proteinItems.forEach(({ ing, rule }) => {
        pushStep(rule.stage || "Приготовь основу", rule.timeMin || 15, fillTemplate(rule.text, ing, rule));
    });

    // 3. Термообработанные овощи / грибы
    if (cookedVegItems.length) {
        const txt = cookedVegItems.map(v => fillTemplate(v.rule.text, v.ing, v.rule)).join(" ");
        const maxT = Math.max(...cookedVegItems.map(v => v.rule.timeMin || 6));
        pushStep("Подготовь овощной гарнир", maxT, txt);
    }

    // 4. Свежие овощи / фрукты / зелень
    if (freshVegItems.length || dairyOrFruitBase.length) {
        const parts = [];
        freshVegItems.forEach(v => parts.push(fillTemplate(v.rule.text, v.ing, v.rule)));
        if (dairyOrFruitBase.length) {
            const listStr = dairyOrFruitBase.map(i => `${i.name.toLowerCase()} (${fmt(i)})`).join(", ");
            parts.push(`Подготовь и выложи рядом: ${listStr}.`);
        }
        pushStep("Подготовь свежие ингредиенты", 3, parts.join(" "));
    }

    // 5. Финальная заправка и сборка
    if (finisherItems.length) {
        const txt = finisherItems.map(f => fillTemplate(f.rule.text, f.ing, f.rule)).join(" ");
        pushStep("Заправка и подача", 2, `${txt} Собери всё в одной тарелке и дай блюду 2 минуты, чтобы ароматы соединились.`);
    } else {
        pushStep("Сборка и подача", 2, "Выложи гарнир, основной белок и овощи на тарелку, по вкусу добавь свежую зелень и подавай тёплым.");
    }

    return steps;
}

/* =========================================================================
   УМНАЯ КОРЗИНА ПОКУПОК (ПО ПАЧКАМ + ГРАММОВКА + СКЛЕИВАНИЕ ДУБЛЕЙ)
   ========================================================================= */
export function getIncludedDaysForGrocery() {
    if (!appState.weekPlan?.length) return [];
    if (store.groceryPeriod === 7) return appState.weekPlan;
    const out = [];
    for (let i = 0; i < store.groceryPeriod; i++) {
        out.push(appState.weekPlan[(store.selectedDayIndex + i) % 7]);
    }
    return out;
}

function isPerishableIngredient(dept, ingName) {
    const n = (ingName || "").toLowerCase();
    return dept === "Мясо и птица"
        || dept === "Рыба и морепродукты"
        || /шпинат|руккол|зелен|голубик|клубник|малин|томат|огурец|салат|микрозелен/.test(n);
}

function isRealRecipeIngredient(ing, meal) {
    if (!ing || !ing.name) return false;
    if (meal.isCustom && (ing.dept === "Собственные блюда" || ing.name === meal.dishTitle)) return false;
    return true;
}

export function rebuildGroceryList() {
    if (!appState.checkedGroceries) appState.checkedGroceries = {};
    const targetDays = getIncludedDaysForGrocery();
    const todayIdx = getTodayDayIndex();
    const agg = {};
    let totalUses = 0;
    let uniqueCount = 0;

    targetDays.forEach((dayObj, idxInPeriod) => {
        const wave = idxInPeriod <= 2 ? 1 : 2;
        const isToday = dayObj.dayIndex === todayIdx;
        (dayObj.meals || []).forEach(meal => {
            if (meal.isOffPlan) return;
            if (isToday && meal.eaten) return;
            const validIngs = (meal.ingredients || []).filter(ing => isRealRecipeIngredient(ing, meal));
            if (meal.isCustom && validIngs.length === 0) return;

            validIngs.forEach(ing => {
                const groupKey = ing.dept || "Бакалея и крупы";
                // Единый канонический ключ (убираем уточнение способа готовки, если попался старый кеш)
                const cleanKey = (ing.name || "")
                    .replace(/\s*\((?:варёный|запечённый|жареный|отварной|свежий)[^)]*\)/gi, "")
                    .trim();
                if (!agg[groupKey]) agg[groupKey] = {};
                if (!agg[groupKey][cleanKey]) {
                    agg[groupKey][cleanKey] = {
                        rawWeight: 0,
                        cookedWeight: 0,
                        dishes: new Set(),
                        waves: new Set(),
                        alt: ing.alt || "",
                        isPerishable: isPerishableIngredient(groupKey, cleanKey)
                    };
                    uniqueCount++;
                }
                agg[groupKey][cleanKey].rawWeight += toRawStoreGrams(ing);
                agg[groupKey][cleanKey].cookedWeight += toCookedPlateGrams(ing);
                agg[groupKey][cleanKey].dishes.add(`${dayObj.short} · ${meal.name}`);
                agg[groupKey][cleanKey].waves.add(wave);
                totalUses++;
            });
        });
    });

    if (Array.isArray(appState.customGroceries) && appState.customGroceries.length) {
        agg["Добавлено вручную"] = {};
        appState.customGroceries.forEach(ci => {
            agg["Добавлено вручную"][ci.name] = {
                rawWeight: 0,
                cookedWeight: 0,
                dishes: new Set(["Своя покупка"]),
                waves: new Set([1]),
                alt: "",
                isPerishable: false
            };
        });
    }

    const activeItemNames = new Set();
    const list = {};
    Object.keys(agg).forEach(group => {
        list[group] = Object.entries(agg[group]).map(([name, info]) => {
            activeItemNames.add(name);
            const rawW = Math.round(info.rawWeight);
            const pack = formatRetailPack(name, rawW);
            return {
                name,
                weight: rawW,
                cookedWeight: Math.round(info.cookedWeight),
                packLabel: pack.packLabel,
                gramsSub: pack.gramsSub,
                checkHome: pack.checkHome,
                dishes: Array.from(info.dishes).slice(0, 3).join(" · "),
                isPerishableWave: Boolean(store.groceryPeriod === 7 && info.isPerishable),
                waveLabel: (store.groceryPeriod === 7 && info.isPerishable)
                    ? (info.waves.size === 2 ? "Скоропорт · Пн + Чт" : (info.waves.has(1) ? "Скоропорт · Пн–Ср" : "Скоропорт · Чт–Вс"))
                    : "",
                alt: info.alt,
                isChecked: Boolean(appState.checkedGroceries[name])
            };
        });
    });

    Object.keys(appState.checkedGroceries).forEach(key => {
        if (!activeItemNames.has(key)) delete appState.checkedGroceries[key];
    });

    appState.groceryList = list;
    appState.groceryReusePct = totalUses > 0 ? Math.max(0, Math.round((1 - uniqueCount / totalUses) * 100)) : 0;
}
