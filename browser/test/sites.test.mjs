// Per-site and global switches, and the popup, in real Chrome.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {launch, waitInPage, cssColor, SOLARIZED_DARK} from './chrome.mjs';

const CHROME_ID = 'minabhiklmiljdidinhogbakhkcfbgji';
const htmlBg = () => getComputedStyle(document.documentElement).backgroundColor;

async function worker(browser) {
    const target = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().includes(CHROME_ID));
    return target.worker();
}

test('a disabled site keeps its colors and is recolored again when enabled', async () => {
    const env = await launch({palette: SOLARIZED_DARK});
    try {
        const sw = await worker(env.browser);
        const page = await env.open('article.html');
        const themed = await cssColor(page, SOLARIZED_DARK.colors.background);
        await waitInPage(page, want => getComputedStyle(document.documentElement).backgroundColor === want, themed);
        await sw.evaluate(() => chrome.storage.sync.set({disabledSites: ['127.0.0.1']}));
        await waitInPage(page, () => getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)');
        await page.reload({waitUntil: 'load'});
        await new Promise(r => setTimeout(r, 500));
        assert.equal(await page.evaluate(htmlBg), 'rgba(0, 0, 0, 0)');
        await sw.evaluate(() => chrome.storage.sync.set({disabledSites: []}));
        await waitInPage(page, want => getComputedStyle(document.documentElement).backgroundColor === want, themed);
        await sw.evaluate(() => chrome.storage.sync.set({enabled: false}));
        await waitInPage(page, () => getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)');
    } finally {
        await env.close();
    }
});

test('the popup shows the theme and its switches change the settings', async () => {
    const env = await launch({palette: SOLARIZED_DARK});
    try {
        const sw = await worker(env.browser);
        const page = await env.browser.newPage();
        await page.goto(`chrome-extension://${CHROME_ID}/popup/popup.html`);
        await waitInPage(page, () => document.getElementById('status').textContent === 'Solarized, dark');
        assert.equal(await page.evaluate(() => document.getElementById('enabled').checked), true);
        await page.click('#enabled');
        await waitInPage(page, () => true);
        assert.equal(await sw.evaluate(() => chrome.storage.sync.get('enabled').then(v => v.enabled)), false);
        // No web page in this tab: the site switch is hidden.
        assert.equal(await page.evaluate(() => document.getElementById('site-row').hidden), true);
    } finally {
        await env.close();
    }
});
