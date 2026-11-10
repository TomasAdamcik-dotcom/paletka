import {test, assert, assertEq, assertThrows, tmpDir} from './harness.js';
import {EXT_DIR} from './fixtures.js';
import {GioFs} from '../extension/lib/adapters.js';
import {ThemeStore} from '../extension/lib/store.js';
import {duplicateFamily} from '../extension/lib/model.js';

const fs = new GioFs();
const BUILTINS = ['ubuntu', 'solarized', 'gruvbox', 'nord', 'dracula'];

function makeStore() {
    const userDir = `${tmpDir()}/themes`;
    const logs = [];
    const store = new ThemeStore({builtinDir: `${EXT_DIR}/themes`, userDir, fs, log: m => logs.push(m)});
    return {store, userDir, logs};
}

test('store: built-ins load first with empty user dir', () => {
    const {store} = makeStore();
    assertEq(store.loadAll().map(f => f.id), BUILTINS);
});

test('store: saved family is loaded, sorted by name', () => {
    const {store} = makeStore();
    const sol = store.get('solarized');
    store.save(duplicateFamily(sol, 'Zeta', ['solarized']));
    store.save(duplicateFamily(sol, 'Alpha', ['solarized']));
    assertEq(store.loadAll().map(f => f.id), [...BUILTINS, 'alpha', 'zeta']);
    assertEq(store.get('alpha').name, 'Alpha');
});

test('store skips invalid files', () => {
    const {store, userDir, logs} = makeStore();
    fs.writeText(`${userDir}/bad.json`,
        '{"version":1,"id":"bad","name":"Bad","kind":"custom","light":{"base":{"background":"nope"}}}');
    fs.writeText(`${userDir}/garbage.json`, '{not json');
    fs.writeText(`${userDir}/solarized.json`, JSON.stringify(store.get('solarized')));
    fs.writeText(`${userDir}/notes.txt`, 'ignored');
    store.save(duplicateFamily(store.get('solarized'), 'Good', []));
    assertEq(store.loadAll().map(f => f.id), [...BUILTINS, 'good']);
    assertEq(logs.length, 3);
});

test('store: built-ins are read-only', () => {
    const {store} = makeStore();
    assertThrows(() => store.save(store.get('solarized')));
    assertThrows(() => store.remove('ubuntu'));
});

test('store: remove deletes user family', () => {
    const {store} = makeStore();
    store.save(duplicateFamily(store.get('solarized'), 'Gone', []));
    store.remove('gone');
    assertEq(store.get('gone'), null);
});

test('store: import assigns unique id, export round-trips', () => {
    const {store} = makeStore();
    const d = tmpDir();
    store.exportTo('solarized', `${d}/sol.json`);
    const imported = store.importFrom(`${d}/sol.json`);
    assertEq(imported.id, 'solarized-2');
    assertEq(imported.kind, 'custom');
    assert(store.get('solarized-2') !== null);
    fs.writeText(`${d}/bad.json`, '{}');
    assertThrows(() => store.importFrom(`${d}/bad.json`));
});

test('store: file whose name differs from its id is skipped (I3)', () => {
    const {store, userDir, logs} = makeStore();
    const fam = duplicateFamily(store.get('solarized'), 'Foo', []);
    fs.writeText(`${userDir}/foo (1).json`, JSON.stringify(fam));
    assertEq(store.loadAll().map(f => f.id), BUILTINS);
    assertEq(logs.length, 1);
});

test('store: takenIds includes invalid files so they are never overwritten (I4)', () => {
    const {store, userDir} = makeStore();
    fs.writeText(`${userDir}/my-theme.json`, '{broken');
    const ids = store.takenIds();
    assert(ids.includes('my-theme') && ids.includes('ubuntu') && ids.includes('solarized'), `${ids}`);
    const d = tmpDir();
    const fam = duplicateFamily(store.get('solarized'), 'My Theme', []);
    fs.writeText(`${d}/x.json`, JSON.stringify(fam));
    assertEq(store.importFrom(`${d}/x.json`).id, 'my-theme-2');
    assertEq(fs.readText(`${userDir}/my-theme.json`), '{broken');
});
