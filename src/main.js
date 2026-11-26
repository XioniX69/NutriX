/* =========================================================================
   NUTRIX v12 — src/main.js
   Точка входа Vite: подключение стилей, связывание ES-модулей (включая
   режим «Семья»), экспорт обработчиков в window, обновление приветствия и
   семьи при возврате (visibilitychange) и неблокирующий bootstrapNutriX().
   ========================================================================= */

import "./styles.css";
import { getTodayDayIndex } from "./math.js";
import {
    tg,
    appState,
    haptic,
    hapticSelect,
    NutriXPerf,
    normalizeThemeId,
    registerStorageHooks,
    initMasterDatabase,
    CloudSync,
    loadState,
    checkAndAdvanceAdaptation,
    sendTelemetryHeartbeat
} from "./storage.js";
import {
    scaleMasterRecipeToMeal,
    rebuildGroceryList,
    generateWeeklyPlanOptimized,
    rebuildUneatenMealsForWeek
} from "./planner.js";
import {
    familyStore,
    registerFamilyHooks,
    loadCachedFamily,
    detectFamilyInviteParam,
    isFamilyActive,
    fetchFamilyState,
    syncMyFamilyProfile
} from "./family.js";
import {
    registerStoreModeHooks,
    initStoreModeSystem,
    onFamilyUpdateInStoreMode,
    openStoreMode,
    closeStoreMode,
    finishStoreTrip,
    requestStoreWakeLock,
    renderStoreModeView,
    selectStoreDept,
    toggleStoreCartAccordion,
    toggleStoreDeferredAccordion,
    storeTapItem,
    storeUncheckItem,
    storeTapUrgentItem,
    storeUncheckUrgentItem,
    restoreDeferredStoreItem,
    openStoreItemActions,
    saveStoreItemNote,
    triggerStoreItemSubstitute,
    deferActiveStoreItem,
    markActiveStoreItemPantry,
    undoLastStoreAction,
    openStoreQuickAddModal,
    submitStoreQuickAdd,
    openPantryModal,
    restorePantryItem,
    clearAllPantryItems,
    openDeptOrderModal,
    moveDeptOrder,
    resetDeptOrder
} from "./storeMode.js";
import {
    registerMascotHooks,
    startNikoOnboardingTour,
    nextNikoTourStep,
    skipNikoTour,
    dismissNikoHint,
    checkNikoReturnGreeting,
    replayNikoTourFromProfile
} from "./mascot.js";
import {
    showToast,
    applyTheme,
    showWelcomeScreen,
    startFromWelcome,
    openWelcomeReplay,
    showOnboarding,
    openSingleStepEditor,
    cancelOnboarding,
    setDraftVal,
    toggleDraftSport,
    stepDraftNum,
    setDraftNum,
    setDraftPrefs,
    togglePrefChip,
    handleDynamicActivityInput,
    setActivityScoreExact,
    updateWizardPrecisionBadge,
    wizardPrevStep,
    wizardSkipStep,
    wizardNextStep,
    closeModal,
    switchTab,
    switchNutritionSubtab,
    renderApp,
    renderHomeOverview,
    renderCloudStatusCard,
    toggleCompleteWholeDay,
    openMenuSettingsModal,
    selectDay,
    openDayTypeModal,
    cycleSelectedDayTrainingType,
    setDayTrainingType,
    setCuisineStyle,
    togglePlanMode,
    clearAllPlanModes,
    setPlanMode,
    regenerateCurrentDay,
    regenerateFullWeek,
    deleteExtraMeal,
    setDetailWeightMode,
    setDetailPortionMult,
    toggleDetailStepDone,
    openMealDetail,
    applyInlineDetailSub,
    revertInlineDetailSub,
    closeMealDetail,
    toggleMealFromDetail,
    swapMealFromDetail,
    openEditFromDetail,
    togglePinMealFromDetail,
    debouncedCatalogSearch,
    setCatalogFilter,
    assignCatalogRecipeToSelectedDay,
    setProgressMode,
    setGroceryPeriod,
    toggleOverlapOptimization,
    toggleHideCheckedGroceries,
    toggleGroceryItem,
    addCustomGroceryItem,
    clearGroceryChecks,
    openSubstitutionModal,
    applyIngredientSubstitution,
    copyGroceriesToClipboard,
    shareGroceriesToTelegram,
    quickAddWater250,
    openWaterModal,
    logWaterIntake,
    undoLastWater,
    openCheckInModal,
    submitCheckIn,
    openChooseMealSheet,
    handleMealChoiceClick,
    applySavedCustomMealToSlot,
    deleteSavedCustomMeal,
    openEditMealModal,
    quickSwapFromModal,
    searchMasterRecipesInModal,
    selectMasterRecipeInModal,
    runAccurateProductLookup,
    submitEditMeal,
    openAddMealModal,
    selectAddMealSlotName,
    setAddMealBalanceMode,
    addSavedCustomMealAsNew,
    searchRecipesInAddModal,
    addMasterRecipeAsNew,
    runAddMealLookup,
    submitAddMeal,
    openZeroGuiltModal,
    submitZeroGuilt,
    updateDbStatusBadge,
    initOwnerAdminVisibility,
    openAdminModal,
    openDbModal,
    openWorkerModal,
    saveWorkerUrl,
    handleDatabaseFileUpload,
    refreshAdminStats,
    inspectCloudStorageAdmin,
    simulateCheckInPromptAdmin,
    resetAllAppStateAdmin,
    forceCloudSyncNow,
    triggerAutoFetchMasterDb,
    openFamilyModal,
    switchFamilySetupTab,
    toggleFamilyDraftSlot,
    submitCreateFamily,
    submitJoinFamilyByCode,
    copyFamilyInviteLink,
    shareFamilyInviteLink,
    refreshFamilyNow,
    toggleFamilyLiveSlot,
    toggleFamilyShareWins,
    toggleFamilyShopperRole,
    removeFamilyMemberClick,
    confirmLeaveFamily,
    showPendingFamilyInvitePrompt,
    acceptPendingFamilyInvite,
    dismissFamilyJoinPrompt,
    setDetailFamilyMode,
    toggleDetailEatingOut,
    toggleDetailCookDuty,
    notifyDetailDinnerReady,
    setGroceryScope,
    toggleFamilyInStoreMode,
    focusUrgentGroceryInput,
    toggleFamilyUrgentItem,
    openDinnerVoteModal,
    startNewFamilyDinnerVote,
    castFamilyVoteClick,
    applyFamilyVoteWinner
} from "./ui.js";

