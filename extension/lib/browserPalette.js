// The active palette as browsers see it (current.json, read by the browser host).
import {parseHex, mix, toHex} from './color.js';
import {resolveVariant} from './palette.js';

export const INACTIVE_PALETTE = {version: 1, active: false};

export function browserPalette(family, isDark) {
    const p = resolveVariant(isDark ? family.dark : family.light, isDark);
    return {
        version: 1,
        active: true,
        family: family.id,
        dark: isDark,
        colors: {
            background: p.view_bg,
            surface: p.card_bg,
            foreground: p.view_fg,
            muted: toHex(mix(parseHex(p.view_bg), parseHex(p.view_fg), 0.6)),
            link: p.accent,
            border: p.border,
            selection: p.selection,
            accent: p.accent_bg,
            headerbar_bg: p.headerbar_bg,
            headerbar_fg: p.headerbar_fg,
        },
    };
}
