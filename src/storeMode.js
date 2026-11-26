/* =========================================================================
   NUTRIX — src/storeMode.js
   Полноэкранный режим «Я в магазине» (Fullscreen Focus Mode):
   • Скрывает нижний Tab Bar и привязывает нативную tg.BackButton
   • Screen Wake Lock API (экран не гаснет в зале, авто-перезахват и release)
   • Лента отделов с остатками и настройкой порядка под планировку магазина
   • Крупные 64px+ строки под одну руку, плавное сворачивание в «В тележке»
   • Свайп влево / «⋯»: Заменить, Отложить, Есть дома (инвентарь), Заметка
   • Undo-плашка на 4 секунды в зоне большого пальца
   • Офлайн-очередь + живые дельта-уведомления в семейном режиме
   • Прямое завершение похода без лишних диалогов + финальная сводка
   ========================================================================= */

import { renderIcon } from "./icons.js";
import { maybeShowNikoHint } from "./mascot.js";
import { escapeHtml, formatCountRu } from "./math.js";
import {
    tg,
    store,
    appState,
    haptic,
    hapticSelect,
    NutriXPerf,
    getCurrentTgUserId,
    saveState
} from "./storage.js";
import {
    familyStore,
    isFamilyActive,
    getMyFamilyMember,
    fetchFamilyState,
    syncFamilyGroceryCheckApi,
    addFamilyUrgentItemApi,
    toggleFamilyUrgentItemApi,
    toggleFamilyInStoreApi,
    clearFamilyGroceryChecksApi,
    notifyFamilyAchievementApi,
    startFamilyGroceryPolling,
    stopFamilyGroceryPolling
} from "./family.js";
import {
    rebuildGroceryList,
    findInlineSubs,
    DEFAULT_DEPT_ORDER,
    getAllManagedDepartments
} from "./planner.js";

const OFFLINE_QUEUE_KEY = "nutrix_store_offline_queue_v1";

const smHooks = {
    onExitStoreMode: null,
    onOpenSubstitution: null,
    onToast: null,
    onGroceriesChanged: null
};

export function registerStoreModeHooks(partial) {
    Object.assign(smHooks, partial);
}

/* =========================================================================
   ВНУТРЕННЕЕ СОСТОЯНИЕ, WAKE LOCK, ОФЛАЙН-ОЧЕРЕДЬ И UNDO
   ========================================================================= */
let _wakeLockSentinel = null;
let _undoPayload = null;
let _undoTimer = null;
let _pendingCheckTimers = new Map();
let _activeActionItem = null;
let _storeCompletedSummary = null;
let _prevFamilyChecksSnap = null;
let _prevFamilyUrgentIds = null;
let _storeBackBound = false;
let _offlineQueue = [];

function loadOfflineQueue() {
    try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        _offlineQueue = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(_offlineQueue)) _offlineQueue = [];
    } catch (e) {
        _offlineQueue = [];
    }
}

function saveOfflineQueue() {
    try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(_offlineQueue.slice(-80)));
    } catch (e) {}
}

function enqueueOfflineOp(op) {
    _offlineQueue.push(Object.assign({ ts: Date.now() }, op));
    saveOfflineQueue();
}

export async function flushStoreOfflineQueue() {
    if (!navigator.onLine || !_offlineQueue.length || !isFamilyActive()) return;
    const queue = _offlineQueue.slice();
    _offlineQueue = [];
    saveOfflineQueue();

    for (const op of queue) {
        if (op.type === "check") {
            await syncFamilyGroceryCheckApi(op.itemKey, op.checked);
        } else if (op.type === "urgent_add") {
            await addFamilyUrgentItemApi(op.name, op.note || "");
        } else if (op.type === "urgent_toggle") {
            await toggleFamilyUrgentItemApi(op.id, op.checked);
        }
    }
    if (store.inStoreFullscreen) {
        updateStoreNetworkBadge();
        smHooks.onToast?.("Офлайн-изменения синхронизированы");
        renderStoreModeView();
    }
}

function updateStoreNetworkBadge() {
    const bar = document.getElementById("store-offline-bar");
    if (!bar) return;
    const offline = navigator.onLine === false;
    bar.classList.toggle("hidden", !offline);
}

export async function requestStoreWakeLock() {
    if (!store.inStoreFullscreen) return;
    if (!("wakeLock" in navigator) || !navigator.wakeLock?.request) {
        store.storeWakeLockActive = false;
        updateWakeLockPill();
        return;
    }
    try {
        _wakeLockSentinel = await navigator.wakeLock.request("screen");
        store.storeWakeLockActive = true;
        _wakeLockSentinel.addEventListener("release", () => {
            store.storeWakeLockActive = false;
            updateWakeLockPill();
        });
    } catch (e) {
        store.storeWakeLockActive = false;
    }
    updateWakeLockPill();
}

export async function releaseStoreWakeLock() {
    store.storeWakeLockActive = false;
    if (_wakeLockSentinel) {
        try { await _wakeLockSentinel.release(); } catch (e) {}
        _wakeLockSentinel = null;
    }
    updateWakeLockPill();
}

function updateWakeLockPill() {
    const el = document.getElementById("store-wakelock-pill");
    if (!el) return;
    el.classList.toggle("active", Boolean(store.storeWakeLockActive));
    el.title = store.storeWakeLockActive ? "Экран не погаснет, пока открыт режим магазина" : "Режим фокуса";
}

function handleStoreTgBack() {
    if (store.inStoreFullscreen) {
        closeStoreMode(false);
    }
}

