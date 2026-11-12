// Manual check (needs network): screenshots of real sites recolored by the
// built extension. Usage: node test/real-sites.mjs <out-dir>
import fs from 'node:fs';

import {launch, SOLARIZED_DARK} from './chrome.mjs';

const SITES = {
    wikipedia: 'https://en.wikipedia.org/wiki/Bratislava',
    github: 'https://github.com/TomasAdamcik-dotcom/paletka',
    mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/color',
    hn: 'https://news.ycombinator.com/',
};
const out = process.argv[2] ?? 'real-sites';
fs.mkdirSync(out, {recursive: true});
const env = await launch({palette: SOLARIZED_DARK});
try {
    for (const [name, url] of Object.entries(SITES)) {
        const page = await env.browser.newPage();
        await page.setViewport({width: 1280, height: 900});
        await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'light'}]);
        await page.goto(url, {waitUntil: 'networkidle2', timeout: 45000}).catch(e => console.log(name, e.message));
        await new Promise(r => setTimeout(r, 1500));
        await page.screenshot({path: `${out}/${name}.png`});
        console.log(`${out}/${name}.png`);
        await page.close();
    }
} finally {
    await env.close();
}
