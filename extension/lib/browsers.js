// Browsers Paletka can talk to through its native messaging host.
export const HOST_NAME = 'io.github.adamciktomas.paletka';
export const CHROME_EXTENSION_ID = 'minabhiklmiljdidinhogbakhkcfbgji';
export const FIREFOX_EXTENSION_ID = 'paletka@adamciktomas.github.io';
const HOST_FILES = ['paletka-host.js', 'nativeMessaging.js'];
const RELEASES = 'https://github.com/TomasAdamcik-dotcom/paletka/releases/latest';

// hostDir is relative to the home directory. Snap and flatpak builds of
// Chromium are not supported (their sandboxes look elsewhere).
export const BROWSERS = [
    {id: 'chrome', name: 'Google Chrome', binaries: ['google-chrome'], hostDir: '.config/google-chrome/NativeMessagingHosts',
        kind: 'chromium', storeUrl: RELEASES},
    {id: 'chromium', name: 'Chromium', binaries: ['chromium', 'chromium-browser'], hostDir: '.config/chromium/NativeMessagingHosts',
        kind: 'chromium', storeUrl: RELEASES, noSnap: true},
    {id: 'firefox', name: 'Firefox', binaries: ['firefox'], hostDir: '.mozilla/native-messaging-hosts',
        kind: 'firefox', storeUrl: RELEASES},
];

const manifestPath = (paths, browser) => `${paths.home}/${browser.hostDir}/${HOST_NAME}.json`;
const hostPath = paths => `${paths.browserHostDir}/paletka-host.js`;

// Installed browsers; a Firefox found only in a snap directory is marked snap.
export function detectBrowsers(fs, paths) {
    const found = [];
    for (const browser of BROWSERS) {
        const dir = paths.binDirs.find(d => browser.binaries.some(bin => fs.exists(`${d}/${bin}`)));
        if (!dir || (browser.noSnap && dir.endsWith('/snap/bin')))
            continue;
        found.push({...browser, snap: dir.endsWith('/snap/bin')});
    }
    return found;
}

export function installHost(fs, paths, browser, sourceDir) {
    for (const name of HOST_FILES)
        fs.copyFile(`${sourceDir}/${name}`, `${paths.browserHostDir}/${name}`);
    fs.setMode(hostPath(paths), 0o755);
    const allowed = browser.kind === 'firefox'
        ? {allowed_extensions: [FIREFOX_EXTENSION_ID]}
        : {allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`]};
    fs.writeText(manifestPath(paths, browser), `${JSON.stringify({
        name: HOST_NAME, description: 'Paletka: the active desktop theme for web pages',
        path: hostPath(paths), type: 'stdio', ...allowed,
    }, null, 2)}\n`);
}

function isOurs(fs, paths, browser) {
    try {
        const manifest = JSON.parse(fs.readText(manifestPath(paths, browser)));
        return manifest?.name === HOST_NAME && manifest.path === hostPath(paths);
    } catch {
        return false;
    }
}

// Removes the manifest only when Paletka wrote it.
export function removeHost(fs, paths, browser) {
    if (isOurs(fs, paths, browser))
        fs.remove(manifestPath(paths, browser));
}

export function removeAllHosts(fs, paths) {
    for (const browser of BROWSERS)
        removeHost(fs, paths, browser);
    fs.removeTree(paths.browserHostDir);
}

// 'off' | 'waiting' | 'needs-permission' | 'active'. firefoxAllowed: whether
// the desktop portal lets the Firefox snap start the host.
export function hostState(fs, paths, browser, firefoxAllowed) {
    if (!isOurs(fs, paths, browser))
        return 'off';
    let seen = 0;
    try {
        seen = JSON.parse(fs.readText(`${paths.browserHostDir}/seen-${browser.id}.json`)).time ?? 0;
    } catch {
        seen = 0;
    }
    if (seen >= fs.mtime(manifestPath(paths, browser)))
        return 'active';
    if (browser.kind === 'firefox' && browser.snap && !firefoxAllowed)
        return 'needs-permission';
    return 'waiting';
}
