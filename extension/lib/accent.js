// Maps an arbitrary color to the closest GNOME accent-color enum value.
import {parseHex, hue, saturation} from './color.js';

export const GNOME_ACCENTS = {
    blue: '#3584e4',
    teal: '#2190a4',
    green: '#3a944a',
    yellow: '#c88800',
    orange: '#ed5b00',
    red: '#e62d42',
    pink: '#d56199',
    purple: '#9141ac',
    slate: '#6f8396',
    brown: '#b5835a',
};

const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export function nearestAccent(hex) {
    const c = parseHex(hex);
    if (saturation(c) < 0.15)
        return 'slate';
    const h = hue(c);
    let best = 'slate', bestD = Infinity;
    for (const [name, value] of Object.entries(GNOME_ACCENTS)) {
        const a = parseHex(value);
        if (name === 'slate' || name === 'brown')
            continue;
        const d = hueDistance(h, hue(a));
        if (d < bestD) {
            best = name;
            bestD = d;
        }
    }
    return best;
}
