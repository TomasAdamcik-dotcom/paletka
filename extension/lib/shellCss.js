// GNOME Shell (St) stylesheet for one theme variant. St has no CSS variables,
// so colors are inlined; !important beats Yaru's own !important panel rules.
import {GENERATED_HEADER} from './gtkCss.js';

export function shellCss(p, isDark) {
    const I = '!important';
    const rules = [
        ['#panel:overview, #panel', `background-color: ${p.panel_bg} ${I}; box-shadow: none ${I};`],
        ['#panel .panel-button', `color: ${p.panel_fg} ${I};`],
        ['#panel .panel-button:hover, #panel .panel-button:focus', `background-color: ${p.hover} ${I};`],
        ['#panel .panel-button:active, #panel .panel-button:checked', `background-color: ${p.active} ${I};`],
        ['#panel .panel-button .system-status-icon, #panel .panel-button .app-menu-icon', `color: ${p.panel_fg} ${I};`],

        ['.popup-menu-content, .candidate-popup-content',
            `background-color: ${p.popover_bg} ${I}; color: ${p.popover_fg} ${I}; border-color: ${p.border} ${I};`],
        ['.popup-menu-boxpointer', `-arrow-background-color: ${p.popover_bg} ${I}; -arrow-border-color: ${p.border} ${I};`],
        ['.popup-menu-item', `color: ${p.popover_fg} ${I};`],
        ['.popup-menu-item:hover, .popup-menu-item:focus, .popup-menu-item:selected', `background-color: ${p.hover} ${I};`],
        ['.popup-menu-item:active, .popup-menu-item:checked', `background-color: ${p.active} ${I};`],
        ['.popup-separator-menu-item .popup-separator-menu-item-separator', `background-color: ${p.border} ${I};`],

        ['.quick-settings', `background-color: ${p.popover_bg} ${I}; color: ${p.popover_fg} ${I};`],
        ['.quick-toggle, .quick-settings .icon-button, .quick-settings .button',
            `background-color: ${p.hover} ${I}; color: ${p.popover_fg} ${I};`],
        ['.quick-toggle:hover, .quick-settings .icon-button:hover, .quick-settings .button:hover',
            `background-color: ${p.active} ${I};`],
        ['.quick-toggle-has-menu .quick-toggle-arrow:checked, .quick-toggle:checked:hover, .quick-toggle:checked',
            `background-color: ${p.accent_bg} ${I}; color: ${p.accent_fg} ${I};`],
        ['.quick-toggle-menu .button.paletka-variant-active:hover, .quick-toggle-menu .button.paletka-variant-active',
            `background-color: ${p.accent_bg} ${I}; color: ${p.accent_fg} ${I};`],
        ['.quick-toggle-menu', `background-color: ${p.view_bg} ${I}; color: ${p.view_fg} ${I};`],
        ['.quick-toggle-menu .header .icon', `background-color: ${p.accent_bg} ${I}; color: ${p.accent_fg} ${I};`],
        ['.quick-slider .slider', `color: ${p.accent_bg} ${I}; -barlevel-active-background-color: ${p.accent_bg} ${I}; -barlevel-background-color: ${p.border} ${I};`],
        ['.slider', `-barlevel-active-background-color: ${p.accent_bg} ${I}; -barlevel-background-color: ${p.border} ${I};`],

        ['.message', `background-color: ${p.card_bg} ${I}; color: ${p.card_fg} ${I};`],
        ['.message:hover, .message:focus', `background-color: ${p.view_bg} ${I};`],
        ['.notification-banner', `background-color: ${p.card_bg} ${I}; color: ${p.card_fg} ${I};`],
        ['.datemenu-popover, .message-list, .calendar', `color: ${p.popover_fg} ${I};`],
        ['.calendar .calendar-day.calendar-today, .calendar .calendar-day.calendar-today:hover',
            `background-color: ${p.accent_bg} ${I}; color: ${p.accent_fg} ${I};`],
        ['.calendar .calendar-day:hover', `background-color: ${p.hover} ${I};`],
        ['.events-button, .world-clocks-button, .weather-button',
            `background-color: ${p.card_bg} ${I}; color: ${p.card_fg} ${I};`],

        ['.osd-window, .resize-popup, .workspace-switcher, .switcher-list',
            `background-color: ${p.osd_bg} ${I}; color: ${p.osd_fg} ${I};`],
        ['.switcher-list .item-box:selected, .switcher-list .item-box:hover', `background-color: ${p.active} ${I};`],
        ['.osd-window .level-bar', `background-color: ${p.accent_bg} ${I};`],

        ['.search-entry, .app-folder-dialog .folder-name-container .folder-name-entry',
            `background-color: ${p.view_bg} ${I}; color: ${p.view_fg} ${I}; border-color: ${p.border} ${I};`],
        ['.search-entry:focus', `border-color: ${p.accent_bg} ${I};`],
        ['#dash .dash-background', `background-color: ${p.panel_bg} ${I};`],
        ['.app-folder-dialog', `background-color: ${p.window_bg} ${I}; color: ${p.window_fg} ${I};`],

        ['.modal-dialog', `background-color: ${p.dialog_bg} ${I}; color: ${p.dialog_fg} ${I};`],
        ['.modal-dialog .modal-dialog-button-box', `background-color: ${p.dialog_bg} ${I};`],
        ['.modal-dialog-button-box .button, .modal-dialog .modal-dialog-linked-button',
            `background-color: ${p.hover} ${I}; color: ${p.dialog_fg} ${I};`],
        ['.modal-dialog .modal-dialog-linked-button:hover', `background-color: ${p.active} ${I};`],
        ['.button.default, .modal-dialog .modal-dialog-linked-button.default',
            `background-color: ${p.accent_bg} ${I}; color: ${p.accent_fg} ${I};`],
    ];
    const body = rules.map(([sel, decl]) => `${sel} {\n  ${decl.split('; ').join(';\n  ')}\n}`).join('\n\n');
    return `${GENERATED_HEADER}
/* Shell variant: ${isDark ? 'dark' : 'light'} */
${body}
`;
}
