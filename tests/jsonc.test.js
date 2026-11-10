import {test, assertEq, assertThrows} from './harness.js';
import {parseJsonc, setTopLevel, removeTopLevel} from '../extension/lib/jsonc.js';

const SAMPLE = `{
    // my editor
    "editor.fontSize": 14,
    "workbench.colorTheme": "Monokai", /* keep me */
    "nested": {"workbench.colorTheme": "inner"},
    "url": "http://x//y}",
}
`;

test('jsonc: parses comments and trailing commas', () => {
    assertEq(parseJsonc(SAMPLE)['workbench.colorTheme'], 'Monokai');
    assertEq(parseJsonc(SAMPLE).url, 'http://x//y}');
    assertThrows(() => parseJsonc('{"a": }'));
    assertThrows(() => parseJsonc('[1]'));
});

test('jsonc: set existing key changes only its value', () => {
    const out = setTopLevel(SAMPLE, 'workbench.colorTheme', 'Solarized Light');
    assertEq(out, SAMPLE.replace('"Monokai"', '"Solarized Light"'));
});

test('jsonc: set new key appends to non-empty object with trailing comma', () => {
    const out = setTopLevel(SAMPLE, 'window.autoDetectColorScheme', true);
    assertEq(parseJsonc(out)['window.autoDetectColorScheme'], true);
    assertEq(parseJsonc(out).nested, {'workbench.colorTheme': 'inner'});
    assertEq(out.startsWith(SAMPLE.slice(0, SAMPLE.indexOf('"url"'))), true);
});

test('jsonc: set new key in object without trailing comma and in empty object', () => {
    const a = setTopLevel('{\n    "a": 1\n}\n', 'b', 'x');
    assertEq(parseJsonc(a), {a: 1, b: 'x'});
    assertEq(a, '{\n    "a": 1,\n    "b": "x"\n}\n');
    assertEq(parseJsonc(setTopLevel('{}', 'b', 2)), {b: 2});
    assertEq(parseJsonc(setTopLevel('{\n  // only a comment\n}', 'b', 2)), {b: 2});
});

test('jsonc: remove first, middle and last keys', () => {
    const text = '{\n    "a": 1,\n    "b": 2,\n    "c": 3\n}\n';
    assertEq(removeTopLevel(text, 'a'), '{\n    "b": 2,\n    "c": 3\n}\n');
    assertEq(removeTopLevel(text, 'b'), '{\n    "a": 1,\n    "c": 3\n}\n');
    assertEq(removeTopLevel(text, 'c'), '{\n    "a": 1,\n    "b": 2\n}\n');
    assertEq(removeTopLevel(text, 'zzz'), text);
});

test('jsonc: add then remove round-trips byte-identical', () => {
    let t = setTopLevel(SAMPLE, 'workbench.preferredDarkColorTheme', 'Solarized Dark');
    t = removeTopLevel(t, 'workbench.preferredDarkColorTheme');
    assertEq(parseJsonc(t), parseJsonc(SAMPLE));
    const plain = '{\n    "diffEditor.codeLens": true,\n    "gitlens.ai.model": "vscode"\n}';
    assertEq(removeTopLevel(setTopLevel(plain, 'x', true), 'x'), plain);
});

test('jsonc: removing a last key that has its own trailing comma keeps the previous comma', () => {
    const text = '{\n    "a": 1,\n    // "editor.fontSize": 20,\n}\n';
    const added = setTopLevel(text, 'k', true);
    assertEq(removeTopLevel(added, 'k'), text);
    assertEq(removeTopLevel('{\n    "a": 1,\n    "b": 2,\n}\n', 'b'), '{\n    "a": 1,\n}\n');
});