function syncStoreTelegramBackButton(show) {
    const bb = tg?.BackButton;
    if (!bb) return;
    try {
        if (show) {
            if (!_storeBackBound) {
                bb.onClick(handleStoreTgBack);
                _storeBackBound = true;
            }
            bb.show();
        } else {
            bb.hide();
            if (_storeBackBound) {
                bb.offClick?.(handleStoreTgBack);
                _storeBackBound = false;
            }
        }
    } catch (e) {}
}

let _listenersInited = false;
export function initStoreModeSystem() {
    if (_listenersInited) return;
    _listenersInited = true;
    loadOfflineQueue();

    window.addEventListener("online", () => {
        updateStoreNetworkBadge();
        flushStoreOfflineQueue();
    });
    window.addEventListener("offline", () => {
        updateStoreNetworkBadge();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && store.inStoreFullscreen) {
            requestStoreWakeLock();
            if (isFamilyActive() && store.groceryScope === "family") {
                fetchFamilyState(true);
            }
        }
    });
}

/* =========================================================================
   UNDO-ПЛАШКА В НИЖНЕЙ ЗОНЕ БОЛЬШОГО ПАЛЬЦА (4 СЕК)
   ========================================================================= */
function showStoreUndoBar(label, undoObj) {
    _undoPayload = undoObj;
    const bar = document.getElementById("store-undo-bar");
    const txt = document.getElementById("store-undo-text");
    if (!bar || !txt) return;
    txt.innerText = label;
    bar.classList.remove("hidden");
    clearTimeout(_undoTimer);
    _undoTimer = setTimeout(() => {
        bar.classList.add("hidden");
        _undoPayload = null;
    }, 4200);
}

function hideStoreUndoBar() {
    clearTimeout(_undoTimer);
    _undoPayload = null;
    document.getElementById("store-undo-bar")?.classList.add("hidden");
}

export function undoLastStoreAction() {
    if (!_undoPayload) return;
    const op = _undoPayload;
    hideStoreUndoBar();

    const isFam = store.groceryScope === "family" && isFamilyActive();
    if (op.kind === "check") {
        if (!appState.checkedGroceries) appState.checkedGroceries = {};
        appState.checkedGroceries[op.name] = op.prevChecked;
        if (isFam && familyStore.family) {
            if (!familyStore.family.groceryChecks) familyStore.family.groceryChecks = {};
            if (op.prevChecked) {
                familyStore.family.groceryChecks[op.name] = { checked: true, actorName: tg?.initDataUnsafe?.user?.first_name || "Ты", updatedAt: Date.now() };
            } else {
                delete familyStore.family.groceryChecks[op.name];
            }
            if (navigator.onLine) syncFamilyGroceryCheckApi(op.name, op.prevChecked);
            else enqueueOfflineOp({ type: "check", itemKey: op.name, checked: op.prevChecked });
        }
    } else if (op.kind === "urgent") {
        const u = familyStore.family?.urgentItems?.find(x => x.id === op.id);
        if (u) u.checked = op.prevChecked;
        if (navigator.onLine) toggleFamilyUrgentItemApi(op.id, op.prevChecked);
        else enqueueOfflineOp({ type: "urgent_toggle", id: op.id, checked: op.prevChecked });
    } else if (op.kind === "defer") {
        if (!appState.deferredGroceries) appState.deferredGroceries = {};
        if (op.prevDeferred) appState.deferredGroceries[op.name] = true;
        else delete appState.deferredGroceries[op.name];
    } else if (op.kind === "pantry") {
        if (!appState.pantryItems) appState.pantryItems = {};
        if (op.prevPantry) appState.pantryItems[op.name] = true;
        else delete appState.pantryItems[op.name];
    }

    rebuildGroceryList();
    saveState();
    renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    haptic("light");
}

/* =========================================================================
   ДЕЛЬТА-УВЕДОМЛЕНИЯ СЕМЬИ В РЕАЛЬНОМ ВРЕМЕНИ
   ========================================================================= */
function snapshotFamilyStoreDiffBase() {
    const fam = familyStore.family;
    if (!fam) {
        _prevFamilyChecksSnap = null;
        _prevFamilyUrgentIds = null;
        return;
    }
    _prevFamilyChecksSnap = {};
    Object.entries(fam.groceryChecks || {}).forEach(([k, v]) => {
        if (v?.checked) _prevFamilyChecksSnap[k] = Number(v.actorTgId) || 0;
    });
    _prevFamilyUrgentIds = new Set((fam.urgentItems || []).map(u => u.id));
}

export function onFamilyUpdateInStoreMode() {
    if (!store.inStoreFullscreen) return;
    const fam = familyStore.family;
    if (!fam) {
        renderStoreModeView();
        return;
    }

    const myId = Number(fam.myTgId || getCurrentTgUserId());
    if (_prevFamilyChecksSnap) {
        const newlyTaken = [];
        Object.entries(fam.groceryChecks || {}).forEach(([itemKey, info]) => {
            if (info?.checked && !_prevFamilyChecksSnap[itemKey] && Number(info.actorTgId) !== myId) {
                newlyTaken.push({ itemKey, actorName: info.actorName || "Семья" });
            }
        });
        if (newlyTaken.length === 1) {
            smHooks.onToast?.(`${newlyTaken[0].actorName} взял(а): ${newlyTaken[0].itemKey}`);
        } else if (newlyTaken.length > 1) {
            smHooks.onToast?.(`${newlyTaken[0].actorName} отметил(а) ${formatCountRu(newlyTaken.length, "позицию", "позиции", "позиций")}`);
        }
    }

    if (_prevFamilyUrgentIds) {
        const freshUrgent = (fam.urgentItems || []).filter(
            u => !u.checked && !_prevFamilyUrgentIds.has(u.id) && Number(u.addedByTgId) !== myId
        );
        if (freshUrgent.length) {
            haptic("light");
            smHooks.onToast?.(`Дозаказ от ${freshUrgent[0].addedByName}: ${freshUrgent[0].name}`);
        }
    }

    snapshotFamilyStoreDiffBase();
    rebuildGroceryList();
    renderStoreModeView();
}

