import {test, assert, assertEq, assertThrows} from './harness.js';
import {parseHex, toHex, toCss, mix, withAlpha, contrastRatio, readableOn, hue, isValidHex} from '../extension/lib/color.js';

test('color: parseHex 6 digits', () => {
    assertEq(parseHex('#fdf6e3'), {r: 253, g: 246, b: 227, a: 1});
});

test('color: parseHex 3 digits', () => {
    assertEq(parseHex('#abc'), {r: 170, g: 187, b: 204, a: 1});
});

test('color: parseHex 8 digits has alpha', () => {
    assertEq(parseHex('#00000080').a, 0.502);
});

test('color: parseHex rejects names', () => {
    assertThrows(() => parseHex('red'));
    assert(!isValidHex('red'));
    assert(isValidHex('#ABCDEF'));
});

test('color: mix black and white is gray', () => {
    assertEq(toHex(mix(parseHex('#000000'), parseHex('#ffffff'), 0.5)), '#808080');
});

test('color: toCss with alpha', () => {
    assertEq(toCss(withAlpha(parseHex('#000000'), 0.07)), 'rgba(0, 0, 0, 0.07)');
    assertEq(toCss(parseHex('#FDF6E3')), '#fdf6e3');
});

test('color: contrast black on white is 21', () => {
    assert(Math.abs(contrastRatio(parseHex('#000'), parseHex('#fff')) - 21) < 0.01);
});

test('color: readableOn picks white on blue, dark on cream', () => {
    assertEq(toHex(readableOn(parseHex('#268bd2'))), '#ffffff');
    assertEq(toCss(readableOn(parseHex('#fdf6e3'))), 'rgba(0, 0, 0, 0.8)');
});

test('color: hue of red is 0', () => {
    assertEq(Math.round(hue(parseHex('#ff0000'))), 0);
    assertEq(Math.round(hue(parseHex('#0000ff'))), 240);
});
