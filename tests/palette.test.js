import {test, assert, assertEq} from './harness.js';
import {loadBuiltin} from './fixtures.js';
import {derivePalette, resolveVariant, DERIVED_KEYS} from '../extension/lib/palette.js';
import {parseHex, contrastRatio} from '../extension/lib/color.js';

const sol = loadBuiltin('solarized');
const solid = s => parseHex(s.startsWith('rgba') ? '#000000' : s);

test('palette: window_bg is base background', () => {
    const p = derivePalette(sol.light.base, false);
    assertEq(p.window_bg, '#fdf6e3');
    assertEq(p.window_fg, '#586e75');
    assertEq(p.sidebar_bg, '#eee8d5');
    assertEq(p.panel_bg, '#eee8d5');
    assertEq(p.accent_bg, '#268bd2');
});

test('palette: every derived key present', () => {
    const p = derivePalette(sol.dark.base, true);
    for (const k of DERIVED_KEYS)
        assert(typeof p[k] === 'string', `missing ${k}`);
});

test('palette: accent_fg is white on solarized blue', () => {
    assertEq(derivePalette(sol.light.base, false).accent_fg, '#ffffff');
});

test('palette: solarized variants are readable', () => {
    for (const [v, dark] of [[sol.light, false], [sol.dark, true]]) {
        const p = derivePalette(v.base, dark);
        assert(contrastRatio(parseHex(p.window_fg), parseHex(p.window_bg)) >= 4.5, 'text contrast');
        assert(contrastRatio(solid(p.accent_fg), parseHex(p.accent_bg)) >= 3, 'accent contrast');
    }
});

test('palette: resolveVariant applies valid overrides only', () => {
    const variant = {...sol.light, overrides: {headerbar_bg: '#123456', bogus: '#ffffff', view_bg: 'nope'}};
    const p = resolveVariant(variant, false);
    assertEq(p.headerbar_bg, '#123456');
    assertEq(p.bogus, undefined);
    assert(p.view_bg !== 'nope');
});
