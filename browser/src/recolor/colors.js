// Color helpers on {r, g, b, a} (0–255, alpha 0–1).

// rgb(), rgba() (comma or space syntax) and #rrggbb; null for anything else
// (the recolorer resolves other syntaxes such as oklch() through a canvas).
export function parseRgb(text) {
    if (typeof text !== 'string')
        return null;
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text.trim());
    if (hex)
        return {r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16), a: 1};
    const m = /^rgba?\(([^)]+)\)$/.exec(text.trim());
    if (!m)
        return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [r, g, b, a].some(Number.isNaN) ? null : {r, g, b, a};
}

const linear = v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function luminance(c) {
    return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

export function saturation(c) {
    const max = Math.max(c.r, c.g, c.b);
    return max === 0 ? 0 : (max - Math.min(c.r, c.g, c.b)) / max;
}

export function mix(a, b, t) {
    const lerp = (x, y) => x + (y - x) * t;
    return {r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b), a: lerp(a.a, b.a)};
}

export function toCss(c, alpha = c.a) {
    return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.round(alpha * 1000) / 1000})`;
}
