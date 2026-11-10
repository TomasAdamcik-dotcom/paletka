// Pure color math. Colors are {r, g, b, a}: r/g/b integers 0-255, a 0-1.

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isValidHex(s) {
    return typeof s === 'string' && HEX_RE.test(s);
}

export function parseHex(s) {
    if (!isValidHex(s))
        throw new Error(`Invalid color: ${s}`);
    let h = s.slice(1);
    if (h.length === 3)
        h = [...h].map(ch => ch + ch).join('');
    const n = i => parseInt(h.slice(i, i + 2), 16);
    const a = h.length === 8 ? Math.round(n(6) / 255 * 1000) / 1000 : 1;
    return {r: n(0), g: n(2), b: n(4), a};
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const byte = v => Math.round(clamp(v, 0, 255));

export function toHex(c) {
    return `#${[c.r, c.g, c.b].map(v => byte(v).toString(16).padStart(2, '0')).join('')}`;
}

export function toCss(c) {
    if (c.a >= 1)
        return toHex(c);
    const a = Math.round(c.a * 1000) / 1000;
    return `rgba(${byte(c.r)}, ${byte(c.g)}, ${byte(c.b)}, ${a})`;
}

export function mix(c1, c2, t) {
    const lerp = (x, y) => x + (y - x) * t;
    return {
        r: byte(lerp(c1.r, c2.r)),
        g: byte(lerp(c1.g, c2.g)),
        b: byte(lerp(c1.b, c2.b)),
        a: Math.round(lerp(c1.a, c2.a) * 1000) / 1000,
    };
}

export function withAlpha(c, a) {
    return {...c, a};
}

// Composite a translucent color over an opaque background.
function over(fg, bg) {
    return {...mix(bg, {...fg, a: 1}, fg.a), a: 1};
}

export function luminance(c) {
    const ch = v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

export function contrastRatio(c1, c2) {
    const [l1, l2] = [luminance(c1), luminance(c2)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
}

export function hue(c) {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0)
        return 0;
    let h;
    if (max === r)
        h = ((g - b) / d) % 6;
    else if (max === g)
        h = (b - r) / d + 2;
    else
        h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
}

export function saturation(c) {
    const max = Math.max(c.r, c.g, c.b) / 255, min = Math.min(c.r, c.g, c.b) / 255;
    const l = (max + min) / 2;
    if (max === min)
        return 0;
    return (max - min) / (1 - Math.abs(2 * l - 1));
}

const WHITE = {r: 255, g: 255, b: 255, a: 1};
const DARK = {r: 0, g: 0, b: 0, a: 0.8};

// White text when it reaches 3:1 (GNOME uses white on accent buttons),
// otherwise whichever of white / 80% black contrasts better.
export function readableOn(bg) {
    const solidBg = {...bg, a: 1};
    const white = contrastRatio(WHITE, solidBg);
    if (white >= 3)
        return WHITE;
    return white >= contrastRatio(over(DARK, solidBg), solidBg) ? WHITE : DARK;
}