/* =========================================================================
   ОТКРЫТИЕ, ЗАКРЫТИЕ И ПРЯМОЕ ЗАВЕРШЕНИЕ ПОХОДА
   ========================================================================= */
export function openStoreMode() {
    initStoreModeSystem();
    _storeCompletedSummary = null;
    store.inStoreFullscreen = true;
    store.storeActiveDept = "all";
    store.storeCartExpanded = false;
    store.storeDeferredExpanded = false;

    if (isFamilyActive() && store.groceryScope === "family") {
        snapshotFamilyStoreDiffBase();
        const me = getMyFamilyMember();
        if (!me?.inStore && navigator.onLine) {
            toggleFamilyInStoreApi(true);
        }
        startFamilyGroceryPolling();
    }

    rebuildGroceryList();
    document.body.classList.add("store-mode-active");
    document.getElementById("main-view")?.classList.add("hidden");
    document.getElementById("bottom-nav")?.classList.add("hidden");
    document.getElementById("store-mode-view")?.classList.remove("hidden");

    syncStoreTelegramBackButton(true);
    requestStoreWakeLock();
    updateStoreNetworkBadge();
    renderStoreModeView();
    window.scrollTo({ top: 0, behavior: "instant" });
    maybeShowNikoHint("store");
    haptic("medium");
}

export function closeStoreMode(markFinished = false) {
    _pendingCheckTimers.forEach(t => clearTimeout(t));
    _pendingCheckTimers.clear();
    hideStoreUndoBar();

    store.inStoreFullscreen = false;
    _storeCompletedSummary = null;
    releaseStoreWakeLock();
    syncStoreTelegramBackButton(false);

    document.body.classList.remove("store-mode-active");
    document.getElementById("store-mode-view")?.classList.add("hidden");
    document.getElementById("main-view")?.classList.remove("hidden");
    document.getElementById("bottom-nav")?.classList.remove("hidden");

    if (markFinished && isFamilyActive()) {
        const me = getMyFamilyMember();
        if (me?.inStore && navigator.onLine) toggleFamilyInStoreApi(false);
    }

    if (!isFamilyActive() || store.groceryScope !== "family") {
        stopFamilyGroceryPolling();
    }

    rebuildGroceryList();
    smHooks.onExitStoreMode?.();
    haptic("light");
}

export async function finishStoreTrip() {
    _pendingCheckTimers.forEach(t => clearTimeout(t));
    _pendingCheckTimers.clear();
    hideStoreUndoBar();

    const stats = collectStoreStats();
    const isFam = store.groceryScope === "family" && isFamilyActive();
    const periodLbl = store.groceryPeriod === 1 ? "1 день" : (store.groceryPeriod === 3 ? "3 дня" : "неделю");

    // Автоматически очищаем купленные разовые (ручные) товары, чтобы не висели в следующем походе
    if (Array.isArray(appState.customGroceries) && appState.customGroceries.length) {
        appState.customGroceries = appState.customGroceries.filter(ci => !appState.checkedGroceries?.[ci.name]);
    }

    releaseStoreWakeLock();

    if (isFam) {
        if (navigator.onLine) {
            await toggleFamilyInStoreApi(false);
            if (stats.boughtCount > 0) {
                notifyFamilyAchievementApi("grocery_done", { periodLabel: periodLbl });
            }
            if (stats.totalCount > 0 && stats.boughtCount === stats.totalCount) {
                clearFamilyGroceryChecksApi();
            }
        }
        stopFamilyGroceryPolling();
    }

    rebuildGroceryList();
    saveState();

    _storeCompletedSummary = {
        boughtCount: stats.boughtCount,
        totalCount: stats.totalCount,
        periodLbl,
        isFamily: isFam
    };

    renderStoreModeView();
    NutriXPerf.notify("success");
}

/* =========================================================================
   СБОР ДАННЫХ И РЕНДЕР ПОЛНОЭКРАННОГО ЭКРАНА МАГАЗИНА
   ========================================================================= */
function collectStoreStats() {
    const isFam = store.groceryScope === "family" && isFamilyActive();
    const deptGroups = appState.groceryList || {};
    const deptMeta = [];
    const activeByDept = {};
    const cartItems = [];
    const deferredItems = [];

    let totalCount = 0;
    let boughtCount = 0;

    Object.entries(deptGroups).forEach(([dept, items]) => {
        let deptRemaining = 0;
        let deptTotal = 0;
        items.forEach(item => {
            totalCount++;
            deptTotal++;
            if (item.isChecked) {
                boughtCount++;
                cartItems.push(item);
            } else if (item.isDeferred) {
                deferredItems.push(item);
            } else {
                deptRemaining++;
                if (!activeByDept[dept]) activeByDept[dept] = [];
                activeByDept[dept].push(item);
            }
        });
        deptMeta.push({ dept, remaining: deptRemaining, total: deptTotal, done: deptTotal > 0 && deptRemaining === 0 });
    });

    const urgentPending = [];
    const urgentDone = [];
    if (isFam && Array.isArray(familyStore.family?.urgentItems)) {
        familyStore.family.urgentItems.forEach(u => {
            totalCount++;
            if (u.checked) {
                boughtCount++;
                urgentDone.push(u);
            } else {
                urgentPending.push(u);
            }
        });
    }

    return {
        isFam,
        totalCount,
        boughtCount,
        remainingCount: Math.max(0, totalCount - boughtCount),
        deptMeta,
        activeByDept,
        cartItems,
        deferredItems,
        urgentPending,
        urgentDone,
        pantryCount: (appState.pantryActiveList || []).length
    };
}

