import Gio from 'gi://Gio';

import {test, assert, assertEq, tmpDir} from './harness.js';
import {EXT_DIR} from './fixtures.js';
import {setup} from './applierSetup.js';
import {GioFs} from '../extension/lib/adapters.js';
import {defaultPaths} from '../extension/lib/paths.js';
import {
    BROWSERS, HOST_NAME, CHROME_EXTENSION_ID, FIREFOX_EXTENSION_ID,
    detectBrowsers, installHost, removeHost, hostState, removeAllHosts,
} from '../extension/lib/browsers.js';

const fs = new GioFs();
const byId = id => BROWSERS.find(b => b.id === id);

function env() {
    const root = tmpDir();
    const paths = defaultPaths({configDir: `${root}/config`, dataDir: `${root}/data`, cacheDir: `${root}/cache`});
    paths.home = `${root}/home`;
    paths.binDirs = [`${root}/bin`, `${root}/snap/bin`];
    return {root, paths, source: `${EXT_DIR}/browser-host`};
}
const manifestPath = (paths, b) => `${paths.home}/${b.hostDir}/${HOST_NAME}.json`;
const mode = path => Gio.File.new_for_path(path).query_info('unix::mode', 0, null).get_attribute_uint32('unix::mode') & 0o777;

test('browsers: detected by their binaries', () => {
    const {root, paths} = env();
    fs.writeText(`${root}/bin/google-chrome`, '');
    fs.writeText(`${root}/snap/bin/firefox`, '');
    assertEq(detectBrowsers(fs, paths).map(b => b.id), ['chrome', 'firefox']);
    assertEq(detectBrowsers(fs, paths).find(b => b.id === 'firefox').snap, true);
});

test('browsers: installing writes the host and an exact manifest per browser', () => {
    const {paths, source} = env();
    installHost(fs, paths, byId('chrome'), source);
    const host = `${paths.browserHostDir}/paletka-host.js`;
    assertEq(mode(host), 0o755);
    assert(fs.exists(`${paths.browserHostDir}/nativeMessaging.js`), 'framing module copied');
    assertEq(JSON.parse(fs.readText(manifestPath(paths, byId('chrome')))), {
        name: HOST_NAME, description: 'Paletka: the active desktop theme for web pages',
        path: host, type: 'stdio', allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`],
    });
    installHost(fs, paths, byId('firefox'), source);
    assertEq(JSON.parse(fs.readText(manifestPath(paths, byId('firefox')))).allowed_extensions, [FIREFOX_EXTENSION_ID]);
});

test('browsers: removing leaves a foreign manifest with the same name alone', () => {
    const {paths, source} = env();
    installHost(fs, paths, byId('chrome'), source);
    removeHost(fs, paths, byId('chrome'));
    assertEq(fs.exists(manifestPath(paths, byId('chrome'))), false);
    const foreign = JSON.stringify({name: HOST_NAME, path: '/opt/other/host', type: 'stdio'});
    fs.writeText(manifestPath(paths, byId('chrome')), foreign);
    removeHost(fs, paths, byId('chrome'));
    assertEq(fs.readText(manifestPath(paths, byId('chrome'))), foreign);
});

test('browsers: state goes from off to waiting to active', () => {
    const {paths, source} = env();
    const chrome = byId('chrome');
    assertEq(hostState(fs, paths, chrome, true), 'off');
    installHost(fs, paths, chrome, source);
    assertEq(hostState(fs, paths, chrome, true), 'waiting');
    fs.writeText(`${paths.browserHostDir}/seen-chrome.json`, JSON.stringify({version: '1.1.0', time: Date.now() + 1000}));
    assertEq(hostState(fs, paths, chrome, true), 'active');
});

test('browsers: Firefox snap without the portal permission needs it', () => {
    const {root, paths, source} = env();
    fs.writeText(`${root}/snap/bin/firefox`, '');
    const firefox = detectBrowsers(fs, paths).find(b => b.id === 'firefox');
    installHost(fs, paths, firefox, source);
    assertEq(hostState(fs, paths, firefox, false), 'needs-permission');
    assertEq(hostState(fs, paths, firefox, true), 'waiting');
});

test('browsers: removeAllHosts removes every manifest of ours and the host', () => {
    const {paths, source} = env();
    for (const b of BROWSERS)
        installHost(fs, paths, b, source);
    removeAllHosts(fs, paths);
    for (const b of BROWSERS)
        assertEq(fs.exists(manifestPath(paths, b)), false);
    assertEq(fs.exists(paths.browserHostDir), false);
});

test('browsers: turning Paletka off removes the hosts', () => {
    const {applier, paths} = setup();
    installHost(fs, paths, byId('chrome'), `${EXT_DIR}/browser-host`);
    applier.removeLeftovers();
    assertEq(fs.exists(manifestPath(paths, byId('chrome'))), false);
    assertEq(fs.exists(paths.browserHostDir), false);
});
