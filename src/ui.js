/* =========================================================================
   NUTRIX v10 — src/ui.js
   Темы (auto/obsidian/daylight), 5-шаговый онбординг (мульти-спорт),
   адаптивное приветствие, режим «Без весов», пошаговое приготовление из
   кулинарной базы, «Совет от NutriX», мульти-режимы, добавление/удаление
   приёма пищи, корзина по пачкам + граммам и понятная карточка облака.
   ========================================================================= */

import {
    WEEK_DAYS,
    MAX_SAVED_CUSTOM_MEALS,
    NUTRIX_THEMES,
    ACTIVITY_LEVEL_TIERS,
    SPORT_PROFILES,
    DAY_TYPE_META,
    GOALS_V4,
    APPETITE_LEVELS,
    escapeHtml,
    pluralRu,
    formatCountRu,
    getTodayStr,
    getTodayDayIndex,
    getWeekStartDateStr,
    getAdaptiveGreeting,
    getUserSportTypes,
    getAvailableDayTypesForUser,
    formatUserSportsShort,
    activityScoreToPal,
    palToActivityScore,
    computePrecisionScore,
    calculateTargets,
    scaleTargetsToKcal,
    toRawStoreGrams,
    toCookedPlateGrams,
    formatHouseholdMeasure,
    generateNutriXAdvice,
    recipeMatchesUserConstraints,
    computeSmoothedWeightTrend,
    evaluatePlanAdherence
} from "./math.js";

import {
    tg,
    store,
    appState,
    STORAGE_KEY,
    haptic,
    hapticSelect,
    NutriXPerf,
    getWorkerUrl,
    setWorkerUrl,
    getWorkerHeaders,
    isOwnerAdmin,
    normalizeThemeId,
    resolveEffectiveTheme,
    parseLiteMasterJson,
    parseRelationalMasterJson,
    saveMasterDbToIndexedDb,
    tryAutoFetchMasterDb,
    getTrainingDaysMap,
    getDayTypeTargets,
    getDayNutritionStats,
    syncSelectedDayMeals,
    recordTodaySnapshot,
    CloudSync,
    saveState,
    applySmoothTargetTransition,
    calculateAccurateProductNutrition,
    getActiveSubTable
} from "./storage.js";

import {
    getUserPlanModes,
    getMealDistribution,
    filterMasterRecipesForUser,
    scoreRecipeForUser,
    scaleMasterRecipeToMeal,
    scaleMealPortions,
    isSlotPinned,
    buildPinnedMealForSlot,
    buildMealsForOneDay,
    generateWeeklyPlanOptimized,
    rebuildUneatenMealsForWeek,
    getMealPrepPairInfo,
    saveCustomMealToLibrary,
    findInlineSubs,
    buildDetailedCookingSteps,
    getIncludedDaysForGrocery,
    rebuildGroceryList
} from "./planner.js";

/* =========================================================================
   ТОСТ, КРУГОВОЙ ЗАГРУЗЧИК И 60 FPS АНИМАЦИИ
   ========================================================================= */
