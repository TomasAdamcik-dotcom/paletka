import {test, assert, assertEq} from './harness.js';
import {setup, VSCODE_SETTINGS} from './applierSetup.js';
import {parseJsonc} from '../extension/lib/jsonc.js';
import {validateFamily, normalizeFamily, setVscodeTheme} from '../extension/lib/model.js';

const read = (fs, p) => parseJsonc(fs.readText(p));

test('vscode: applying Solarized sets the preferred themes and keeps comments', async () => {
    const {applier, fs, vscodeSettings, sol} = setup({vscode: VSCODE_SETTINGS});
    await applier.applyFamily(sol, false, {restartServices: false});
    const s = read(fs, vscodeSettings);
    assertEq(s['window.autoDetectColorScheme'], true);
    assertEq(s['workbench.preferredLightColorTheme'], 'Solarized Light');
    assertEq(s['workbench.preferredDarkColorTheme'], 'Solarized Dark');
    assertEq(s['editor.fontSize'], 14);
    assert(fs.readText(vscodeSettings).includes('// mine'));
});

test('vscode: restore to Ubuntu gives back the file byte-identical', async () => {
    const {applier, fs, vscodeSettings, sol} = setup({vscode: VSCODE_SETTINGS});
    await applier.applyFamily(sol, true, {restartServices: false});
    await applier.restoreSystem(true, {restartServices: false});
    assertEq(fs.readText(vscodeSettings), VSCODE_SETTINGS);
});

test('vscode: a theme the user picked meanwhile survives restore', async () => {
    const {applier, fs, vscodeSettings, sol} = setup({vscode: VSCODE_SETTINGS});
    await applier.applyFamily(sol, false, {restartServices: false});
    fs.writeText(vscodeSettings, fs.readText(vscodeSettings).replace('"Solarized Dark"', '"Monokai"'));
    await applier.restoreSystem(false, {restartServices: false});
    const s = read(fs, vscodeSettings);
    assertEq(s['workbench.preferredDarkColorTheme'], 'Monokai');
    assertEq(s['workbench.preferredLightColorTheme'], undefined);
});

test('vscode: nothing is created when VS Code is not installed', async () => {
    const {applier, fs, vscodeSettings, sol} = setup();
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(fs.exists(vscodeSettings), false);
});

test('vscode: a family without VS Code themes reverts the keys', async () => {
    const {applier, fs, vscodeSettings, sol} = setup({vscode: VSCODE_SETTINGS});
    await applier.applyFamily(sol, false, {restartServices: false});
    let other = setVscodeTheme(sol, 'light', null);
    other = setVscodeTheme(other, 'dark', null);
    await applier.applyFamily({...other, id: 'other'}, false, {restartServices: false});
    assertEq(fs.readText(vscodeSettings), VSCODE_SETTINGS);
});

test('vscode: an unparsable settings.json is left untouched', async () => {
    const {applier, fs, vscodeSettings, settings, sol} = setup({vscode: '{ "a": '});
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(fs.readText(vscodeSettings), '{ "a": ');
    assert(settings.values.size > 0);
});

test('vscode: model validates and normalizes vscodeTheme', () => {
    const {sol} = setup();
    assertEq(sol.light.vscodeTheme, 'Solarized Light');
    const bad = JSON.parse(JSON.stringify(sol));
    bad.dark.vscodeTheme = 42;
    assertEq(validateFamily(bad).ok, false);
    const n = normalizeFamily({...sol, light: {base: sol.light.base}, dark: {base: sol.dark.base}});
    assertEq(n.light.vscodeTheme, null);
});

test('vscode: keys first written after the snapshot are still reverted on restore', async () => {
    const {applier, fs, vscodeSettings, sol} = setup({vscode: '{ "a": '});
    await applier.applyFamily(sol, false, {restartServices: false});
    fs.writeText(vscodeSettings, VSCODE_SETTINGS);
    await applier.applyFamily(sol, false, {restartServices: false});
    assertEq(read(fs, vscodeSettings)['workbench.preferredLightColorTheme'], 'Solarized Light');
    await applier.restoreSystem(false, {restartServices: false});
    assertEq(fs.readText(vscodeSettings), VSCODE_SETTINGS);
});

test('vscode: a theme that is not installed in VS Code is not set', async () => {
    const {applier, fs, vscodeSettings, sol} = setup({vscode: VSCODE_SETTINGS});
    let fam = setVscodeTheme(sol, 'dark', 'Nord');
    fam = setVscodeTheme(fam, 'light', 'Nope Light');
    await applier.applyFamily(fam, false, {restartServices: false});
    assertEq(fs.readText(vscodeSettings), VSCODE_SETTINGS);
});

test('vscode: only the installed variant theme is set', async () => {
    const {applier, fs, vscodeSettings, sol} = setup({vscode: VSCODE_SETTINGS});
    const fam = setVscodeTheme(sol, 'dark', 'Nord');
    await applier.applyFamily(fam, false, {restartServices: false});
    const s = read(fs, vscodeSettings);
    assertEq(s['workbench.preferredLightColorTheme'], 'Solarized Light');
    assertEq(s['workbench.preferredDarkColorTheme'], undefined);
});

const withExtension = (fam, variant, theme, ext) =>
    ({...fam, [variant]: {...fam[variant], vscodeTheme: theme, vscodeExtension: ext}});

test('vscode: a missing theme with a known extension produces an install suggestion', async () => {
    const {applier, sol} = setup({vscode: VSCODE_SETTINGS});
    let fam = withExtension(sol, 'dark', 'Nord', 'arcticicestudio.nord-visual-studio-code');
    fam = withExtension(fam, 'light', 'Nord Light', 'arcticicestudio.nord-visual-studio-code');
    fam = {...fam, id: 'nord', name: 'Nord'};
    const {warnings} = await applier.applyFamily(fam, true, {restartServices: false});
    assertEq(warnings, [{code: 'vscode-theme-missing', family: 'nord', name: 'Nord',
        extensions: ['arcticicestudio.nord-visual-studio-code']}]);
});

test('vscode: no install suggestion when the theme is installed, unknown, or VS Code is absent', async () => {
    const a = setup({vscode: VSCODE_SETTINGS});
    assertEq((await a.applier.applyFamily(withExtension(a.sol, 'dark', 'Solarized Dark', 'x.y'), true,
        {restartServices: false})).warnings, []);
    const b = setup({vscode: VSCODE_SETTINGS});
    assertEq((await b.applier.applyFamily(setVscodeTheme(b.sol, 'dark', 'Nord'), true,
        {restartServices: false})).warnings, []);
    const c = setup();
    assertEq((await c.applier.applyFamily(withExtension(c.sol, 'dark', 'Nord', 'a.b'), true,
        {restartServices: false})).warnings, []);
});

test('vscode: variant switches never suggest installs', async () => {
    const {applier, sol} = setup({vscode: VSCODE_SETTINGS});
    const fam = withExtension(sol, 'dark', 'Nord', 'a.b');
    await applier.applyFamily(fam, false, {restartServices: false});
    assertEq(applier.applyVariant(fam, true).warnings, []);
});

test('vscode: model validates vscodeExtension', () => {
    const {sol} = setup();
    assertEq(validateFamily(withExtension(sol, 'dark', 'Nord', 'arcticicestudio.nord-visual-studio-code')).ok, true);
    assertEq(validateFamily(withExtension(sol, 'dark', 'Nord', 'rm -rf /')).ok, false);
    assertEq(normalizeFamily(sol).dark.vscodeExtension, null);
});
