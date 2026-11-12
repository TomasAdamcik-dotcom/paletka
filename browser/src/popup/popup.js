// The toolbar popup: connection state and theme, a global switch and a switch
// for the site in the current tab.
import {statusText} from './status.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = id => document.getElementById(id);

const port = api.runtime.connect({name: 'status'});
port.onMessage.addListener(status => {
    $('status').textContent = statusText(status);
});

async function currentSite() {
    const [tab] = await api.tabs.query({active: true, currentWindow: true});
    if (!tab?.id)
        return null;
    try {
        const reply = await api.tabs.sendMessage(tab.id, {type: 'site'}, {frameId: 0});
        return reply?.site || null;
    } catch {
        return null; // no content script there (browser pages, the store)
    }
}

async function init() {
    const {enabled = true, disabledSites = []} = await api.storage.sync.get(['enabled', 'disabledSites']);
    $('enabled').checked = enabled;
    $('enabled').addEventListener('change', () => api.storage.sync.set({enabled: $('enabled').checked}));

    const site = await currentSite();
    if (!site)
        return;
    $('site').textContent = site;
    $('site-enabled').checked = !disabledSites.includes(site);
    $('site-row').hidden = false;
    $('site-enabled').addEventListener('change', async () => {
        const {disabledSites: list = []} = await api.storage.sync.get('disabledSites');
        const others = list.filter(s => s !== site);
        api.storage.sync.set({disabledSites: $('site-enabled').checked ? others : [...others, site]});
    });
}

init();
