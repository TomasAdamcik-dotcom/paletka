import {test, assert, assertEq} from './harness.js';
import {setup, keys} from './applierSetup.js';
import {loadBuiltin} from './fixtures.js';

const get = (s, k) => s.values.get(k);

test('textEditor: applying a family writes its schemes and selects them', async () => {
    const {applier, settings, fs, paths, sol} = setup();
    await applier.applyFamily(sol, true, {restartServices: false});
    for (const v of ['light', 'dark'])
        assert(fs.exists(`${paths.sourceStylesDir}/paletka-solarized-${v}.xml`), `${v} scheme`);
    assertEq(get(settings, keys.editorScheme), 'paletka-solarized-light');
    assertEq(get(settings, keys.editorVariant), 'follow');
});

test('textEditor: Ubuntu restores the user scheme and variant', async () => {
    const {applier, settings, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(get(settings, keys.editorScheme), 'solarized-light');
    assertEq(get(settings, keys.editorVariant), 'light');
});

test('textEditor: skipped without Text Editor', async () => {
    const {applier, settings, sol} = setup({missingSchemas: ['org.gnome.TextEditor']});
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(get(settings, keys.editorScheme), 'solarized-light');
});

test('textEditor: writeSourceSchemes pre-generates every custom family', () => {
    const {applier, fs, paths} = setup();
    applier.writeSourceSchemes(['ubuntu', 'solarized', 'nord'].map(loadBuiltin));
    assert(fs.exists(`${paths.sourceStylesDir}/paletka-nord-dark.xml`), 'nord dark');
    assertEq(fs.listDir(paths.sourceStylesDir).length, 4);
});
