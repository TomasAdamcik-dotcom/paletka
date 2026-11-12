import {test, assertEq} from './harness.js';
import {setup} from './applierSetup.js';
import {browserPalette, INACTIVE_PALETTE} from '../extension/lib/browserPalette.js';
import {resolveVariant} from '../extension/lib/palette.js';

const readJson = (fs, path) => JSON.parse(fs.readText(path));

test('browserPalette: colors come from the resolved palette', () => {
    const {sol} = setup();
    const p = browserPalette(sol, true);
    const r = resolveVariant(sol.dark, true);
    assertEq([p.version, p.active, p.family, p.dark], [1, true, 'solarized', true]);
    assertEq(p.colors.background, '#00252e');
    assertEq(p.colors.foreground, '#839496');
    assertEq(p.colors.surface, r.card_bg);
    assertEq(p.colors.link, r.accent);
    assertEq(p.colors.accent, r.accent_bg);
    assertEq([p.colors.border, p.colors.selection, p.colors.headerbar_bg, p.colors.headerbar_fg],
        [r.border, r.selection, r.headerbar_bg, r.headerbar_fg]);
    // 60 % of the text color mixed into the background
    assertEq(p.colors.muted, '#4f686c');
});

test('browserPalette: applying writes current.json, light/dark rewrites it', async () => {
    const {applier, fs, paths, sol} = setup();
    await applier.applyFamily(sol, true, {restartServices: false});
    assertEq(readJson(fs, paths.currentPalette), browserPalette(sol, true));
    applier.applyVariant(sol, false);
    assertEq(readJson(fs, paths.currentPalette).dark, false);
});

test('browserPalette: Ubuntu writes the inactive palette, turning off removes it', async () => {
    const {applier, fs, paths, sol} = setup();
    await applier.applyFamily(sol, true, {restartServices: false});
    await applier.restoreSystem(true, {restartServices: false});
    assertEq(readJson(fs, paths.currentPalette), INACTIVE_PALETTE);
    applier.removeLeftovers();
    assertEq(fs.exists(paths.currentPalette), false);
});
