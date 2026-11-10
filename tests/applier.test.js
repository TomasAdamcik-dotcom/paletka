import {test, assert, assertEq} from './harness.js';
import {setup, keys, otherFamily, FOREIGN_CSS} from './applierSetup.js';

const get = (s, k) => s.values.get(k);

test('applier: applyFamily writes all outputs (light)', async () => {
    const {applier, settings, fs, paths, services, sol} = setup();
    const {shellCssPath} = await applier.applyFamily(sol, false, {restartServices: false});
    assert(fs.readText(paths.gtk4Css).includes('#fdf6e3'), 'gtk4 css');
    assertEq(fs.exists(paths.gtk3Css), false);
    for (const [v, base, bg] of [['light', 'adw-gtk3', '#fdf6e3'], ['dark', 'adw-gtk3-dark', '#002b36']]) {
        const dir = `${paths.userThemesDir}/paletka-solarized-${v}`;
        const css = fs.readText(`${dir}/gtk-3.0/gtk.css`);
        assert(css.includes(`@import url("file://${paths.userThemesDir}/${base}/gtk-3.0/gtk.css");`), `${v} imports ${base}`);
        assert(css.includes(`@define-color window_bg_color ${bg};`), `${v} colors`);
        assert(fs.readText(`${dir}/index.theme`).includes(`GtkTheme=paletka-solarized-${v}`), `${v} index`);
    }
    assertEq(get(settings, keys.gtk), 'paletka-solarized-light');
    assertEq(get(settings, keys.accent), 'blue');
    assertEq(get(settings, keys.ptyxisPalette), 'paletka-solarized');
    assert(fs.exists(`${paths.ptyxisPaletteDir}/paletka-solarized.palette`), 'ptyxis file');
    assertEq(get(settings, keys.termBg), '#fdf6e3');
    assertEq(get(settings, keys.termUseTheme), false);
    assert(get(settings, keys.uri).endsWith('solarized-light.svg'), 'wallpaper light');
    assert(get(settings, keys.uriDark).endsWith('solarized-dark.svg'), 'wallpaper dark');
    assertEq(get(settings, keys.icon), 'Yaru');
    assert(fs.exists(shellCssPath) && shellCssPath.endsWith('shell-solarized-light.css'), 'shell css');
    assert(fs.exists(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`), 'adw-gtk3 installed');
    assertEq(services.calls, []);
});

test('applier: applyFamily restarts services when asked', async () => {
    const {applier, services, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: true});
    assertEq(services.calls, ['restart']);
});

test('applier: applyVariant switches to dark without snapshot or restarts', async () => {
    const {applier, settings, backup, services, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    const before = backup.state();
    const {shellCssPath} = applier.applyVariant(sol, true);
    assertEq(get(settings, keys.gtk), 'paletka-solarized-dark');
    assertEq(get(settings, keys.termBg), '#002b36');
    assertEq(get(settings, keys.icon), 'Yaru-dark');
    assert(shellCssPath.endsWith('shell-solarized-dark.css'));
    assertEq(backup.state().settings, before.settings);
    assertEq(services.calls, []);
});

test('restore puts back foreign gtk.css byte-identical', async () => {
    const {applier, settings, fs, paths, backup, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.readText(paths.gtk4Css), FOREIGN_CSS);
    assertEq(fs.exists(paths.gtk3Css), false);
    assertEq(get(settings, keys.gtk), 'Yaru');
    assertEq(get(settings, keys.accent), 'orange');
    assertEq(get(settings, keys.ptyxisPalette), 'solarized');
    assertEq(get(settings, keys.termUseTheme), true);
    assertEq(get(settings, keys.termBg), 'rgb(23,20,33)');
    assertEq(get(settings, keys.uri), 'file:///usr/share/backgrounds/warty.png');
    assertEq(backup.has(), false);
});

test('restore keeps file without our header', async () => {
    const {applier, fs, paths, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    fs.writeText(paths.gtk4Css, '/* mine */\n');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.readText(paths.gtk4Css), '/* mine */\n');
});

test('restore keeps settings the user changed meanwhile', async () => {
    const {applier, settings, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    settings.values.set(keys.uri, 'file:///mine.png');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(get(settings, keys.uri), 'file:///mine.png');
    assertEq(get(settings, keys.gtk), 'Yaru');
});

test('applier: switching custom to custom keeps the first snapshot', async () => {
    const {applier, settings, backup, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    const snap = backup.state().settings;
    await applier.applyFamily(otherFamily(sol), false, {restartServices: false});
    assertEq(backup.state().settings, snap);
    assertEq(get(settings, keys.accent), 'pink');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(get(settings, keys.accent), 'orange');
});

test('applier: restore while dark picks Yaru dark variant', async () => {
    const {applier, settings, sol} = setup();
    await applier.applyFamily(sol, true, {restartServices: false});
    await applier.restoreSystem(true, {restartServices: false});
    assertEq(get(settings, keys.gtk), 'Yaru-dark');
    assertEq(get(settings, keys.icon), 'Yaru-dark');
});

test('applier: restore without foreign css removes our gtk.css', async () => {
    const {applier, fs, paths, sol} = setup({foreignCss: false});
    await applier.applyFamily(sol, false, {restartServices: false});
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.exists(paths.gtk4Css), false);
});

test('apply skips missing terminals and unknown icon theme', async () => {
    const {applier, settings, sol} = setup({missingSchemas: ['org.gnome.Ptyxis', 'org.gnome.Terminal.ProfilesList']});
    const fam = JSON.parse(JSON.stringify(sol));
    fam.light.iconTheme = 'Nope';
    await applier.applyFamily(fam, false, {restartServices: false});
    assertEq(get(settings, keys.icon), 'Yaru');
    assertEq(get(settings, keys.gtk), 'paletka-solarized-light');
    assertEq(get(settings, keys.termBg), 'rgb(23,20,33)');
});

test('applier: wallpaper none keeps the original wallpaper', async () => {
    const {applier, settings, sol} = setup();
    const fam = JSON.parse(JSON.stringify(sol));
    fam.light.wallpaper = {type: 'none'};
    await applier.applyFamily(fam, false, {restartServices: false});
    assertEq(get(settings, keys.uri), 'file:///usr/share/backgrounds/warty.png');
    assert(get(settings, keys.uriDark).endsWith('solarized-dark.svg'));
});

test('applier: ensureAdwGtk3 leaves a user-installed theme alone', () => {
    const {applier, fs, paths} = setup();
    fs.writeText(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`, '/* user */');
    assertEq(applier.ensureAdwGtk3(), true);
    assertEq(fs.readText(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`), '/* user */');
    assert(fs.exists(`${paths.userThemesDir}/adw-gtk3-dark/gtk-3.0/gtk.css`), 'dark copied');
});

test('applier: ensureAdwGtk3 upgrades an older bundled copy', () => {
    const {applier, fs, paths} = setup();
    fs.writeText(`${paths.userThemesDir}/adw-gtk3/.paletka-version`, '6.0');
    fs.writeText(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`, '/* old */');
    applier.ensureAdwGtk3();
    assert(fs.readText(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`) !== '/* old */');
    assertEq(fs.readText(`${paths.userThemesDir}/adw-gtk3/.paletka-version`), '6.5');
});

test('applier: restore removes generated wallpapers not in use', async () => {
    const {applier, fs, paths, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    assert(fs.exists(paths.wallpaperDir));
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.exists(paths.wallpaperDir), false);
});

test('applier: restore keeps generated wallpaper the user still uses', async () => {
    const {applier, settings, fs, paths, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    const ours = get(settings, keys.uri);
    settings.values.set(keys.uriDark, ours);
    await applier.restoreSystem(false, {restartServices: false});
    assert(fs.exists(ours.replace('file://', '')));
});

test('applyVariant without a prior applyFamily still snapshots first (C1)', async () => {
    const {applier, settings, fs, paths, backup, sol} = setup();
    fs.writeText(paths.gtk3Css, '/* user gtk3 */\n');
    applier.applyVariant(sol, false);
    assertEq(backup.has(), true);
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.readText(paths.gtk3Css), '/* user gtk3 */\n');
    assertEq(get(settings, keys.gtk), 'Yaru');
});

test('restoreSystem without a backup removes our generated gtk.css files (C1)', async () => {
    const {applier, fs, paths, backup, sol} = setup({foreignCss: false});
    await applier.applyFamily(sol, false, {restartServices: false});
    backup.clear();
    fs.writeText(paths.gtk3Css, '/* mine */\n');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.exists(paths.gtk4Css), false);
    assertEq(fs.readText(paths.gtk3Css), '/* mine */\n');
});

test('restore resets keys that were at their default instead of pinning them (I5)', async () => {
    const {applier, settings, sol} = setup({defaultKeys: [keys.uri, keys.accent]});
    await applier.applyFamily(sol, false, {restartServices: false});
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(settings.userSet.has(keys.uri), false);
    assertEq(settings.userSet.has(keys.accent), false);
    assertEq(get(settings, keys.uri), 'file:///usr/share/backgrounds/warty.png');
    assertEq(settings.userSet.has(keys.gtk), true);
});

test('restore of a default Yaru theme while dark sets the dark variant (I5)', async () => {
    const {applier, settings, sol} = setup({defaultKeys: [keys.gtk, keys.icon]});
    await applier.applyFamily(sol, true, {restartServices: false});
    await applier.restoreSystem(true, {restartServices: false});
    assertEq(get(settings, keys.gtk), 'Yaru-dark');
    assertEq(get(settings, keys.icon), 'Yaru-dark');
});

test('restore recreates a symlinked gtk.css (I2)', async () => {
    const {applier, fs, paths, root, sol} = setup({foreignCss: false});
    fs.writeText(`${root}/dotfiles/gtk.css`, '/* dotfiles */\n');
    fs.symlink(`${root}/dotfiles/gtk.css`, paths.gtk4Css);
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(fs.readText(`${root}/dotfiles/gtk.css`), '/* dotfiles */\n');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.readLink(paths.gtk4Css), `${root}/dotfiles/gtk.css`);
    assertEq(fs.readText(paths.gtk4Css), '/* dotfiles */\n');
});

const LEGACY_CSS = '@define-color window_bg_color #fafafa;\n@define-color view_bg_color #ffffff;\n';

test('applier: warns once when the foreign gtk.css has legacy surface colors', async () => {
    const {applier, fs, paths, sol} = setup({foreignCss: false});
    fs.writeText(paths.gtk4Css, LEGACY_CSS);
    const first = await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(first.warnings, [{code: 'legacy-gtk-css', path: paths.gtk4Css}]);
    const second = await applier.applyFamily(sol, true, {restartServices: false});
    assertEq(second.warnings, []);
    assertEq(applier.applyVariant(sol, false).warnings, []);
});

test('applier: no warning for a harmless foreign gtk.css or none at all', async () => {
    const a = setup();
    assertEq((await a.applier.applyFamily(a.sol, false, {restartServices: false})).warnings, []);
    const b = setup({foreignCss: false});
    assertEq((await b.applier.applyFamily(b.sol, false, {restartServices: false})).warnings, []);
});

test('applier: warns when applyVariant takes the first snapshot', () => {
    const {applier, fs, paths, sol} = setup({foreignCss: false});
    fs.writeText(paths.gtk4Css, LEGACY_CSS);
    assertEq(applier.applyVariant(sol, false).warnings.length, 1);
});

test('applier: Ptyxis follows the system style while a custom family is active', async () => {
    const {applier, settings, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(get(settings, keys.ptyxisStyle), 'system');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(get(settings, keys.ptyxisStyle), 'dark');
});

test('applier: Ptyxis style is restored even with a snapshot taken before it was managed', async () => {
    const {applier, settings, backup, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    const state = backup.state();
    state.settings = state.settings.filter(e => e.ref.key !== 'interface-style');
    backup._save(state);
    settings.values.set(keys.ptyxisStyle, 'dark');
    await applier.applyFamily(sol, true, {restartServices: false});
    assertEq(get(settings, keys.ptyxisStyle), 'system');
    await applier.restoreSystem(true, {restartServices: false});
    assertEq(get(settings, keys.ptyxisStyle), 'dark');
});

test('applier: a foreign gtk-3.0/gtk.css is set aside while a custom family is active', async () => {
    const {applier, fs, paths, sol} = setup();
    fs.writeText(paths.gtk3Css, '/* user gtk3 */\n');
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(fs.exists(paths.gtk3Css), false);
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.readText(paths.gtk3Css), '/* user gtk3 */\n');
});

test('applier: an old generated gtk-3.0/gtk.css is removed on apply', async () => {
    const {applier, fs, paths, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    fs.writeText(paths.gtk3Css, '/* Generated by Paletka — do not edit. */\n@define-color x #fff;\n');
    await applier.applyFamily(sol, true, {restartServices: false});
    assertEq(fs.exists(paths.gtk3Css), false);
});

test('applier: restore removes the generated GTK3 themes', async () => {
    const {applier, fs, paths, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.listDir(paths.userThemesDir).filter(n => n.startsWith('paletka-')), []);
    assert(fs.exists(`${paths.userThemesDir}/adw-gtk3`), 'adw-gtk3 kept');
});

test('applier: a gtk-3.0/gtk.css created after the snapshot is never deleted', async () => {
    const {applier, fs, paths, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    fs.writeText(paths.gtk3Css, '/* written later by the user */\n');
    await applier.applyFamily(sol, true, {restartServices: false});
    assertEq(fs.readText(paths.gtk3Css), '/* written later by the user */\n');
});

test('applier: a wallpaper file name with # or % becomes a valid URI', async () => {
    const {applier, settings, fs, root, sol} = setup();
    const path = `${root}/wallpaper #2 100%.png`;
    fs.writeText(path, 'png');
    const f = JSON.parse(JSON.stringify(sol));
    f.light.wallpaper = {type: 'file', path};
    await applier.applyFamily(f, false, {restartServices: false});
    assertEq(get(settings, keys.uri), `file://${root.replaceAll(' ', '%20')}/wallpaper%20%232%20100%25.png`);
});