let _toastTimer = null;
export function showToast(text) {
    const el = document.getElementById("nx-toast");
    if (!el) return;
    el.innerText = String(text ?? "");
    el.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

export const NutriXLoader = {
    _raf: null,
    run(stages, onComplete, durationMs = 480) {
        const overlay = document.getElementById("nx-loader");
        const arc = document.getElementById("nx-loader-arc");
        const pctEl = document.getElementById("nx-loader-pct");
        const titleEl = document.getElementById("nx-loader-title");
        const subEl = document.getElementById("nx-loader-sub");
        if (!overlay || !arc) { onComplete?.(); return; }

        const circ = 376.99;
        overlay.classList.add("visible");
        const t0 = performance.now();

        const tick = (now) => {
            const p = Math.min(1, (now - t0) / Math.max(200, durationMs));
            const eased = 1 - Math.pow(1 - p, 3);
            const pct = Math.round(eased * 100);
            arc.style.strokeDashoffset = (circ * (1 - eased)).toFixed(2);
            if (pctEl) pctEl.innerText = `${pct}%`;

            const activeStage = stages.find(s => pct <= s.pct) || stages[stages.length - 1];
            if (activeStage) {
                if (titleEl) titleEl.innerText = activeStage.title;
                if (subEl) subEl.innerText = activeStage.sub;
            }

            if (p < 1) {
                this._raf = requestAnimationFrame(tick);
            } else {
                setTimeout(() => {
                    overlay.classList.remove("visible");
                    onComplete?.();
                }, 90);
            }
        };
        cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(tick);
    }
};

export const NutriXMotion = {
    _tweens: new WeakMap(),
    tweenNumber(el, target, suffix = "", duration = 360) {
        if (!el) return;
        const prev = Number(el.dataset.val ?? (parseFloat(el.innerText.replace(/\s+/g, "")) || 0));
        const end = Math.round(Number(target) || 0);
        el.dataset.val = String(end);
        if (prev === end) { el.innerText = end.toLocaleString("ru-RU") + suffix; return; }

        const oldRaf = this._tweens.get(el);
        if (oldRaf) cancelAnimationFrame(oldRaf);
        const t0 = performance.now();

        const step = (now) => {
            const p = Math.min(1, (now - t0) / duration);
            const val = Math.round(prev + (end - prev) * (1 - Math.pow(1 - p, 3)));
            el.innerText = val.toLocaleString("ru-RU") + suffix;
            if (p < 1) this._tweens.set(el, requestAnimationFrame(step));
        };
        this._tweens.set(el, requestAnimationFrame(step));
    },

    triggerWave() {
        const wave = document.getElementById("nx-zg-wave");
        if (!wave) return;
        wave.classList.remove("active");
        void wave.offsetWidth;
        wave.classList.add("active");
        setTimeout(() => wave.classList.remove("active"), 780);
    },

    staggerScreen(containerId) {
        const root = document.getElementById(containerId);
        if (!root) return;
        root.querySelectorAll("[data-nx-stagger]").forEach((el, idx) => {
            el.style.setProperty("--i", String(Math.min(idx, 7)));
            el.classList.remove("nx-stagger-in");
            void el.offsetWidth;
            el.classList.add("nx-stagger-in");
        });
    },

    attachSwipe(cardEl, mealId) {
        let startX = 0, startY = 0, dx = 0, tracking = false, locked = false;
        cardEl.addEventListener("touchstart", (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            dx = 0; tracking = true; locked = false;
        }, { passive: true });

        cardEl.addEventListener("touchmove", (e) => {
            if (!tracking) return;
            const curX = e.touches[0].clientX - startX;
            const curY = e.touches[0].clientY - startY;
            if (!locked) {
                if (Math.abs(curY) > Math.abs(curX) && Math.abs(curY) > 10) { tracking = false; return; }
                if (Math.abs(curX) > 12) { locked = true; cardEl.classList.add("dragging"); }
            }
            if (locked) {
                dx = Math.max(-105, Math.min(105, curX));
                cardEl.style.transform = `translate3d(${dx}px, 0, 0)`;
            }
        }, { passive: true });

        const finish = () => {
            if (!tracking) return;
            tracking = false;
            cardEl.classList.remove("dragging");
            cardEl.style.transform = "translate3d(0, 0, 0)";
            if (dx >= 68) toggleMealEaten(mealId);
            else if (dx <= -68) swapSingleMeal(mealId);
            dx = 0;
        };
        cardEl.addEventListener("touchend", finish, { passive: true });
        cardEl.addEventListener("touchcancel", finish, { passive: true });
    }
};

/* =========================================================================
   ТЕМЫ ОФОРМЛЕНИЯ (AUTO / OBSIDIAN / DAYLIGHT)
   ========================================================================= */
export function applyTheme(themeId, persist = true) {
    const modeId = normalizeThemeId(themeId);
    const effective = resolveEffectiveTheme(modeId);
    const bgHex = effective === "daylight" ? "#F3F6F4" : "#0B0D0C";

    document.documentElement.setAttribute("data-theme", effective);
    try { localStorage.setItem("nutrix_theme", modeId); } catch (e) {}

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", bgHex);

    if (tg) {
        try {
            tg.setHeaderColor?.(bgHex);
            tg.setBackgroundColor?.(bgHex);
        } catch (e) {}
    }

    if (persist && appState) {
        appState.theme = modeId;
        saveState();
    }
    renderThemePicker();
}

export function renderThemePicker() {
    const grid = document.getElementById("theme-picker-grid");
    if (!grid) return;
    const current = normalizeThemeId(appState.theme || localStorage.getItem("nutrix_theme") || "auto");
    grid.innerHTML = NUTRIX_THEMES.map(t => `
        <div class="theme-card ${t.id === current ? "active" : ""}" onclick="applyTheme('${t.id}', true); hapticSelect();">
            <div class="theme-swatch" style="background:${t.bg}; --swatch-accent:${t.accent};"></div>
            <div>
                <div style="font-size:13px; font-weight:800;">${escapeHtml(t.name)}</div>
                <div style="font-size:10px; color:var(--nx-text-muted);">${escapeHtml(t.sub)}</div>
            </div>
        </div>
    `).join("");
}

/* =========================================================================
   ПРИВЕТСТВЕННОЕ ОКНО И 5-ШАГОВАЯ АНКЕТА
   ========================================================================= */
export function showWelcomeScreen() {
    document.getElementById("onboarding-view")?.classList.add("hidden");
    document.getElementById("main-view")?.classList.add("hidden");
    document.getElementById("bottom-nav")?.classList.add("hidden");
    document.getElementById("welcome-view")?.classList.remove("hidden");
}

export function startFromWelcome() {
    try { localStorage.setItem("nutrix_seen_welcome", "1"); } catch (e) {}
    document.getElementById("welcome-view")?.classList.add("hidden");
    if (appState.user) {
        document.getElementById("main-view")?.classList.remove("hidden");
        document.getElementById("bottom-nav")?.classList.remove("hidden");
        switchTab("home");
    } else {
        showOnboarding(false);
    }
    haptic("medium");
}

export function openWelcomeReplay() {
    showWelcomeScreen();
    haptic("light");
}

const WIZARD_STEPS = [
    "biometrics",
    "activityLevel",
    "sportType",
    "goal",
    "mealsAndPrefs"
];

let wizardStepIdx = 0;
let wizardDraft = {};
let wizardSingleEditField = null;

function createDefaultDraft() {
    const u = appState.user || {};
    const score = u.activityScore ?? palToActivityScore(u.activityLevel || 1.50);
    const sportTypes = getUserSportTypes(u);
    const planModes = getUserPlanModes(u);
    return {
        gender: u.gender || "male",
        age: u.age || 20,
        height: u.height || 178,
        weight: u.weight || 70,
        activityScore: score,
        activityLevel: u.activityLevel || activityScoreToPal(score),
        sportTypes: sportTypes.slice(),
        sportType: sportTypes[0] || "none",
        goal: u.goal || "healthy",
        mealsCount: u.mealsCount || 4,
        appetiteLevel: u.appetiteLevel || 3,
        preferencesText: u.preferencesText || "",
        cuisineStyle: u.cuisineStyle || "balanced",
        planModes: planModes.slice(),
        planMode: planModes[0] || null,
        trainingDays: u.trainingDays ? Object.assign({}, u.trainingDays) : null,
        bodyFatPct: u.bodyFatPct || "",
        leanBodyMass: u.leanBodyMass || "",
        waistCm: u.waistCm || ""
    };
}

export function toggleDraftSport(sportKey) {
    let list = Array.isArray(wizardDraft.sportTypes) ? wizardDraft.sportTypes.slice() : ["none"];
    if (sportKey === "none") {
        list = ["none"];
    } else {
        list = list.filter(s => s !== "none");
        const idx = list.indexOf(sportKey);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(sportKey);
        if (!list.length) list = ["none"];
    }
    wizardDraft.sportTypes = list;
    wizardDraft.sportType = list[0];
    renderWizardStep();
    hapticSelect();
}

export function showOnboarding(canCancel = false) {
    wizardSingleEditField = null;
    wizardStepIdx = 0;
    wizardDraft = createDefaultDraft();

    document.getElementById("welcome-view").classList.add("hidden");
    document.getElementById("main-view").classList.add("hidden");
    document.getElementById("bottom-nav").classList.add("hidden");
    document.getElementById("onboarding-view").classList.remove("hidden");
    document.getElementById("cancel-onboarding-btn").classList.toggle("hidden", !canCancel);
    renderWizardStep();
}

export function openSingleStepEditor(fieldKey) {
    wizardSingleEditField = fieldKey;
    wizardStepIdx = 0;
    wizardDraft = createDefaultDraft();

    document.getElementById("main-view").classList.add("hidden");
    document.getElementById("bottom-nav").classList.add("hidden");
    document.getElementById("onboarding-view").classList.remove("hidden");
    document.getElementById("cancel-onboarding-btn").classList.remove("hidden");
    renderWizardStep();
    haptic("light");
}

export function cancelOnboarding() {
    document.getElementById("onboarding-view").classList.add("hidden");
    document.getElementById("main-view").classList.remove("hidden");
    document.getElementById("bottom-nav").classList.remove("hidden");
    haptic("light");
}

export function setDraftVal(key, val, autoAdvance = false) {
    wizardDraft[key] = val;
    hapticSelect();
    if (autoAdvance && !wizardSingleEditField) {
        renderWizardStep();
        setTimeout(() => wizardNextStep(), 150);
    } else {
        renderWizardStep();
    }
}

export function stepDraftNum(key, delta, min, max, isFloat = false) {
    const cur = parseFloat(wizardDraft[key]) || min;
    let next = cur + delta;
    next = Math.max(min, Math.min(max, next));
    wizardDraft[key] = isFloat ? Number(next.toFixed(1)) : Math.round(next);
    const inp = document.getElementById("wizard-num-input");
    if (inp) inp.value = wizardDraft[key];
    updateWizardPrecisionBadge();
    hapticSelect();
}

export function setDraftNum(key, rawVal) {
    const v = parseFloat(rawVal);
    wizardDraft[key] = isNaN(v) ? "" : v;
    updateWizardPrecisionBadge();
}

export function setDraftPrefs(rawVal) {
    wizardDraft.preferencesText = String(rawVal || "");
    updateWizardPrecisionBadge();
}

export function togglePrefChip(label) {
    const cur = (wizardDraft.preferencesText || "").trim();
    const parts = cur ? cur.split(",").map(s => s.trim()).filter(Boolean) : [];
    const idx = parts.findIndex(p => p.toLowerCase() === label.toLowerCase());
    if (idx >= 0) parts.splice(idx, 1);
    else parts.push(label);
    wizardDraft.preferencesText = parts.join(", ");
    renderWizardStep();
    hapticSelect();
}

export function handleDynamicActivityInput(valStr) {
    const score = Number(valStr);
    const pal = activityScoreToPal(score);
    wizardDraft.activityScore = score;
    wizardDraft.activityLevel = pal;

    const pct = ((score - 1) / 9) * 100;
    const range = document.getElementById("wizard-act-range");
    if (range) range.style.setProperty("--fill-pct", `${pct.toFixed(1)}%`);

    const tier = ACTIVITY_LEVEL_TIERS[Math.round(score)] || ACTIVITY_LEVEL_TIERS[5];
    const scoreEl = document.getElementById("act-score-big");
    const titleEl = document.getElementById("act-tier-title");
    const descEl = document.getElementById("act-tier-desc");
    const palEl = document.getElementById("act-pal-pill");
    const halo = document.getElementById("act-halo");

    if (scoreEl) scoreEl.innerText = Number.isInteger(score) ? String(score) : score.toFixed(1);
    if (titleEl) titleEl.innerText = tier.title;
    if (descEl) descEl.innerText = tier.desc;
    if (palEl) palEl.innerText = `Коэффициент расхода: PAL ×${pal.toFixed(2)}`;
    if (halo) {
        halo.style.setProperty("--act-scale", (0.85 + (score / 10) * 0.55).toFixed(2));
        halo.style.setProperty("--act-opacity", (0.28 + (score / 10) * 0.52).toFixed(2));
    }
    document.querySelectorAll(".nx-tick-num").forEach(t => {
        t.classList.toggle("active", Number(t.dataset.tick) === Math.round(score));
    });
    hapticSelect();
}

export function setActivityScoreExact(n) {
    const range = document.getElementById("wizard-act-range");
    if (range) range.value = String(n);
    handleDynamicActivityInput(String(n));
}

export function updateWizardPrecisionBadge() {
    const el = document.getElementById("wizard-precision-pill");
    if (el) el.innerText = `Точность: ${computePrecisionScore(wizardDraft)}%`;
}

export function renderWizardStep() {
    const isSingle = Boolean(wizardSingleEditField);
    const key = isSingle ? wizardSingleEditField : WIZARD_STEPS[wizardStepIdx];
    const total = WIZARD_STEPS.length;

    document.getElementById("wizard-step-counter").innerText = isSingle
        ? "Редактирование параметра"
        : `Шаг ${wizardStepIdx + 1} из ${total}`;
    document.getElementById("wizard-progress-fill").style.width = `${isSingle ? 100 : Math.round(((wizardStepIdx + 1) / total) * 100)}%`;
    document.getElementById("wizard-back-btn").style.visibility = (!isSingle && wizardStepIdx === 0) ? "hidden" : "visible";
    updateWizardPrecisionBadge();

    let bodyHtml = "";
    const isOptionalSingle = isSingle && ["preferencesText", "bodyFatPct", "leanBodyMass", "waistCm"].includes(key);

    if (key === "biometrics") {
        bodyHtml = `
            <div>
                <span class="wizard-badge">Базовая биометрия</span>
                <h2 class="wizard-q-title">Ваши параметры</h2>
                <p class="wizard-q-desc">Нужны для точного расчёта базового обмена (BMR), нормы белка и воды.</p>
                <div class="form-label">Пол</div>
                <div class="wizard-gender-row">
                    <button type="button" class="wizard-gender-btn ${wizardDraft.gender === "male" ? "active" : ""}" onclick="setDraftVal('gender','male',false)">Мужской</button>
                    <button type="button" class="wizard-gender-btn ${wizardDraft.gender === "female" ? "active" : ""}" onclick="setDraftVal('gender','female',false)">Женский</button>
                </div>
                <div class="wizard-bio-grid">
                    <div class="wizard-bio-cell">
                        <label for="wb-age">Возраст</label>
                        <input id="wb-age" type="number" min="14" max="90" value="${Number(wizardDraft.age) || 20}" oninput="setDraftNum('age', this.value)">
                        <div class="wb-unit">лет</div>
                    </div>
                    <div class="wizard-bio-cell">
                        <label for="wb-height">Рост</label>
                        <input id="wb-height" type="number" min="130" max="225" value="${Number(wizardDraft.height) || 178}" oninput="setDraftNum('height', this.value)">
                        <div class="wb-unit">см</div>
                    </div>
                    <div class="wizard-bio-cell">
                        <label for="wb-weight">Вес</label>
                        <input id="wb-weight" type="number" step="0.1" min="35" max="220" value="${Number(wizardDraft.weight) || 70}" oninput="setDraftNum('weight', this.value)">
                        <div class="wb-unit">кг</div>
                    </div>
                </div>
            </div>`;
    } else if (key === "gender") {
        bodyHtml = `
            <div>
                <span class="wizard-badge">Базовый обмен</span>
                <h2 class="wizard-q-title">Укажи свой пол</h2>
                <p class="wizard-q-desc">Используется в формулах расчёта базового расхода энергии.</p>
                <div class="choice-stack">
                    <div class="choice-card ${wizardDraft.gender === "male" ? "active" : ""}" onclick="setDraftVal('gender','male',false)">
                        <div><div class="choice-title">Мужской</div><div class="choice-sub">Мужские коэффициенты BMR</div></div>
                        <div class="choice-check">${wizardDraft.gender === "male" ? "✓" : ""}</div>
                    </div>
                    <div class="choice-card ${wizardDraft.gender === "female" ? "active" : ""}" onclick="setDraftVal('gender','female',false)">
                        <div><div class="choice-title">Женский</div><div class="choice-sub">Женские коэффициенты BMR</div></div>
                        <div class="choice-check">${wizardDraft.gender === "female" ? "✓" : ""}</div>
                    </div>
                </div>
            </div>`;
    } else if (key === "age") {
        bodyHtml = `
            <div>
                <span class="wizard-badge">Биометрия</span>
                <h2 class="wizard-q-title">Сколько тебе лет?</h2>
                <p class="wizard-q-desc">Возраст корректирует скорость базового метаболизма.</p>
                <div class="big-num-box">
                    <button class="stepper-btn" onclick="stepDraftNum('age',-1,14,90)">−</button>
                    <div class="big-num-input-wrap">
                        <input type="number" id="wizard-num-input" class="big-num-input" value="${Number(wizardDraft.age) || 20}" oninput="setDraftNum('age',this.value)">
                        <span class="big-num-unit">лет</span>
                    </div>
                    <button class="stepper-btn" onclick="stepDraftNum('age',1,14,90)">+</button>
                </div>
            </div>`;
    } else if (key === "height") {
        bodyHtml = `
            <div>
                <span class="wizard-badge">Биометрия</span>
                <h2 class="wizard-q-title">Твой рост?</h2>
                <p class="wizard-q-desc">Используется в расчёте обмена веществ и индекса талия/рост.</p>
                <div class="big-num-box">
                    <button class="stepper-btn" onclick="stepDraftNum('height',-1,130,225)">−</button>
                    <div class="big-num-input-wrap">
                        <input type="number" id="wizard-num-input" class="big-num-input" value="${Number(wizardDraft.height) || 178}" oninput="setDraftNum('height',this.value)">
                        <span class="big-num-unit">см</span>
                    </div>
                    <button class="stepper-btn" onclick="stepDraftNum('height',1,130,225)">+</button>
                </div>
            </div>`;
    } else if (key === "weight") {
        bodyHtml = `
            <div>
                <span class="wizard-badge">Биометрия</span>
                <h2 class="wizard-q-title">Текущий вес?</h2>
                <p class="wizard-q-desc">От веса считаются нормы белка, воды и стартовая точка прогресса.</p>
                <div class="big-num-box">
                    <button class="stepper-btn" onclick="stepDraftNum('weight',-0.5,35,220,true)">−</button>
                    <div class="big-num-input-wrap">
                        <input type="number" step="0.1" id="wizard-num-input" class="big-num-input" value="${Number(wizardDraft.weight) || 70}" oninput="setDraftNum('weight',this.value)">
                        <span class="big-num-unit">кг</span>
                    </div>
                    <button class="stepper-btn" onclick="stepDraftNum('weight',0.5,35,220,true)">+</button>
                </div>
            </div>`;
    } else if (key === "activityLevel") {
        const sc = Number(wizardDraft.activityScore) || 5;
        const pal = activityScoreToPal(sc);
        const tier = ACTIVITY_LEVEL_TIERS[Math.round(sc)] || ACTIVITY_LEVEL_TIERS[5];
        const fillPct = (((sc - 1) / 9) * 100).toFixed(1);
        bodyHtml = `
            <div>
                <span class="wizard-badge">Дневной расход</span>
                <h2 class="wizard-q-title">Уровень активности</h2>
                <p class="wizard-q-desc">Выбери общую подвижность за неделю (шаги + тренировки) от 1 до 10.</p>
                <div class="nx-act-hero">
                    <div id="act-halo" class="nx-act-halo" style="--act-scale:${(0.85 + (sc / 10) * 0.55).toFixed(2)}; --act-opacity:${(0.28 + (sc / 10) * 0.52).toFixed(2)};"></div>
                    <div id="act-score-big" class="nx-act-score-big">${Number.isInteger(sc) ? sc : sc.toFixed(1)}</div>
                    <div id="act-tier-title" class="nx-act-tier-title">${escapeHtml(tier.title)}</div>
                    <div id="act-tier-desc" class="nx-act-tier-desc">${escapeHtml(tier.desc)}</div>
                    <div id="act-pal-pill" class="nx-act-pal-pill">Коэффициент расхода: PAL ×${pal.toFixed(2)}</div>
                </div>
                <input id="wizard-act-range" type="range" min="1" max="10" step="0.5" value="${sc}"
                       class="nx-range-dynamic" style="--fill-pct:${fillPct}%;"
                       oninput="handleDynamicActivityInput(this.value)">
                <div class="nx-slider-ticks">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<span class="nx-tick-num ${Math.round(sc) === n ? "active" : ""}" data-tick="${n}" onclick="setActivityScoreExact(${n})">${n}</span>`).join("")}
                </div>
                <div class="nx-slider-anchors"><span>1 · Минимум</span><span>5 · Фитнес</span><span>10 · Максимум</span></div>
            </div>`;
    } else if (key === "sportType") {
        const curList = Array.isArray(wizardDraft.sportTypes) && wizardDraft.sportTypes.length
            ? wizardDraft.sportTypes
            : [wizardDraft.sportType || "none"];
        bodyHtml = `
            <div>
                <span class="wizard-badge">Профиль нагрузок</span>
                <h2 class="wizard-q-title">Каким спортом занимаешься?</h2>
                <p class="wizard-q-desc">Можно выбрать сразу несколько вариантов — под них подстроятся типы тренировочных дней и норма БЖУ.</p>
                <div class="choice-stack">
                    ${Object.entries(SPORT_PROFILES).map(([k, sp]) => {
                        const active = curList.includes(k);
                        return `
                        <div class="choice-card ${active ? "active" : ""}" onclick="toggleDraftSport('${k}')">
                            <div><div class="choice-title">${escapeHtml(sp.title)}</div><div class="choice-sub">${escapeHtml(sp.sub)}</div></div>
                            <div class="choice-check">${active ? "✓" : ""}</div>
                        </div>`;
                    }).join("")}
                </div>
            </div>`;
    } else if (key === "goal") {
        const cur = wizardDraft.goal || "healthy";
        bodyHtml = `
            <div>
                <span class="wizard-badge">Цель питания</span>
                <h2 class="wizard-q-title">Какая у тебя главная цель?</h2>
                <p class="wizard-q-desc">Определяет дефицит, баланс или контролируемый профицит калорий.</p>
                <div class="choice-stack">
                    ${GOALS_V4.map(g => `
                        <div class="choice-card ${cur === g.val ? "active" : ""}" onclick="setDraftVal('goal','${g.val}',true)">
                            <div><div class="choice-title">${escapeHtml(g.title)}</div><div class="choice-sub">${escapeHtml(g.sub)}</div></div>
                            <div class="choice-check">${cur === g.val ? "✓" : ""}</div>
                        </div>`).join("")}
                </div>
            </div>`;
    } else if (key === "mealsAndPrefs") {
        const curMeals = Number(wizardDraft.mealsCount) || 4;
        const chips = ["Без лактозы", "Без глютена", "Без рыбы", "Без морепродуктов", "Без орехов", "Вегетарианское"];
        const low = (wizardDraft.preferencesText || "").toLowerCase();
        bodyHtml = `
            <div>
                <span class="wizard-badge">Финальный шаг</span>
                <h2 class="wizard-q-title">Режим и ограничения</h2>
                <p class="wizard-q-desc">Выбери число приёмов пищи и, если нужно, укажи продукты, которые не ешь.</p>
                <div class="form-label">Приёмов пищи в день</div>
                <div class="meals-pill-row">
                    ${[3, 4, 5].map(n => `
                        <button type="button" class="meals-pill-btn ${curMeals === n ? "active" : ""}" onclick="setDraftVal('mealsCount', ${n}, false)">${formatCountRu(n, 'раз', 'раза', 'раз')}</button>
                    `).join("")}
                </div>
                <div class="form-label">Исключения и аллергены (необязательно)</div>
                <div class="quick-chips-row">
                    ${chips.map(c => `<button type="button" class="q-chip ${low.includes(c.toLowerCase()) ? "active" : ""}" onclick="togglePrefChip('${c}')">${escapeHtml(c)}</button>`).join("")}
                </div>
                <textarea id="wizard-prefs-input" class="form-textarea" placeholder="Например: без лактозы, не люблю грибы и творог…" oninput="setDraftPrefs(this.value)">${escapeHtml(wizardDraft.preferencesText || "")}</textarea>
            </div>`;
    } else if (key === "mealsCount") {
        const cur = Number(wizardDraft.mealsCount) || 4;
        bodyHtml = `
            <div>
                <span class="wizard-badge">Режим дня</span>
                <h2 class="wizard-q-title">Сколько приёмов пищи в день?</h2>
                <p class="wizard-q-desc">Выбери ритм, который удобно соблюдать каждый день.</p>
                <div class="choice-stack">
                    ${[
                        { n: 3, t: "3 приёма пищи", s: "Завтрак, Обед, Ужин — плотные и простые порции" },
                        { n: 4, t: "4 приёма пищи", s: "Завтрак, Обед, Полдник, Ужин — золотой стандарт" },
                        { n: 5, t: "5 приёмов пищи", s: "Дробное питание — удобно при большом калораже" }
                    ].map(m => `
                        <div class="choice-card ${cur === m.n ? "active" : ""}" onclick="setDraftVal('mealsCount',${m.n},false)">
                            <div><div class="choice-title">${m.t}</div><div class="choice-sub">${m.s}</div></div>
                            <div class="choice-check">${cur === m.n ? "✓" : ""}</div>
                        </div>`).join("")}
                </div>
            </div>`;
    } else if (key === "appetiteLevel") {
        const cur = Number(wizardDraft.appetiteLevel) || 3;
        bodyHtml = `
            <div>
                <span class="wizard-badge">Комфорт рациона</span>
                <h2 class="wizard-q-title">Как оценишь свой аппетит?</h2>
                <p class="wizard-q-desc">Влияет на плотность порций и плавную раскачку калорий.</p>
                <div class="choice-stack">
                    ${Object.entries(APPETITE_LEVELS).map(([lvl, info]) => `
                        <div class="choice-card ${cur === Number(lvl) ? "active" : ""}" onclick="setDraftVal('appetiteLevel',${lvl},false)">
                            <div><div class="choice-title">${lvl} / 5 · ${escapeHtml(info.title)}</div><div class="choice-sub">${escapeHtml(info.sub)}</div></div>
                            <div class="choice-check">${cur === Number(lvl) ? "✓" : ""}</div>
                        </div>`).join("")}
                </div>
            </div>`;
    } else if (key === "preferencesText") {
        const chips = ["Без лактозы", "Без глютена", "Без рыбы", "Без морепродуктов", "Без орехов", "Вегетарианское"];
        const low = (wizardDraft.preferencesText || "").toLowerCase();
        bodyHtml = `
            <div>
                <span class="wizard-badge optional">Ограничения</span>
                <h2 class="wizard-q-title">Ограничения и вкусы</h2>
                <p class="wizard-q-desc">Укажи непереносимости или продукты через запятую — исключим их из меню и каталога.</p>
                <div class="quick-chips-row">
                    ${chips.map(c => `<button type="button" class="q-chip ${low.includes(c.toLowerCase()) ? "active" : ""}" onclick="togglePrefChip('${c}')">${escapeHtml(c)}</button>`).join("")}
                </div>
                <textarea id="wizard-prefs-input" class="form-textarea" placeholder="Например: без лактозы, не люблю рыбу…" oninput="setDraftPrefs(this.value)">${escapeHtml(wizardDraft.preferencesText || "")}</textarea>
            </div>`;
    } else if (key === "bodyFatPct") {
        bodyHtml = `
            <div>
                <span class="wizard-badge optional">Точный расчёт (Pro)</span>
                <h2 class="wizard-q-title">Процент жира (BF%)</h2>
                <p class="wizard-q-desc">Позволяет перевести расчёт BMR и белка на сухую массу тела.</p>
                <div class="big-num-box">
                    <button class="stepper-btn" onclick="stepDraftNum('bodyFatPct',-1,5,55,true)">−</button>
                    <div class="big-num-input-wrap">
                        <input type="number" step="0.5" id="wizard-num-input" class="big-num-input" placeholder="--" value="${wizardDraft.bodyFatPct}" oninput="setDraftNum('bodyFatPct',this.value)">
                        <span class="big-num-unit">%</span>
                    </div>
                    <button class="stepper-btn" onclick="stepDraftNum('bodyFatPct',1,5,55,true)">+</button>
                </div>
                <div class="hint-ref-box">Ориентир: атлетичное телосложение — 10–14% (муж.) / 18–22% (жен.); норма — 15–20% / 23–28%.</div>
            </div>`;
    } else if (key === "leanBodyMass") {
        bodyHtml = `
            <div>
                <span class="wizard-badge optional">Точный расчёт (Pro)</span>
                <h2 class="wizard-q-title">Безжировая масса (LBM)</h2>
                <p class="wizard-q-desc">Вес тела без жира для расчёта по формулам Katch-McArdle / Cunningham.</p>
                <div class="big-num-box">
                    <button class="stepper-btn" onclick="stepDraftNum('leanBodyMass',-0.5,30,130,true)">−</button>
                    <div class="big-num-input-wrap">
                        <input type="number" step="0.1" id="wizard-num-input" class="big-num-input" placeholder="--" value="${wizardDraft.leanBodyMass}" oninput="setDraftNum('leanBodyMass',this.value)">
                        <span class="big-num-unit">кг</span>
                    </div>
                    <button class="stepper-btn" onclick="stepDraftNum('leanBodyMass',0.5,30,130,true)">+</button>
                </div>
            </div>`;
    } else if (key === "waistCm") {
        bodyHtml = `
            <div>
                <span class="wizard-badge optional">Точный расчёт (Pro)</span>
                <h2 class="wizard-q-title">Обхват талии</h2>
                <p class="wizard-q-desc">Уточняет безопасный темп профицита на наборе массы (индекс талия/рост).</p>
                <div class="big-num-box">
                    <button class="stepper-btn" onclick="stepDraftNum('waistCm',-1,45,170,true)">−</button>
                    <div class="big-num-input-wrap">
                        <input type="number" step="0.5" id="wizard-num-input" class="big-num-input" placeholder="--" value="${wizardDraft.waistCm}" oninput="setDraftNum('waistCm',this.value)">
                        <span class="big-num-unit">см</span>
                    </div>
                    <button class="stepper-btn" onclick="stepDraftNum('waistCm',1,45,170,true)">+</button>
                </div>
            </div>`;
    }

    const nextLabel = isSingle
        ? "Сохранить изменение"
        : (wizardStepIdx === total - 1 ? "Создать мой рацион ✓" : "Далее →");

    const footerHtml = `
        <div style="margin-top:16px;">
            <button class="nx-cta-pill" onclick="wizardNextStep()">${nextLabel}</button>
            ${isOptionalSingle ? `<button class="nx-btn-ghost" onclick="wizardSkipStep()">Очистить значение</button>` : ""}
        </div>`;

    document.getElementById("wizard-card-container").innerHTML = bodyHtml + footerHtml;
}

export function wizardPrevStep() {
    if (wizardSingleEditField) { cancelOnboarding(); return; }
    if (wizardStepIdx > 0) {
        wizardStepIdx--;
        renderWizardStep();
        haptic("light");
    }
}

export function wizardSkipStep() {
    const key = wizardSingleEditField || WIZARD_STEPS[wizardStepIdx];
    wizardDraft[key] = "";
    wizardNextStep();
}

export function wizardNextStep() {
    haptic("light");
    if (wizardSingleEditField || wizardStepIdx >= WIZARD_STEPS.length - 1) {
        finishOnboardingWizard();
        return;
    }
    wizardStepIdx++;
    renderWizardStep();
}

export function finishOnboardingWizard() {
    const wasExistingUser = Boolean(appState.user);
    const isSingle = Boolean(wizardSingleEditField);

    const cleanUser = {
        gender: wizardDraft.gender || "male",
        age: Math.max(14, Math.min(95, Number(wizardDraft.age) || 20)),
        height: Math.max(120, Math.min(230, Number(wizardDraft.height) || 178)),
        weight: Math.max(35, Math.min(240, Number(wizardDraft.weight) || 70)),
        activityScore: Number(wizardDraft.activityScore) || 5,
        activityLevel: activityScoreToPal(Number(wizardDraft.activityScore) || 5),
        sportTypes: (Array.isArray(wizardDraft.sportTypes) && wizardDraft.sportTypes.length) ? wizardDraft.sportTypes.slice() : [wizardDraft.sportType || "none"],
        sportType: (Array.isArray(wizardDraft.sportTypes) && wizardDraft.sportTypes[0]) || wizardDraft.sportType || "none",
        goal: wizardDraft.goal || "healthy",
        mealsCount: Number(wizardDraft.mealsCount) || 4,
        appetiteLevel: Number(wizardDraft.appetiteLevel) || 3,
        preferencesText: (wizardDraft.preferencesText || "").trim(),
        cuisineStyle: wizardDraft.cuisineStyle || "balanced",
        planModes: Array.isArray(wizardDraft.planModes) ? wizardDraft.planModes.slice() : (wizardDraft.planMode ? [wizardDraft.planMode] : []),
        planMode: (Array.isArray(wizardDraft.planModes) && wizardDraft.planModes[0]) || wizardDraft.planMode || null,
        trainingDays: wizardDraft.trainingDays || null,
        bodyFatPct: Number(wizardDraft.bodyFatPct) || null,
        leanBodyMass: Number(wizardDraft.leanBodyMass) || null,
        waistCm: Number(wizardDraft.waistCm) || null
    };

    const applyWizardResult = () => {
        appState.user = cleanUser;
        const freshIdeal = calculateTargets(cleanUser);

        if (!wasExistingUser) {
            appState.startedAt = getTodayStr();
            appState.weekStartDate = getWeekStartDateStr();
            appState.activeTargets = null;
            appState.checkIns = [{ date: appState.startedAt, weight: cleanUser.weight, waist: cleanUser.waistCm, bf: cleanUser.bodyFatPct }];
            applySmoothTargetTransition(freshIdeal, "Стартовая калибровка");
            generateWeeklyPlanOptimized();
        } else {
            const adjusted = scaleTargetsToKcal(freshIdeal, freshIdeal.dailyKcal + (appState.adaptiveOffsetKcal || 0));
            applySmoothTargetTransition(adjusted, "Плавная адаптация после правки профиля");
            if (isSingle) rebuildUneatenMealsForWeek();
            else { store.variationSeed++; generateWeeklyPlanOptimized(); }
        }

        document.getElementById("onboarding-view").classList.add("hidden");
        document.getElementById("main-view").classList.remove("hidden");
        document.getElementById("bottom-nav").classList.remove("hidden");

        saveState();
        renderApp();
        switchTab(isSingle ? "profile" : "home");
        if (isSingle) showToast("Параметр обновлён ✓");
        NutriXPerf.notify("success");
    };

    if (!isSingle && !wasExistingUser) {
        NutriXLoader.run([
            { pct: 45, title: "Калибровка КБЖУ", sub: "Расчёт нормы под параметры и активность…" },
            { pct: 100, title: "Рацион готов", sub: "Меню на 7 дней и корзина собраны" }
        ], applyWizardResult, 480);
    } else {
        applyWizardResult();
    }
}

/* =========================================================================
   НАВИГАЦИЯ И ОБЩИЙ РЕНДЕР
   ========================================================================= */
let currentTab = "home";
let currentNutritionSubtab = "diary";
let activeProgressMode = "week";
let activeCatalogFilter = "all";
let catalogSearchQuery = "";
let previousTabBeforeDetail = "nutrition";
let pendingCatalogRecipeId = null;

export function closeModal(id) {
    document.getElementById(id)?.classList.add("hidden");
    haptic("light");
}

export function switchTab(tabName) {
    currentTab = tabName;
    ["home", "nutrition", "progress", "profile"].forEach(t => {
        document.getElementById(`tab-${t}`)?.classList.toggle("hidden", t !== tabName);
        document.getElementById(`nav-${t}`)?.classList.toggle("active", t === tabName);
    });
    document.getElementById("tab-meal-detail")?.classList.add("hidden");

    if (tabName === "home") renderHomeOverview();
    else if (tabName === "nutrition") {
        if (currentNutritionSubtab === "diary") renderNutritionDiary();
        else if (currentNutritionSubtab === "groceries") renderGroceriesList();
        else renderRecipesCatalog();
    } else if (tabName === "progress") renderProgressTab();
    else if (tabName === "profile") renderProfileTab();

    NutriXMotion.staggerScreen(`tab-${tabName}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    hapticSelect();
}

