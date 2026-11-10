import {test, assert, assertEq} from './harness.js';
import {setup, keys} from './applierSetup.js';

const get = (s, k) => s.values.get(k);

test('disable: isApplied follows apply and restore', async () => {
    const {applier, sol} = setup();
    assertEq(applier.isApplied(), false);
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(applier.isApplied(), true);
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(applier.isApplied(), false);
});

test('disable: removeLeftovers drops schemes and the bundled adw-gtk3', async () => {
    const {applier, fs, paths, settings, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    await applier.restoreSystem(false, {restartServices: false});
    applier.removeLeftovers();
    assertEq(fs.listDir(paths.sourceStylesDir).filter(n => n.startsWith('paletka-')), []);
    assertEq(fs.exists(`${paths.userThemesDir}/adw-gtk3`), false);
    assertEq(fs.exists(`${paths.userThemesDir}/adw-gtk3-dark`), false);
    assertEq(get(settings, keys.gtk), 'Yaru');
});

test('disable: removeLeftovers keeps a user-installed adw-gtk3', () => {
    const {applier, fs, paths} = setup();
    fs.writeText(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`, '/* user */');
    applier.ensureAdwGtk3();
    applier.removeLeftovers();
    assertEq(fs.readText(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`), '/* user */');
    assertEq(fs.exists(`${paths.userThemesDir}/adw-gtk3-dark`), false);
});

test('disable: removeLeftovers keeps the bundled adw-gtk3 while it is the GTK theme', () => {
    const {applier, fs, paths, settings} = setup();
    applier.ensureAdwGtk3();
    settings.values.set(keys.gtk, 'adw-gtk3-dark');
    applier.removeLeftovers();
    assert(fs.exists(`${paths.userThemesDir}/adw-gtk3/gtk-3.0/gtk.css`), 'light kept with its dark pair');
    assert(fs.exists(`${paths.userThemesDir}/adw-gtk3-dark/gtk-3.0/gtk.css`), 'dark kept');
});

test('disable: removeLeftovers keeps a foreign file in the GtkSourceView styles', () => {
    const {applier, fs, paths} = setup();
    fs.writeText(`${paths.sourceStylesDir}/mine.xml`, '<style-scheme/>');
    applier.removeLeftovers();
    assert(fs.exists(`${paths.sourceStylesDir}/mine.xml`), 'kept');
});
