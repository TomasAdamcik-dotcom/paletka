import {test, assert, assertEq} from './harness.js';
import GLib from 'gi://GLib';
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

test('backup: an empty or broken state file counts as no backup and is set aside', () => {
    for (const text of ['', '{ broken']) {
        const {backup, fs, paths} = setup();
        GLib.mkdir_with_parents(paths.backupDir, 0o755);
        GLib.file_set_contents(`${paths.backupDir}/state.json`, text);
        assertEq(backup.has(), false);
        assertEq(backup.state(), null);
        assert(fs.exists(`${paths.backupDir}/state.json.broken`), 'set aside');
        assertEq(backup.snapshot([{schema: 'org.gnome.desktop.interface', key: 'gtk-theme'}], []), true);
    }
});

test('restore without a backup resets settings that still name Paletka files', async () => {
    const {applier, backup, settings, sol} = setup({defaultKeys: [keys.gtk]});
    await applier.applyFamily(sol, false, {restartServices: false});
    backup.clear();
    await applier.restoreSystem(false, {restartServices: false});
    assert(!String(get(settings, keys.gtk)).startsWith('paletka-'), `gtk ${get(settings, keys.gtk)}`);
    assert(!String(get(settings, keys.ptyxisPalette)).startsWith('paletka-'), 'ptyxis');
    assert(!String(get(settings, keys.editorScheme)).startsWith('paletka-'), 'editor');
});

test('restore: a terminal profile made default while a family is active is restored too', async () => {
    const {applier, settings, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    const p2 = '/org/gnome/Ptyxis/Profiles/p2/';
    const t2 = '/org/gnome/terminal/legacy/profiles:/:t2/';
    const K = (schema, key, path) => `${schema}|${path}|${key}`;
    settings.values.set(K('org.gnome.Ptyxis', 'default-profile-uuid', ''), 'p2');
    settings.set({schema: 'org.gnome.Ptyxis.Profile', key: 'palette', path: p2}, 'gnome');
    settings.values.set(K('org.gnome.Terminal.ProfilesList', 'default', ''), 't2');
    settings.set({schema: 'org.gnome.Terminal.Legacy.Profile', key: 'use-theme-colors', path: t2}, true);
    await applier.applyFamily(sol, true, {restartServices: false});
    assertEq(settings.values.get(K('org.gnome.Ptyxis.Profile', 'palette', p2)), 'paletka-solarized');
    await applier.restoreSystem(true, {restartServices: false});
    assertEq(settings.values.get(K('org.gnome.Ptyxis.Profile', 'palette', p2)), 'gnome');
    assertEq(settings.values.get(K('org.gnome.Terminal.Legacy.Profile', 'use-theme-colors', t2)), true);
});

test('removeFamilyFiles drops the generated files of a deleted theme only', async () => {
    const {applier, fs, paths, sol} = setup();
    const other = JSON.parse(JSON.stringify(sol));
    other.id = 'other';
    await applier.applyFamily(other, false, {restartServices: false});
    await applier.applyFamily(sol, false, {restartServices: false});
    applier.removeFamilyFiles('other');
    const left = dir => fs.listDir(dir).filter(n => n.includes('other'));
    assertEq(left(paths.userThemesDir), []);
    assertEq(left(paths.sourceStylesDir), []);
    assertEq(left(paths.ptyxisPaletteDir), []);
    assertEq(left(paths.wallpaperDir), []);
    assert(fs.exists(`${paths.userThemesDir}/paletka-solarized-light`), 'active theme kept');
    assert(fs.exists(`${paths.ptyxisPaletteDir}/paletka-solarized.palette`), 'active palette kept');
});