export function switchNutritionSubtab(sub) {
    currentNutritionSubtab = sub;
    ["diary", "groceries", "recipes"].forEach(s => {
        document.getElementById(`subtab-${s}`)?.classList.toggle("hidden", s !== sub);
        document.getElementById(`nut-sub-${s}`)?.classList.toggle("active", s === sub);
    });
    if (sub === "diary") renderNutritionDiary();
    else if (sub === "groceries") renderGroceriesList();
    else renderRecipesCatalog();
    hapticSelect();
}

export function renderApp() {
    if (!appState.user) return;
    syncSelectedDayMeals();
    renderHomeOverview();
    renderNutritionDiary();
    renderGroceriesList();
    renderProgressTab();
    renderProfileTab();
}

/* =========================================================================
   КАРТОЧКИ ПРИЁМОВ ПИЩИ, ЗАКРЕПЛЕНИЕ И СВАЙПЫ
   ========================================================================= */
function getMealSlotVisual(meal) {
    if (meal.isOffPlan) {
        return {
            cls: "offplan", time: "Вне плана",
            svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
        };
    }
    const k = meal.slotKey || "";
    if (k === "breakfast" || /завтрак/i.test(meal.name)) {
        return {
            cls: "breakfast", time: "Утро",
            svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 2v3"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h20"/><path d="m19.07 10.93-1.41 1.41"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`
        };
    }
    if (k === "lunch" || /обед/i.test(meal.name)) {
        return {
            cls: "lunch", time: "День",
            svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`
        };
    }
    if (k === "dinner" || /ужин/i.test(meal.name)) {
        return {
            cls: "dinner", time: "Вечер",
            svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
        };
    }
    return {
        cls: "snack", time: meal.isExtra ? "Доп. приём" : "Полдник",
        svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`
    };
}

export function createMealRowElement(meal, isHomePreview = false) {
    const shell = document.createElement("div");
    shell.className = "nx-swipe-shell";
    const vis = getMealSlotVisual(meal);
    const dayIdx = isHomePreview ? getTodayDayIndex() : store.selectedDayIndex;
    const pinned = !meal.isOffPlan && !meal.isExtra && isSlotPinned(meal.name);
    const mpInfo = getMealPrepPairInfo(dayIdx, meal);
    const canDelete = Boolean(meal.isExtra || meal.isOffPlan);

    const badgesHtml = (pinned || mpInfo) ? `
        <div class="mc-badges-row">
            ${pinned ? `<span class="pin-badge">📌 Закреплено на неделю</span>` : ""}
            ${mpInfo ? `<span class="mealprep-badge">🍱 На 2 дня (${escapeHtml(mpInfo.label)})</span>` : ""}
        </div>` : "";

    const slotMeta = vis.time && vis.time.toLowerCase() !== String(meal.name || "").toLowerCase()
        ? `${escapeHtml(meal.name)} · ${escapeHtml(vis.time)}`
        : escapeHtml(meal.name);

    const card = document.createElement("div");
    card.className = "nx-meal-card-lg" + (meal.eaten ? " eaten" : "");
    card.innerHTML = `
        <div class="mc-top">
            <div class="meal-slot-icon ${vis.cls}">${vis.svg}</div>
            <div class="mc-header-info">
                <div class="mc-slot-line">
                    <span class="mc-slot-label">${slotMeta}</span>
                    <span class="mc-kcal-pill">${Number(meal.kcal) || 0} ккал</span>
                </div>
                <div class="mc-dish-title">${escapeHtml(meal.dishTitle || meal.name)}</div>
            </div>
        </div>
        ${badgesHtml}
        <div class="mc-macros-row">
            <div class="mc-macro-pills">
                <span class="mc-mpill p"><b>Б</b> ${Number(meal.protein) || 0} г</span>
                <span class="mc-mpill f"><b>Ж</b> ${Number(meal.fat) || 0} г</span>
                <span class="mc-mpill c"><b>У</b> ${Number(meal.carbs) || 0} г</span>
            </div>
            <div class="mc-meta-right">${meal.cookedWeightG ? `${Number(meal.cookedWeightG)} г · ` : ""}${escapeHtml(meal.prepTime || "15 мин")}</div>
        </div>
        ${isHomePreview ? "" : `
        <div class="mc-footer-actions ${canDelete ? "with-del" : ""}">
            <button class="btn-small ${meal.eaten ? "active-eat" : ""}" data-act="eat">${meal.eaten ? "✓ Съел" : "Отметить"}</button>
            <button class="btn-small" data-act="swap">↻ Другое</button>
            ${canDelete
                ? `<button class="btn-small danger-act" data-act="delete" title="Удалить приём пищи">🗑</button>`
                : `<button class="btn-small ${pinned ? "active-pin" : ""}" data-act="pin" title="${pinned ? "Открепить" : "Закрепить на всю неделю"}">📌</button>`}
            ${canDelete ? `<button class="btn-small" data-act="edit" title="Изменить">✎</button>` : ""}
            <button class="btn-small" data-act="detail">Рецепт ›</button>
        </div>`}
    `;

    card.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (btn) {
            e.stopPropagation();
            const act = btn.dataset.act;
            if (act === "eat") toggleMealEaten(meal.id);
            else if (act === "swap") swapSingleMeal(meal.id);
            else if (act === "pin") togglePinMealForWeek(meal.id);
            else if (act === "delete") deleteExtraMeal(meal.id);
            else if (act === "edit") openEditMealModal(meal.id);
            else openMealDetail(meal.id);
            return;
        }
        if (isHomePreview) store.selectedDayIndex = getTodayDayIndex();
        syncSelectedDayMeals();
        openMealDetail(meal.id);
    });

    if (!isHomePreview) {
        const bg = document.createElement("div");
        bg.className = "nx-swipe-bg";
        bg.innerHTML = `<span class="nx-swipe-left-hint">✓ ${meal.eaten ? "Снять" : "Съедено"}</span><span class="nx-swipe-right-hint">↻ Заменить</span>`;
        shell.appendChild(bg);
        NutriXMotion.attachSwipe(card, meal.id);
    }

    shell.appendChild(card);
    return shell;
}

export function deleteExtraMeal(mealId) {
    syncSelectedDayMeals();
    const dayObj = appState.weekPlan?.[store.selectedDayIndex];
    if (!dayObj) return;
    const before = dayObj.meals.length;
    dayObj.meals = dayObj.meals.filter(m => m.id !== mealId);
    if (dayObj.meals.length === before) return;
    syncSelectedDayMeals();
    rebuildGroceryList();
    saveState();
    renderApp();
    showToast("Приём пищи удалён");
    haptic("light");
}

export function toggleMealEaten(mealId) {
    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    if (!meal) return;
    meal.eaten = !meal.eaten;
    rebuildGroceryList();
    saveState();
    renderHomeOverview();
    renderNutritionDiary();
    renderGroceriesList();
    if (store.activeDetailMealId === mealId) openMealDetail(mealId);
    haptic("medium");
}

export function swapSingleMeal(mealId) {
    syncSelectedDayMeals();
    const idx = appState.meals.findIndex(m => m.id === mealId);
    if (idx === -1) return;
    const cur = appState.meals[idx];
    const usedIds = new Set();
    (appState.weekPlan || []).forEach(d => (d.meals || []).forEach(m => { if (m.recipeId) usedIds.add(m.recipeId); }));

    const pool = filterMasterRecipesForUser(cur.slotKey || "lunch", appState.user, cur.recipeId)
        .sort((a, b) => {
            const aRep = usedIds.has(a.recipe_id) ? -60 : 0;
            const bRep = usedIds.has(b.recipe_id) ? -60 : 0;
            return (scoreRecipeForUser(b, appState.user) + bRep) - (scoreRecipeForUser(a, appState.user) + aRep);
        });
    const top = pool.slice(0, Math.min(pool.length, 10));
    const nextMaster = top[Math.floor(Math.random() * top.length)] || store.MASTER_RECIPES_DB[0];

    const replaced = scaleMasterRecipeToMeal(nextMaster, cur.name, cur.slotKey || "lunch", cur.id, cur.kcal);
    replaced.eaten = false;
    replaced.isExtra = Boolean(cur.isExtra);
    appState.meals[idx] = replaced;

    rebuildGroceryList();
    saveState();
    renderHomeOverview();
    renderNutritionDiary();
    if (store.activeDetailMealId === mealId) openMealDetail(mealId);
    showToast(`Заменено: ${replaced.dishTitle.slice(0, 36)}…`);
    haptic("medium");
}

export function togglePinMealForWeek(mealId) {
    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    if (!meal || meal.isOffPlan) return;

    if (!appState.pinnedSlots) appState.pinnedSlots = {};
    const slotName = meal.name;

    if (appState.pinnedSlots[slotName]) {
        delete appState.pinnedSlots[slotName];
        (appState.weekPlan || []).forEach(dayObj => {
            (dayObj.meals || []).forEach(m => {
                if (m.name === slotName) m.isPinned = false;
            });
        });
        saveState();
        renderApp();
        if (store.activeDetailMealId === mealId) openMealDetail(mealId);
        showToast(`Закрепление снято со слота «${slotName}»`);
        haptic("light");
        return;
    }

    const pinSpec = meal.isCustom
        ? {
            isCustom: true,
            dishTitle: meal.dishTitle,
            kcal: meal.kcal,
            protein: meal.protein,
            fat: meal.fat,
            carbs: meal.carbs,
            weight: meal.cookedWeightG || meal.rawWeightG || 250
        }
        : { isCustom: false, recipeId: meal.recipeId };

    appState.pinnedSlots[slotName] = pinSpec;

    const dist = getMealDistribution(Number(appState.user?.mealsCount) || 4);
    (appState.weekPlan || []).forEach((dayObj, dIdx) => {
        const dayT = getDayTypeTargets(dIdx);
        const slotIdx = (dayObj.meals || []).findIndex(m => !m.isOffPlan && m.name === slotName);
        if (slotIdx === -1) return;
        const targetMeal = dayObj.meals[slotIdx];
        if (targetMeal.eaten) {
            targetMeal.isPinned = true;
            return;
        }
        const slotShare = dist[slotIdx]?.share || 0.25;
        const slotKcal = Math.max(150, Math.round(dayT.dailyKcal * slotShare));
        const built = buildPinnedMealForSlot(pinSpec, slotName, targetMeal.slotKey || dist[slotIdx]?.slot || "lunch", targetMeal.id, slotKcal);
        if (built) dayObj.meals[slotIdx] = built;
    });

    syncSelectedDayMeals();
    rebuildGroceryList();
    saveState();
    renderApp();
    if (store.activeDetailMealId === mealId) openMealDetail(mealId);
    showToast(`📌 «${meal.dishTitle.slice(0, 30)}» закреплено на всю неделю`);
    haptic("medium");
}

/* =========================================================================
   ВКЛАДКА «ГЛАВНАЯ»
   ========================================================================= */
function getDaysSinceLastCheckIn() {
    const last = appState.checkIns?.[appState.checkIns.length - 1]?.date || appState.startedAt || getTodayStr();
    return Math.max(0, Math.floor((new Date(getTodayStr()) - new Date(last)) / 86400000));
}

function updateHomeBanners() {
    const daysSince = getDaysSinceLastCheckIn();
    const ciBanner = document.getElementById("home-checkin-banner");
    if (ciBanner) {
        const needCheckIn = daysSince >= 7;
        ciBanner.classList.toggle("hidden", !needCheckIn);
        if (needCheckIn) {
            const needTape = daysSince >= 14;
            document.getElementById("checkin-banner-title").innerText = needTape ? "Контрольный замер (вес + талия)" : "Недельный замер веса";
            document.getElementById("checkin-banner-sub").innerText = `Прошло ${daysSince} дн. — внеси замер для точной адаптации рациона`;
        }
    }

    const ad = appState.adaptation;
    const adBanner = document.getElementById("home-adapt-banner");
    if (adBanner) {
        const showAd = Boolean(ad?.active && appState.idealTargets && appState.activeTargets);
        adBanner.classList.toggle("hidden", !showAd);
        if (showAd) {
            const cur = appState.activeTargets.dailyKcal;
            const target = appState.idealTargets.dailyKcal;
            const span = Math.max(1, Math.abs(target - ad.startKcal));
            const pct = Math.min(95, Math.max(12, Math.round((Math.abs(cur - ad.startKcal) / span) * 100)));
            const passed = Math.floor((new Date(getTodayStr()) - new Date(ad.lastStepDate)) / 86400000);
            const daysLeft = Math.max(1, (ad.intervalDays || 4) - passed);

            document.getElementById("adapt-banner-title").innerText = ad.reason || "Плавная адаптация";
            document.getElementById("adapt-banner-nums").innerText = `${cur} → ${target} ккал`;
            document.getElementById("adapt-banner-bar").style.width = `${pct}%`;
            document.getElementById("adapt-banner-desc").innerText = `Следующий шаг (${cur < target ? "+" : "−"}${ad.stepKcal} ккал) через ${daysLeft} дн.`;
        }
    }
}

function updateCompleteDayButton() {
    const btn = document.getElementById("home-complete-day-btn");
    if (!btn) return;
    const todayMeals = appState.weekPlan?.[getTodayDayIndex()]?.meals || [];
    const doneCount = todayMeals.filter(m => m.eaten).length;
    const allDone = todayMeals.length > 0 && doneCount === todayMeals.length;

    btn.classList.toggle("done", allDone);
    document.getElementById("home-complete-day-label").innerText =
        allDone ? "✓ План дня выполнен (снять отметку)" : "✓ Отметить: план дня выполнен";
    document.getElementById("home-complete-day-meta").innerText = `${doneCount} / ${todayMeals.length}`;
}

export function toggleCompleteWholeDay(dayIdx) {
    const dayObj = appState.weekPlan?.[dayIdx];
    if (!dayObj?.meals?.length) return;
    const allDone = dayObj.meals.every(m => m.eaten);
    dayObj.meals.forEach(m => { m.eaten = !allDone; });
    rebuildGroceryList();
    saveState();
    renderApp();
    showToast(allDone ? "Отметка выполнения дня снята" : "План дня выполнен на 100% ✓");
    NutriXPerf.notify("success");
}

export function renderHomeOverview() {
    if (!appState.user) return;
    const todayIdx = getTodayDayIndex();
    const stats = getDayNutritionStats(todayIdx);

    const todayMealsForGreet = appState.weekPlan?.[todayIdx]?.meals || [];
    const nextMealForGreet = todayMealsForGreet.find(m => !m.eaten) || todayMealsForGreet[todayMealsForGreet.length - 1];
    const firstName = tg?.initDataUnsafe?.user?.first_name;
    const greet = getAdaptiveGreeting(firstName, stats, nextMealForGreet);
    document.getElementById("home-greeting").innerText = greet.title;
    const subEl = document.getElementById("home-greeting-sub");
    if (subEl) subEl.innerText = greet.subtitle || "";

    const avatarBtn = document.getElementById("home-avatar-btn");
    if (avatarBtn && firstName) avatarBtn.innerText = firstName[0].toUpperCase();

    const dateStr = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    document.getElementById("home-date-label").innerText = dateStr.toUpperCase();
    document.getElementById("home-streak-label").innerText = `Серия: ${formatCountRu(appState.streakDays || 0, "день", "дня", "дней")}`;

    const dayMeta = DAY_TYPE_META[stats.dayType] || DAY_TYPE_META.rest;
    document.getElementById("home-day-type-title").innerText = stats.dayType !== "rest"
        ? `Баланс · ${dayMeta.icon} ${dayMeta.label}`
        : "Баланс калорий";

    const ringArc = document.getElementById("home-ring-arc");
    const ringSub = document.querySelector(".nx-ring-sub");
    const pctLabel = document.getElementById("home-goal-pct");
    const remEl = document.getElementById("home-kcal-rem");

    if (stats.isOver) {
        const overRatio = stats.overKcal / Math.max(1, stats.goal.kcal);
        const overColor = overRatio > 0.10 ? "var(--nx-danger)" : "var(--nx-warning)";
        ringArc.style.stroke = overColor;
        ringArc.style.strokeDashoffset = "0";
        if (ringSub) {
            ringSub.innerText = "ккал сверх плана";
            ringSub.style.color = overColor;
        }
        if (pctLabel) {
            pctLabel.innerText = `+${stats.overKcal} ккал (${stats.rawPctKcal}%)`;
            pctLabel.style.color = overColor;
        }
        if (remEl) {
            remEl.dataset.val = String(stats.overKcal);
            remEl.innerText = `+${stats.overKcal.toLocaleString("ru-RU")}`;
        }
    } else {
        ringArc.style.stroke = "var(--nx-mint)";
        ringArc.style.strokeDashoffset = (515.22 * (1 - stats.pctKcal / 100)).toFixed(2);
        if (ringSub) {
            ringSub.innerText = "ккал осталось";
            ringSub.style.color = "var(--nx-text-muted)";
        }
        if (pctLabel) {
            pctLabel.innerText = `${stats.pctKcal}% от плана`;
            pctLabel.style.color = "var(--nx-text-muted)";
        }
        NutriXMotion.tweenNumber(remEl, stats.remainingKcal);
    }

    NutriXMotion.tweenNumber(document.getElementById("home-kcal-eaten"), stats.eaten.kcal);
    document.getElementById("home-kcal-goal").innerText = stats.goal.kcal.toLocaleString("ru-RU");

    const setMacro = (key, cur, goal) => {
        document.getElementById(`home-${key}-val`).innerText = `${cur} г`;
        document.getElementById(`home-${key}-of`).innerText = `из ${goal} г`;
        document.getElementById(`home-${key}-bar`).style.width = `${Math.min(100, Math.round((cur / Math.max(1, goal)) * 100))}%`;
    };
    setMacro("p", stats.eaten.protein, stats.goal.protein);
    setMacro("f", stats.eaten.fat, stats.goal.fat);
    setMacro("c", stats.eaten.carbs, stats.goal.carbs);

    updateHomeBanners();
    updateCompleteDayButton();

    const todayMeals = appState.weekPlan?.[todayIdx]?.meals || [];
    const nextMeal = todayMeals.find(m => !m.eaten) || todayMeals[todayMeals.length - 1];
    const previewBox = document.getElementById("home-meals-preview");
    previewBox.innerHTML = "";
    if (nextMeal) previewBox.appendChild(createMealRowElement(nextMeal, true));

    const goalMl = computeDailyWaterGoalMl();
    const curL = Number(appState.waterLog?.[getTodayStr()] || 0);
    const waterPct = Math.min(100, Math.round(((curL * 1000) / Math.max(1, goalMl)) * 100));
    document.getElementById("home-water-cur").innerText = curL.toFixed(1);
    document.getElementById("home-water-goal").innerText = `/ ${(goalMl / 1000).toFixed(1)} л`;
    document.getElementById("home-water-bg").style.setProperty("--water-pct", `${waterPct}%`);

    const actScore = appState.user.activityScore ?? palToActivityScore(appState.user.activityLevel);
    const tier = ACTIVITY_LEVEL_TIERS[Math.round(actScore)] || ACTIVITY_LEVEL_TIERS[5];
    document.getElementById("home-act-score").innerText = Number.isInteger(actScore) ? String(actScore) : actScore.toFixed(1);
    document.getElementById("home-act-pal").innerText = `PAL ×${Number(appState.user.activityLevel || 1.5).toFixed(2)} · ${tier.title.split(" ")[0]}`;
}

/* =========================================================================
   ВКЛАДКА «ПИТАНИЕ» + ШТОРКА НАСТРОЕК МЕНЮ
   ========================================================================= */
export function openMenuSettingsModal() {
    syncMenuSettingsSheetState();
    document.getElementById("menu-settings-modal")?.classList.remove("hidden");
    haptic("light");
}

function syncMenuSettingsSheetState() {
    if (!appState.user) return;
    const curStyle = appState.user.cuisineStyle || "balanced";
    document.querySelectorAll("#cuisine-style-pills .sheet-style-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.style === curStyle);
    });
    const modes = getUserPlanModes(appState.user);
    document.querySelectorAll("#plan-mode-grid .plan-mode-card").forEach(c => {
        c.classList.toggle("active", modes.includes(c.dataset.mode));
    });
    document.getElementById("plan-mode-reset-btn")?.classList.toggle("hidden", modes.length === 0);
    const cntEl = document.getElementById("plan-modes-counter");
    if (cntEl) cntEl.innerText = modes.length ? `(выбрано: ${modes.length})` : "(можно несколько)";

    const overlapBadge = document.getElementById("overlap-toggle-badge");
    if (overlapBadge) overlapBadge.innerText = appState.optimizeOverlap !== false ? "ВКЛ" : "ВЫКЛ";
}

function getActiveMenuBadgeLabel() {
    const modes = getUserPlanModes(appState.user);
    const style = appState.user?.cuisineStyle || "balanced";
    const modeChips = {
        quick: "⚡ Быстро",
        budget: "💰 Экономно",
        mealprep: "🍱 На 2 дня",
        diverse: "🌈 Разнообразие"
    };
    const modeIcons = { quick: "⚡", budget: "💰", mealprep: "🍱", diverse: "🌈" };
    if (modes.length === 1 && modeChips[modes[0]]) return modeChips[modes[0]];
    if (modes.length >= 2) {
        const icons = modes.map(m => modeIcons[m] || "").join("");
        return `${icons} ${formatCountRu(modes.length, "режим", "режима", "режимов")}`;
    }
    if (style === "simple") return "⚡ Простые";
    if (style === "exotic") return "✨ Необычные";
    return "";
}

function renderWeekStrip() {
    const container = document.getElementById("week-strip-container");
    if (!container) return;
    const todayIdx = getTodayDayIndex();
    const map = getTrainingDaysMap();
    const availTypes = getAvailableDayTypesForUser(appState.user);
    const hasSports = availTypes.length > 0;
    const now = new Date();
    const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();

    container.innerHTML = WEEK_DAYS.map((d, idx) => {
        const dt = new Date(now);
        dt.setDate(now.getDate() + mondayOffset + idx);
        const tType = map[idx] || "rest";
        const meta = DAY_TYPE_META[tType] || DAY_TYPE_META.rest;
        const badge = hasSports ? (tType !== "rest" ? meta.short : "•") : "";
        return `
            <div class="nx-day-oval ${idx === todayIdx ? "today" : ""} ${idx === store.selectedDayIndex ? "active" : ""}" onclick="selectDay(${idx})">
                <span class="d-let">${d.short}</span>
                <span class="d-num">${dt.getDate()}</span>
                ${hasSports ? `<div class="nx-day-train-badge">${badge}</div>` : ""}
            </div>`;
    }).join("");
}

export function selectDay(dayIdx) {
    if (dayIdx === store.selectedDayIndex) {
        if (getAvailableDayTypesForUser(appState.user).length > 0) {
            cycleSelectedDayTrainingType();
        }
        return;
    }
    store.selectedDayIndex = dayIdx;
    syncSelectedDayMeals();
    renderNutritionDiary();
    hapticSelect();
}

export function openDayTypeModal() {
    const avail = getAvailableDayTypesForUser(appState.user);
    if (!avail.length) return;
    const cur = getTrainingDaysMap()[store.selectedDayIndex] || "rest";
    const dayName = WEEK_DAYS[store.selectedDayIndex]?.full || "День";
    const titleEl = document.getElementById("day-type-modal-title");
    if (titleEl) titleEl.innerText = `${dayName} · тип дня`;

    const listEl = document.getElementById("day-type-options-list");
    if (listEl) {
        listEl.innerHTML = avail.map(k => {
            const m = DAY_TYPE_META[k] || DAY_TYPE_META.rest;
            const active = cur === k;
            return `
                <div class="choice-card ${active ? "active" : ""}" onclick="setDayTrainingType('${k}'); closeModal('day-type-modal');">
                    <div>
                        <div class="choice-title">${m.icon} ${escapeHtml(m.label)}</div>
                        <div class="choice-sub">${escapeHtml(m.toast)}</div>
                    </div>
                    <div class="choice-check">${active ? "✓" : ""}</div>
                </div>`;
        }).join("");
    }
    document.getElementById("day-type-modal")?.classList.remove("hidden");
    haptic("light");
}

export function cycleSelectedDayTrainingType() {
    const order = getAvailableDayTypesForUser(appState.user);
    if (!order.length) return;
    if (order.length >= 4) {
        openDayTypeModal();
        return;
    }
    const cur = getTrainingDaysMap()[store.selectedDayIndex] || "rest";
    const idx = order.indexOf(cur);
    const next = order[(idx + 1) % order.length];
    setDayTrainingType(next);
}

export function setDayTrainingType(type) {
    const map = getTrainingDaysMap();
    if (type === "rest") delete map[store.selectedDayIndex];
    else map[store.selectedDayIndex] = type;

    rebuildUneatenMealsForWeek();
    rebuildGroceryList();
    saveState();
    renderApp();

    const meta = DAY_TYPE_META[type] || DAY_TYPE_META.rest;
    showToast(meta.toast || "Тип дня обновлён");
    haptic("medium");
}

export function setCuisineStyle(style) {
    if (!appState.user) return;
    appState.user.cuisineStyle = style;
    const labels = { simple: "Простые блюда", balanced: "Сбалансированное меню", exotic: "Необычные блюда" };

    rebuildUneatenMealsForWeek();
    syncMenuSettingsSheetState();
    renderApp();
    showToast(`Стиль: ${labels[style]}`);
    haptic("medium");
}

export function togglePlanMode(mode) {
    if (!appState.user) return;
    let modes = getUserPlanModes(appState.user).slice();
    let conflictMsg = "";

    if (modes.includes(mode)) {
        modes = modes.filter(m => m !== mode);
    } else {
        if (mode === "mealprep" && modes.includes("diverse")) {
            modes = modes.filter(m => m !== "diverse");
            conflictMsg = "Включён режим «На 2 дня» — «Разнообразие» снято";
        } else if (mode === "diverse" && modes.includes("mealprep")) {
            modes = modes.filter(m => m !== "mealprep");
            conflictMsg = "Включено «Разнообразие» — «На 2 дня» снято";
        }
        modes.push(mode);
    }

    appState.user.planModes = modes;
    appState.user.planMode = modes[0] || null;
    if (modes.includes("budget") || modes.includes("mealprep")) appState.optimizeOverlap = true;

    generateWeeklyPlanOptimized();
    syncMenuSettingsSheetState();
    renderApp();
    if (conflictMsg) {
        showToast(conflictMsg);
    } else if (modes.length) {
        showToast(`Активно: ${formatCountRu(modes.length, "режим", "режима", "режимов")} ✓`);
    } else {
        showToast("Все режимы сброшены");
    }
    haptic("medium");
}

export function clearAllPlanModes() {
    if (!appState.user) return;
    appState.user.planModes = [];
    appState.user.planMode = null;
    generateWeeklyPlanOptimized();
    syncMenuSettingsSheetState();
    renderApp();
    showToast("Режимы меню сброшены");
    haptic("light");
}

export function setPlanMode(mode) {
    if (mode === null) clearAllPlanModes();
    else togglePlanMode(mode);
}

export function renderNutritionDiary() {
    if (!appState.user) return;
    syncSelectedDayMeals();
    renderWeekStrip();
    syncMenuSettingsSheetState();

    const chipEl = document.getElementById("nut-active-mode-chip");
    if (chipEl) {
        const chipText = getActiveMenuBadgeLabel();
        chipEl.innerText = chipText;
        chipEl.classList.toggle("hidden", !chipText);
        chipEl.onclick = openMenuSettingsModal;
        chipEl.style.cursor = "pointer";
    }

    const availTypes = getAvailableDayTypesForUser(appState.user);
    const dayType = getTrainingDaysMap()[store.selectedDayIndex] || "rest";
    const cycleBtn = document.getElementById("day-type-cycle-btn");
    if (cycleBtn) {
        if (!availTypes.length) {
            cycleBtn.classList.add("hidden");
        } else {
            cycleBtn.classList.remove("hidden");
            const meta = DAY_TYPE_META[dayType] || DAY_TYPE_META.rest;
            const suffix = availTypes.length >= 4 ? " ▾" : " ↻";
            cycleBtn.innerText = `${dayType !== "rest" ? `${meta.icon} ` : ""}${meta.label}${suffix}`;
            cycleBtn.classList.toggle("train", dayType !== "rest");
        }
    }

    const stats = getDayNutritionStats(store.selectedDayIndex);
    const dayName = WEEK_DAYS[store.selectedDayIndex]?.full || "День";
    const nutLeftEl = document.getElementById("nut-kcal-left");
    const nutBarEl = document.getElementById("nut-kcal-bar");

    if (stats.isOver) {
        const overColor = (stats.overKcal / Math.max(1, stats.goal.kcal)) > 0.10 ? "var(--nx-danger)" : "var(--nx-warning)";
        nutLeftEl.innerText = `+${stats.overKcal} ккал сверх плана`;
        nutLeftEl.style.color = overColor;
        nutBarEl.style.width = "100%";
        nutBarEl.style.background = overColor;
    } else {
        nutLeftEl.innerText = `${stats.remainingKcal} осталось`;
        nutLeftEl.style.color = "var(--nx-mint)";
        nutBarEl.style.width = `${stats.pctKcal}%`;
        nutBarEl.style.background = "var(--nx-protein)";
    }

    document.getElementById("nut-kcal-eaten").innerText = stats.eaten.kcal.toLocaleString("ru-RU");
    document.getElementById("nut-kcal-goal").innerText = `/ ${stats.goal.kcal.toLocaleString("ru-RU")} ккал`;
    document.getElementById("nut-p-val").innerText = `${stats.eaten.protein} / ${stats.goal.protein} г`;
    document.getElementById("nut-f-val").innerText = `${stats.eaten.fat} / ${stats.goal.fat} г`;
    document.getElementById("nut-c-val").innerText = `${stats.eaten.carbs} / ${stats.goal.carbs} г`;
    document.getElementById("meals-section-title").innerText = dayName;

    const box = document.getElementById("meals-container");
    box.innerHTML = "";
    (appState.meals || []).forEach(meal => box.appendChild(createMealRowElement(meal, false)));
}

export function regenerateCurrentDay() {
    store.variationSeed++;
    appState.weekPlan[store.selectedDayIndex].meals = buildMealsForOneDay(store.selectedDayIndex, store.variationSeed);
    syncSelectedDayMeals();
    rebuildGroceryList();
    saveState();
    renderApp();
    showToast(`${WEEK_DAYS[store.selectedDayIndex].full}: меню обновлено ✓`);
    haptic("medium");
}

export function regenerateFullWeek() {
    store.variationSeed++;
    appState.weekPlan.forEach(d => {
        d.meals = (d.meals || []).filter(m => !m.isOffPlan).map(m => Object.assign({}, m, { eaten: false }));
    });
    generateWeeklyPlanOptimized();
    renderApp();
    showToast("Недельный план обновлён ✓");
    haptic("medium");
}

/* =========================================================================
   ПАСПОРТ БЛЮДА, СЫРОЙ/ГОТОВЫЙ ВЕС, МИЛПРЕП ×2 И 1-CLICK ЗАМЕНЫ
   ========================================================================= */
export function setDetailWeightMode(mode) {
    store.detailWeightMode = ["raw", "cooked", "visual"].includes(mode) ? mode : "raw";
    document.getElementById("wm-raw-btn")?.classList.toggle("active", store.detailWeightMode === "raw");
    document.getElementById("wm-cooked-btn")?.classList.toggle("active", store.detailWeightMode === "cooked");
    document.getElementById("wm-visual-btn")?.classList.toggle("active", store.detailWeightMode === "visual");
    if (store.activeDetailMealId) {
        syncSelectedDayMeals();
        const meal = appState.meals.find(m => m.id === store.activeDetailMealId);
        if (meal) updateDetailWeightsAndIngredients(meal);
    }
    hapticSelect();
}

export function setDetailPortionMult(mult) {
    store.detailPortionMult = mult === 2 ? 2 : 1;
    document.getElementById("pm-x1-btn")?.classList.toggle("active", store.detailPortionMult === 1);
    document.getElementById("pm-x2-btn")?.classList.toggle("active", store.detailPortionMult === 2);
    if (store.activeDetailMealId) {
        syncSelectedDayMeals();
        const meal = appState.meals.find(m => m.id === store.activeDetailMealId);
        if (meal) updateDetailWeightsAndIngredients(meal);
    }
    hapticSelect();
}

export function toggleDetailStepDone(mealId, stepIdx) {
    if (!store.checkedStepsByMeal[mealId]) store.checkedStepsByMeal[mealId] = {};
    store.checkedStepsByMeal[mealId][stepIdx] = !store.checkedStepsByMeal[mealId][stepIdx];
    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    if (meal) renderDetailCookingSteps(meal);
    hapticSelect();
}

function renderDetailCookingSteps(meal) {
    const stepsEl = document.getElementById("detail-steps-list");
    if (!stepsEl) return;
    const mult = store.detailPortionMult === 2 ? 2 : 1;
    const steps = buildDetailedCookingSteps(meal, store.detailWeightMode, mult);
    const doneMap = store.checkedStepsByMeal[meal.id] || {};

    stepsEl.innerHTML = steps.length ? steps.map((st, i) => {
        const isDone = Boolean(doneMap[i]);
        return `
        <div class="step-item ${isDone ? "done" : ""}" onclick="toggleDetailStepDone('${escapeHtml(meal.id)}', ${i})">
            <div class="step-num">${isDone ? "✓" : (Number(st.step_number) || i + 1)}</div>
            <div style="flex:1;">
                <div class="step-stage-header">
                    <span>${escapeHtml(st.stage_name || `Шаг ${i + 1}`)}</span>
                    <span style="color:var(--nx-text-muted);">${st.duration_min ? `${Number(st.duration_min)} мин` : ""}</span>
                </div>
                <div class="step-text">${escapeHtml(st.instruction)}</div>
            </div>
        </div>`;
    }).join("") : `<div class="hint-ref-box">Соедини ингредиенты согласно порциям и подавай к столу.</div>`;
}

function updateDetailWeightsAndIngredients(meal) {
    const mult = store.detailPortionMult === 2 ? 2 : 1;
    const rawW = (meal.rawWeightG || 340) * mult;
    const cookedW = (meal.cookedWeightG || 310) * mult;
    document.getElementById("detail-weights").innerText = mult === 2
        ? `${rawW} г → ${cookedW} г (×2)`
        : `${rawW} г → ${cookedW} г`;

    const hint = document.getElementById("detail-yield-hint");
    if (hint) {
        const baseText = store.detailWeightMode === "visual"
            ? "Режим «Без весов»: ориентируйся на ложки, штуки, пачки и размер ладони (ориентир в граммах указан снизу)."
            : (store.detailWeightMode === "raw"
                ? "Показан сырой вес для взвешивания до готовки."
                : "Показан готовый вес ингредиентов на тарелке.");
        hint.innerText = mult === 2
            ? `${baseText} Порции умножены на ×2 сразу для двух дней.`
            : `${baseText} Нажми на замену под продуктом, чтобы пересчитать КБЖУ.`;
    }
    renderDetailIngredientsWithOneClickSubs(meal);
    renderDetailCookingSteps(meal);
}

export function openMealDetail(mealId) {
    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    if (!meal) return;

    if (store.activeDetailMealId !== mealId) store.detailPortionMult = 1;
    store.activeDetailMealId = mealId;
    previousTabBeforeDetail = currentTab;

    ["home", "nutrition", "progress", "profile"].forEach(t => document.getElementById(`tab-${t}`)?.classList.add("hidden"));
    document.getElementById("tab-meal-detail").classList.remove("hidden");

    document.getElementById("detail-slot-badge").innerText = meal.name;
    document.getElementById("detail-category-tag").innerText = meal.primaryCategory || "Сбалансированное";
    document.getElementById("detail-cuisine-tag").innerText = meal.cuisine || "Домашняя";
    const priceTag = document.getElementById("detail-price-tag");
    if (priceTag) {
        const pt = typeof meal.priceTier === "number" ? meal.priceTier : 1;
        priceTag.innerText = pt === 0 ? "₽ Бюджет" : (pt === 2 ? "₽₽₽ Премиум" : "₽₽ Средний");
    }
    document.getElementById("detail-status-tag").innerText = meal.eaten ? "✓ Съедено" : "По плану";
    document.getElementById("detail-dish-title").innerText = meal.dishTitle;
    document.getElementById("detail-short-desc").innerText = meal.shortDescription || "";

    document.getElementById("detail-kcal").innerText = meal.kcal;
    document.getElementById("detail-p").innerText = `${meal.protein} г`;
    document.getElementById("detail-f").innerText = `${meal.fat} г`;
    document.getElementById("detail-c").innerText = `${meal.carbs} г`;
    document.getElementById("detail-fiber").innerText = `${meal.fiber || 5} г`;

    document.getElementById("detail-time-breakdown").innerText = meal.prepTime || "15 мин";
    document.getElementById("detail-temp").innerText = meal.cookingTempC && meal.cookingTempC > 30 ? `${meal.cookingTempC} °C` : "Без нагрева";
    document.getElementById("detail-shelf-life").innerText = `до ${meal.shelfLifeHours || 36} ч (+4 °C)`;

    const eatBtn = document.getElementById("detail-eat-btn");
    eatBtn.innerText = meal.eaten ? "✓ Съедено" : "Отметить";
    eatBtn.classList.toggle("active-eat", Boolean(meal.eaten));

    const pinBtn = document.getElementById("detail-pin-btn");
    if (pinBtn) {
        const pinned = !meal.isOffPlan && !meal.isExtra && isSlotPinned(meal.name);
        pinBtn.disabled = Boolean(meal.isOffPlan || meal.isExtra);
        pinBtn.innerText = pinned ? "📌 Закреплено" : "📌 На всю неделю";
        pinBtn.classList.toggle("active-pin", pinned);
    }

    document.getElementById("wm-raw-btn")?.classList.toggle("active", store.detailWeightMode === "raw");
    document.getElementById("wm-cooked-btn")?.classList.toggle("active", store.detailWeightMode === "cooked");
    document.getElementById("wm-visual-btn")?.classList.toggle("active", store.detailWeightMode === "visual");

    const mpInfo = getMealPrepPairInfo(store.selectedDayIndex, meal);
    const mpBar = document.getElementById("detail-mealprep-bar");
    if (mpBar) {
        if (mpInfo) {
            mpBar.classList.remove("hidden");
            document.getElementById("detail-mealprep-title").innerText = `🍱 Заготовка на 2 дня (${mpInfo.label})`;
            document.getElementById("detail-mealprep-sub").innerText = `Готовь один раз — раздели на ${mpInfo.label}`;
            document.getElementById("pm-x1-btn")?.classList.toggle("active", store.detailPortionMult === 1);
            document.getElementById("pm-x2-btn")?.classList.toggle("active", store.detailPortionMult === 2);
        } else {
            store.detailPortionMult = 1;
            mpBar.classList.add("hidden");
        }
    }

    updateDetailWeightsAndIngredients(meal);

    const tagsEl = document.getElementById("detail-tags-list");
    const dTags = (meal.dietaryTags || []).map(t => `<span class="chip-item dietary">${escapeHtml(t)}</span>`);
    const aTags = (meal.allergens || []).length
        ? meal.allergens.map(a => `<span class="chip-item allergen">⚠ ${escapeHtml(a)}</span>`)
        : [`<span class="chip-item dietary">Без частых аллергенов</span>`];
    tagsEl.innerHTML = [...dTags, ...aTags].join("");

    const dayStats = getDayNutritionStats(store.selectedDayIndex);
    document.getElementById("detail-science-tip").innerText = generateNutriXAdvice(meal, dayStats, appState.user, mpInfo);

    window.scrollTo({ top: 0, behavior: "instant" });
    haptic("light");
}

function renderDetailIngredientsWithOneClickSubs(meal) {
    const container = document.getElementById("detail-ingredients-list");
    if (!container) return;
    const mult = store.detailPortionMult === 2 ? 2 : 1;

    container.innerHTML = (meal.ingredients || []).map((ing, idx) => {
        let qtyHtml = "";
        let stateLbl = "";
        if (store.detailWeightMode === "visual") {
            const hm = formatHouseholdMeasure(ing, mult);
            qtyHtml = `<div class="ing-qty-col"><div class="ing-qty-main">${escapeHtml(hm.primary)}</div><div class="ing-qty-sub">${escapeHtml(hm.sub)}</div></div>`;
            stateLbl = "на глаз";
        } else {
            const baseG = store.detailWeightMode === "raw" ? toRawStoreGrams(ing) : toCookedPlateGrams(ing);
            const displayG = Math.round(baseG * mult);
            qtyHtml = `<div class="ing-qty-col"><div class="ing-qty-main tabular">${displayG} г</div></div>`;
            stateLbl = store.detailWeightMode === "raw" ? "сырой (весы)" : "готовый (тарелка)";
        }

        const subs = findInlineSubs(ing.name, ing.alt);

        const subChips = subs.map((s, sIdx) => {
            const dK = Math.round((s.dKcal || 0) * ((Number(ing.weight) || 100) / 100));
            const dStr = dK !== 0 ? ` (${dK > 0 ? "+" : ""}${dK} ккал)` : "";
            return `<button type="button" class="inline-sub-chip" onclick="applyInlineDetailSub('${escapeHtml(meal.id)}', ${idx}, ${sIdx})">⇄ ${escapeHtml(s.target.split("(")[0].trim())}${dStr}</button>`;
        }).join("");

        const revertBtn = ing.originalSnapshot
            ? `<button type="button" class="inline-sub-chip revert" onclick="revertInlineDetailSub('${escapeHtml(meal.id)}', ${idx})">↩ Вернуть «${escapeHtml(ing.originalSnapshot.name.split("(")[0].trim())}»</button>`
            : "";

        return `
            <div class="ing-row">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700;">${escapeHtml(ing.name)}</div>
                    <div style="font-size:11px; color:var(--nx-text-muted);">${stateLbl}${ing.dept ? ` · ${escapeHtml(ing.dept)}` : ""}${mult === 2 ? " · ×2 дня" : ""}</div>
                    ${(subChips || revertBtn) ? `<div class="inline-sub-strip">${revertBtn || subChips}</div>` : ""}
                </div>
                ${qtyHtml}
            </div>`;
    }).join("");
}

export function applyInlineDetailSub(mealId, ingIdx, subIdx) {
    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    const ing = meal?.ingredients?.[ingIdx];
    if (!ing) return;

    const chosen = findInlineSubs(ing.name, ing.alt)[subIdx];
    if (!chosen) return;

    const scale100 = (Number(ing.weight) || 100) / 100;
    const dK = Math.round((chosen.dKcal || 0) * scale100);
    const dP = Math.round((chosen.dP || 0) * scale100);
    const dF = Math.round((chosen.dF || 0) * scale100);
    const dC = Math.round((chosen.dC || 0) * scale100);

    if (!ing.originalSnapshot) {
        ing.originalSnapshot = { name: ing.name, weight: ing.weight, dK, dP, dF, dC };
    }
    ing.name = chosen.target;
    ing.weight = Math.max(5, Math.round(ing.weight * (chosen.ratio || 1.0)));
    meal.kcal = Math.max(60, meal.kcal + dK);
    meal.protein = Math.max(1, meal.protein + dP);
    meal.fat = Math.max(0, meal.fat + dF);
    meal.carbs = Math.max(0, meal.carbs + dC);

    rebuildGroceryList();
    saveState();
    openMealDetail(mealId);
    ["detail-kcal", "detail-p", "detail-f", "detail-c"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove("macro-flash");
        void el.offsetWidth;
        el.classList.add("macro-flash");
    });
    showToast(`Заменено: ${chosen.target.split("(")[0].trim()} (${dK >= 0 ? "+" : ""}${dK} ккал)`);
    haptic("medium");
}

export function revertInlineDetailSub(mealId, ingIdx) {
    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    const ing = meal?.ingredients?.[ingIdx];
    if (!ing?.originalSnapshot) return;

    const snap = ing.originalSnapshot;
    ing.name = snap.name;
    ing.weight = snap.weight;
    meal.kcal = Math.max(60, meal.kcal - snap.dK);
    meal.protein = Math.max(1, meal.protein - snap.dP);
    meal.fat = Math.max(0, meal.fat - snap.dF);
    meal.carbs = Math.max(0, meal.carbs - snap.dC);
    delete ing.originalSnapshot;

    rebuildGroceryList();
    saveState();
    openMealDetail(mealId);
    showToast("Исходный продукт возвращён");
    haptic("light");
}

export function closeMealDetail() {
    store.activeDetailMealId = null;
    store.detailPortionMult = 1;
    switchTab(previousTabBeforeDetail || "nutrition");
}

export function toggleMealFromDetail() { if (store.activeDetailMealId) toggleMealEaten(store.activeDetailMealId); }
export function swapMealFromDetail() { if (store.activeDetailMealId) swapSingleMeal(store.activeDetailMealId); }
export function openEditFromDetail() { if (store.activeDetailMealId) openEditMealModal(store.activeDetailMealId); }
export function togglePinMealFromDetail() { if (store.activeDetailMealId) togglePinMealForWeek(store.activeDetailMealId); }

/* =========================================================================
   КАТАЛОГ РЕЦЕПТОВ («ДЛЯ ТЕБЯ» С ФИЛЬТРАЦИЕЙ ОГРАНИЧЕНИЙ И СКОРИНГОМ)
   ========================================================================= */
let _catSearchTimer = null;
export function debouncedCatalogSearch(val) {
    catalogSearchQuery = (val || "").trim().toLowerCase();
    clearTimeout(_catSearchTimer);
    _catSearchTimer = setTimeout(renderRecipesCatalog, 160);
}

export function setCatalogFilter(filter, btnEl) {
    activeCatalogFilter = filter;
    document.querySelectorAll("#catalog-filter-chips .q-chip").forEach(c => c.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderRecipesCatalog();
    hapticSelect();
}

export function renderRecipesCatalog() {
    const box = document.getElementById("recipes-catalog-list");
    if (!box) return;

    let list = store.MASTER_RECIPES_DB.filter(r => {
        if (activeCatalogFilter === "all" && appState.user && !recipeMatchesUserConstraints(r, appState.user)) return false;
        if (activeCatalogFilter === "high_protein" && (r.nutrition?.serving_protein_g || 0) < 35) return false;
        if (activeCatalogFilter === "quick" && (r.total_time_min || 20) > 15) return false;
        if (activeCatalogFilter === "breakfast" && r.meal_type !== "Завтрак") return false;
        if (activeCatalogFilter === "dinner" && r.meal_type !== "Ужин") return false;
        if (catalogSearchQuery) {
            const blob = (r.title_ru + " " + (r.primary_category_ru || "") + " " + (r.ingredients || []).map(i => i.name).join(" ")).toLowerCase();
            if (!blob.includes(catalogSearchQuery)) return false;
        }
        return true;
    });

    if (activeCatalogFilter === "all" && appState.user) {
        list = list.slice().sort((a, b) => scoreRecipeForUser(b, appState.user) - scoreRecipeForUser(a, appState.user));
    }

    list = list.slice(0, 45);
    if (!list.length) {
        box.innerHTML = `<div class="hint-ref-box" style="text-align:center;">Ничего не найдено по запросу или с учётом ваших ограничений.</div>`;
        return;
    }

    box.innerHTML = list.map(r => {
        const n = r.nutrition || {};
        return `
            <div class="nx-cat-row" onclick="assignCatalogRecipeToSelectedDay('${escapeHtml(r.recipe_id)}')">
                <div style="flex:1; min-width:0;">
                    <div style="font-size:14px; font-weight:800; line-height:1.28; margin-bottom:4px;">${escapeHtml(r.title_ru)}</div>
                    <div style="font-size:11px; color:var(--nx-text-muted);">
                        ${escapeHtml(r.meal_type)} · ${Number(r.total_time_min) || 18} мин ·
                        <strong style="color:var(--nx-mint);">${Math.round(n.serving_kcal || 400)} ккал</strong>
                        (Б ${Math.round(n.serving_protein_g || 25)} / Ж ${Math.round(n.serving_fat_g || 12)} / У ${Math.round(n.serving_carbs_g || 35)})
                    </div>
                </div>
                <div class="nx-plus-circle">+</div>
            </div>`;
    }).join("");
}

export function assignCatalogRecipeToSelectedDay(recipeId) {
    pendingCatalogRecipeId = recipeId;
    openChooseMealSheet(true);
}

/* =========================================================================
   ВКЛАДКА «ПРОГРЕСС» И «ПРОФИЛЬ»
   ========================================================================= */
export function setProgressMode(mode) {
    activeProgressMode = mode;
    document.getElementById("prog-mode-week")?.classList.toggle("active", mode === "week");
    document.getElementById("prog-mode-month")?.classList.toggle("active", mode === "month");
    renderProgressTab();
    hapticSelect();
}

export function renderProgressTab() {
    const u = appState.user;
    const t = appState.activeTargets || appState.targets;
    if (!u || !t) return;

    recordTodaySnapshot();
    const entries = Object.values(appState.dailyHistory || {}).sort((a, b) => a.date.localeCompare(b.date));
    const visible = entries.slice(-(activeProgressMode === "week" ? 7 : 30));

    const startDate = appState.startedAt || getTodayStr();
    const daysSinceStart = Math.max(1, Math.floor((new Date(getTodayStr()) - new Date(startDate)) / 86400000) + 1);
    const startLbl = new Date(startDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    document.getElementById("prog-period-label").innerText = `День ${daysSinceStart} · с ${startLbl}`;

    const avg = visible.length ? Math.round(visible.reduce((s, d) => s + (d.eatenKcal || 0), 0) / visible.length) : 0;
    document.getElementById("prog-avg-kcal").innerText = avg.toLocaleString("ru-RU");
    document.getElementById("prog-status-badge").innerText = avg > 0
        ? (Math.abs(avg - t.dailyKcal) <= 180 ? "В коридоре" : (avg < t.dailyKcal ? "Ниже плана" : "Выше плана"))
        : "День старта";

    const bars = visible.slice(-7);
    const maxVal = Math.max(...bars.map(d => d.eatenKcal || 0), t.dailyKcal, 1);
    const chartEl = document.getElementById("prog-bar-chart");
    chartEl.style.gridTemplateColumns = `repeat(${Math.max(1, bars.length)}, 1fr)`;
    chartEl.innerHTML = bars.map((d, idx) => {
        const isLast = idx === bars.length - 1;
        const hPct = Math.max(14, Math.round(((d.eatenKcal || 0) / maxVal) * 100));
        const shortDt = new Date(d.date).toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" });
        return `
            <div class="nx-bar-col ${isLast ? "active" : ""}">
                ${isLast ? `<div class="nx-bar-tooltip">${Number(d.eatenKcal) || 0}</div>` : ""}
                <div class="nx-bar-capsule" style="height:${hPct}%"></div>
                <div class="nx-bar-x">${escapeHtml(shortDt)}</div>
            </div>`;
    }).join("");

    const checkIns = (appState.checkIns?.length) ? appState.checkIns : [{ date: startDate, weight: u.weight }];
    document.getElementById("prog-weight-val").innerText = Number(u.weight).toFixed(1);
    const deltaW = Number((u.weight - checkIns[0].weight).toFixed(1));
    document.getElementById("prog-weight-delta").innerText = checkIns.length > 1
        ? `${deltaW > 0 ? "+" : ""}${deltaW} кг со старта · Внести замер ›`
        : "Стартовая точка · Внести замер ›";

    const svg = document.getElementById("prog-weight-svg");
    if (checkIns.length === 1) {
        svg.innerHTML = `<line x1="12" y1="30" x2="132" y2="30" stroke="var(--nx-border-strong)" stroke-dasharray="4 4" stroke-width="2"/><circle cx="72" cy="30" r="5" fill="var(--nx-mint)"/>`;
    } else {
        const ws = checkIns.map(c => c.weight);
        const minW = Math.min(...ws) - 0.5, maxW = Math.max(...ws) + 0.5;
        const pts = checkIns.map((c, i) => {
            const x = 10 + (i / (checkIns.length - 1)) * 124;
            const y = 50 - ((c.weight - minW) / Math.max(0.5, maxW - minW)) * 38;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const lastPt = pts[pts.length - 1].split(",");
        svg.innerHTML = `<polyline fill="none" stroke="var(--nx-mint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(" ")}"/><circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="4.5" fill="var(--nx-mint)"/>`;
    }

    const pK = t.protein * 4, fK = t.fat * 9, cK = t.carbs * 4;
    const tot = Math.max(1, pK + fK + cK);
    const pP = Math.round((pK / tot) * 100), fP = Math.round((fK / tot) * 100), cP = Math.max(0, 100 - pP - fP);
    document.getElementById("prog-seg-p").style.width = `${pP}%`;
    document.getElementById("prog-seg-f").style.width = `${fP}%`;
    document.getElementById("prog-seg-c").style.width = `${cP}%`;
    document.getElementById("prog-pct-p").innerText = `${pP}%`;
    document.getElementById("prog-pct-f").innerText = `${fP}%`;
    document.getElementById("prog-pct-c").innerText = `${cP}%`;
}

export function renderCloudStatusCard() {
    const card = document.getElementById("cloud-status-card");
    const titleEl = document.getElementById("cloud-sync-title");
    const subEl = document.getElementById("cloud-sync-sub");
    const btn = document.getElementById("cloud-retry-btn");
    if (!card || !titleEl || !subEl) return;

    const supported = CloudSync.isSupported();
    const st = store.cloudSyncStatus;
    card.classList.toggle("error", st === "error" || st === "limit");

    if (!supported) {
        titleEl.innerText = "💾 Сохранено на этом устройстве";
        subEl.innerText = "Открой NutriX через бота в Telegram, чтобы включить автоматический перенос профиля между телефоном и ПК.";
        btn?.classList.add("hidden");
    } else if (st === "error") {
        titleEl.innerText = "⚠ Не удалось сохранить в облако";
        subEl.innerText = "Локальная копия в порядке — нажми «Повторить», когда вернётся стабильная сеть.";
        btn?.classList.remove("hidden");
    } else if (st === "limit") {
        titleEl.innerText = "⚠ Облако переполнено";
        subEl.innerText = "Слишком много сохранённых записей — почисти лишние «Мои блюда» и повтори сохранение.";
        btn?.classList.remove("hidden");
    } else {
        titleEl.innerText = "☁️ Всё сохраняется само";
        const timeNote = store.lastCloudSyncTime ? ` · обновлено в ${store.lastCloudSyncTime}` : "";
        subEl.innerText = `Данные привязаны к аккаунту Telegram — на другом телефоне или ПК всё откроется автоматически${timeNote}.`;
        btn?.classList.add("hidden");
    }
}

export function renderProfileTab() {
    const u = appState.user;
    const t = appState.activeTargets || appState.targets;
    if (!u || !t) return;

    const goalObj = GOALS_V4.find(g => g.val === u.goal) || GOALS_V4[0];
    const sportsLabel = formatUserSportsShort(u);
    const appObj = APPETITE_LEVELS[Number(u.appetiteLevel) || 3] || APPETITE_LEVELS[3];
    const actScore = u.activityScore ?? palToActivityScore(u.activityLevel);

    document.getElementById("prof-goal-title").innerText = goalObj.title;
    document.getElementById("prof-formula-sub").innerText = `Формула: ${t.formulaName}`;
    document.getElementById("prof-precision-pct").innerText = `${t.precisionScore || 75}%`;
    document.getElementById("prof-precision-bar").style.width = `${t.precisionScore || 75}%`;
    document.getElementById("prof-precision-hint").innerText = t.derivedLbm
        ? `Расчёт идёт по сухой массе тела (${t.derivedLbm} кг) с учётом профиля «${sportsLabel}».`
        : "Добавь % жира или сухую массу ниже — расчёт станет ещё точнее.";

    document.getElementById("prof-gender").innerText = u.gender === "female" ? "Женский" : "Мужской";
    document.getElementById("prof-age").innerText = formatCountRu(u.age, "год", "года", "лет");
    document.getElementById("prof-height").innerText = `${u.height} см`;
    document.getElementById("prof-weight").innerText = `${u.weight} кг`;
    document.getElementById("prof-pal").innerText = `${Number.isInteger(actScore) ? actScore : actScore.toFixed(1)} / 10`;
    document.getElementById("prof-sport").innerText = sportsLabel;
    document.getElementById("prof-goal-short").innerText = goalObj.title.split(" ").slice(0, 2).join(" ");
    document.getElementById("prof-meals-count").innerText = `${formatCountRu(u.mealsCount, "приём", "приёма", "приёмов")} в день`;
    document.getElementById("prof-appetite").innerText = `${u.appetiteLevel || 3} / 5 · ${appObj.title.split(" ")[0]}`;
    document.getElementById("prof-prefs-short").innerText = u.preferencesText ? u.preferencesText.slice(0, 18) : "Без ограничений";

    const setOpt = (id, val, unit) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = val ? `${escapeHtml(val)} ${escapeHtml(unit)}` : `<span class="bio-empty-tag">+ Добавить</span>`;
    };
    setOpt("prof-bf", u.bodyFatPct || t.derivedBf, "%");
    setOpt("prof-lbm", u.leanBodyMass || t.derivedLbm, "кг");
    setOpt("prof-waist", u.waistCm, "см");

    document.getElementById("prof-formula-name").innerText = t.formulaName;
    document.getElementById("prof-bmr").innerText = `${t.bmr} ккал`;
    document.getElementById("prof-tdee").innerText = `${t.tdee} ккал`;
    document.getElementById("prof-target-kcal").innerText = `${t.dailyKcal} ккал`;
    document.getElementById("prof-macro-ratios").innerText = `Б ${t.proteinPerKg} · Ж ${t.fatPerKg} · У ${t.carbsPerKg}`;

    renderThemePicker();
    renderCloudStatusCard();
}

/* =========================================================================
   КОРЗИНА ПОКУПОК, ЗАМЕНЫ, КОПИРОВАНИЕ И ШЕРИНГ
   ========================================================================= */
export function setGroceryPeriod(days) {
    store.groceryPeriod = days;
    [1, 3, 7].forEach(d => document.getElementById(`btn-days-${d}`)?.classList.toggle("active", d === days));
    rebuildGroceryList();
    saveState();
    renderGroceriesList();
    hapticSelect();
}

export function toggleOverlapOptimization() {
    appState.optimizeOverlap = !(appState.optimizeOverlap !== false);
    generateWeeklyPlanOptimized();
    renderApp();
    showToast(appState.optimizeOverlap ? "Оптимизация остатков включена" : "Оптимизация остатков выключена");
    haptic("light");
}

export function toggleHideCheckedGroceries() {
    store.hideCheckedGroceries = !store.hideCheckedGroceries;
    document.getElementById("btn-hide-checked")?.classList.toggle("active-eat", store.hideCheckedGroceries);
    renderGroceriesList();
    hapticSelect();
}

export function toggleGroceryItem(encodedName) {
    const name = decodeURIComponent(encodedName);
    if (!appState.checkedGroceries) appState.checkedGroceries = {};
    appState.checkedGroceries[name] = !appState.checkedGroceries[name];
    rebuildGroceryList();
    saveState();
    renderGroceriesList();
    hapticSelect();
}

export function addCustomGroceryItem() {
    const inp = document.getElementById("custom-grocery-input");
    const val = (inp?.value || "").trim();
    if (!val) return;
    if (!Array.isArray(appState.customGroceries)) appState.customGroceries = [];
    appState.customGroceries.push({ name: val, weight: 0, isCustom: true });
    inp.value = "";
    rebuildGroceryList();
    saveState();
    renderGroceriesList();
    showToast(`Добавлено: ${val}`);
    haptic("light");
}

export function clearGroceryChecks() {
    appState.checkedGroceries = {};
    appState.customGroceries = [];
    rebuildGroceryList();
    saveState();
    renderGroceriesList();
    showToast("Галочки и личные позиции очищены");
    haptic("light");
}

export function renderGroceriesList() {
    const container = document.getElementById("groceries-container");
    if (!container) return;

    const incDays = getIncludedDaysForGrocery();
    let rangeLbl = "Закупка · Неделя";
    if (store.groceryPeriod === 1 && incDays.length) {
        rangeLbl = `Закупка · ${incDays[0].full}`;
    } else if (store.groceryPeriod === 3 && incDays.length >= 2) {
        rangeLbl = `Закупка · ${incDays[0].short}–${incDays[incDays.length - 1].short}`;
    }
    const titleEl = document.getElementById("grocery-range-title");
    if (titleEl) titleEl.innerText = rangeLbl;
    [1, 3, 7].forEach(d => document.getElementById(`btn-days-${d}`)?.classList.toggle("active", d === store.groceryPeriod));

    const overlapOn = appState.optimizeOverlap !== false;
    const badge = document.getElementById("overlap-toggle-badge");
    if (badge) badge.innerText = overlapOn ? "ВКЛ" : "ВЫКЛ";

    const list = appState.groceryList || {};
    let totalItems = 0, checkedItems = 0;

    Object.values(list).forEach(items => {
        items.forEach(i => {
            totalItems++;
            if (i.isChecked) checkedItems++;
        });
    });

    const pct = totalItems ? Math.round((checkedItems / totalItems) * 100) : 0;
    const progTxt = document.getElementById("grocery-progress-text");
    if (progTxt) progTxt.innerText = `Куплено ${checkedItems} из ${totalItems}`;
    const progBar = document.getElementById("grocery-progress-bar");
    if (progBar) progBar.style.width = `${pct}%`;

    const hasResettable = checkedItems > 0 || (Array.isArray(appState.customGroceries) && appState.customGroceries.length > 0);
    document.getElementById("btn-reset-grocery-checks")?.classList.toggle("hidden", !hasResettable);

    let html = "";
    Object.entries(list).forEach(([group, items]) => {
        const visible = store.hideCheckedGroceries ? items.filter(i => !i.isChecked) : items;
        if (!visible.length) return;
        html += `<div class="dept-header">${escapeHtml(group)}</div>`;

        visible.forEach(item => {
            const encName = encodeURIComponent(item.name);
            const encAlt = encodeURIComponent(item.alt || "");
            const packMain = item.packLabel || (item.weight > 0 ? `${item.weight} г` : "по вкусу");
            const packSub = item.gramsSub ? `<div class="g-pack-sub ${item.checkHome ? "home-hint" : ""}">${escapeHtml(item.gramsSub)}</div>` : "";
            const hasSubs = findInlineSubs(item.name, item.alt).length > 0;

            html += `
                <div class="grocery-row ${item.isChecked ? "checked" : ""}" onclick="toggleGroceryItem('${encName}')">
                    <div class="g-left">
                        <div class="custom-checkbox">${item.isChecked ? "✓" : ""}</div>
                        <div style="min-width:0;">
                            <div class="g-title">${escapeHtml(item.name)}${item.waveLabel ? `<span class="wave-badge">${escapeHtml(item.waveLabel)}</span>` : ""}</div>
                            <div class="g-meta-dishes">${escapeHtml(item.dishes || "")}</div>
                            ${hasSubs ? `<button type="button" class="sub-trigger-btn" onclick="event.stopPropagation(); openSubstitutionModal('${encName}', '${encAlt}')">⇄ Заменить</button>` : ""}
                        </div>
                    </div>
                    <div class="g-weight-col">
                        <div class="g-pack-main">${escapeHtml(packMain)}</div>
                        ${packSub}
                    </div>
                </div>`;
        });
    });

    container.innerHTML = html || `<div class="hint-ref-box" style="text-align:center;">Все покупки отмечены ✓</div>`;
}

let activeSubSourceName = null;
let activeSubFallbackAlt = "";

export function openSubstitutionModal(encName, encAlt = "") {
    activeSubSourceName = decodeURIComponent(encName);
    activeSubFallbackAlt = decodeURIComponent(encAlt || "");
    const opts = findInlineSubs(activeSubSourceName, activeSubFallbackAlt);

    document.getElementById("sub-modal-source-label").innerText = `Чем заменить «${activeSubSourceName}» в меню и корзине?`;
    const box = document.getElementById("sub-options-container");
    box.innerHTML = opts.length ? opts.map((o, idx) => `
        <div class="sub-option-card" onclick="applyIngredientSubstitution(${idx})">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <strong style="font-size:14px;">${escapeHtml(o.target)}</strong>
                <span class="precision-pill">${escapeHtml(o.eq || "Аналог")}</span>
            </div>
            <div style="font-size:12px; color:var(--nx-text-muted); margin-top:4px;">${escapeHtml(o.note || "Равноценная замена из справочника")}</div>
            ${(o.dKcal !== 0 || o.dP !== 0) ? `
            <div class="sub-delta-row">
                <span style="color:var(--nx-mint);">${o.dKcal > 0 ? "+" : ""}${o.dKcal} ккал/100г</span>
                <span>Б: ${o.dP > 0 ? "+" : ""}${o.dP}г</span>
                <span>Ж: ${o.dF > 0 ? "+" : ""}${o.dF}г</span>
            </div>` : ""}
        </div>`).join("") : `<div class="hint-ref-box">Нет замен для этого продукта.</div>`;

    document.getElementById("substitution-modal").classList.remove("hidden");
    haptic("light");
}

export function applyIngredientSubstitution(optIdx) {
    if (!activeSubSourceName) return;
    const chosen = findInlineSubs(activeSubSourceName, activeSubFallbackAlt)[optIdx];
    if (!chosen) return;

    let replacedCount = 0;
    (appState.weekPlan || []).forEach(dayObj => {
        (dayObj.meals || []).forEach(meal => {
            if (meal.eaten) return;
            (meal.ingredients || []).forEach(ing => {
                if (ing.name === activeSubSourceName) {
                    const s100 = (Number(ing.weight) || 100) / 100;
                    ing.name = chosen.target;
                    ing.weight = Math.max(5, Math.round(ing.weight * (chosen.ratio || 1.0)));
                    meal.kcal = Math.max(80, Math.round(meal.kcal + (chosen.dKcal || 0) * s100));
                    meal.protein = Math.max(1, Math.round(meal.protein + (chosen.dP || 0) * s100));
                    meal.fat = Math.max(0, Math.round(meal.fat + (chosen.dF || 0) * s100));
                    meal.carbs = Math.max(0, Math.round(meal.carbs + (chosen.dC || 0) * s100));
                    replacedCount++;
                }
            });
        });
    });

    rebuildGroceryList();
    saveState();
    renderApp();
    closeModal("substitution-modal");
    showToast(`Заменено на «${chosen.target.split("(")[0].trim()}» (${formatCountRu(replacedCount, "блюдо", "блюда", "блюд")})`);
    haptic("medium");
}

function buildPlainGroceryText() {
    const pLbl = store.groceryPeriod === 1 ? "на 1 день" : (store.groceryPeriod === 3 ? "на 3 дня" : "на неделю");
    const lines = [`🛒 NutriX · Список покупок ${pLbl}`];
    Object.entries(appState.groceryList || {}).forEach(([group, items]) => {
        const pending = items.filter(i => !i.isChecked);
        if (!pending.length) return;
        lines.push(`\n${group}:`);
        pending.forEach(i => {
            const pack = i.packLabel ? ` — ${i.packLabel}` : "";
            const sub = i.gramsSub ? ` (${i.gramsSub})` : "";
            lines.push(`• ${i.name}${pack}${sub}`);
        });
    });
    return lines.join("\n");
}

export function copyGroceriesToClipboard() {
    const text = buildPlainGroceryText();
    const fallbackCopy = () => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand("copy"); showToast("Список покупок скопирован ✓"); }
        catch (e) { showToast("Не удалось скопировать"); }
        document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast("Список покупок скопирован ✓")).catch(fallbackCopy);
    } else {
        fallbackCopy();
    }
    haptic("medium");
}

export function shareGroceriesToTelegram() {
    const text = buildPlainGroceryText();
    const url = `https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
    haptic("light");
}

/* =========================================================================
   УПРОЩЁННЫЙ ТРЕКЕР ВОДЫ (БЕЗ ПСЕВДОНАУЧНЫХ КОЭФФИЦИЕНТОВ)
   ========================================================================= */
export function computeDailyWaterGoalMl() {
    const u = appState.user;
    if (!u) return 2500;
    const base = Number(u.weight) * 35;
    const actScore = u.activityScore ?? palToActivityScore(u.activityLevel);
    const bonus = Math.max(0, (actScore - 1) * 75);
    return Math.round((base + bonus) / 50) * 50;
}

export function quickAddWater250() {
    logWaterIntake(250);
}

export function openWaterModal() {
    renderWaterModal();
    document.getElementById("water-modal").classList.remove("hidden");
    haptic("light");
}

export function logWaterIntake(ml) {
    const amountMl = Math.max(50, Math.round(Number(ml) || 0));
    if (!amountMl) return;
    const today = getTodayStr();
    if (!appState.waterLog) appState.waterLog = {};
    if (!appState.waterHistory) appState.waterHistory = {};
    if (!Array.isArray(appState.waterHistory[today])) appState.waterHistory[today] = [];

    const time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    appState.waterHistory[today].push({ time, ml: amountMl });
    appState.waterLog[today] = Number((Number(appState.waterLog[today] || 0) + amountMl / 1000).toFixed(3));

    saveState();
    renderHomeOverview();
    renderWaterModal();
    showToast(`+${amountMl} мл воды`);
    haptic("medium");
}

export function undoLastWater() {
    const today = getTodayStr();
    const hist = appState.waterHistory?.[today];
    if (!hist?.length) return;
    const last = hist.pop();
    const deltaMl = Number(last.ml ?? last.effMl) || 0;
    appState.waterLog[today] = Math.max(0, Number((Number(appState.waterLog?.[today] || 0) - deltaMl / 1000).toFixed(3)));
    saveState();
    renderHomeOverview();
    renderWaterModal();
    showToast(`Отменено: −${deltaMl} мл`);
    haptic("light");
}

export function renderWaterModal() {
    const goalMl = computeDailyWaterGoalMl();
    const today = getTodayStr();
    const curMl = Math.round(Number(appState.waterLog?.[today] || 0) * 1000);
    const pct = Math.min(100, Math.round((curMl / Math.max(1, goalMl)) * 100));
    const remMl = Math.max(0, goalMl - curMl);

    const u = appState.user || { weight: 70 };
    const baseMl = Math.round(u.weight * 35);
    const bonusMl = Math.max(0, goalMl - baseMl);

    document.getElementById("wm-pct-badge").innerText = `${pct}%`;
    document.getElementById("wm-norm-breakdown").innerText = `База ${baseMl} мл (${u.weight} кг) + активность +${bonusMl} мл`;
    document.getElementById("wm-cur-l").innerText = (curMl / 1000).toFixed(2);
    document.getElementById("wm-goal-l").innerText = (goalMl / 1000).toFixed(2);
    document.getElementById("wm-rem-text").innerText = remMl > 0 ? `До цели осталось ${remMl} мл` : "Суточная норма воды выполнена ✓";

    const hist = (appState.waterHistory?.[today] || []).slice().reverse();
    document.getElementById("wm-history-list").innerHTML = hist.length
        ? hist.map(h => {
            const val = Number(h.ml ?? h.effMl) || 0;
            return `<div class="science-row"><span style="color:var(--nx-text-muted);">${escapeHtml(h.time || "")}</span><strong>+${val} мл</strong></div>`;
        }).join("")
        : `<div style="font-size:12px; color:var(--nx-text-muted); text-align:center; padding:8px 0;">Записей за сегодня пока нет</div>`;
}

/* =========================================================================
   УМНЫЙ CHECK-IN (EMA + ПРОВЕРКА СОБЛЮДЕНИЯ ПЛАНА >= 70% И <= 15%)
   ========================================================================= */
export function openCheckInModal() {
    document.getElementById("ci-weight-input").value = appState.user?.weight || 70;
    document.getElementById("ci-waist-input").value = appState.user?.waistCm || "";
    document.getElementById("ci-bf-input").value = appState.user?.bodyFatPct || "";
    document.getElementById("checkin-modal").classList.remove("hidden");
    haptic("light");
}

export function submitCheckIn() {
    const newWeight = parseFloat(document.getElementById("ci-weight-input").value);
    if (isNaN(newWeight) || newWeight < 35 || newWeight > 250) {
        showToast("Введите корректный вес (35–250 кг)");
        return;
    }

    const newWaist = parseFloat(document.getElementById("ci-waist-input").value) || null;
    const newBf = parseFloat(document.getElementById("ci-bf-input").value) || null;
    if (!Array.isArray(appState.checkIns)) appState.checkIns = [];

    const today = getTodayStr();
    const sameDayIdx = appState.checkIns.findIndex(c => c.date === today);
    const record = { date: today, weight: newWeight, waist: newWaist, bf: newBf };
    if (sameDayIdx >= 0) appState.checkIns[sameDayIdx] = record;
    else appState.checkIns.push(record);

    appState.user.weight = newWeight;
    if (newWaist) appState.user.waistCm = newWaist;
    if (newBf) appState.user.bodyFatPct = newBf;

    const trend = computeSmoothedWeightTrend(appState.checkIns, today, appState.lastAutoAdjustDate);
    let msg = "Замер сохранён ✓";
    let shouldAdjustCalories = false;
    let deltaKcal = 0;

    if (!trend.ready) {
        msg = "Замер сохранён · копим тренд веса (нужно 7–14 дней наблюдений)";
    } else if (appState.user.goal === "healthy") {
        msg = "Замер сохранён · режим здорового питания без коррекции веса";
    } else {
        const adherence = evaluatePlanAdherence(
            appState.dailyHistory,
            trend.refDate,
            trend.latestDate,
            appState.activeTargets?.dailyKcal || 2000
        );
        if (!adherence.isReliable) {
            msg = "Недостаточно данных по соблюдению плана для автокоррекции — просто продолжаем держать текущую норму";
        } else {
            const ratePct = trend.weeklyRatePct;
            const goal = appState.user.goal;
            shouldAdjustCalories = true;

            if (goal === "cut") {
                if (ratePct > -0.30) {
                    deltaKcal = -120;
                    msg = `Тренд EMA ${ratePct > 0 ? "+" : ""}${ratePct}%/нед — мягко убираем 120 ккал`;
                } else if (ratePct < -1.15) {
                    deltaKcal = +120;
                    msg = `Слишком быстрый спад (${ratePct}%/нед) — добавляем +120 ккал для мышц`;
                } else {
                    msg = `Отличный темп похудения по тренду EMA (${ratePct}%/нед)`;
                }
            } else if (goal === "bulk") {
                if (ratePct < 0.15) {
                    deltaKcal = +120;
                    msg = `Тренд EMA замедлился (${ratePct}%/нед) — добавляем +120 ккал`;
                } else if (ratePct > 0.70) {
                    deltaKcal = -100;
                    msg = `Набор быстрее нормы (+${ratePct}%/нед) — убираем 100 ккал`;
                } else {
                    msg = `Оптимальный набор массы (+${ratePct}%/нед по EMA)`;
                }
            } else if (goal === "maintain") {
                if (ratePct > 0.35) {
                    deltaKcal = -100;
                    msg = `Тренд вверх (+${ratePct}%/нед) — корректируем −100 ккал`;
                } else if (ratePct < -0.35) {
                    deltaKcal = +100;
                    msg = `Тренд вниз (${ratePct}%/нед) — возвращаем +100 ккал`;
                } else {
                    msg = "Вес стабилен по тренду EMA — норма идеально откалибрована";
                }
            }
        }
    }

    if (shouldAdjustCalories && deltaKcal !== 0) {
        appState.adaptiveOffsetKcal = Math.max(-350, Math.min(400, (appState.adaptiveOffsetKcal || 0) + deltaKcal));
        appState.lastAutoAdjustDate = today;
        const freshIdeal = calculateTargets(appState.user);
        const adjusted = scaleTargetsToKcal(freshIdeal, freshIdeal.dailyKcal + appState.adaptiveOffsetKcal);
        applySmoothTargetTransition(adjusted, "Коррекция по тренду веса (EMA)");
        rebuildUneatenMealsForWeek();
    } else if (shouldAdjustCalories) {
        appState.lastAutoAdjustDate = today;
    }

    saveState();
    renderApp();
    closeModal("checkin-modal");
    showToast(msg);
    NutriXPerf.notify("success");
}

/* =========================================================================
   МОДАЛКИ ЗАМЕНЫ БЛЮДА, «МОИ БЛЮДА» И ZERO GUILT AI
   ========================================================================= */
export function openChooseMealSheet(fromCatalog = false) {
    if (!fromCatalog) pendingCatalogRecipeId = null;
    syncSelectedDayMeals();
    const listEl = document.getElementById("choose-meal-list");
    listEl.innerHTML = (appState.meals || []).map(m => `
        <div class="choice-card" onclick="handleMealChoiceClick('${escapeHtml(m.id)}')">
            <div style="min-width:0;">
                <div class="choice-title">${escapeHtml(m.name)} · ${Number(m.kcal) || 0} ккал</div>
                <div class="choice-sub">${escapeHtml(m.dishTitle)}</div>
            </div>
            <span style="color:var(--nx-mint); font-weight:800;">›</span>
        </div>`).join("");
    document.getElementById("choose-meal-modal").classList.remove("hidden");
    haptic("light");
}

export function handleMealChoiceClick(mealId) {
    closeModal("choose-meal-modal");
    if (pendingCatalogRecipeId) {
        const master = store.MASTER_RECIPES_DB.find(r => r.recipe_id === pendingCatalogRecipeId);
        pendingCatalogRecipeId = null;
        if (master) {
            applyMasterRecipeToMealSlot(mealId, master);
            return;
        }
    }
    openEditMealModal(mealId);
}

function applyMasterRecipeToMealSlot(mealId, master) {
    syncSelectedDayMeals();
    const idx = appState.meals.findIndex(m => m.id === mealId);
    if (idx === -1) return;
    const cur = appState.meals[idx];
    appState.meals[idx] = scaleMasterRecipeToMeal(master, cur.name, cur.slotKey || "lunch", cur.id, cur.kcal);
    rebuildGroceryList();
    saveState();
    renderApp();
    if (store.activeDetailMealId === mealId) openMealDetail(mealId);
    showToast(`Установлено: ${master.title_ru.slice(0, 34)}…`);
    haptic("medium");
}

function renderSavedCustomMealsInModal() {
    const section = document.getElementById("saved-custom-meals-section");
    const listEl = document.getElementById("saved-custom-meals-list");
    const countEl = document.getElementById("saved-meals-count");
    if (!section || !listEl) return;

    const list = Array.isArray(appState.savedCustomMeals) ? appState.savedCustomMeals : [];
    section.classList.toggle("hidden", list.length === 0);
    if (countEl) countEl.innerText = `${list.length} / ${MAX_SAVED_CUSTOM_MEALS}`;

    listEl.innerHTML = list.map(item => `
        <div class="saved-meal-row" onclick="applySavedCustomMealToSlot('${escapeHtml(item.id)}')">
            <div style="min-width:0; flex:1;">
                <div style="font-size:13px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.title)}</div>
                <div style="font-size:11px; color:var(--nx-text-muted); margin-top:2px;">
                    <strong style="color:var(--nx-mint);">${Number(item.kcal) || 0} ккал</strong>
                    · Б ${Number(item.protein) || 0} / Ж ${Number(item.fat) || 0} / У ${Number(item.carbs) || 0} · ${Number(item.weight) || 250} г
                </div>
            </div>
            <button type="button" class="saved-meal-del" title="Удалить из Моих блюд" onclick="event.stopPropagation(); deleteSavedCustomMeal('${escapeHtml(item.id)}')">×</button>
        </div>
    `).join("");
}

export function applySavedCustomMealToSlot(savedId) {
    const mealId = document.getElementById("edit-meal-id").value;
    const saved = (appState.savedCustomMeals || []).find(item => item.id === savedId);
    if (!mealId || !saved) return;

    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    if (!meal) return;

    meal.dishTitle = saved.title;
    meal.kcal = saved.kcal;
    meal.protein = saved.protein;
    meal.fat = saved.fat;
    meal.carbs = saved.carbs;
    meal.isCustom = true;
    meal.recipeId = "CUSTOM";
    meal.cookedWeightG = saved.weight || 250;
    meal.rawWeightG = saved.weight || 250;
    meal.ingredients = [{ name: saved.title, weight: saved.weight || 250, state: "готовый", dept: "Собственные блюда", yieldFactor: 1.0 }];
    meal.stepsStructured = [];

    rebuildGroceryList();
    saveState();
    renderApp();
    closeModal("edit-meal-modal");
    if (store.activeDetailMealId === mealId) openMealDetail(mealId);
    showToast(`Вставлено из «Моих блюд»: ${saved.title.slice(0, 30)}`);
    haptic("medium");
}

export function deleteSavedCustomMeal(savedId) {
    appState.savedCustomMeals = (appState.savedCustomMeals || []).filter(item => item.id !== savedId);
    saveState();
    renderSavedCustomMealsInModal();
    showToast("Удалено из «Моих блюд»");
    haptic("light");
}

export function openEditMealModal(mealId) {
    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    if (!meal) return;

    document.getElementById("edit-meal-id").value = mealId;
    document.getElementById("db-recipe-search-input").value = "";
    document.getElementById("db-recipe-search-results").classList.add("hidden");
    document.getElementById("edit-meal-input").value = "";
    document.getElementById("edit-meal-brand").value = "";
    document.getElementById("edit-meal-weight").value = "";
    document.getElementById("edit-source-badge").classList.add("hidden");
    document.getElementById("manual-kcal").value = meal.kcal;
    document.getElementById("manual-p").value = meal.protein;
    document.getElementById("manual-f").value = meal.fat;
    document.getElementById("manual-c").value = meal.carbs;
    const cb = document.getElementById("save-to-my-meals-cb");
    if (cb) cb.checked = true;

    renderSavedCustomMealsInModal();
    document.getElementById("edit-meal-modal").classList.remove("hidden");
    haptic("light");
}

export function quickSwapFromModal() {
    const mealId = document.getElementById("edit-meal-id").value;
    closeModal("edit-meal-modal");
    if (mealId) swapSingleMeal(mealId);
}

export function searchMasterRecipesInModal(query) {
    const box = document.getElementById("db-recipe-search-results");
    const q = (query || "").trim().toLowerCase();
    if (q.length < 2) { box.classList.add("hidden"); return; }

    const hits = store.MASTER_RECIPES_DB.filter(r =>
        r.title_ru.toLowerCase().includes(q) || (r.ingredients || []).some(i => i.name.toLowerCase().includes(q))
    ).slice(0, 12);

    if (!hits.length) {
        box.innerHTML = `<div style="padding:10px; font-size:12px; color:var(--nx-text-muted); text-align:center;">Рецепты не найдены</div>`;
    } else {
        box.innerHTML = hits.map(r => `
            <div class="db-search-item" onclick="selectMasterRecipeInModal('${escapeHtml(r.recipe_id)}')">
                <div style="font-size:13px; font-weight:700;">${escapeHtml(r.title_ru)}</div>
                <span style="font-size:11px; color:var(--nx-mint); white-space:nowrap;">${Math.round(r.nutrition?.serving_kcal || 400)} ккал</span>
            </div>`).join("");
    }
    box.classList.remove("hidden");
}

export function selectMasterRecipeInModal(recipeId) {
    const mealId = document.getElementById("edit-meal-id").value;
    const master = store.MASTER_RECIPES_DB.find(r => r.recipe_id === recipeId);
    closeModal("edit-meal-modal");
    if (mealId && master) applyMasterRecipeToMealSlot(mealId, master);
}

export async function runAccurateProductLookup() {
    const name = document.getElementById("edit-meal-input").value.trim();
    const brand = document.getElementById("edit-meal-brand").value.trim();
    const weight = parseFloat(document.getElementById("edit-meal-weight").value) || null;
    if (!name) { showToast("Введите название продукта"); return; }

    const btn = document.getElementById("ai-estimate-btn");
    const badge = document.getElementById("edit-source-badge");
    btn.disabled = true;
    btn.innerText = brand ? `Ищем «${brand}»…` : "Точный расчёт КБЖУ…";

    const res = await calculateAccurateProductNutrition(name, brand, weight);
    document.getElementById("manual-kcal").value = res.kcal;
    document.getElementById("manual-p").value = res.protein;
    document.getElementById("manual-f").value = res.fat;
    document.getElementById("manual-c").value = res.carbs;

    if (badge) {
        badge.classList.remove("hidden");
        badge.innerText = res.source === "openfoodfacts" ? `✓ Этикетка: ${res.matchedLabel}` : `✦ ${res.matchedLabel}`;
    }
    btn.disabled = false;
    btn.innerText = "✦ Пересчитать КБЖУ";
    haptic("medium");
}

export async function submitEditMeal() {
    const mealId = document.getElementById("edit-meal-id").value;
    const name = document.getElementById("edit-meal-input").value.trim();
    const brand = document.getElementById("edit-meal-brand").value.trim();
    const weight = parseFloat(document.getElementById("edit-meal-weight").value) || 250;
    const kcal = parseInt(document.getElementById("manual-kcal").value, 10) || 400;
    const p = parseInt(document.getElementById("manual-p").value, 10) || 20;
    const f = parseInt(document.getElementById("manual-f").value, 10) || 14;
    const c = parseInt(document.getElementById("manual-c").value, 10) || 42;
    const shouldSaveToLibrary = Boolean(document.getElementById("save-to-my-meals-cb")?.checked);

    syncSelectedDayMeals();
    const meal = appState.meals.find(m => m.id === mealId);
    if (!meal) return;

    const title = name ? (brand ? `${name} (${brand})` : name) : meal.dishTitle;
    meal.dishTitle = title;
    meal.kcal = kcal;
    meal.protein = p;
    meal.fat = f;
    meal.carbs = c;
    meal.isCustom = true;
    meal.recipeId = "CUSTOM";
    meal.cookedWeightG = weight;
    meal.rawWeightG = weight;
    meal.ingredients = [{ name: title, weight, state: "готовый", dept: "Собственные блюда", yieldFactor: 1.0 }];
    meal.stepsStructured = [];

    if (shouldSaveToLibrary && title) {
        saveCustomMealToLibrary({ title, kcal, protein: p, fat: f, carbs: c, weight });
    }

    rebuildGroceryList();
    saveState();
    renderApp();
    closeModal("edit-meal-modal");
    if (store.activeDetailMealId === mealId) openMealDetail(mealId);
    showToast(shouldSaveToLibrary ? "Блюдо сохранено и добавлено в «Мои блюда» ✓" : "Блюдо сохранено ✓");
    haptic("medium");
}

export function openZeroGuiltModal() {
    document.getElementById("zg-food-input").value = "";
    document.getElementById("zg-brand-input").value = "";
    document.getElementById("zg-weight-input").value = "";
    document.getElementById("zg-kcal-override").value = "";
    document.getElementById("zero-guilt-modal").classList.remove("hidden");
    haptic("light");
}

export async function submitZeroGuilt() {
    const food = document.getElementById("zg-food-input").value.trim();
    if (!food) { showToast("Опишите, что съели"); return; }

    const brand = document.getElementById("zg-brand-input").value.trim();
    const weight = parseFloat(document.getElementById("zg-weight-input").value) || null;
    const manualKcal = parseInt(document.getElementById("zg-kcal-override").value, 10) || null;

    const btn = document.getElementById("zg-submit-btn");
    btn.disabled = true;
    btn.innerText = "Перебалансировка…";

    let est;
    if (manualKcal && manualKcal > 20) {
        est = {
            kcal: manualKcal,
            protein: Math.round((manualKcal * 0.16) / 4),
            fat: Math.round((manualKcal * 0.34) / 9),
            carbs: Math.round((manualKcal * 0.50) / 4)
        };
    } else {
        est = await calculateAccurateProductNutrition(food, brand, weight);
    }

    const todayIdx = getTodayDayIndex();
    const todayMeals = appState.weekPlan?.[todayIdx]?.meals || [];
    const title = brand ? `${food} (${brand})` : food;

    todayMeals.push({
        id: `zg_${Date.now()}`, name: "Вне плана", slotKey: "snack", recipeId: "AI-ZG",
        dishTitle: title, shortDescription: "Учтено системой Zero Guilt — остаток дня мягко адаптирован.",
        kcal: est.kcal, protein: est.protein, fat: est.fat, carbs: est.carbs,
        prepTime: "Вне плана", eaten: true, isCustom: true, isOffPlan: true,
        rawWeightG: weight || 200, cookedWeightG: weight || 200,
        ingredients: [{ name: title, weight: weight || 200, state: "готовый", dept: "Собственные блюда", yieldFactor: 1.0 }],
        stepsStructured: []
    });

    const dayT = getDayTypeTargets(todayIdx);
    const eatenTotal = todayMeals.filter(m => m.eaten).reduce((s, m) => s + m.kcal, 0);
    const uneaten = todayMeals.filter(m => !m.eaten);
    const uneatenSum = uneaten.reduce((s, m) => s + m.kcal, 0);

    if (uneaten.length && uneatenSum > 0) {
        const targetRem = Math.max(uneaten.length * 160, dayT.dailyKcal - eatenTotal);
        const factor = Math.max(0.55, Math.min(1.0, targetRem / uneatenSum));
        uneaten.forEach(m => scaleMealPortions(m, factor));
    }

    btn.disabled = false;
    btn.innerText = "Пересчитать день";
    closeModal("zero-guilt-modal");

    rebuildGroceryList();
    saveState();
    renderApp();
    NutriXMotion.triggerWave();
    showToast(`Zero Guilt: +${est.kcal} ккал учтено, остаток сбалансирован`);
    NutriXPerf.notify("success");
}

/* =========================================================================
   АДМИН-ПАНЕЛЬ, БАЗА V4, WORKER И ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ
   ========================================================================= */
export function updateDbStatusBadge() {
    const rEl = document.getElementById("db-stat-recipes");
    const sEl = document.getElementById("db-stat-subs");
    const aEl = document.getElementById("adm-db-count");
    if (rEl) rEl.innerText = `${store.MASTER_RECIPES_DB.length} рецептов`;
    if (sEl) sEl.innerText = `${getActiveSubTable().length} пар`;
    if (aEl) aEl.innerText = `${store.MASTER_RECIPES_DB.length}`;
}

export function initOwnerAdminVisibility() {
    document.getElementById("owner-admin-btn")?.classList.toggle("hidden", !isOwnerAdmin());
}

export function openAdminModal() {
    if (!isOwnerAdmin()) return;
    updateDbStatusBadge();
    document.getElementById("admin-modal").classList.remove("hidden");
    refreshAdminStats();
    haptic("medium");
}

export function openDbModal() {
    updateDbStatusBadge();
    document.getElementById("db-modal").classList.remove("hidden");
    haptic("light");
}

export function openWorkerModal() {
    document.getElementById("worker-url-input").value = getWorkerUrl();
    document.getElementById("worker-modal").classList.remove("hidden");
    haptic("light");
}

export function saveWorkerUrl() {
    const val = document.getElementById("worker-url-input").value.trim();
    if (val) setWorkerUrl(val);
    closeModal("worker-modal");
    showToast("URL воркера обновлён ✓");
}

export async function handleDatabaseFileUpload(input) {
    const file = input?.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        const parsed = json?.v === "4-lite" ? parseLiteMasterJson(json) : parseRelationalMasterJson(json);
        if (parsed && parsed.length > 0) {
            store.MASTER_RECIPES_DB = parsed;
            await saveMasterDbToIndexedDb(parsed, store.DYNAMIC_SUBS_V4);
            updateDbStatusBadge();
            CloudSync.rehydratePendingWeek();
            closeModal("db-modal");
            showToast(`Загружено ${parsed.length} рецептов ✓`);
        } else {
            showToast("Неизвестный формат JSON");
        }
    } catch (e) {
        showToast("Ошибка чтения файла базы");
    }
}

