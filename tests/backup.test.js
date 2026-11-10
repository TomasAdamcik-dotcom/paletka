import {test, assertEq} from './harness.js';
import {setup, keys} from './applierSetup.js';

const ref = {schema: 'org.gnome.desktop.interface', key: 'gtk-theme'};

test('backup: snapshot is taken once and survives reload', () => {
    const {backup, settings, paths, fs} = setup();
    backup.snapshot([ref], [paths.gtk4Css]);
    settings.values.set(keys.gtk, 'Other');
    backup.snapshot([ref], [paths.gtk4Css]);
    assertEq(backup.original(ref), 'Yaru');
    assertEq(fs.exists(`${paths.backupDir}/state.json`), true);
});

test('backup: restore only touches keys still holding our value', () => {
    const {backup, settings} = setup();
    const accent = {schema: 'org.gnome.desktop.interface', key: 'accent-color'};
    backup.snapshot([ref, accent], []);
    settings.set(ref, 'adw-gtk3');
    backup.recordWritten(ref, 'adw-gtk3');
    settings.set(accent, 'blue');
    backup.recordWritten(accent, 'blue');
    settings.set(accent, 'teal');
    backup.restore(false);
    assertEq(settings.get(ref), 'Yaru');
    assertEq(settings.get(accent), 'teal');
    assertEq(backup.has(), false);
});

test('backup: recording an unchanged value does not rewrite the state file', () => {
    const {backup, fs, paths} = setup();
    backup.snapshot([ref], []);
    backup.recordWritten(ref, 'adw-gtk3');
    const state = `${paths.backupDir}/state.json`;
    let writes = 0;
    const writeText = fs.writeText.bind(fs);
    fs.writeText = (path, text) => {
        if (path === state)
            writes++;
        writeText(path, text);
    };
    backup.recordWritten(ref, 'adw-gtk3');
    assertEq(writes, 0);
    backup.recordWritten(ref, 'Yaru');
    assertEq(writes, 1);
});

test('backup: a new snapshot after clear starts from an empty state', () => {
    const {backup, settings} = setup();
    backup.snapshot([ref], []);
    backup.recordWritten(ref, 'adw-gtk3');
    backup.clear();
    assertEq(backup.state(), null);
    settings.set(ref, 'Other');
    backup.snapshot([ref], []);
    assertEq(backup.original(ref), 'Other');
    assertEq(backup.state().written, {});
});