function getShortDeptLabel(dept) {
    const map = {
        "Овощи, фрукты и зелень": "Овощи и фрукты",
        "Мясо и птица": "Мясо и птица",
        "Рыба и морепродукты": "Рыба",
        "Молочные продукты и яйца": "Молочка и яйца",
        "Бакалея и крупы": "Бакалея",
        "Орехи, масла и соусы": "Масла и орехи",
        "Растительные и спорт-продукты": "Раст. / спорт",
        "Добавлено вручную": "Свои товары"
    };
    return map[dept] || dept;
}

function attachStoreRowSwipe(rowEl, itemName, altText) {
    let sx = 0, sy = 0, dx = 0, tracking = false, locked = false;
    rowEl.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        dx = 0; tracking = true; locked = false;
    }, { passive: true });

    rowEl.addEventListener("touchmove", (e) => {
        if (!tracking) return;
        const cx = e.touches[0].clientX - sx;
        const cy = e.touches[0].clientY - sy;
        if (!locked) {
            if (Math.abs(cy) > Math.abs(cx) && Math.abs(cy) > 10) { tracking = false; return; }
            if (cx < -14) { locked = true; rowEl.classList.add("dragging"); }
        }
        if (locked) {
            dx = Math.max(-92, Math.min(0, cx));
            rowEl.style.transform = `translate3d(${dx}px, 0, 0)`;
        }
    }, { passive: true });

    const finish = () => {
        if (!tracking) return;
        tracking = false;
        rowEl.classList.remove("dragging");
        rowEl.style.transform = "translate3d(0, 0, 0)";
        if (dx <= -56) {
            openStoreItemActions(encodeURIComponent(itemName), encodeURIComponent(altText || ""));
        }
        dx = 0;
    };
    rowEl.addEventListener("touchend", finish, { passive: true });
    rowEl.addEventListener("touchcancel", finish, { passive: true });
}

