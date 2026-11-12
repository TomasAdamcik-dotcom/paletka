// Keeps the connection to Paletka's native host, remembers the latest palette
// and passes it to every tab. The open port also keeps the service worker alive.
import {HOST, retryDelay, classifyFailure, browserId} from './connection.js';
import {firefoxThemeFor} from './firefoxTheme.js';

const api = globalThis.browser ?? globalThis.chrome;
const isFirefox = typeof globalThis.browser !== 'undefined' && !!api.runtime.getBrowserInfo;
const BROWSER = browserId({isFirefox, brands: (navigator.userAgentData?.brands ?? []).map(b => b.brand)});
const storage = api.storage.session ?? api.storage.local;

let failures = 0;
let state = 'connecting';
let palette = null;
const listeners = new Set();

function setState(next) {
    state = next;
    const problem = state === 'no-host' || state === 'needs-permission';
    api.action.setBadgeText({text: problem ? '!' : ''});
    for (const listener of listeners)
        listener();
}

// Firefox's own window follows the theme too (Chrome has no such API).
function themeBrowser() {
    if (!api.theme?.update)
        return;
    if (palette?.active)
        api.theme.update(firefoxThemeFor(palette));
    else
        api.theme.reset();
}

async function broadcast() {
    themeBrowser();
    await storage.set({palette});
    for (const tab of await api.tabs.query({}))
        api.tabs.sendMessage(tab.id, {type: 'palette', palette}).catch(() => {});
    for (const listener of listeners)
        listener();
}

function connect() {
    const port = api.runtime.connectNative(HOST);
    port.onMessage.addListener(msg => {
        if (msg?.type !== 'palette')
            return;
        failures = 0;
        if (state !== 'connected')
            setState('connected');
        const {type: _type, ...rest} = msg;
        palette = rest;
        broadcast();
    });
    port.onDisconnect.addListener(p => {
        const message = (p.error ?? api.runtime.lastError)?.message ?? '';
        failures++;
        setState(classifyFailure(message, BROWSER, failures));
        setTimeout(connect, retryDelay(failures - 1));
    });
    port.postMessage({type: 'hello', browser: BROWSER, version: api.runtime.getManifest().version});
}

api.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'get') {
        if (palette)
            reply({palette});
        else
            storage.get('palette').then(v => reply({palette: v.palette ?? null}));
        return true;
    }
    if (msg?.type === 'status') {
        reply({state, palette, browser: BROWSER});
        return false;
    }
    return false;
});

// The popup listens to state changes while it is open.
api.runtime.onConnect.addListener(port => {
    if (port.name !== 'status')
        return;
    const send = () => port.postMessage({state, palette, browser: BROWSER});
    listeners.add(send);
    port.onDisconnect.addListener(() => listeners.delete(send));
    send();
});

connect();
