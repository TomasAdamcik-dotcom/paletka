// How a page's colors map onto the theme. `base` is the page's own background,
// `P` the theme palette as parsed colors. null means: keep the page's color.
import {luminance, saturation, mix} from './colors.js';

const STRONG = 0.35;
const BLACK = {r: 0, g: 0, b: 0, a: 1};
const WHITE = {r: 255, g: 255, b: 255, a: 1};

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// Saturated colors carry meaning (brand colors, buttons, highlights).
const isStrong = c => saturation(c) > STRONG && luminance(c) > 0.05;

export function mapBackground(color, base, P) {
    if (isStrong(color))
        return null;
    const distance = Math.abs(luminance(color) - luminance(base));
    if (distance < 0.03)
        return P.background;
    // Cards and panels: the surface, raised a little more the further they were.
    return mix(P.surface, P.foreground, Math.min(0.25, Math.max(0, distance - 0.15)));
}

export function mapText(color, base, P, {isLink}) {
    if (isLink && saturation(color) > 0.25)
        return P.link;
    if (saturation(color) > STRONG)
        return null;
    // Contrast against the page decides how strong the text stays: full for
    // body text, weaker for secondary text (log scale, like perceived contrast).
    const best = Math.max(contrast(BLACK, base), contrast(WHITE, base));
    const strength = Math.min(1, Math.log(contrast(color, base)) / Math.log(0.5 * best));
    return mix(P.background, P.foreground, 0.45 + 0.55 * strength);
}

export function mapBorder(color, P) {
    return saturation(color) < STRONG ? P.border : null;
}

// Gradients of only unsaturated colors are fades and stripes that would stay
// as white bands on a dark theme.
export function isNeutralGradient(stops) {
    return stops.length > 0 && stops.every(c => saturation(c) < STRONG);
}