export function renderStoreModeView() {
    if (!store.inStoreFullscreen) return;
    const view = document.getElementById("store-mode-view");
    if (!view) return;

    const activePane = document.getElementById("store-active-pane");
    const donePane = document.getElementById("store-complete-pane");

    if (_storeCompletedSummary) {
        activePane?.classList.add("hidden");
        donePane?.classList.remove("hidden");
        const s = _storeCompletedSummary;
        const titleEl = document.getElementById("store-done-title");
        const subEl = document.getElementById("store-done-sub");
        if (titleEl) {
            titleEl.innerText = s.boughtCount === s.totalCount && s.totalCount > 0
                ? "Закупка собрана на 100%"
                : "Поход в магазин завершён";
        }
        if (subEl) {
            const base = `Собрано ${s.boughtCount} из ${s.totalCount} позиций · хватит на ${s.periodLbl}.`;
            subEl.innerText = s.isFamily
                ? `${base} Нико уже сообщил семье, что продукты дома.`
                : base;
        }
        return;
    }

    activePane?.classList.remove("hidden");
    donePane?.classList.add("hidden");

    const stats = collectStoreStats();
    const pct = stats.totalCount ? Math.round((stats.boughtCount / stats.totalCount) * 100) : 0;

    // 1. Sticky header
    const countEl = document.getElementById("store-progress-counter");
    if (countEl) countEl.innerText = `${stats.boughtCount} / ${stats.totalCount}`;
    const barEl = document.getElementById("store-progress-bar");
    if (barEl) barEl.style.width = `${pct}%`;

    const famLiveEl = document.getElementById("store-family-live-pill");
    if (famLiveEl) {
        if (stats.isFam) {
            const fam = familyStore.family;
            const shoppers = (fam.members || []).filter(m => m.inStore);
            const names = shoppers.length > 1
                ? shoppers.map(m => m.firstName[0].toUpperCase()).join("·")
                : "Live";
            famLiveEl.innerHTML = `<span class="admin-pulse-dot"></span><span>${escapeHtml(names)} · Семья</span>`;
            famLiveEl.classList.remove("hidden");
        } else {
            famLiveEl.classList.add("hidden");
        }
    }

    updateWakeLockPill();
    updateStoreNetworkBadge();

    // 2. Department filter strip (completed departments automatically move to the end)
    const stripEl = document.getElementById("store-dept-strip");
    if (stripEl) {
        const sortedDepts = stats.deptMeta.slice().sort((a, b) => Number(a.done) - Number(b.done));
        const allActive = store.storeActiveDept === "all";
        let pillsHtml = `
            <button type="button" class="store-dept-pill ${allActive ? "active" : ""}" onclick="selectStoreDept('all')">
                <span>Все</span>
                <span class="store-dept-cnt">${stats.remainingCount}</span>
            </button>`;

        sortedDepts.forEach(dm => {
            const isSel = store.storeActiveDept === dm.dept;
            const encD = encodeURIComponent(dm.dept);
            pillsHtml += `
                <button type="button" class="store-dept-pill ${isSel ? "active" : ""} ${dm.done ? "done" : ""}" onclick="selectStoreDept('${encD}')">
                    ${dm.done ? renderIcon("check", { size: 12, strokeWidth: 2.3 }) : ""}
                    <span>${escapeHtml(getShortDeptLabel(dm.dept))}</span>
                    ${!dm.done ? `<span class="store-dept-cnt">${dm.remaining}</span>` : ""}
                </button>`;
        });
        stripEl.innerHTML = pillsHtml;
    }

    // 3. Family urgent block «Только что добавили»
    const urgentEl = document.getElementById("store-urgent-section");
    if (urgentEl) {
        if (!stats.urgentPending.length) {
            urgentEl.classList.add("hidden");
            urgentEl.innerHTML = "";
        } else {
            urgentEl.classList.remove("hidden");
            urgentEl.innerHTML = `
                <div class="store-urgent-box">
                    <div class="store-urgent-head">
                        <span class="nx-row">${renderIcon("bell", { size: 13, active: true })}<span>Только что добавили</span></span>
                        <span class="tabular">${stats.urgentPending.length}</span>
                    </div>
                    ${stats.urgentPending.map(u => `
                        <div class="store-item-row store-item-row--urgent" data-urgent-id="${escapeHtml(u.id)}" onclick="storeTapUrgentItem('${escapeHtml(u.id)}', this)">
                            <div class="store-check-circle"></div>
                            <div class="nx-flex-1">
                                <div class="store-item-title">${escapeHtml(u.name)}</div>
                                <div class="store-item-note">Добавил(а) ${escapeHtml(u.addedByName || "Семья")}${u.note ? ` · ${escapeHtml(u.note)}` : ""}</div>
                            </div>
                        </div>`).join("")}
                </div>`;
        }
    }

    // 4. Active items list (large 64px+ one-handed rows)
    const listBox = document.getElementById("store-items-list");
    if (listBox) {
        listBox.innerHTML = "";
        const selectedDept = store.storeActiveDept;
        const visibleDepts = Object.keys(stats.activeByDept).filter(d => selectedDept === "all" || d === selectedDept);

        if (!visibleDepts.length && !stats.urgentPending.length) {
            if (stats.totalCount > 0 && stats.boughtCount === stats.totalCount) {
                listBox.innerHTML = `
                    <div class="store-all-done-card">
                        <div class="store-all-done-icon">${renderIcon("checkCircle", { size: 28, active: true })}</div>
                        <div class="store-all-done-title">Всё в тележке</div>
                        <div class="store-all-done-sub">Все ${stats.totalCount} позиций собраны — можно идти к кассе.</div>
                        <button type="button" class="nx-cta-pill" onclick="finishStoreTrip()">Завершить поход</button>
                    </div>`;
            } else {
                listBox.innerHTML = `<div class="hint-ref-box nx-text-center">В этом отделе всё уже собрано.</div>`;
            }
        } else {
            visibleDepts.forEach(dept => {
                const items = stats.activeByDept[dept] || [];
                if (!items.length) return;

                if (selectedDept === "all") {
                    const hdr = document.createElement("div");
                    hdr.className = "store-dept-heading";
                    hdr.innerHTML = `<span>${escapeHtml(dept)}</span><span class="tabular">${items.length}</span>`;
                    listBox.appendChild(hdr);
                }

                const card = document.createElement("div");
                card.className = "store-dept-group";

                items.forEach(item => {
                    const encName = encodeURIComponent(item.name);
                    const encAlt = encodeURIComponent(item.alt || "");
                    const packMain = item.packLabel || (item.weight > 0 ? `${item.weight} г` : "по вкусу");
                    const packSub = item.gramsSub
                        ? `<div class="store-pack-sub ${item.checkHome ? "home-hint" : ""}">${escapeHtml(item.gramsSub)}</div>`
                        : "";
                    const noteHtml = item.note
                        ? `<div class="store-item-note">${escapeHtml(item.note)}</div>`
                        : "";
                    const waveHtml = item.waveLabel
                        ? `<span class="wave-badge">${renderIcon("leaf", { size: 11 })}<span>${escapeHtml(item.waveLabel)}</span></span>`
                        : "";

                    const shell = document.createElement("div");
                    shell.className = "store-row-shell";
                    shell.innerHTML = `<div class="store-row-swipe-bg">${renderIcon("moreHorizontal", { size: 16 })}<span>Опции</span></div>`;

                    const row = document.createElement("div");
                    row.className = "store-item-row";
                    row.innerHTML = `
                        <div class="store-check-circle"></div>
                        <div class="nx-flex-1">
                            <div class="store-item-title">${escapeHtml(item.name)}${waveHtml}</div>
                            ${noteHtml}
                        </div>
                        <div class="store-pack-col">
                            <div class="store-pack-main">${escapeHtml(packMain)}</div>
                            ${packSub}
                        </div>
                        <button type="button" class="store-more-btn" aria-label="Действия с товаром">${renderIcon("moreHorizontal", { size: 18 })}</button>
                    `;

                    row.addEventListener("click", (e) => {
                        if (e.target.closest(".store-more-btn")) {
                            e.stopPropagation();
                            openStoreItemActions(encName, encAlt);
                            return;
                        }
                        storeTapItem(encName, row);
                    });

                    attachStoreRowSwipe(row, item.name, item.alt);
                    shell.appendChild(row);
                    card.appendChild(shell);
                });

                listBox.appendChild(card);
            });
        }
    }

    // 5. «Докупить позже» accordion (deferred items)
    const defBox = document.getElementById("store-deferred-section");
    if (defBox) {
        if (!stats.deferredItems.length) {
            defBox.classList.add("hidden");
            defBox.innerHTML = "";
        } else {
            defBox.classList.remove("hidden");
            const open = Boolean(store.storeDeferredExpanded);
            defBox.innerHTML = `
                <button type="button" class="store-accordion-head" onclick="toggleStoreDeferredAccordion()">
                    <span class="nx-row">${renderIcon("bookmark", { size: 15 })}<span>Докупить позже (${stats.deferredItems.length})</span></span>
                    ${renderIcon("chevronDown", { size: 16, className: open ? "store-chev-open" : "" })}
                </button>
                <div class="store-accordion-body ${open ? "" : "hidden"}">
                    ${stats.deferredItems.map(item => {
                        const encName = encodeURIComponent(item.name);
                        return `
                        <div class="store-item-row store-item-row--muted" onclick="restoreDeferredStoreItem('${encName}')">
                            <div class="store-check-circle"></div>
                            <div class="nx-flex-1">
                                <div class="store-item-title">${escapeHtml(item.name)}</div>
                                <div class="store-item-sub">Нажми, чтобы вернуть в активный список</div>
                            </div>
                            <div class="store-pack-col">
                                <div class="store-pack-main">${escapeHtml(item.packLabel || "")}</div>
                            </div>
                        </div>`;
                    }).join("")}
                </div>`;
        }
    }

    // 6. «В тележке (N)» accordion (bought items + bought urgent)
    const cartBox = document.getElementById("store-cart-section");
    if (cartBox) {
        const cartTotal = stats.cartItems.length + stats.urgentDone.length;
        if (!cartTotal) {
            cartBox.classList.add("hidden");
            cartBox.innerHTML = "";
        } else {
            cartBox.classList.remove("hidden");
            const open = Boolean(store.storeCartExpanded);
            const regularRows = stats.cartItems.map(item => {
                const encName = encodeURIComponent(item.name);
                const byText = item.checkedBy ? `Взял(а) ${item.checkedBy}` : "Нажми, чтобы вернуть";
                return `
                <div class="store-item-row store-item-row--done" onclick="storeUncheckItem('${encName}')">
                    <div class="store-check-circle checked">${renderIcon("check", { size: 14, strokeWidth: 2.4 })}</div>
                    <div class="nx-flex-1">
                        <div class="store-item-title">${escapeHtml(item.name)}</div>
                        <div class="store-item-sub">${escapeHtml(byText)}</div>
                    </div>
                    <div class="store-pack-col">
                        <div class="store-pack-main">${escapeHtml(item.packLabel || "")}</div>
                    </div>
                </div>`;
            }).join("");

            const urgentRows = stats.urgentDone.map(u => `
                <div class="store-item-row store-item-row--done" onclick="storeUncheckUrgentItem('${escapeHtml(u.id)}')">
                    <div class="store-check-circle checked">${renderIcon("check", { size: 14, strokeWidth: 2.4 })}</div>
                    <div class="nx-flex-1">
                        <div class="store-item-title">${escapeHtml(u.name)}</div>
                        <div class="store-item-sub">Дозаказ от ${escapeHtml(u.addedByName || "Семья")}</div>
                    </div>
                </div>`).join("");

            cartBox.innerHTML = `
                <button type="button" class="store-accordion-head" onclick="toggleStoreCartAccordion()">
                    <span class="nx-row">${renderIcon("cart", { size: 15, active: true })}<span>В тележке (${cartTotal})</span></span>
                    ${renderIcon("chevronDown", { size: 16, className: open ? "store-chev-open" : "" })}
                </button>
                <div class="store-accordion-body ${open ? "" : "hidden"}">
                    ${regularRows}${urgentRows}
                </div>`;
        }
    }

    // 7. Pantry link if items hidden as «Есть дома»
    const pantryChip = document.getElementById("store-pantry-chip");
    if (pantryChip) {
        pantryChip.classList.toggle("hidden", stats.pantryCount === 0);
        const cnt = document.getElementById("store-pantry-count");
        if (cnt) cnt.innerText = String(stats.pantryCount);
    }
}

