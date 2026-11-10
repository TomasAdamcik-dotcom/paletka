// Derives the full palette of a theme variant from its 6 base colors.
import {parseHex, toCss, mix, withAlpha, readableOn, contrastRatio, isValidHex} from './color.js';

export const BASE_KEYS = ['background', 'foreground', 'accent', 'surface', 'success', 'error'];

export const DERIVED_KEYS = [
    'window_bg', 'window_fg', 'view_bg', 'view_fg',
    'headerbar_bg', 'headerbar_fg', 'headerbar_border', 'headerbar_shade',
    'sidebar_bg', 'sidebar_fg', 'card_bg', 'card_fg',
    'popover_bg', 'popover_fg', 'dialog_bg', 'dialog_fg',
    'accent', 'accent_bg', 'accent_fg',
    'destructive_bg', 'destructive_fg', 'success_bg', 'success_fg',
    'warning_bg', 'warning_fg', 'error_bg', 'error_fg',
    'border', 'shade', 'hover', 'active', 'selection',
    'panel_bg', 'panel_fg', 'osd_bg', 'osd_fg',
];

const WHITE = parseHex('#ffffff');
const BLACK = parseHex('#000000');
const AMBER = parseHex('#e5a50a');

// Accent usable as text on the window background: pull it toward the
// foreground until it reaches 4.5:1.
function textSafe(accent, fg, bg) {
    for (let t = 0; t <= 1; t += 0.1) {
        const c = mix(accent, fg, t);
        if (contrastRatio(c, bg) >= 4.5)
            return c;
    }
    return fg;
}

export function derivePalette(base, isDark) {
    const c = Object.fromEntries(BASE_KEYS.map(k => [k, parseHex(base[k])]));
    const {background: bg, foreground: fg, accent, surface} = c;
    const warning = mix(c.error, AMBER, 0.6);
    const view = isDark ? mix(bg, BLACK, 0.15) : mix(bg, WHITE, 0.3);
    const card = isDark ? mix(bg, WHITE, 0.05) : mix(bg, WHITE, 0.5);
    const popover = isDark ? mix(surface, bg, 0.5) : view;

    const p = {
        window_bg: bg, window_fg: fg,
        view_bg: view, view_fg: fg,
        headerbar_bg: surface, headerbar_fg: fg,
        headerbar_border: fg, headerbar_shade: withAlpha(BLACK, isDark ? 0.36 : 0.07),
        sidebar_bg: surface, sidebar_fg: fg,
        card_bg: card, card_fg: fg,
        popover_bg: popover, popover_fg: fg,
        dialog_bg: bg, dialog_fg: fg,
        accent: textSafe(accent, fg, bg), accent_bg: accent, accent_fg: readableOn(accent),
        destructive_bg: c.error, destructive_fg: readableOn(c.error),
        success_bg: c.success, success_fg: readableOn(c.success),
        warning_bg: warning, warning_fg: readableOn(warning),
        error_bg: c.error, error_fg: readableOn(c.error),
        border: withAlpha(fg, 0.15),
        shade: withAlpha(BLACK, isDark ? 0.36 : 0.07),
        hover: withAlpha(fg, 0.07),
        active: withAlpha(fg, 0.16),
        selection: withAlpha(accent, 0.25),
        panel_bg: surface, panel_fg: fg,
        osd_bg: withAlpha(mix(surface, bg, 0.5), 0.95), osd_fg: fg,
    };
    return Object.fromEntries(DERIVED_KEYS.map(k => [k, toCss(p[k])]));
}

export function resolveVariant(variant, isDark) {
    const p = derivePalette(variant.base, isDark);
    for (const [k, v] of Object.entries(variant.overrides ?? {})) {
        if (DERIVED_KEYS.includes(k) && isValidHex(v))
            p[k] = toCss(parseHex(v));
    }
    return p;
}