export async function refreshAdminStats() {
    const logEl = document.getElementById("adm-log-box");
    const url = getWorkerUrl().replace(/\/$/, "");
    const t0 = performance.now();
    logEl.innerText = `[${new Date().toLocaleTimeString()}] Опрос ${url}/admin/stats…`;

    try {
        const res = await fetch(`${url}/admin/stats`, {
            headers: getWorkerHeaders(false)
        });
        const ms = Math.round(performance.now() - t0);
        document.getElementById("adm-worker-ping").innerText = `${ms} мс`;

        if (res.ok) {
            const st = await res.json();
            document.getElementById("adm-online").innerText = String(st.online_5m ?? 1);
            document.getElementById("adm-total-users").innerText = String(st.total_users ?? 1);
            logEl.innerText = [
                `[OK] Latency: ${ms} ms | Platform: ${tg?.platform || "web"}`,
                `Online (5 min): ${st.online_5m ?? 1} | Total unique: ${st.total_users ?? 1}`,
                `AI requests: ${st.ai_requests ?? 0} | Recipes in RAM: ${store.MASTER_RECIPES_DB.length}`,
                `CloudStorage: ${CloudSync.isSupported() ? "ACTIVE" : "OFF"} | Theme: ${appState.theme}`
            ].join("\n");
        } else {
            logEl.innerText = `[WARN] HTTP ${res.status}. Проверьте верификацию X-Telegram-Init-Data в worker.js.\nRecipes in RAM: ${store.MASTER_RECIPES_DB.length}`;
        }
    } catch (e) {
        document.getElementById("adm-worker-ping").innerText = "ERR";
        logEl.innerText = `[ERR] Worker недоступен: ${e.message}`;
    }
}