/* =========================================================================
   ИНТЕРАКТИВНЫЕ ДЕЙСТВИЯ В МАГАЗИНЕ (ТАП, 360ms COLLAPSE, ОПЦИИ, ЗАМЕТКА)
   ========================================================================= */
export function selectStoreDept(encDept) {
    store.storeActiveDept = encDept === "all" ? "all" : decodeURIComponent(encDept);
    renderStoreModeView();
    hapticSelect();
}

export function toggleStoreCartAccordion() {
    store.storeCartExpanded = !store.storeCartExpanded;
    renderStoreModeView();
    hapticSelect();
}

export function toggleStoreDeferredAccordion() {
    store.storeDeferredExpanded = !store.storeDeferredExpanded;
    renderStoreModeView();
    hapticSelect();
}

export function storeTapItem(encName, rowEl) {
    const name = decodeURIComponent(encName);
    if (_pendingCheckTimers.has(name)) return;

    haptic("medium");
    if (rowEl) {
        rowEl.classList.add("checking");
        const dot = rowEl.querySelector(".store-check-circle");
        if (dot) {
            dot.classList.add("checked");
            dot.innerHTML = renderIcon("check", { size: 14, strokeWidth: 2.4 });
        }
    }

    const commitCheck = () => {
        _pendingCheckTimers.delete(name);
        if (!appState.checkedGroceries) appState.checkedGroceries = {};
        appState.checkedGroceries[name] = true;
        delete appState.deferredGroceries?.[name];

        const isFam = store.groceryScope === "family" && isFamilyActive();
        if (isFam && familyStore.family) {
            if (!familyStore.family.groceryChecks) familyStore.family.groceryChecks = {};
            familyStore.family.groceryChecks[name] = {
                checked: true,
                actorTgId: Number(familyStore.family.myTgId || getCurrentTgUserId()),
                actorName: tg?.initDataUnsafe?.user?.first_name || "Ты",
                updatedAt: Date.now()
            };
            if (navigator.onLine) syncFamilyGroceryCheckApi(name, true);
            else enqueueOfflineOp({ type: "check", itemKey: name, checked: true });
        }

        rebuildGroceryList();
        saveState();
        showStoreUndoBar(`В тележке: ${name}`, { kind: "check", name, prevChecked: false });
        renderStoreModeView();
        smHooks.onGroceriesChanged?.();
    };

    const timer = setTimeout(commitCheck, 360);
    _pendingCheckTimers.set(name, timer);
}

