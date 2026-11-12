// Recoloring in real Chrome on local fixtures.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';

import {launch, waitInPage, cssColor, SOLARIZED_DARK, NORD_DARK, SOLARIZED_LIGHT} from './chrome.mjs';

let env;
before(async () => {
    env = await launch({palette: SOLARIZED_DARK});
});
after(async () => {
    await env?.close();
});

const style = (page, selector, prop) => page.evaluate((s, p) => {
    const el = document.querySelector(s) ?? document.querySelector('x-card')?.shadowRoot.querySelector(s);
    return getComputedStyle(el)[p];
}, selector, prop);
const done = page => waitInPage(page, () => performance.getEntriesByName('paletka-done').length > 0, null, 10000);

test('a white article gets the theme colors; media and brand colors stay', async () => {
    env.writePalette(SOLARIZED_DARK);
    const page = await env.open('article.html');
    await done(page);
    const c = SOLARIZED_DARK.colors;
    assert.equal(await style(page, 'html', 'backgroundColor'), await cssColor(page, c.background));
    assert.equal(await style(page, '#text', 'color'), await cssColor(page, c.foreground));
    assert.equal(await style(page, '#link', 'color'), await cssColor(page, c.link));
    assert.equal(await style(page, '#card', 'backgroundColor'), await cssColor(page, c.surface));
    assert.notEqual(await style(page, '#muted', 'color'), await cssColor(page, c.foreground));
    assert.equal(await style(page, '#brand', 'backgroundColor'), 'rgb(45, 164, 78)');
    assert.equal(await style(page, '#fade', 'backgroundImage'), 'none');
    assert.equal(await page.evaluate(() => document.getElementById('img').getAttribute('style')), null);
    await page.close();
});

test('a dark page is recolored into the theme too', async () => {
    const page = await env.open('dark.html');
    await done(page);
    const c = SOLARIZED_DARK.colors;
    assert.equal(await style(page, 'html', 'backgroundColor'), await cssColor(page, c.background));
    assert.equal(await style(page, '#text', 'color'), await cssColor(page, c.foreground));
    assert.notEqual(await style(page, '#box', 'backgroundColor'), 'rgb(22, 27, 34)');
    await page.close();
});

test('shadow roots, oklch() colors and nodes added later are recolored', async () => {
    const page = await env.open('components.html');
    await done(page);
    const fg = await cssColor(page, SOLARIZED_DARK.colors.foreground);
    assert.equal(await style(page, '#inner', 'color'), fg);
    assert.equal(await style(page, '#oklch', 'color'), fg);
    await waitInPage(page, want => {
        const late = [...document.querySelectorAll('.late')];
        return late.length === 100 && late.every(p => getComputedStyle(p).color !== 'rgb(51, 51, 51)') && want;
    }, fg, 4000);
    await page.close();
});

test('a theme switch recolors open pages; turning off restores the page', async () => {
    env.writePalette(SOLARIZED_DARK);
    const page = await env.open('article.html');
    await done(page);
    env.writePalette(NORD_DARK);
    const nord = await cssColor(page, NORD_DARK.colors.foreground);
    await waitInPage(page, want => getComputedStyle(document.getElementById('text')).color === want, nord, 1000);
    env.writePalette(SOLARIZED_LIGHT);
    const light = await cssColor(page, SOLARIZED_LIGHT.colors.background);
    await waitInPage(page, want => getComputedStyle(document.documentElement).backgroundColor === want, light, 1000);
    env.writePalette({version: 1, active: false});
    await waitInPage(page, () => getComputedStyle(document.getElementById('text')).color === 'rgb(34, 34, 34)', null, 1000);
    assert.equal(await page.evaluate(() => document.getElementById('inline').style.color), 'rgb(90, 90, 90)');
    assert.equal(await style(page, '#fade', 'backgroundImage') === 'none', false);
    assert.equal(await page.evaluate(() => document.getElementById('paletka-style')), null);
    env.writePalette(SOLARIZED_DARK);
    await page.close();
});

test('backgrounds from styles added later are recolored; mask icons use the text color', async () => {
    env.writePalette(SOLARIZED_DARK);
    const page = await env.open('late.html');
    const bg = await cssColor(page, SOLARIZED_DARK.colors.background);
    await waitInPage(page, want => getComputedStyle(document.body).backgroundColor === want, bg, 3000);
    const icon = await style(page, '#icon', 'backgroundColor');
    assert.notEqual(icon, 'rgb(32, 33, 34)');
    assert.equal(icon, await style(page, '#text', 'color'));
    await page.close();
});

test('inherited text deep in the page and in subtrees added later gets the full text color', async () => {
    env.writePalette(SOLARIZED_DARK);
    const page = await env.open('deep.html');
    const fg = await cssColor(page, SOLARIZED_DARK.colors.foreground);
    await waitInPage(page, want => getComputedStyle(document.getElementById('deep')).color === want, fg, 3000);
    await waitInPage(page, want => getComputedStyle(document.getElementById('late-deep'))?.color === want, fg, 3000);
    // Inheriting elements get no color of their own.
    assert.equal(await page.evaluate(() => document.getElementById('section').style.color), '');
    await page.close();
});

test('turning off restores the color scheme of a page without colors', async () => {
    env.writePalette(SOLARIZED_DARK);
    const page = await env.open('plain.html');
    const fg = await cssColor(page, SOLARIZED_DARK.colors.foreground);
    await waitInPage(page, want => getComputedStyle(document.getElementById('text')).color === want, fg);
    env.writePalette({version: 1, active: false});
    await waitInPage(page, () => getComputedStyle(document.getElementById('text')).color === 'rgb(0, 0, 0)', null, 1500);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('style') ?? ''), '');
    env.writePalette(SOLARIZED_DARK);
    await page.close();
});

test('a huge page is recolored in chunks without long freezes', async () => {
    env.writePalette(SOLARIZED_DARK);
    const page = await env.open('big.html');
    await done(page);
    const chunks = await page.evaluate(() => performance.getEntriesByName('paletka-chunk').map(e => e.duration));
    const first = chunks[0];
    assert.ok(first < 150, `first chunk ${first} ms`);
    assert.ok(Math.max(...chunks) < 100, `longest chunk ${Math.max(...chunks)} ms`);
    // Rows the parser added after the first pass arrive through the observer.
    const fg = await cssColor(page, SOLARIZED_DARK.colors.foreground);
    await waitInPage(page, want => getComputedStyle(document.querySelector('p:last-of-type')).color === want, fg, 10000);
    const all = await page.evaluate(() => performance.getEntriesByName('paletka-chunk').map(e => e.duration));
    assert.ok(Math.max(...all) < 100, `longest chunk ${Math.max(...all)} ms`);
    // A style added later makes Paletka look again, also in chunks.
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = 'span { background: #fafafa; }';
        document.head.append(style);
    });
    await waitInPage(page, () => performance.getEntriesByName('paletka-recheck').length > 5, null, 10000);
    await new Promise(r => setTimeout(r, 2000));
    const rechecks = await page.evaluate(() => performance.getEntriesByName('paletka-recheck').map(e => e.duration));
    assert.ok(Math.max(...rechecks) < 100, `longest recheck ${Math.max(...rechecks)} ms`);
    await page.close();
});
