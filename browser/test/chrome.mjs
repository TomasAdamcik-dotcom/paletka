// Test helper: system Chrome with the built extension, Paletka's real native
// host (reading a temporary current.json) and a local server for fixtures.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

import {build} from '../build.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HOST_SCRIPT = path.resolve(root, '../extension/browser-host/paletka-host.js');
const CHROME_ID = 'minabhiklmiljdidinhogbakhkcfbgji';

export const SOLARIZED_DARK = {version: 1, active: true, family: 'solarized', dark: true, colors: {
    background: '#00252e', surface: '#0d3640', foreground: '#839496', muted: '#4f686c', link: '#7092a2',
    border: 'rgba(131, 148, 150, 0.15)', selection: 'rgba(38, 139, 210, 0.25)', accent: '#268bd2',
    headerbar_bg: '#073642', headerbar_fg: '#839496'}};
export const NORD_DARK = {version: 1, active: true, family: 'nord', dark: true, colors: {
    background: '#2e3440', surface: '#3b4252', foreground: '#d8dee9', muted: '#99a0ac', link: '#88c0d0',
    border: 'rgba(216, 222, 233, 0.15)', selection: 'rgba(136, 192, 208, 0.25)', accent: '#88c0d0',
    headerbar_bg: '#3b4252', headerbar_fg: '#d8dee9'}};
export const SOLARIZED_LIGHT = {version: 1, active: true, family: 'solarized', dark: false, colors: {
    background: '#fdf6e3', surface: '#eee8d5', foreground: '#586e75', muted: '#9fa59e', link: '#2075b5',
    border: 'rgba(88, 110, 117, 0.15)', selection: 'rgba(38, 139, 210, 0.25)', accent: '#268bd2',
    headerbar_bg: '#eee8d5', headerbar_fg: '#586e75'}};

export async function launch({palette = SOLARIZED_DARK} = {}) {
    build('chrome');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paletka-browser-'));
    const current = path.join(dir, 'current.json');
    const writePalette = p => {
        fs.writeFileSync(`${current}.tmp`, JSON.stringify(p));
        fs.renameSync(`${current}.tmp`, current);
    };
    writePalette(palette);
    const wrapper = path.join(dir, 'host.sh');
    fs.writeFileSync(wrapper, `#!/bin/sh\nPALETKA_CURRENT='${current}' XDG_DATA_HOME='${dir}/data' exec gjs -m '${HOST_SCRIPT}' "$@"\n`);
    fs.chmodSync(wrapper, 0o755);
    const profile = path.join(dir, 'profile');
    fs.mkdirSync(path.join(profile, 'NativeMessagingHosts'), {recursive: true});
    fs.writeFileSync(path.join(profile, 'NativeMessagingHosts', 'io.github.adamciktomas.paletka.json'), JSON.stringify({
        name: 'io.github.adamciktomas.paletka', description: 'test', path: wrapper, type: 'stdio',
        allowed_origins: [`chrome-extension://${CHROME_ID}/`]}));

    const fixtures = path.join(root, 'test', 'fixtures');
    const server = http.createServer((req, res) => {
        const file = path.join(fixtures, path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
        if (!file.startsWith(fixtures) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}).end(fs.readFileSync(file));
    }).listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome', headless: true, pipe: true, enableExtensions: true,
        userDataDir: profile, args: ['--no-first-run', '--no-default-browser-check'],
    });
    const id = await browser.installExtension(path.join(root, 'dist', 'chrome'));
    if (id !== CHROME_ID)
        throw new Error(`extension id ${id}, expected ${CHROME_ID}`);
    const url = name => `http://127.0.0.1:${server.address().port}/${name}`;
    const open = async (name, {width = 1280, height = 900} = {}) => {
        const page = await browser.newPage();
        await page.setViewport({width, height});
        await page.goto(url(name), {waitUntil: 'load'});
        return page;
    };
    const close = async () => {
        await browser.close();
        server.close();
        fs.rmSync(dir, {recursive: true, force: true});
    };
    return {browser, url, open, writePalette, close, dataDir: path.join(dir, 'data')};
}

// Polls fn (evaluated in the page) until it returns a truthy value.
export async function waitInPage(page, fn, arg, timeoutMs = 2000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
        const value = await page.evaluate(fn, arg).catch(() => null);
        if (value)
            return value;
        if (Date.now() > end)
            throw new Error(`timed out: ${fn}`);
        await new Promise(r => setTimeout(r, 20));
    }
}

export const cssColor = (page, color) => page.evaluate(c => {
    const d = document.createElement('div');
    d.style.color = c;
    document.body.append(d);
    const v = getComputedStyle(d).color;
    d.remove();
    return v;
}, color);
