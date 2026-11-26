/* =========================================================================
   NUTRIX — src/icons.js
   Единая система авторских минималистичных SVG-иконок (24×24, stroke 1.5)
   с внутренним слоем .icon-duotone для эстетики «Botanical Editorial × Precision Telemetry».
   ========================================================================= */

export const ICONS = {
    /* Навигация */
    home: `<path class="icon-duotone" d="M4.5 10.5 12 4.5l7.5 6V19a1.5 1.5 0 0 1-1.5 1.5h-4v-5.5h-4v5.5H6A1.5 1.5 0 0 1 4.5 19v-8.5Z"/>
        <path d="M3.5 10.5 12 3.75l8.5 6.75"/><path d="M5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9.5"/><path d="M9.5 20.5v-5.75a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5.75"/>`,

    nutrition: `<path class="icon-duotone" d="M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z"/>
        <circle cx="12" cy="12" r="7.75"/><circle cx="12" cy="12" r="4"/><path d="M12 4.25V6"/><path d="M19.75 12H18"/>`,

    progress: `<rect class="icon-duotone" x="10" y="5" width="4" height="15" rx="1.5"/>
        <rect class="icon-duotone" x="16.5" y="10" width="4" height="10" rx="1.5"/>
        <path d="M4.5 20v-6.5a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1V20"/><path d="M10.25 20V5.5a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1V20"/><path d="M16 20v-9.5a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1V20"/><path d="M3 20h18"/>`,

    profile: `<circle class="icon-duotone" cx="12" cy="8" r="3.75"/>
        <path class="icon-duotone" d="M5 19.5c0-3.2 3.1-5.25 7-5.25s7 2.05 7 5.25"/>
        <circle cx="12" cy="8" r="3.75"/><path d="M4.75 19.75c.55-3.3 3.5-5.5 7.25-5.5s6.7 2.2 7.25 5.5"/>`,

    /* Слоты приёмов пищи */
    sunrise: `<path class="icon-duotone" d="M16.5 17.5a4.5 4.5 0 0 0-9 0Z"/>
        <path d="M12 3.5v3"/><path d="m5.5 10 1.75 1.75"/><path d="m18.5 10-1.75 1.75"/><path d="M3 17.5h18"/><path d="M7.5 17.5a4.5 4.5 0 0 1 9 0"/><path d="M6.5 20.5h11"/>`,

    sun: `<circle class="icon-duotone" cx="12" cy="12" r="4.25"/>
        <circle cx="12" cy="12" r="4.25"/><path d="M12 2.75v2"/><path d="M12 19.25v2"/><path d="M2.75 12h2"/><path d="M19.25 12h2"/><path d="m5.46 5.46 1.42 1.42"/><path d="m17.12 17.12 1.42 1.42"/><path d="m18.54 5.46-1.42 1.42"/><path d="m6.88 17.12-1.42 1.42"/>`,

    moon: `<path class="icon-duotone" d="M20 13.5A8 8 0 1 1 10.5 4a6.4 6.4 0 0 0 9.5 9.5Z"/>
        <path d="M20 13.5A8 8 0 1 1 10.5 4a6.4 6.4 0 0 0 9.5 9.5Z"/>`,

    leaf: `<path class="icon-duotone" d="M19.5 4.5C12.5 4.5 6.5 8 6.5 15c0 1.4.35 2.7 1 3.75 1.05.65 2.35 1 3.75 1 7 0 10.5-6 10.5-13 0-.8-.1-1.55-.25-2.25Z"/>
        <path d="M19.5 4.5C12.2 4.5 6.25 8.1 6.25 15c0 1.65.5 3.15 1.4 4.35 1.2.9 2.7 1.4 4.35 1.4 6.9 0 10.5-5.95 10.5-13.25 0-1-.12-2-.35-3Z"/><path d="M4.5 19.5 14 10"/>`,

    /* Типы тренировочных дней */
    rest: `<path class="icon-duotone" d="M19.5 13.5A7.5 7.5 0 1 1 10.5 4.5a6 6 0 0 0 9 9Z"/>
        <path d="M19.5 13.5A7.5 7.5 0 1 1 10.5 4.5a6 6 0 0 0 9 9Z"/><path d="M15.5 5.5h3l-3 3.5h3"/>`,

    strength: `<rect class="icon-duotone" x="4.5" y="8" width="2.75" height="8" rx="1"/>
        <rect class="icon-duotone" x="16.75" y="8" width="2.75" height="8" rx="1"/>
        <path d="M7.25 12h9.5"/><rect x="4.5" y="8" width="2.75" height="8" rx="1"/><rect x="16.75" y="8" width="2.75" height="8" rx="1"/><path d="M2.5 10v4"/><path d="M21.5 10v4"/>`,

    team: `<circle class="icon-duotone" cx="12" cy="12" r="8.5"/>
        <circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c2.2 2.4 2.2 14.6 0 17"/><path d="M4.5 8.5c4.5 1.2 10.5 1.2 15 0"/><path d="M4.5 15.5c4.5-1.2 10.5-1.2 15 0"/>`,

    endurance: `<path class="icon-duotone" d="M4.5 16.5c3.5 0 5-9 9.5-9 2.5 0 4.5 2 5.5 4.5H4.5Z"/>
        <path d="M3.5 16.5h17"/><path d="M5 13.5c2.2-4.8 5.2-7 8.5-7 2.8 0 5 1.8 6.5 4.5"/><path d="M7.5 19.5h9"/>`,

    combat: `<path class="icon-duotone" d="M12 3.5 5.5 6.5v5.25c0 4.2 2.8 7.5 6.5 8.75 3.7-1.25 6.5-4.55 6.5-8.75V6.5L12 3.5Z"/>
        <path d="M12 3.5 5.5 6.5v5.25c0 4.2 2.8 7.5 6.5 8.75 3.7-1.25 6.5-4.55 6.5-8.75V6.5L12 3.5Z"/><path d="m12.75 8.25-3 4h2.5l-1 3.75 3-4h-2.5l1-3.75Z"/>`,

    fitness: `<circle class="icon-duotone" cx="12" cy="12" r="4"/>
        <circle cx="12" cy="12" r="3.5"/><path d="M12 3.5c2.5 2.5 2.5 5.5 0 8.5-2.5-3-2.5-6 0-8.5Z"/><path d="M3.5 14.5c3.2-1.8 6-.8 8.5 1-3.2 1.8-6 .8-8.5-1Z"/><path d="M20.5 14.5c-3.2-1.8-6-.8-8.5 1 3.2 1.8 6 .8 8.5-1Z"/>`,

    /* Режимы меню, стили, AI и телеметрия */
    sliders: `<circle class="icon-duotone" cx="9" cy="7" r="2.25"/>
        <circle class="icon-duotone" cx="15" cy="17" r="2.25"/>
        <path d="M3.5 7h3.25"/><path d="M11.25 7h9.25"/><circle cx="9" cy="7" r="2.25"/><path d="M3.5 17h9.25"/><path d="M17.25 17h3.25"/><circle cx="15" cy="17" r="2.25"/>`,

    bolt: `<path class="icon-duotone" d="M13 2.75 4.75 13.5H11l-1 7.75 9.25-10.75H13l0-7.75Z"/>
        <path d="M13 2.75 4.75 13.5H11l-1 7.75 9.25-10.75H13V2.75Z"/>`,

    wallet: `<rect class="icon-duotone" x="3.5" y="6.5" width="17" height="12" rx="2.5"/>
        <rect x="3.5" y="6.5" width="17" height="12" rx="2.5"/><path d="M16.5 12.5h4"/><path d="M6.5 6.5V5.25A1.75 1.75 0 0 1 8.25 3.5h8.5"/><circle cx="16.5" cy="12.5" r=".75" fill="currentColor" stroke="none"/>`,

    layers: `<path class="icon-duotone" d="M12 4 3.5 8.5 12 13l8.5-4.5L12 4Z"/>
        <path d="M12 4 3.5 8.5 12 13l8.5-4.5L12 4Z"/><path d="M3.5 12.5 12 17l8.5-4.5"/><path d="M3.5 16.5 12 21l8.5-4.5"/>`,

    sparkles: `<path class="icon-duotone" d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/>
        <path d="m12 3 1.65 5.1L18.75 9.75l-5.1 1.65L12 16.5l-1.65-5.1-5.1-1.65 5.1-1.65L12 3Z"/><path d="M18.5 15.5v3"/><path d="M17 17h3"/><path d="M5.5 16v2.5"/><path d="M4.25 17.25h2.5"/>`,

    scale: `<path class="icon-duotone" d="M4 13.5a2.75 2.75 0 0 0 5.5 0H4Zm10.5 0a2.75 2.75 0 0 0 5.5 0h-5.5Z"/>
        <path d="M12 4v16"/><path d="M7.5 20h9"/><path d="M5 7.5h14"/><path d="m6.75 7.5-2.5 6h5l-2.5-6Z"/><path d="m17.25 7.5-2.5 6h5l-2.5-6Z"/>`,

    recycle: `<circle class="icon-duotone" cx="12" cy="12" r="7.5"/>
        <path d="M7.5 6.5A7.5 7.5 0 0 1 18.5 8"/><path d="M16 8h2.75V5.25"/><path d="M16.5 17.5A7.5 7.5 0 0 1 5.5 16"/><path d="M8 16H5.25v2.75"/>`,

    /* Действия и контролы */
    check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,

    checkCircle: `<circle class="icon-duotone" cx="12" cy="12" r="8.5"/>
        <circle cx="12" cy="12" r="8.5"/><path d="m8.75 12.25 2.25 2.25 4.5-4.75"/>`,

    refresh: `<path d="M19.5 11a7.5 7.5 0 0 0-13-4.5L4.5 8.5"/><path d="M4.5 4.5v4h4"/><path d="M4.5 13a7.5 7.5 0 0 0 13 4.5l2-2"/><path d="M19.5 19.5v-4h-4"/>`,

    swap: `<path d="M7 7.5h12"/><path d="m15.5 4 3.5 3.5-3.5 3.5"/><path d="M17 16.5H5"/><path d="m8.5 13-3.5 3.5 3.5 3.5"/>`,

    pin: `<path class="icon-duotone" d="m14.5 4.5 5 5-3.5 3.5-1.5-.5-3 3-3.5-3.5 3-3-.5-1.5 4-3Z"/>
        <path d="m14.5 4 5.5 5.5-2 2-1.75-.5-3.5 3.5.5 1.75-1.25 1.25-5.5-5.5 1.25-1.25 1.75.5 3.5-3.5-.5-1.75L14.5 4Z"/><path d="m9.25 14.75-4.75 4.75"/>`,

    trash: `<path class="icon-duotone" d="M6.5 7.5h11l-.9 11.5a1.5 1.5 0 0 1-1.5 1.5H8.9a1.5 1.5 0 0 1-1.5-1.5L6.5 7.5Z"/>
        <path d="M4.5 7h15"/><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/><path d="M6.5 7 7.4 18.8a1.75 1.75 0 0 0 1.75 1.7h5.7a1.75 1.75 0 0 0 1.75-1.7L17.5 7"/><path d="M10.25 11v5.5"/><path d="M13.75 11v5.5"/>`,

    edit: `<path class="icon-duotone" d="m15.25 5.25 3.5 3.5-9.5 9.5H5.75v-3.5l9.5-9.5Z"/>
        <path d="M14.75 5.25a2.12 2.12 0 0 1 3 3l-9.75 9.75-4 1 1-4 9.75-9.75Z"/><path d="m13.25 6.75 3 3"/>`,

    plus: `<path d="M12 5v14"/><path d="M5 12h14"/>`,

    minus: `<path d="M5 12h14"/>`,

    close: `<path d="M6 6l12 12"/><path d="M18 6 6 18"/>`,

    chevronRight: `<path d="m9.5 6 6 6-6 6"/>`,

    chevronLeft: `<path d="m14.5 6-6 6 6 6"/>`,

    chevronDown: `<path d="m6 9.5 6 6 6-6"/>`,

    search: `<circle class="icon-duotone" cx="10.75" cy="10.75" r="6.25"/>
        <circle cx="10.75" cy="10.75" r="6.25"/><path d="m19.5 19.5-4.1-4.1"/>`,

    copy: `<rect class="icon-duotone" x="9" y="9" width="11" height="11" rx="2"/>
        <rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>`,

    share: `<path class="icon-duotone" d="M20 4.5 10.5 14l-5.5-2.5L20 4.5Z"/>
        <path d="M20 4.5 10.5 14"/><path d="M20 4.5 13.75 20l-3.25-6-6-3.25L20 4.5Z"/>`,

    eye: `<path class="icon-duotone" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.75"/>`,

    eyeOff: `<path d="M3.5 3.5 20.5 20.5"/><path d="M10.5 6.15A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16.4 16.4 0 0 1-3.1 3.7"/><path d="M14.1 14.1a2.75 2.75 0 0 1-4.2-4.2"/><path d="M6.4 8.3A15.8 15.8 0 0 0 2.5 12s3.5 6 9.5 6c1.5 0 2.85-.35 4.05-.95"/>`,

    undo: `<path d="M8.5 8H4.5V4"/><path d="M4.5 8a8 8 0 1 1 2 9.5"/>`,

    /* Виджеты, статусы и системные модули */
    droplet: `<path class="icon-duotone" d="M12 3.25 6.25 10.6a7.25 7.25 0 1 0 11.5 0L12 3.25Z"/>
        <path d="M12 3.25 6.25 10.6a7.25 7.25 0 1 0 11.5 0L12 3.25Z"/>`,

    activity: `<path d="M3 12h3.75l2.5-6.5 4.5 13 2.75-6.5H21"/>`,

    flame: `<path class="icon-duotone" d="M12.25 3.25c.7 3.5-2.75 5.75-2.75 9.25a4.75 4.75 0 0 0 9.5 0c0-3.5-2.5-6-3.25-9.25-1.1 1.75-2.4 2.25-3.5 0Z"/>
        <path d="M12 3c.65 3.5-2.75 5.8-2.75 9.25a4.75 4.75 0 0 0 9.5 0c0-3.5-2.5-5.9-3.25-9.25-1.1 1.8-2.45 2.2-3.5 0Z"/>`,

    clock: `<circle class="icon-duotone" cx="12" cy="12" r="8.5"/>
        <circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.75"/>`,

    star: `<path class="icon-duotone" d="m12 3.75 2.55 5.15 5.7.83-4.12 4.02.97 5.68L12 16.75l-5.1 2.68.97-5.68-4.12-4.02 5.7-.83L12 3.75Z"/>
        <path d="m12 3.75 2.55 5.15 5.7.83-4.12 4.02.97 5.68L12 16.75l-5.1 2.68.97-5.68-4.12-4.02 5.7-.83L12 3.75Z"/>`,

    cloud: `<path class="icon-duotone" d="M7.25 18.5h10.25a3.75 3.75 0 0 0 .5-7.46 5.5 5.5 0 0 0-10.65-1.35A4.25 4.25 0 0 0 7.25 18.5Z"/>
        <path d="M7.25 18.5h10.25a3.75 3.75 0 0 0 .5-7.46 5.5 5.5 0 0 0-10.65-1.35A4.25 4.25 0 0 0 7.25 18.5Z"/>`,

    cloudCheck: `<path class="icon-duotone" d="M7.25 18.5h10.25a3.75 3.75 0 0 0 .5-7.46 5.5 5.5 0 0 0-10.65-1.35A4.25 4.25 0 0 0 7.25 18.5Z"/>
        <path d="M7.25 18.5h10.25a3.75 3.75 0 0 0 .5-7.46 5.5 5.5 0 0 0-10.65-1.35A4.25 4.25 0 0 0 7.25 18.5Z"/><path d="m9.75 13.75 1.75 1.75 3.5-3.5"/>`,

    cloudOff: `<path d="M3.5 3.5 20.5 20.5"/><path d="M18 18.5h-.5"/><path d="M7.25 18.5h6.25"/><path d="M17.5 18.5a3.75 3.75 0 0 0 .5-7.46 5.5 5.5 0 0 0-8.15-4.3"/><path d="M6.4 9.95A4.25 4.25 0 0 0 7.25 18.5"/>`,

    hardDrive: `<rect class="icon-duotone" x="3.5" y="13" width="17" height="6.5" rx="2"/>
        <path d="M5.5 6 3.5 13v4.5a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V13l-2-7a2 2 0 0 0-1.9-1.5H7.4A2 2 0 0 0 5.5 6Z"/><path d="M3.5 13h17"/><circle cx="7.5" cy="16.25" r=".75" fill="currentColor" stroke="none"/>`,

    alertTriangle: `<path class="icon-duotone" d="M10.4 4.75 3.3 17a1.85 1.85 0 0 0 1.6 2.75h14.2a1.85 1.85 0 0 0 1.6-2.75l-7.1-12.25a1.85 1.85 0 0 0-3.2 0Z"/>
        <path d="M10.4 4.75 3.3 17a1.85 1.85 0 0 0 1.6 2.75h14.2a1.85 1.85 0 0 0 1.6-2.75l-7.1-12.25a1.85 1.85 0 0 0-3.2 0Z"/><path d="M12 9.5v4"/><circle cx="12" cy="16.25" r=".75" fill="currentColor" stroke="none"/>`,

    shield: `<path class="icon-duotone" d="M12 3.25 5 6.25v5.5c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9v-5.5l-7-3Z"/>
        <path d="M12 3.25 5 6.25v5.5c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9v-5.5l-7-3Z"/><path d="m9.25 12 2 2 3.75-3.75"/>`,

    database: `<ellipse class="icon-duotone" cx="12" cy="6.25" rx="7.5" ry="2.75"/>
        <ellipse cx="12" cy="6.25" rx="7.5" ry="2.75"/><path d="M4.5 6.25v11.5c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75V6.25"/><path d="M4.5 12c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75"/>`,

    calendar: `<rect class="icon-duotone" x="4" y="5.5" width="16" height="4.5" rx="1.5"/>
        <rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M8.5 3.5v3.5"/><path d="M15.5 3.5v3.5"/><path d="M4 10h16"/>`,

    cart: `<path class="icon-duotone" d="M6.25 7h14l-1.5 7.5a1.5 1.5 0 0 1-1.48 1.2H8.5a1.5 1.5 0 0 1-1.48-1.24L6.25 7Z"/>
        <path d="M3 4.5h2.25L7 14.5a1.5 1.5 0 0 0 1.48 1.25h8.8a1.5 1.5 0 0 0 1.47-1.2L20.25 7H6"/><circle cx="9.25" cy="19.5" r="1.25"/><circle cx="16.75" cy="19.5" r="1.25"/>`,

    target: `<circle class="icon-duotone" cx="12" cy="12" r="4"/>
        <circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`,

    weight: `<rect class="icon-duotone" x="4.5" y="4.5" width="15" height="15" rx="3.5"/>
        <rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="M8.25 11.25a4.5 4.5 0 0 1 7.5 0"/><path d="m12 11 1.5-2.25"/>`
};

/**
 * Рендерит единую inline SVG-иконку NutriX с поддержкой duotone-слоя.
 * @param {string} name — ключ иконки из ICONS
 * @param {object} [opts]
 * @param {number} [opts.size=18]
 * @param {string} [opts.className=""]
 * @param {number} [opts.strokeWidth=1.5]
 * @param {boolean} [opts.active=false]
 * @param {string} [opts.ariaLabel=""]
 */
export function renderIcon(name, opts = {}) {
    const body = ICONS[name] || ICONS.leaf;
    const size = Number(opts.size) || 18;
    const strokeWidth = Number(opts.strokeWidth) || 1.5;
    const cls = ["nx-icon", opts.active ? "nx-icon--active" : "", opts.className || ""]
        .filter(Boolean)
        .join(" ");
    const a11y = opts.ariaLabel
        ? `role="img" aria-label="${String(opts.ariaLabel).replace(/"/g, "&quot;")}"`
        : `aria-hidden="true"`;

    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}
