import {test, assert, assertEq} from './harness.js';
import {loadBuiltin} from './fixtures.js';
import {validateFamily} from '../extension/lib/model.js';
import {derivePalette} from '../extension/lib/palette.js';
import {parseHex, contrastRatio} from '../extension/lib/color.js';

const CUSTOM = ['solarized', 'gruvbox', 'nord', 'dracula'];
// rgba(0, 0, 0, 0.8) text: compare as near-black.
const solid = s => parseHex(s.startsWith('rgba') ? '#333333' : s);

for (const id of CUSTOM) {
    test(`builtins: ${id} is a valid custom family with both variants`, () => {
        const f = loadBuiltin(id);
        assertEq(validateFamily(f), {ok: true, errors: []});
        assertEq(f.id, id);
        for (const v of ['light', 'dark'])
            assertEq(f[v].terminal.palette.length, 16, `${v} terminal`);
    });

    test(`builtins: ${id} light and dark are readable`, () => {
        const f = loadBuiltin(id);
        for (const [name, isDark] of [['light', false], ['dark', true]]) {
            const p = derivePalette(f[name].base, isDark);
            const bg = parseHex(p.window_bg);
            const lum = c => contrastRatio(c, parseHex('#000000'));
            assert(isDark ? lum(bg) < 4 : lum(bg) > 14, `${id} ${name}: background brightness matches variant`);
            assert(contrastRatio(parseHex(p.window_fg), bg) >= 4.5, `${id} ${name}: text contrast`);
            assert(contrastRatio(solid(p.accent_fg), parseHex(p.accent_bg)) >= 3, `${id} ${name}: accent contrast`);
            assert(contrastRatio(parseHex(p.accent), bg) >= 4.5, `${id} ${name}: accent text contrast`);
        }
    });
}