// 1. Регистрируем колбэки модулей (строго ациклический граф)
registerStorageHooks({
    scaleMasterRecipeToMeal,
    rebuildGroceryList,
    generateWeeklyPlanOptimized,
    rebuildUneatenMealsForWeek,
    onDbUpdated: updateDbStatusBadge,
    onCloudRehydrated: () => { if (appState.user) renderApp(); },
    onApplyTheme: applyTheme,
    onToast: showToast,
    onCloudStatusChanged: renderCloudStatusCard
});

registerFamilyHooks({
    scaleMasterRecipeToMeal,
    rebuildGroceryList,
    onFamilyChanged: () => {
        if (appState.user) renderApp();
        onFamilyUpdateInStoreMode();
    },
    onToast: showToast
});

registerStoreModeHooks({
    onExitStoreMode: () => { if (appState.user) renderApp(); },
    onOpenSubstitution: openSubstitutionModal,
    onToast: showToast,
    onGroceriesChanged: () => { if (appState.user) renderApp(); }
});

registerMascotHooks({
    onSwitchTab: switchTab,
    onToast: showToast
});

// 2. Автоматическая смена темы Telegram в режиме «Авто»
if (tg?.onEvent) {
    try {
        tg.onEvent("themeChanged", () => {
            const cur = normalizeThemeId(appState?.theme || localStorage.getItem("nutrix_theme") || "auto");
            if (cur === "auto") applyTheme("auto", false);
        });
    } catch (e) {}
}

