/* =========================================================================
   NUTRIX — src/mascot.js
   Маскот Нико (Niko):
   • 8 прозрачных WebP-спрайтов (public/assets/niko/*.webp)
   • 3-шаговый тур новичков с подсветкой элементов (Hero → Zero Guilt → Питание)
   • Контекстные «первые встречи» на экранах (Рацион, Покупки, Паспорт блюда, Магазин)
   • Реакция на редкий заход (3+ дня отсутствия — без чувства вины)
   • Состояние appState.mascot = { seenTours, muted, lastVisitDate }
   ========================================================================= */

import { getTodayStr } from "./math.js";
import { appState, saveState, haptic, hapticSelect } from "./storage.js";

export const NIKO_POSES = {
    idle: "./assets/niko/idle.webp",
    guide: "./assets/niko/guide.webp",
    thinking: "./assets/niko/thinking.webp",
    support: "./assets/niko/support.webp",
    celebrate: "./assets/niko/celebrate.webp",
    shop: "./assets/niko/shop.webp",
    advice: "./assets/niko/advice.webp",
    avatar: "./assets/niko/avatar.webp"
};

const mHooks = {
    onSwitchTab: null,
    onToast: null
};

export function registerMascotHooks(partial) {
    Object.assign(mHooks, partial);
}

export function ensureMascotState() {
    if (!appState.mascot || typeof appState.mascot !== "object") {
        appState.mascot = { seenTours: {}, muted: false, lastVisitDate: getTodayStr() };
    }
    if (!appState.mascot.seenTours || typeof appState.mascot.seenTours !== "object") {
        appState.mascot.seenTours = {};
    }
    return appState.mascot;
}

export function renderNiko(pose = "idle", opts = {}) {
    const src = NIKO_POSES[pose] || NIKO_POSES.idle;
    const size = Number(opts.size) || 64;
    const cls = ["niko-sprite", opts.breathe ? "niko-breathe" : "", opts.className || ""]
        .filter(Boolean)
        .join(" ");
    const alt = opts.alt || "Нико — маскот NutriX";
    return `<img class="${cls}" src="${src}" width="${size}" height="${size}" alt="${alt}" loading="lazy" decoding="async">`;
}

/* =========================================================================
   СЛОЙ 1: 3-ШАГОВЫЙ ТУР НОВИЧКОВ НА ГЛАВНОЙ (20 СЕКУНД)
   ========================================================================= */
const ONBOARDING_TOUR_STEPS = [
    {
        pose: "idle",
        selector: "#tab-home .nx-hero-card",
        title: "Привет! Я Нико",
        text: "Я уже собрал для тебя меню на всю неделю. Здесь твой баланс дня — просто отмечай съеденное, а цифры пересчитаются сами.",
        nextLabel: "Дальше"
    },
    {
        pose: "support",
        selector: "#tab-home .nx-action-strip",
        title: "Zero Guilt без стресса",
        text: "Съел бургер, кофе с сиропом или что-то вне плана? Не переживай и не бросай — нажми сюда, и я мягко перестрою остаток дня.",
        nextLabel: "Дальше"
    },
    {
        pose: "guide",
        selector: "#nav-nutrition",
        title: "Меню и покупки в «Питании»",
        text: "Вся магия живёт здесь: рецепты на каждый день, режим «Без весов» и готовый список покупок в пачках. Заглянем?",
        nextLabel: "Открыть меню",
        goToNutrition: true
    }
];

let _tourStepIdx = -1;
let _highlightedEl = null;

function clearTourHighlight() {
    if (_highlightedEl) {
        _highlightedEl.classList.remove("niko-tour-spotlight");
        _highlightedEl = null;
    }
}

export function startNikoOnboardingTour(force = false) {
    const ms = ensureMascotState();
    if (!force && (ms.muted || ms.seenTours.home_tour)) return false;

    _tourStepIdx = 0;
    renderNikoTourStep();
    haptic("light");
    return true;
}

