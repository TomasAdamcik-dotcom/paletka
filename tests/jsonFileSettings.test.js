import {test, assert, assertEq, tmpDir} from './harness.js';
import {GioFs} from '../extension/lib/adapters.js';
import {JsonFileSettings, CompositeSettings} from '../extension/lib/jsonFileSettings.js';

const fs = new GioFs();
const ref = (path, key) => ({schema: 'jsonfile', path, key});

test('jsonFileSettings: exists needs the parent dir and a parsable or missing file', () => {
    const d = tmpDir();
    const s = new JsonFileSettings({fs, log: () => {}});
    assertEq(s.exists(ref(`${d}/nope/settings.json`, 'a')), false);
    assertEq(s.exists(ref(`${d}/settings.json`, 'a')), true);
    fs.writeText(`${d}/settings.json`, '{ broken');
    assertEq(s.exists(ref(`${d}/settings.json`, 'a')), false);
});

test('jsonFileSettings: get/set/isUserSet/reset keep other content', () => {
    const d = tmpDir();
    const path = `${d}/settings.json`;
    const original = '{\n    // mine\n    "editor.fontSize": 14\n}\n';
    fs.writeText(path, original);
    const s = new JsonFileSettings({fs, log: () => {}});
    const r = ref(path, 'workbench.preferredDarkColorTheme');
    assertEq(s.isUserSet(r), false);
    assertEq(s.get(r), null);
    s.set(r, 'Solarized Dark');
    assertEq(s.get(r), 'Solarized Dark');
    assertEq(s.isUserSet(r), true);
    assert(fs.readText(path).includes('// mine'));
    s.reset(r);
    assertEq(fs.readText(path), original);
});

test('jsonFileSettings: set creates a missing settings.json', () => {
    const d = tmpDir();
    const s = new JsonFileSettings({fs, log: () => {}});
    s.set(ref(`${d}/settings.json`, 'a'), true);
    assertEq(JSON.parse(fs.readText(`${d}/settings.json`)), {a: true});
});

test('compositeSettings: routes jsonfile refs and others', () => {
    const calls = [];
    const g = {exists: () => true, get: () => 'g', set: () => calls.push('g'), isUserSet: () => true,
        reset: () => {}, destroy: () => calls.push('destroy')};
    const d = tmpDir();
    const c = new CompositeSettings(g, new JsonFileSettings({fs, log: () => {}}));
    assertEq(c.get({schema: 'org.x', key: 'k'}), 'g');
    c.set(ref(`${d}/settings.json`, 'a'), 1);
    assertEq(c.get(ref(`${d}/settings.json`, 'a')), 1);
    c.destroy();
    assertEq(calls, ['destroy']);
});

test('jsonFileSettings: writes through a symlinked settings.json', () => {
    const d = tmpDir();
    fs.writeText(`${d}/dotfiles/settings.json`, '{\n    "a": 1\n}\n');
    fs.symlink('../dotfiles/settings.json', `${d}/User/settings.json`);
    const s = new JsonFileSettings({fs, log: () => {}});
    const r = ref(`${d}/User/settings.json`, 'b');
    s.set(r, true);
    assertEq(fs.readLink(`${d}/User/settings.json`), '../dotfiles/settings.json');
    assertEq(JSON.parse(fs.readText(`${d}/dotfiles/settings.json`)), {a: 1, b: true});
    s.reset(r);
    assertEq(fs.readText(`${d}/dotfiles/settings.json`), '{\n    "a": 1\n}\n');
});