// 3. Обновление адаптивного приветствия и семьи при возврате в Mini App
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && appState.user) {
        renderHomeOverview();
        if (isFamilyActive()) fetchFamilyState(true);
    }
});

// 4. Экспорт всех обработчиков HTML-атрибутов в глобальный window
Object.assign(window, {
    getTodayDayIndex,
    haptic,
    hapticSelect,
    applyTheme,
    startFromWelcome,
    openWelcomeReplay,
    showOnboarding,
    openSingleStepEditor,
    cancelOnboarding,
    setDraftVal,
    toggleDraftSport,
    stepDraftNum,
    setDraftNum,
    setDraftPrefs,
    togglePrefChip,
    handleDynamicActivityInput,
    setActivityScoreExact,
    updateWizardPrecisionBadge,
    wizardPrevStep,
    wizardSkipStep,
    wizardNextStep,
    closeModal,
    switchTab,
    switchNutritionSubtab,
    toggleCompleteWholeDay,
    openMenuSettingsModal,
    selectDay,
    openDayTypeModal,
    cycleSelectedDayTrainingType,
    setDayTrainingType,
    setCuisineStyle,
    togglePlanMode,
    clearAllPlanModes,
    setPlanMode,
    regenerateCurrentDay,
    regenerateFullWeek,
    deleteExtraMeal,
    setDetailWeightMode,
    setDetailPortionMult,
    toggleDetailStepDone,
    openMealDetail,
    applyInlineDetailSub,
    revertInlineDetailSub,
    closeMealDetail,
    toggleMealFromDetail,
    swapMealFromDetail,
    openEditFromDetail,
    togglePinMealFromDetail,
    debouncedCatalogSearch,
    setCatalogFilter,
    assignCatalogRecipeToSelectedDay,
    setProgressMode,
    setGroceryPeriod,
    toggleOverlapOptimization,
    toggleHideCheckedGroceries,
    toggleGroceryItem,
    addCustomGroceryItem,
    clearGroceryChecks,
    openSubstitutionModal,
    applyIngredientSubstitution,
    copyGroceriesToClipboard,
    shareGroceriesToTelegram,
    quickAddWater250,
    openWaterModal,
    logWaterIntake,
    undoLastWater,
    openCheckInModal,
    submitCheckIn,
    openChooseMealSheet,
    handleMealChoiceClick,
    applySavedCustomMealToSlot,
    deleteSavedCustomMeal,
    openEditMealModal,
    quickSwapFromModal,
    searchMasterRecipesInModal,
    selectMasterRecipeInModal,
    runAccurateProductLookup,
    submitEditMeal,
    openAddMealModal,
    selectAddMealSlotName,
    setAddMealBalanceMode,
    addSavedCustomMealAsNew,
    searchRecipesInAddModal,
    addMasterRecipeAsNew,
    runAddMealLookup,
    submitAddMeal,
    openZeroGuiltModal,
    submitZeroGuilt,
    openAdminModal,
    openDbModal,
    openWorkerModal,
    saveWorkerUrl,
    handleDatabaseFileUpload,
    refreshAdminStats,
    inspectCloudStorageAdmin,
    simulateCheckInPromptAdmin,
    resetAllAppStateAdmin,
    forceCloudSyncNow,
    tryAutoFetchMasterDb: triggerAutoFetchMasterDb,
    openFamilyModal,
    switchFamilySetupTab,
    toggleFamilyDraftSlot,
    submitCreateFamily,
    submitJoinFamilyByCode,
    copyFamilyInviteLink,
    shareFamilyInviteLink,
    refreshFamilyNow,
    toggleFamilyLiveSlot,
    toggleFamilyShareWins,
    toggleFamilyShopperRole,
    removeFamilyMemberClick,
    confirmLeaveFamily,
    acceptPendingFamilyInvite,
    dismissFamilyJoinPrompt,
    setDetailFamilyMode,
    toggleDetailEatingOut,
    toggleDetailCookDuty,
    notifyDetailDinnerReady,
    setGroceryScope,
    toggleFamilyInStoreMode,
    focusUrgentGroceryInput,
    toggleFamilyUrgentItem,
    openDinnerVoteModal,
    startNewFamilyDinnerVote,
    castFamilyVoteClick,
    applyFamilyVoteWinner,
    openStoreMode,
    closeStoreMode,
    finishStoreTrip,
    requestStoreWakeLock,
    renderStoreModeView,
    selectStoreDept,
    toggleStoreCartAccordion,
    toggleStoreDeferredAccordion,
    storeTapItem,
    storeUncheckItem,
    storeTapUrgentItem,
    storeUncheckUrgentItem,
    restoreDeferredStoreItem,
    openStoreItemActions,
    saveStoreItemNote,
    triggerStoreItemSubstitute,
    deferActiveStoreItem,
    markActiveStoreItemPantry,
    undoLastStoreAction,
    openStoreQuickAddModal,
    submitStoreQuickAdd,
    openPantryModal,
    restorePantryItem,
    clearAllPantryItems,
    openDeptOrderModal,
    moveDeptOrder,
    resetDeptOrder,
    nextNikoTourStep,
    skipNikoTour,
    dismissNikoHint,
    replayNikoTourFromProfile
});