export function inspectCloudStorageAdmin() {
    const logEl = document.getElementById("adm-log-box");
    if (!CloudSync.isSupported()) {
        logEl.innerText = "Telegram CloudStorage недоступен вне Telegram.";
        return;
    }
    tg.CloudStorage.getKeys((err, keys) => {
        logEl.innerText = err ? `Ошибка: ${err}` : `CloudStorage keys (${keys.length}): ${keys.join(", ")}`;
    });
}

export function simulateCheckInPromptAdmin() {
    if (appState.checkIns?.length) {
        const d = new Date();
        d.setDate(d.getDate() - 8);
        appState.checkIns[appState.checkIns.length - 1].date = d.toISOString().slice(0, 10);
        saveState();
        renderHomeOverview();
        closeModal("admin-modal");
        switchTab("home");
        showToast("Баннер контрольного замера активирован");
    }
}

export function resetAllAppStateAdmin() {
    if (!confirm("Сбросить локальные данные NutriX на этом устройстве?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("nutrix_seen_welcome");
    location.reload();
}


/* =========================================================================
   ДОБАВЛЕНИЕ ДОПОЛНИТЕЛЬНОГО ПРИЁМА ПИЩИ В ДЕНЬ (ПУНКТ 13)
   ========================================================================= */
let addMealBalanceMode = "fit"; // "fit" | "extra"

export function selectAddMealSlotName(label, btnEl) {
    const inp = document.getElementById("add-meal-slot-name");
    if (inp) inp.value = label;
    document.querySelectorAll("#add-meal-slot-chips .q-chip").forEach(b => b.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    hapticSelect();
}

export function setAddMealBalanceMode(mode) {
    addMealBalanceMode = mode === "extra" ? "extra" : "fit";
    document.getElementById("add-mode-fit")?.classList.toggle("active", addMealBalanceMode === "fit");
    document.getElementById("add-mode-extra")?.classList.toggle("active", addMealBalanceMode === "extra");
    hapticSelect();
}

function renderSavedMealsInAddModal() {
    const section = document.getElementById("add-saved-meals-section");
    const listEl = document.getElementById("add-saved-meals-list");
    if (!section || !listEl) return;
    const saved = Array.isArray(appState.savedCustomMeals) ? appState.savedCustomMeals : [];
    if (!saved.length) {
        section.classList.add("hidden");
        return;
    }
    section.classList.remove("hidden");
    listEl.innerHTML = saved.slice(0, 12).map(item => `
        <div class="saved-meal-row" onclick="addSavedCustomMealAsNew('${escapeHtml(item.id)}')">
            <div style="min-width:0; flex:1;">
                <div style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.title)}</div>
                <div style="font-size:11px; color:var(--nx-text-muted);">${Number(item.kcal)} ккал · Б ${Number(item.protein)} · Ж ${Number(item.fat)} · У ${Number(item.carbs)}</div>
            </div>
            <span style="color:var(--nx-mint); font-weight:800; font-size:16px;">+</span>
        </div>`).join("");
}

export function openAddMealModal() {
    addMealBalanceMode = "fit";
    document.getElementById("add-mode-fit")?.classList.add("active");
    document.getElementById("add-mode-extra")?.classList.remove("active");
    const slotInp = document.getElementById("add-meal-slot-name");
    if (slotInp) slotInp.value = "Перекус";
    document.querySelectorAll("#add-meal-slot-chips .q-chip").forEach((b, idx) => b.classList.toggle("active", idx === 0));

    ["add-recipe-search-input", "add-meal-title", "add-meal-brand", "add-meal-weight", "add-kcal", "add-p", "add-f", "add-c"]
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    document.getElementById("add-recipe-search-results")?.classList.add("hidden");
    document.getElementById("add-source-badge")?.classList.add("hidden");

    renderSavedMealsInAddModal();
    document.getElementById("add-meal-modal")?.classList.remove("hidden");
    haptic("light");
}

function insertExtraMealIntoSelectedDay(newMeal) {
    syncSelectedDayMeals();
    const dayObj = appState.weekPlan?.[store.selectedDayIndex];
    if (!dayObj) return;

    if (addMealBalanceMode === "fit") {
        const uneaten = (dayObj.meals || []).filter(m => !m.eaten && !m.isOffPlan);
        const remSum = uneaten.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
        if (remSum > 220 && newMeal.kcal > 0) {
            const factor = Math.max(0.65, (remSum - newMeal.kcal) / remSum);
            uneaten.forEach(m => scaleMealPortions(m, factor));
        }
    }

    dayObj.meals.push(newMeal);
    syncSelectedDayMeals();
    rebuildGroceryList();
    saveState();
    renderApp();
    closeModal("add-meal-modal");
    showToast(`Добавлено: ${newMeal.dishTitle.slice(0, 32)} (+${newMeal.kcal} ккал)`);
    NutriXPerf.notify("success");
}

export function addSavedCustomMealAsNew(savedId) {
    const item = (appState.savedCustomMeals || []).find(s => s.id === savedId);
    if (!item) return;
    const slotName = (document.getElementById("add-meal-slot-name")?.value || "Перекус").trim() || "Перекус";
    const w = Number(item.weight) || 220;
    insertExtraMealIntoSelectedDay({
        id: `extra_${Date.now()}`,
        name: slotName,
        slotKey: "snack",
        recipeId: "CUSTOM",
        dishTitle: item.title,
        shortDescription: "Добавлено из «Моих блюд».",
        primaryCategory: "Мои блюда",
        cuisine: "Своё блюдо",
        prepTime: "Своё",
        kcal: Number(item.kcal) || 300,
        protein: Number(item.protein) || 18,
        fat: Number(item.fat) || 10,
        carbs: Number(item.carbs) || 32,
        fiber: 3,
        rawWeightG: w,
        cookedWeightG: w,
        shelfLifeHours: 24,
        eaten: false,
        isCustom: true,
        isOffPlan: false,
        isExtra: true,
        ingredients: [{ name: item.title, weight: w, state: "готовый", dept: "Собственные блюда", yieldFactor: 1.0 }],
        stepsStructured: []
    });
}

export function searchRecipesInAddModal(query) {
    const box = document.getElementById("add-recipe-search-results");
    if (!box) return;
    const q = (query || "").trim().toLowerCase();
    if (q.length < 2) {
        box.classList.add("hidden");
        return;
    }
    const hits = store.MASTER_RECIPES_DB.filter(r =>
        (r.title_ru || "").toLowerCase().includes(q)
        || (r.ingredients || []).some(i => (i.name || "").toLowerCase().includes(q))
    ).slice(0, 10);

    if (!hits.length) {
        box.innerHTML = `<div style="padding:10px 12px; font-size:12px; color:var(--nx-text-muted);">Ничего не нашлось — введи продукт ниже.</div>`;
        box.classList.remove("hidden");
        return;
    }

    box.innerHTML = hits.map(r => `
        <div class="db-search-item" onclick="addMasterRecipeAsNew('${escapeHtml(r.recipe_id)}')">
            <div style="min-width:0; flex:1;">
                <div style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(r.title_ru)}</div>
                <div style="font-size:10px; color:var(--nx-text-muted);">${Math.round(r.nutrition?.serving_kcal || 350)} ккал · ${r.total_time_min || 15} мин</div>
            </div>
            <span style="color:var(--nx-mint); font-weight:800;">+</span>
        </div>`).join("");
    box.classList.remove("hidden");
}

export function addMasterRecipeAsNew(recipeId) {
    const master = store.MASTER_RECIPES_DB.find(r => r.recipe_id === recipeId);
    if (!master) return;
    const slotName = (document.getElementById("add-meal-slot-name")?.value || "Перекус").trim() || "Перекус";
    const targetKcal = Math.round(master.nutrition?.serving_kcal || 350);
    const meal = scaleMasterRecipeToMeal(master, slotName, "snack", `extra_${Date.now()}`, targetKcal);
    meal.isExtra = true;
    insertExtraMealIntoSelectedDay(meal);
}

export async function runAddMealLookup() {
    const title = (document.getElementById("add-meal-title")?.value || "").trim();
    const brand = (document.getElementById("add-meal-brand")?.value || "").trim();
    const weight = Number(document.getElementById("add-meal-weight")?.value) || null;
    if (!title) { showToast("Введи название продукта или блюда"); return; }

    const btn = document.getElementById("add-ai-btn");
    const badge = document.getElementById("add-source-badge");
    if (btn) { btn.disabled = true; btn.innerText = "Ищем точное КБЖУ…"; }

    const res = await calculateAccurateProductNutrition(title, brand, weight);
    document.getElementById("add-kcal").value = res.kcal;
    document.getElementById("add-p").value = res.protein;
    document.getElementById("add-f").value = res.fat;
    document.getElementById("add-c").value = res.carbs;

    if (badge) {
        badge.innerText = `✓ ${res.matchedLabel}`;
        badge.classList.remove("hidden");
    }
    if (btn) { btn.disabled = false; btn.innerText = "✦ Найти точное КБЖУ (этикетка / AI)"; }
    haptic("light");
}

export async function submitAddMeal() {
    const slotName = (document.getElementById("add-meal-slot-name")?.value || "Перекус").trim() || "Перекус";
    const title = (document.getElementById("add-meal-title")?.value || "").trim();
    const brand = (document.getElementById("add-meal-brand")?.value || "").trim();
    const weight = Number(document.getElementById("add-meal-weight")?.value) || 200;
    if (!title) { showToast("Введи название блюда или выбери его из списка выше"); return; }

    let kcal = Number(document.getElementById("add-kcal")?.value) || 0;
    let protein = Number(document.getElementById("add-p")?.value) || 0;
    let fat = Number(document.getElementById("add-f")?.value) || 0;
    let carbs = Number(document.getElementById("add-c")?.value) || 0;

    const submitBtn = document.getElementById("add-meal-submit-btn");
    if (kcal <= 0) {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "Считаем КБЖУ…"; }
        const res = await calculateAccurateProductNutrition(title, brand, weight);
        kcal = res.kcal; protein = res.protein; fat = res.fat; carbs = res.carbs;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "Добавить в день"; }
    }

    const fullTitle = brand ? `${title} (${brand})` : title;
    if (document.getElementById("add-save-to-my-meals-cb")?.checked) {
        saveCustomMealToLibrary({ title: fullTitle, kcal, protein, fat, carbs, weight });
    }

    insertExtraMealIntoSelectedDay({
        id: `extra_${Date.now()}`,
        name: slotName,
        slotKey: "snack",
        recipeId: "CUSTOM",
        dishTitle: fullTitle,
        shortDescription: "Добавлено вручную.",
        primaryCategory: "Мои блюда",
        cuisine: "Своё блюдо",
        prepTime: "Своё",
        kcal: Math.round(kcal),
        protein: Math.round(protein),
        fat: Math.round(fat),
        carbs: Math.round(carbs),
        fiber: 2,
        rawWeightG: weight,
        cookedWeightG: weight,
        shelfLifeHours: 24,
        eaten: false,
        isCustom: true,
        isOffPlan: false,
        isExtra: true,
        ingredients: [{ name: fullTitle, weight, state: "готовый", dept: "Собственные блюда", yieldFactor: 1.0 }],
        stepsStructured: []
    });
}

export async function forceCloudSyncNow() {
    const ok = await CloudSync.push();
    showToast(ok ? "Данные сохранены в облако Telegram ✓" : "Не удалось сохранить — проверь сеть или открой в Telegram");
    haptic("medium");
}

export async function triggerAutoFetchMasterDb(notify = true) {
    const ok = await tryAutoFetchMasterDb(notify);
    if (ok && notify) closeModal("db-modal");
    return ok;
}
