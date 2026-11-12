// The extension, Paletka's host and a theme switch, in real Chrome.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {launch, waitInPage, cssColor, SOLARIZED_DARK, NORD_DARK} from './chrome.mjs';

const htmlBackground = () => getComputedStyle(document.documentElement).backgroundColor;

test('open pages get the palette and follow a theme switch', async () => {
    const env = await launch({palette: SOLARIZED_DARK});
    try {
        const pages = [await env.open('article.html'), await env.open('article.html')];
        const solarized = await cssColor(pages[0], SOLARIZED_DARK.colors.background);
        for (const page of pages)
            await waitInPage(page, want => getComputedStyle(document.documentElement).backgroundColor === want, solarized);

        const nord = await cssColor(pages[0], NORD_DARK.colors.background);
        const t = Date.now();
        env.writePalette(NORD_DARK);
        for (const page of pages)
            await waitInPage(page, want => getComputedStyle(document.documentElement).backgroundColor === want, nord, 500);
        assert.ok(Date.now() - t < 500, `switch took ${Date.now() - t} ms`);

        env.writePalette({version: 1, active: false});
        await waitInPage(pages[0], want => getComputedStyle(document.documentElement).backgroundColor !== want, nord);
        assert.equal(await pages[0].evaluate(htmlBackground), 'rgba(0, 0, 0, 0)');
    } finally {
        await env.close();
    }
});

test('the extension says hello so Paletka shows it as connected', async () => {
    const env = await launch();
    try {
        const fs = await import('node:fs');
        const seen = `${env.dataDir}/paletka/browser-host/seen-chrome.json`;
        const end = Date.now() + 3000;
        while (!fs.existsSync(seen) && Date.now() < end)
            await new Promise(r => setTimeout(r, 50));
        assert.equal(JSON.parse(fs.readFileSync(seen, 'utf8')).version, '1.1.0');
    } finally {
        await env.close();
    }
});

test('after six idle minutes a switch still arrives', {skip: !process.env.SLOW}, async () => {
    const env = await launch({palette: SOLARIZED_DARK});
    try {
        const page = await env.open('article.html');
        await new Promise(r => setTimeout(r, 6 * 60 * 1000));
        const nord = await cssColor(page, NORD_DARK.colors.background);
        env.writePalette(NORD_DARK);
        await waitInPage(page, want => getComputedStyle(document.documentElement).backgroundColor === want, nord, 1000);
    } finally {
        await env.close();
    }
});
