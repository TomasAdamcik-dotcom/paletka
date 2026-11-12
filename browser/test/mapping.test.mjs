import {test} from 'node:test';
import assert from 'node:assert/strict';

import {parseRgb, luminance, saturation, mix, toCss} from '../src/recolor/colors.js';
import {mapBackground, mapText, mapBorder, isNeutralGradient} from '../src/recolor/mapping.js';

const P = Object.fromEntries(Object.entries({
    background: '#00252e', surface: '#0d3640', foreground: '#839496', link: '#7092a2',
    border: 'rgba(131, 148, 150, 0.15)',
}).map(([k, v]) => [k, parseRgb(v)]));
const WHITE = parseRgb('rgb(255, 255, 255)');
const css = c => c && toCss(c);

test('colors: rgb(), rgba() and hex parse; other syntaxes are left to the canvas', () => {
    assert.deepEqual(parseRgb('rgb(1, 2, 3)'), {r: 1, g: 2, b: 3, a: 1});
    assert.deepEqual(parseRgb('rgba(1, 2, 3, 0.5)'), {r: 1, g: 2, b: 3, a: 0.5});
    assert.deepEqual(parseRgb('rgb(1 2 3 / 0.25)'), {r: 1, g: 2, b: 3, a: 0.25});
    assert.deepEqual(parseRgb('#0d1117'), {r: 13, g: 17, b: 23, a: 1});
    assert.equal(parseRgb('oklch(50% 0.1 200)'), null);
    assert.equal(parseRgb('rgba(0, 0, 0, 0)').a, 0);
});

test('colors: luminance, saturation, mix, css', () => {
    assert.equal(luminance(WHITE), 1);
    assert.equal(saturation(parseRgb('#2da44e')) > 0.35, true);
    assert.equal(css(mix(parseRgb('#000000'), WHITE, 0.5)), 'rgba(128, 128, 128, 1)');
});

test('mapping: black text on a white page becomes the theme text color', () => {
    assert.equal(css(mapText(parseRgb('rgb(0, 0, 0)'), WHITE, P, {isLink: false})), css(P.foreground));
});

test('mapping: light text on a dark page (GitHub dark) becomes the theme text color', () => {
    const base = parseRgb('#0d1117');
    assert.equal(css(mapText(parseRgb('#e6edf3'), base, P, {isLink: false})), css(P.foreground));
});

test('mapping: weaker text stays weaker', () => {
    const gray = mapText(parseRgb('#777777'), WHITE, P, {isLink: false});
    assert.ok(luminance(gray) < luminance(P.foreground) && luminance(gray) > luminance(P.background));
});

test('mapping: links get the link color, other strong colors are kept', () => {
    assert.equal(css(mapText(parseRgb('#0645ad'), WHITE, P, {isLink: true})), css(P.link));
    assert.equal(mapText(parseRgb('#d73a49'), WHITE, P, {isLink: false}), null);
});

test('mapping: the page background becomes the theme background, cards the surface', () => {
    assert.equal(css(mapBackground(WHITE, WHITE, P)), css(P.background));
    assert.equal(css(mapBackground(parseRgb('#f4f4f4'), WHITE, P)), css(P.surface));
    // further from the page: raised above the surface, toward the text color
    const raised = mapBackground(parseRgb('#dddddd'), WHITE, P);
    assert.ok(luminance(raised) > luminance(P.surface) && luminance(raised) < luminance(P.foreground));
});

test('mapping: brand colors are kept', () => {
    assert.equal(mapBackground(parseRgb('#2da44e'), WHITE, P), null);
});

test('mapping: neutral borders get the theme border, colored ones are kept', () => {
    assert.equal(css(mapBorder(parseRgb('#dddddd'), P)), css(P.border));
    assert.equal(mapBorder(parseRgb('#0969da'), P), null);
});

test('mapping: a white fade is a neutral gradient, a colored one is not', () => {
    assert.equal(isNeutralGradient([parseRgb('rgba(255, 255, 255, 0)'), WHITE]), true);
    assert.equal(isNeutralGradient([parseRgb('#ff5f6d'), parseRgb('#ffc371')]), false);
});