function renderNikoTourStep() {
    const overlay = document.getElementById("niko-tour-overlay");
    if (!overlay) return;
    const step = ONBOARDING_TOUR_STEPS[_tourStepIdx];
    if (!step) {
        finishNikoTour(false);
        return;
    }

    clearTourHighlight();
    const target = document.querySelector(step.selector);
    if (target) {
        target.classList.add("niko-tour-spotlight");
        _highlightedEl = target;
        try { target.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    }

    const imgEl = document.getElementById("niko-tour-img");
    if (imgEl) imgEl.src = NIKO_POSES[step.pose] || NIKO_POSES.idle;
    const stepEl = document.getElementById("niko-tour-step");
    if (stepEl) stepEl.innerText = `Шаг ${_tourStepIdx + 1} из ${ONBOARDING_TOUR_STEPS.length}`;
    const titleEl = document.getElementById("niko-tour-title");
    if (titleEl) titleEl.innerText = step.title;
    const textEl = document.getElementById("niko-tour-text");
    if (textEl) textEl.innerText = step.text;
    const nextBtn = document.getElementById("niko-tour-next-btn");
    if (nextBtn) nextBtn.innerText = step.nextLabel || "Дальше";

    overlay.classList.remove("hidden");
}

export function nextNikoTourStep() {
    const step = ONBOARDING_TOUR_STEPS[_tourStepIdx];
    const goNut = Boolean(step?.goToNutrition);
    _tourStepIdx++;
    if (_tourStepIdx >= ONBOARDING_TOUR_STEPS.length) {
        finishNikoTour(goNut);
        return;
    }
    renderNikoTourStep();
    hapticSelect();
}

export function skipNikoTour() {
    finishNikoTour(false);
}

function finishNikoTour(openNutrition = false) {
    clearTourHighlight();
    _tourStepIdx = -1;
    document.getElementById("niko-tour-overlay")?.classList.add("hidden");

    const ms = ensureMascotState();
    ms.seenTours.home_tour = true;
    saveState();

    if (openNutrition) {
        mHooks.onSwitchTab?.("nutrition");
    }
    haptic("light");
}

/* =========================================================================
   СЛОЙ 2: КОНТЕКСТНЫЕ «ПЕРВЫЕ ВСТРЕЧИ» НА ЭКРАНАХ + ВОЗВРАТ ЧЕРЕЗ 3+ ДНЯ
   ========================================================================= */
const CONTEXT_HINTS = {
    diary: {
        pose: "guide",
        title: "Нико · Рацион",
        text: "Свайпни карточку вправо, чтобы отметить приём пищи, или влево — чтобы заменить блюдо. В «Настроить» сверху есть режим на 2 дня и эконом."
    },
    groceries: {
        pose: "shop",
        title: "Нико · Покупки",
        text: "Я перевёл граммы в привычные пачки и штуки. Нажми «Я в магазине» — экран не погаснет, а строки станут крупными под одну руку."
    },
    detail: {
        pose: "advice",
        title: "Нико · На кухне",
        text: "Нет кухонных весов под рукой? Переключи на «Без весов» — покажу порции в ложках, ладонях и штуках. Шаги готовки можно вычёркивать тапом."
    },
    store: {
        pose: "shop",
        title: "Нико · В магазине",
        text: "Тап по строке сразу кладёт товар в тележку. Если продукта нет на полке — свайпни влево или нажми «⋯», чтобы заменить или отложить."
    }
};

let _activeHintKey = null;

export function maybeShowNikoHint(screenKey) {
    const ms = ensureMascotState();
    if (ms.muted) return;
    if (_tourStepIdx >= 0) return; // не перебиваем основной тур
    const hint = CONTEXT_HINTS[screenKey];
    if (!hint || ms.seenTours[`hint_${screenKey}`]) return;

    showNikoHintBanner(screenKey, hint.pose, hint.title, hint.text);
}

export function checkNikoReturnGreeting() {
    const ms = ensureMascotState();
    const today = getTodayStr();
    const prev = ms.lastVisitDate;
    ms.lastVisitDate = today;
    if (!prev || prev === today || ms.muted) return;

    const daysAway = Math.floor((new Date(today) - new Date(prev)) / 86400000);
    if (daysAway >= 3 && ms.seenTours.home_tour) {
        showNikoHintBanner(
            "return_welcome",
            "idle",
            "С возвращением!",
            "Старые дни я аккуратно закрыл, а сегодняшний рацион уже готов и ждёт тебя. Продолжаем в спокойном ритме."
        );
    }
}

function showNikoHintBanner(key, pose, title, text) {
    const banner = document.getElementById("niko-hint-banner");
    if (!banner) return;
    _activeHintKey = key;

    const imgEl = document.getElementById("niko-hint-img");
    if (imgEl) imgEl.src = NIKO_POSES[pose] || NIKO_POSES.idle;
    const titleEl = document.getElementById("niko-hint-title");
    if (titleEl) titleEl.innerText = title;
    const textEl = document.getElementById("niko-hint-text");
    if (textEl) textEl.innerText = text;

    banner.classList.remove("hidden");
}

export function dismissNikoHint() {
    document.getElementById("niko-hint-banner")?.classList.add("hidden");
    if (_activeHintKey && _activeHintKey !== "return_welcome") {
        const ms = ensureMascotState();
        ms.seenTours[`hint_${_activeHintKey}`] = true;
        saveState();
    }
    _activeHintKey = null;
    hapticSelect();
}

export function replayNikoTourFromProfile() {
    const ms = ensureMascotState();
    ms.muted = false;
    ms.seenTours = {};
    saveState();
    mHooks.onSwitchTab?.("home");
    setTimeout(() => startNikoOnboardingTour(true), 240);
}
