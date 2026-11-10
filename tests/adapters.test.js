import {test, assert, assertEq} from './harness.js';
import {tmpDir} from './harness.js';
import {GioFs, GioSettingsAdapter} from '../extension/lib/adapters.js';

test('adapters: GioFs round trip', () => {
    const fs = new GioFs();
    const d = tmpDir();
    fs.writeText(`${d}/a/b/c.txt`, 'hello');
    assertEq(fs.readText(`${d}/a/b/c.txt`), 'hello');
    assertEq(fs.readText(`${d}/missing.txt`), null);
    fs.copyDir(`${d}/a`, `${d}/copy`);
    assertEq(fs.readText(`${d}/copy/b/c.txt`), 'hello');
    assertEq(fs.listDir(`${d}/copy`), ['b']);
    assertEq(fs.listDir(`${d}/nope`), []);
    fs.remove(`${d}/copy/b/c.txt`);
    assertEq(fs.exists(`${d}/copy/b/c.txt`), false);
    fs.remove(`${d}/copy/b/c.txt`);
    fs.removeTree(`${d}/copy`);
    assertEq(fs.exists(`${d}/copy`), false);
});

test('adapters: GioSettingsAdapter.exists', () => {
    const s = new GioSettingsAdapter();
    assert(s.exists({schema: 'org.gnome.desktop.interface', key: 'gtk-theme'}));
    assert(!s.exists({schema: 'org.gnome.desktop.interface', key: 'nope'}));
    assert(!s.exists({schema: 'org.example.nope', key: 'x'}));
    assertEq(typeof s.get({schema: 'org.gnome.desktop.interface', key: 'gtk-theme'}), 'string');
});
