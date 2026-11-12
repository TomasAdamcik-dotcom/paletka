// Content script entry: gets the palette from the background and recolors the
// page with it (Recolorer from recolor/recolorer.js, concatenated by build.mjs).
const api = globalThis.browser ?? globalThis.chrome;
let recolorer = null;
let disabled = false;

function show(palette) {
    if (disabled || !palette?.active) {
        recolorer?.revert();
        recolorer = null;
        return;
    }
    if (recolorer)
        recolorer.update(palette);
    else {
        recolorer = new Recolorer(document, palette);
        recolorer.apply();
    }
}

async function start() {
    const {disabledSites = [], enabled = true} = await api.storage.sync.get(['disabledSites', 'enabled']);
    disabled = !enabled || disabledSites.includes(location.hostname);
    const {palette} = await api.runtime.sendMessage({type: 'get'}) ?? {};
    show(palette);
}

api.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'palette')
        show(msg.palette);
    else if (msg?.type === 'site')
        reply({site: location.hostname});
    return false;
});
api.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.disabledSites || changes.enabled))
        start();
});
start();