export function storeUncheckItem(encName) {
    const name = decodeURIComponent(encName);
    if (!appState.checkedGroceries) appState.checkedGroceries = {};
    appState.checkedGroceries[name] = false;

    const isFam = store.groceryScope === "family" && isFamilyActive();
    if (isFam && familyStore.family?.groceryChecks) {
        delete familyStore.family.groceryChecks[name];
        if (navigator.onLine) syncFamilyGroceryCheckApi(name, false);
        else enqueueOfflineOp({ type: "check", itemKey: name, checked: false });
    }

    rebuildGroceryList();
    saveState();
    renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    hapticSelect();
}

export function storeTapUrgentItem(urgentId, rowEl) {
    haptic("medium");
    if (rowEl) {
        rowEl.classList.add("checking");
        const dot = rowEl.querySelector(".store-check-circle");
        if (dot) {
            dot.classList.add("checked");
            dot.innerHTML = renderIcon("check", { size: 14, strokeWidth: 2.4 });
        }
    }
    setTimeout(() => {
        const u = familyStore.family?.urgentItems?.find(x => x.id === urgentId);
        if (!u) return;
        u.checked = true;
        if (navigator.onLine) toggleFamilyUrgentItemApi(urgentId, true);
        else enqueueOfflineOp({ type: "urgent_toggle", id: urgentId, checked: true });
        showStoreUndoBar(`В тележке: ${u.name}`, { kind: "urgent", id: urgentId, prevChecked: false });
        renderStoreModeView();
        smHooks.onGroceriesChanged?.();
    }, 340);
}

export function storeUncheckUrgentItem(urgentId) {
    const u = familyStore.family?.urgentItems?.find(x => x.id === urgentId);
    if (!u) return;
    u.checked = false;
    if (navigator.onLine) toggleFamilyUrgentItemApi(urgentId, false);
    else enqueueOfflineOp({ type: "urgent_toggle", id: urgentId, checked: false });
    renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    hapticSelect();
}

export function restoreDeferredStoreItem(encName) {
    const name = decodeURIComponent(encName);
    if (appState.deferredGroceries) delete appState.deferredGroceries[name];
    rebuildGroceryList();
    saveState();
    renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    hapticSelect();
}

/* --- Шторка действий по товару (Заменить / Отложить / Есть дома / Заметка) --- */
export function openStoreItemActions(encName, encAlt = "") {
    const name = decodeURIComponent(encName);
    const alt = decodeURIComponent(encAlt || "");
    _activeActionItem = { name, alt };

    const titleEl = document.getElementById("store-action-item-title");
    if (titleEl) titleEl.innerText = name;

    const noteInp = document.getElementById("store-item-note-input");
    if (noteInp) noteInp.value = appState.groceryNotes?.[name] || "";

    const hasSubs = findInlineSubs(name, alt).length > 0;
    document.getElementById("store-act-sub-btn")?.classList.toggle("hidden", !hasSubs);

    document.getElementById("store-item-actions-modal")?.classList.remove("hidden");
    haptic("light");
}

export function saveStoreItemNote() {
    if (!_activeActionItem) return;
    const val = (document.getElementById("store-item-note-input")?.value || "").trim().slice(0, 80);
    if (!appState.groceryNotes) appState.groceryNotes = {};
    if (val) appState.groceryNotes[_activeActionItem.name] = val;
    else delete appState.groceryNotes[_activeActionItem.name];

    rebuildGroceryList();
    saveState();
    document.getElementById("store-item-actions-modal")?.classList.add("hidden");
    renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    smHooks.onToast?.(val ? "Заметка сохранена" : "Заметка удалена");
    haptic("light");
}

export function triggerStoreItemSubstitute() {
    if (!_activeActionItem) return;
    const { name, alt } = _activeActionItem;
    document.getElementById("store-item-actions-modal")?.classList.add("hidden");
    smHooks.onOpenSubstitution?.(encodeURIComponent(name), encodeURIComponent(alt));
}

export function deferActiveStoreItem() {
    if (!_activeActionItem) return;
    const { name } = _activeActionItem;
    if (!appState.deferredGroceries) appState.deferredGroceries = {};
    appState.deferredGroceries[name] = true;
    delete appState.checkedGroceries?.[name];

    document.getElementById("store-item-actions-modal")?.classList.add("hidden");
    rebuildGroceryList();
    saveState();
    showStoreUndoBar(`Отложено: ${name}`, { kind: "defer", name, prevDeferred: false });
    renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    haptic("light");
}

export function markActiveStoreItemPantry() {
    if (!_activeActionItem) return;
    const { name } = _activeActionItem;
    if (!appState.pantryItems) appState.pantryItems = {};
    appState.pantryItems[name] = true;

    document.getElementById("store-item-actions-modal")?.classList.add("hidden");
    rebuildGroceryList();
    saveState();
    showStoreUndoBar(`Есть дома: ${name}`, { kind: "pantry", name, prevPantry: false });
    renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    haptic("light");
}

/* --- Быстрое добавление товара в магазине --- */
export function openStoreQuickAddModal() {
    const inp = document.getElementById("store-quick-add-name");
    const note = document.getElementById("store-quick-add-note");
    const cb = document.getElementById("store-quick-add-checked");
    if (inp) inp.value = "";
    if (note) note.value = "";
    if (cb) cb.checked = false;
    document.getElementById("store-quick-add-modal")?.classList.remove("hidden");
    setTimeout(() => inp?.focus(), 140);
    haptic("light");
}

