import {test, assert, assertEq} from './harness.js';
import {setup, keys, VSCODE_SETTINGS} from './applierSetup.js';
import {normalizeFamily} from '../extension/lib/model.js';

const get = (s, k) => s.values.get(k);

function keepWallpaper(sol) {
    const f = normalizeFamily(JSON.parse(JSON.stringify(sol)));
    f.light.wallpaper = {type: 'none'};
    f.dark.wallpaper = {type: 'none'};
    return f;
}

test('restore: a setting Paletka never wrote keeps what the user chose meanwhile', async () => {
    const {applier, settings, sol} = setup();
    await applier.applyFamily(keepWallpaper(sol), false, {restartServices: false});
    settings.values.set(keys.uri, 'file:///home/u/new.png');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(get(settings, keys.uri), 'file:///home/u/new.png');
});

test('restore: the original file is set aside when a new one replaced ours', async () => {
    const {applier, fs, paths, sol} = setup();
    fs.writeText(paths.gtk3Css, '/* original */\n');
    await applier.applyFamily(sol, false, {restartServices: false});
    fs.writeText(paths.gtk3Css, '/* written later */\n');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.readText(paths.gtk3Css), '/* written later */\n');
    assertEq(fs.readText(`${paths.gtk3Css}.paletka-original`), '/* original */\n');
});

test('restore: one failing setting does not stop the rest', async () => {
    const {applier, settings, fs, paths, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    const set = settings.set.bind(settings);
    settings.set = (ref, value) => {
        if (ref.key === 'accent-color')
            throw new Error('read-only');
        set(ref, value);
    };
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(get(settings, keys.gtk), 'Yaru');
    assertEq(get(settings, keys.icon), 'Yaru');
    assert(!fs.readText(paths.gtk4Css)?.startsWith('/* Generated'), 'gtk.css restored');
});

test('removeLeftovers keeps adw-gtk3 while a Paletka theme still uses it', async () => {
    const {applier, settings, fs, paths, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(get(settings, keys.gtk), 'paletka-solarized-light');
    applier.removeLeftovers();
    assert(fs.exists(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`), 'kept');
});

test('restore: a default setting Paletka never wrote keeps the later user choice', async () => {
    const {applier, settings, sol} = setup({defaultKeys: [keys.uri]});
    await applier.applyFamily(keepWallpaper(sol), false, {restartServices: false});
    settings.set({schema: 'org.gnome.desktop.background', key: 'picture-uri'}, 'file:///home/u/new.png');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(get(settings, keys.uri), 'file:///home/u/new.png');
});

test('restore: a VS Code key Paletka never wrote is not removed', async () => {
    const {applier, fs, vscodeSettings, sol} = setup({vscode: VSCODE_SETTINGS});
    const f = normalizeFamily(JSON.parse(JSON.stringify(sol)));
    for (const v of ['light', 'dark'])
        f[v].vscodeTheme = null;
    await applier.applyFamily(f, false, {restartServices: false});
    fs.writeText(vscodeSettings, fs.readText(vscodeSettings).replace('"editor.fontSize": 14', '"editor.fontSize": 14,\n    "workbench.preferredDarkColorTheme": "Monokai"'));
    await applier.restoreSystem(false, {restartServices: false});
    assert(fs.readText(vscodeSettings).includes('"Monokai"'), fs.readText(vscodeSettings));
});