function withTimeout(promise, ms = 1500) {
    return Promise.race([
        Promise.resolve(promise).catch(() => false),
        new Promise(resolve => setTimeout(() => resolve(false), ms))
    ]);
}

function bootstrapNutriX() {
    try {
        NutriXPerf.init();
        initStoreModeSystem();
        loadCachedFamily();
        detectFamilyInviteParam();

        let savedTheme = "auto";
        try { savedTheme = localStorage.getItem("nutrix_theme") || "auto"; } catch (e) {}
        applyTheme(savedTheme, false);

        const hasLocal = loadState();
        let seenWelcome = false;
        try { seenWelcome = Boolean(localStorage.getItem("nutrix_seen_welcome")); } catch (e) {}

        if (hasLocal && appState.user) {
            applyTheme(appState.theme || "auto", false);
            checkAndAdvanceAdaptation();
            document.getElementById("main-view").classList.remove("hidden");
            document.getElementById("bottom-nav").classList.remove("hidden");
            renderApp();
            switchTab("home");
            checkNikoReturnGreeting();
        } else if (!seenWelcome) {
            showWelcomeScreen();
        } else {
            showOnboarding(false);
        }

        initOwnerAdminVisibility();
        sendTelemetryHeartbeat();
        setInterval(sendTelemetryHeartbeat, 120000);

        withTimeout(initMasterDatabase(), 2500)
            .then(() => withTimeout(CloudSync.pull(), 1600))
            .then((pulledCloud) => {
                if (pulledCloud && appState.user) {
                    applyTheme(appState.theme || "auto", false);
                    checkAndAdvanceAdaptation();
                    document.getElementById("welcome-view").classList.add("hidden");
                    document.getElementById("onboarding-view").classList.add("hidden");
                    document.getElementById("main-view").classList.remove("hidden");
                    document.getElementById("bottom-nav").classList.remove("hidden");
                    renderApp();
                    switchTab("home");
                } else if (appState.user) {
                    renderApp();
                }
                return withTimeout(fetchFamilyState(true), 2200);
            })
            .then(() => {
                if (!appState.user) return;
                if (isFamilyActive()) {
                    syncMyFamilyProfile(false);
                } else if (familyStore.pendingInviteCode) {
                    showPendingFamilyInvitePrompt();
                }
            });
    } catch (err) {
        console.error("NutriX bootstrap error:", err);
        showWelcomeScreen();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapNutriX);
} else {
    bootstrapNutriX();
}