export async function submitStoreQuickAdd() {
    const name = (document.getElementById("store-quick-add-name")?.value || "").trim();
    const note = (document.getElementById("store-quick-add-note")?.value || "").trim().slice(0, 80);
    const alreadyInCart = Boolean(document.getElementById("store-quick-add-checked")?.checked);
    if (!name) { smHooks.onToast?.("Введи название товара"); return; }

    document.getElementById("store-quick-add-modal")?.classList.add("hidden");

    const isFam = store.groceryScope === "family" && isFamilyActive();
    if (isFam && !alreadyInCart) {
        if (navigator.onLine) {
            await addFamilyUrgentItemApi(name, note);
        } else {
            enqueueOfflineOp({ type: "urgent_add", name, note });
            if (!Array.isArray(appState.customGroceries)) appState.customGroceries = [];
            appState.customGroceries.push({ name, weight: 0, isCustom: true });
            if (note) {
                if (!appState.groceryNotes) appState.groceryNotes = {};
                appState.groceryNotes[name] = note;
            }
        }
    } else {
        if (!Array.isArray(appState.customGroceries)) appState.customGroceries = [];
        if (!appState.customGroceries.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            appState.customGroceries.push({ name, weight: 0, isCustom: true });
        }
        if (note) {
            if (!appState.groceryNotes) appState.groceryNotes = {};
            appState.groceryNotes[name] = note;
        }
        if (alreadyInCart) {
            if (!appState.checkedGroceries) appState.checkedGroceries = {};
            appState.checkedGroceries[name] = true;
        }
    }

    rebuildGroceryList();
    saveState();
    renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    smHooks.onToast?.(alreadyInCart ? `Добавлено в тележку: ${name}` : `Добавлено: ${name}`);
    haptic("medium");
}

/* --- Инвентарь «Есть дома» (восстановление скрытых продуктов) --- */
export function openPantryModal() {
    renderPantryModal();
    document.getElementById("pantry-modal")?.classList.remove("hidden");
    haptic("light");
}

export function renderPantryModal() {
    const listEl = document.getElementById("pantry-items-list");
    if (!listEl) return;
    const allKeys = Object.keys(appState.pantryItems || {}).filter(k => appState.pantryItems[k]);
    if (!allKeys.length) {
        listEl.innerHTML = `<div class="hint-ref-box nx-text-center">Список «Есть дома» пуст. Отмечай продукты в магазине через «⋯», чтобы скрыть то, что уже есть на кухне.</div>`;
        return;
    }
    listEl.innerHTML = allKeys.map(name => {
        const enc = encodeURIComponent(name);
        return `
            <div class="saved-meal-row" onclick="restorePantryItem('${enc}')">
                <div class="nx-flex-1">
                    <div class="cloud-sync-title">${escapeHtml(name)}</div>
                    <div class="ing-meta">Скрыто из закупки · нажми, чтобы вернуть</div>
                </div>
                <span class="precision-pill">Вернуть</span>
            </div>`;
    }).join("");
}

export function restorePantryItem(encName) {
    const name = decodeURIComponent(encName);
    if (appState.pantryItems) delete appState.pantryItems[name];
    rebuildGroceryList();
    saveState();
    renderPantryModal();
    if (store.inStoreFullscreen) renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    smHooks.onToast?.(`Возвращено в закупки: ${name}`);
    hapticSelect();
}

export function clearAllPantryItems() {
    appState.pantryItems = {};
    rebuildGroceryList();
    saveState();
    renderPantryModal();
    if (store.inStoreFullscreen) renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    smHooks.onToast?.("Все продукты возвращены в список покупок");
    haptic("light");
}

/* --- Настройка порядка отделов супермаркета --- */
export function openDeptOrderModal() {
    renderDeptOrderModal();
    document.getElementById("store-dept-order-modal")?.classList.remove("hidden");
    haptic("light");
}

function renderDeptOrderModal() {
    const listEl = document.getElementById("dept-order-list");
    if (!listEl) return;
    const depts = getAllManagedDepartments();
    listEl.innerHTML = depts.map((dept, idx) => `
        <div class="dept-order-row">
            <div class="nx-row nx-minw0">
                <span class="dept-order-num">${idx + 1}</span>
                <span class="cloud-sync-title">${escapeHtml(dept)}</span>
            </div>
            <div class="nx-row">
                <button type="button" class="mc-icon-btn" ${idx === 0 ? "disabled" : ""} onclick="moveDeptOrder(${idx}, -1)" aria-label="Выше">${renderIcon("arrowUp", { size: 16 })}</button>
                <button type="button" class="mc-icon-btn" ${idx === depts.length - 1 ? "disabled" : ""} onclick="moveDeptOrder(${idx}, 1)" aria-label="Ниже">${renderIcon("arrowDown", { size: 16 })}</button>
            </div>
        </div>
    `).join("");
}

export function moveDeptOrder(idx, delta) {
    const depts = getAllManagedDepartments().slice();
    const target = idx + delta;
    if (target < 0 || target >= depts.length) return;
    const tmp = depts[idx];
    depts[idx] = depts[target];
    depts[target] = tmp;

    appState.deptOrder = depts;
    rebuildGroceryList();
    saveState();
    renderDeptOrderModal();
    if (store.inStoreFullscreen) renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    hapticSelect();
}

export function resetDeptOrder() {
    appState.deptOrder = DEFAULT_DEPT_ORDER.slice();
    rebuildGroceryList();
    saveState();
    renderDeptOrderModal();
    if (store.inStoreFullscreen) renderStoreModeView();
    smHooks.onGroceriesChanged?.();
    smHooks.onToast?.("Порядок отделов сброшен");
    haptic("light");
}
