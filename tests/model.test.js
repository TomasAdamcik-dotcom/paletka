import {test, assert, assertEq} from './harness.js';
import {loadBuiltin} from './fixtures.js';
import {
    validateFamily, normalizeFamily, uniqueId, slugify, duplicateFamily, setBaseColor,
    setOverride, clearOverride, setTerminalColor, resetTerminal, resolveActiveId, rename,
} from '../extension/lib/model.js';

const sol = loadBuiltin('solarized');
const ubuntu = loadBuiltin('ubuntu');

test('model: built-in families are valid', () => {
    assertEq(validateFamily(sol), {ok: true, errors: []});
    assertEq(validateFamily(ubuntu), {ok: true, errors: []});
});

test('model: invalid base color is reported by key', () => {
    const bad = JSON.parse(JSON.stringify(sol));
    bad.dark.base.accent = 'blue';
    const r = validateFamily(bad);
    assertEq(r.ok, false);
    assert(r.errors.some(e => e.includes('accent')), r.errors.join());
});

test('model: missing variant is invalid', () => {
    const bad = JSON.parse(JSON.stringify(sol));
    delete bad.light;
    assertEq(validateFamily(bad).ok, false);
});

test('model: wrong terminal palette length is invalid', () => {
    const bad = JSON.parse(JSON.stringify(sol));
    bad.light.terminal.palette = ['#000000'];
    assertEq(validateFamily(bad).ok, false);
});

test('model: slugify and uniqueId', () => {
    assertEq(slugify('  Moja Téma!! '), 'moja-tema');
    assertEq(uniqueId('Solarized', ['solarized']), 'solarized-2');
    assertEq(uniqueId('Solarized', ['solarized', 'solarized-2']), 'solarized-3');
    assertEq(uniqueId('!!!', []), 'theme');
});

test('model: normalize fills defaults', () => {
    const f = normalizeFamily({version: 1, id: 'x', name: 'X', kind: 'custom',
        light: {base: sol.light.base}, dark: {base: sol.dark.base}});
    assertEq(f.light.overrides, {});
    assertEq(f.light.wallpaper, {type: 'none'});
    assertEq(f.light.iconTheme, null);
    assertEq(f.dark.terminal.palette.length, 16);
    assertEq(validateFamily(f).ok, true);
});

test('model: duplicate ubuntu yields yaru-like custom family', () => {
    const d = duplicateFamily(ubuntu, 'Mine', []);
    assertEq(d.id, 'mine');
    assertEq(d.kind, 'custom');
    assertEq(d.light.base.accent, '#e95420');
    assertEq(validateFamily(d).ok, true);
});

test('model: duplicate solarized copies colors under new id', () => {
    const d = duplicateFamily(sol, 'Solarized', ['solarized']);
    assertEq(d.id, 'solarized-2');
    assertEq(d.dark.base, sol.dark.base);
});

test('model: edit helpers do not mutate input', () => {
    const before = JSON.stringify(sol);
    const f = setBaseColor(sol, 'light', 'accent', '#d33682');
    assertEq(f.light.base.accent, '#d33682');
    assertEq(JSON.stringify(sol), before);
    const o = setOverride(f, 'dark', 'headerbar_bg', '#000000');
    assertEq(o.dark.overrides.headerbar_bg, '#000000');
    assertEq(clearOverride(o, 'dark', 'headerbar_bg').dark.overrides, {});
    assertEq(setTerminalColor(sol, 'dark', 3, '#ffffff').dark.terminal.palette[3], '#ffffff');
    assertEq(setTerminalColor(sol, 'dark', 'cursor', '#ffffff').dark.terminal.cursor, '#ffffff');
    assertEq(resetTerminal(sol, 'dark').dark.terminal.background, sol.dark.base.background);
    assertEq(rename(sol, 'Nové').name, 'Nové');
    assertEq(JSON.stringify(sol), before);
});

test('model: resolveActiveId falls back to ubuntu', () => {
    assertEq(resolveActiveId([ubuntu, sol], 'gone'), 'ubuntu');
    assertEq(resolveActiveId([ubuntu, sol], 'solarized'), 'solarized');
});

test('model: names that could break generated files are invalid', () => {
    for (const name of ['a */ window { opacity: 0 } /*', 'line\nbreak', 'tab\there', 'x'.repeat(81)]) {
        const f = JSON.parse(JSON.stringify(sol));
        f.name = name;
        assertEq(validateFamily(f).ok, false, JSON.stringify(name));
    }
});

test('model: icon theme must be a plain directory name', () => {
    for (const icon of ['../evil', 'a/b', '..', '.', 'bad\nname']) {
        const f = JSON.parse(JSON.stringify(sol));
        f.dark.iconTheme = icon;
        assertEq(validateFamily(f).ok, false, JSON.stringify(icon));
    }
    const ok = JSON.parse(JSON.stringify(sol));
    ok.dark.iconTheme = 'Papirus-Dark';
    assertEq(validateFamily(ok).ok, true);
});

test('model: a duplicate of a long-named theme is still valid', () => {
    const f = JSON.parse(JSON.stringify(sol));
    f.name = 'x'.repeat(80);
    assertEq(validateFamily(duplicateFamily(f, `${f.name} (copy)`, [])).ok, true);
});
