import {test, assertEq, tmpDir} from './harness.js';
import {GioFs} from '../extension/lib/adapters.js';
import {listVscodeThemes} from '../extension/lib/vscodeThemes.js';

test('vscodeThemes: reads themes from extension package.json files', () => {
    const fs = new GioFs();
    const a = tmpDir(), b = tmpDir();
    fs.writeText(`${a}/theme-solarized-light/package.json`, JSON.stringify({contributes: {themes: [
        {id: 'Solarized Light', label: '%themeLabel%', uiTheme: 'vs'}]}}));
    fs.writeText(`${a}/theme-defaults/package.json`, JSON.stringify({contributes: {themes: [
        {id: 'Default Dark Modern', label: '%x%', uiTheme: 'vs-dark'},
        {label: '%untranslatable%', uiTheme: 'vs'},
        {label: 'HC', uiTheme: 'hc-black'}]}}));
    fs.writeText(`${b}/someone.nord-1.0/package.json`, JSON.stringify({contributes: {themes: [
        {label: 'Nord', uiTheme: 'vs-dark'}]}}));
    fs.writeText(`${b}/broken/package.json`, '{nope');
    fs.writeText(`${b}/no-themes/package.json`, '{"name": "x"}');
    assertEq(listVscodeThemes(fs, [a, b, `${a}/missing`]), [
        {id: 'Default Dark Modern', dark: true},
        {id: 'HC', dark: true},
        {id: 'Nord', dark: true},
        {id: 'Solarized Light', dark: false},
    ]);
});
