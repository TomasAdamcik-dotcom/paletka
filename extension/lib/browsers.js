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

// Installed browsers. On Ubuntu /usr/bin/firefox and /usr/bin/chromium-browser
// are only shims that start the snap, so a snap binary decides.
export function detectBrowsers(fs, paths) {
    const found = [];
    const has = dir => browser => browser.binaries.some(bin => fs.exists(`${dir}/${bin}`));
    const snapDirs = paths.binDirs.filter(d => d.endsWith('/snap/bin'));
    for (const browser of BROWSERS) {
        const snap = snapDirs.some(d => has(d)(browser));
        if (!snap && !paths.binDirs.some(d => has(d)(browser)))
            continue;
        if (snap && browser.noSnap)
            continue;
        found.push({...browser, snap});
    }
    return found;
}

// Unchanged files keep their modification time, which tells whether the
// extension connected since the host was set up.
function writeIfChanged(fs, path, text) {
    if (fs.readText(path) !== text)
        fs.writeText(path, text);
}

export function installHost(fs, paths, browser, sourceDir) {
    for (const name of HOST_FILES)
        writeIfChanged(fs, `${paths.browserHostDir}/${name}`, fs.readText(`${sourceDir}/${name}`));
    fs.setMode(hostPath(paths), 0o755);
    const allowed = browser.kind === 'firefox'
        ? {allowed_extensions: [FIREFOX_EXTENSION_ID]}
        : {allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`]};
    writeIfChanged(fs, manifestPath(paths, browser), `${JSON.stringify({
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

// 'off' | 'waiting' | 'needs-permission' | 'permission-denied' | 'active'.
// firefoxPermission: the desktop portal's answer for the Firefox snap
// ('yes', 'no', or null when not asked yet).
export function hostState(fs, paths, browser, firefoxPermission) {
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
    if (browser.kind === 'firefox' && browser.snap && firefoxPermission !== 'yes')
        return firefoxPermission === 'no' ? 'permission-denied' : 'needs-permission';
    return 'waiting';
}
