// Load measurements (not a test): CPU and memory the content script adds on
// pages that change all the time. Run: node test/perf.mjs
import {launch, SOLARIZED_DARK} from './chrome.mjs';

const INACTIVE = {version: 1, active: false};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function metrics(page) {
    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('Performance.enable');
    const {metrics: m} = await cdp.send('Performance.getMetrics');
    const get = name => m.find(x => x.name === name)?.value ?? 0;
    return {nodes: get('Nodes'), heapMB: get('JSHeapUsedSize') / 1e6, scriptS: get('ScriptDuration'),
        styleS: get('RecalcStyleDuration'), taskS: get('TaskDuration')};
}

const recheckMs = page => page.evaluate(() =>
    performance.getEntriesByName('paletka-recheck').reduce((s, e) => s + e.duration, 0)
    + performance.getEntriesByName('paletka-chunk').reduce((s, e) => s + e.duration, 0));

// A chat: 2000 messages, then every 50 ms 50 old ones go and 50 new ones come.
async function chat(env, seconds) {
    const page = await env.open('plain.html');
    await sleep(500);
    await page.evaluate(() => {
        const list = document.body;
        let n = 0;
        const add = () => {
            const m = document.createElement('div');
            m.innerHTML = `<p style="color:#222">Message ${n++}</p><span style="color:#666">12:00</span><a href="#">reply</a>`;
            list.append(m);
        };
        for (let i = 0; i < 2000; i++)
            add();
        window.churn = setInterval(() => {
            for (let i = 0; i < 50; i++) {
                list.firstElementChild?.remove();
                add();
            }
        }, 50);
    });
    await sleep(2000);
    const a = await metrics(page);
    await sleep(seconds * 1000);
    const b = await metrics(page);
    await page.evaluate(() => clearInterval(window.churn));
    const ours = await recheckMs(page);
    await page.close();
    return {nodesStart: a.nodes, nodesEnd: b.nodes, heapStart: a.heapMB.toFixed(1), heapEnd: b.heapMB.toFixed(1),
        taskPerS: ((b.taskS - a.taskS) / seconds * 100).toFixed(1) + '%', paletkaMs: ours.toFixed(0)};
}

// CSS-in-JS: 20 000 elements, a new <style> every 100 ms.
async function cssInJs(env, seconds) {
    const page = await env.open('plain.html');
    await page.evaluate(() => {
        for (let i = 0; i < 5000; i++) {
            const d = document.createElement('div');
            d.innerHTML = `<p style="color:#222">Row ${i} <a href="#">x</a> <span>y</span></p>`;
            document.body.append(d);
        }
    });
    await sleep(3000);
    const a = await metrics(page);
    const before = await recheckMs(page);
    await page.evaluate(() => {
        let n = 0;
        window.css = setInterval(() => {
            const s = document.createElement('style');
            s.textContent = `.c${n++} { color: red; }`;
            document.head.append(s);
        }, 100);
    });
    await sleep(seconds * 1000);
    const b = await metrics(page);
    await page.evaluate(() => clearInterval(window.css));
    const ours = await recheckMs(page) - before;
    await page.close();
    return {taskPerS: ((b.taskS - a.taskS) / seconds * 100).toFixed(1) + '%', paletkaMs: ours.toFixed(0),
        paletkaPerS: (ours / seconds / 10).toFixed(1) + '%'};
}

async function idleBig(env, seconds) {
    const page = await env.open('big.html');
    await sleep(8000);
    const a = await metrics(page);
    await sleep(seconds * 1000);
    const b = await metrics(page);
    await page.close();
    return {nodes: b.nodes, heapMB: b.heapMB.toFixed(1), idleTaskPerS: ((b.taskS - a.taskS) / seconds * 100).toFixed(2) + '%'};
}

for (const [label, palette] of [['off', INACTIVE], ['on', SOLARIZED_DARK]]) {
    const env = await launch({palette});
    console.log(label, 'chat 20s     ', JSON.stringify(await chat(env, 20)));
    console.log(label, 'css-in-js 10s', JSON.stringify(await cssInJs(env, 10)));
    console.log(label, 'big idle 10s ', JSON.stringify(await idleBig(env, 10)));
    await env.close();
}
