// Shared fixture for backup/applier tests: temp XDG tree + fake settings.
import {tmpDir} from './harness.js';
import {EXT_DIR, loadBuiltin} from './fixtures.js';
import {FakeSettings, FakeServices} from './fakes.js';
import {JsonFileSettings, CompositeSettings} from '../extension/lib/jsonFileSettings.js';
import {GioFs} from '../extension/lib/adapters.js';
import {defaultPaths} from '../extension/lib/paths.js';
import {Backup} from '../extension/lib/backup.js';
import {Applier} from '../extension/lib/applier.js';
import {normalizeFamily} from '../extension/lib/model.js';

export const FOREIGN_CSS = '@define-color accent_color #1c71d8;\n';
export const PTYXIS_UUID = 'p1';
export const TERM_UUID = 't1';
export const PTYXIS_PATH = `/org/gnome/Ptyxis/Profiles/${PTYXIS_UUID}/`;
export const TERM_PATH = `/org/gnome/terminal/legacy/profiles:/:${TERM_UUID}/`;

const K = FakeSettings.key;
export const keys = {
    gtk: K('org.gnome.desktop.interface', 'gtk-theme'),
    icon: K('org.gnome.desktop.interface', 'icon-theme'),
    accent: K('org.gnome.desktop.interface', 'accent-color'),
    uri: K('org.gnome.desktop.background', 'picture-uri'),
    uriDark: K('org.gnome.desktop.background', 'picture-uri-dark'),
    options: K('org.gnome.desktop.background', 'picture-options'),
    ptyxisPalette: K('org.gnome.Ptyxis.Profile', 'palette', PTYXIS_PATH),
    ptyxisStyle: K('org.gnome.Ptyxis', 'interface-style'),
    editorScheme: K('org.gnome.TextEditor', 'style-scheme'),
    editorVariant: K('org.gnome.TextEditor', 'style-variant'),
    termBg: K('org.gnome.Terminal.Legacy.Profile', 'background-color', TERM_PATH),
    termUseTheme: K('org.gnome.Terminal.Legacy.Profile', 'use-theme-colors', TERM_PATH),
};

export const VSCODE_SETTINGS = '{\n    // mine\n    "editor.fontSize": 14\n}\n';

export function setup({missingSchemas = [], foreignCss = true, defaultKeys = [], vscode = null} = {}) {
    const fs = new GioFs();
    const root = tmpDir();
    const paths = defaultPaths({configDir: `${root}/config`, dataDir: `${root}/data`, cacheDir: `${root}/cache`});
    paths.iconDirs = [`${root}/icons`];
    // Never the real home: browser host manifests live there.
    paths.home = `${root}/home`;
    paths.binDirs = [`${root}/bin`];
    paths.applicationsDir = `${root}/data/applications`;
    paths.systemApplicationsDirs = [`${root}/system-applications`];
    for (const n of ['Yaru', 'Yaru-dark'])
        fs.writeText(`${root}/icons/${n}/index.theme`, '[Icon Theme]\n');
    if (foreignCss)
        fs.writeText(paths.gtk4Css, FOREIGN_CSS);
    paths.vscodeExtensionDirs = [`${root}/vscode-ext`];
    fs.writeText(`${root}/vscode-ext/theme-solarized/package.json`, JSON.stringify({contributes: {themes: [
        {id: 'Solarized Light', uiTheme: 'vs'}, {id: 'Solarized Dark', uiTheme: 'vs-dark'}]}}));
    const vscodeSettings = `${paths.vscodeUserDirs[0]}/settings.json`;
    if (vscode !== null)
        fs.writeText(vscodeSettings, vscode);
    const settings = new FakeSettings({
        [keys.gtk]: 'Yaru',
        [keys.icon]: 'Yaru',
        [keys.accent]: 'orange',
        [keys.uri]: 'file:///usr/share/backgrounds/warty.png',
        [keys.uriDark]: 'file:///usr/share/backgrounds/warty-dark.png',
        [keys.options]: 'zoom',
        [K('org.gnome.Ptyxis', 'default-profile-uuid')]: PTYXIS_UUID,
        [keys.ptyxisPalette]: 'solarized',
        [keys.ptyxisStyle]: 'dark',
        [keys.editorScheme]: 'solarized-light',
        [keys.editorVariant]: 'light',
        [K('org.gnome.Terminal.ProfilesList', 'default')]: TERM_UUID,
        [keys.termUseTheme]: true,
        [keys.termBg]: 'rgb(23,20,33)',
    }, missingSchemas, defaultKeys);
    const services = new FakeServices();
    const composite = new CompositeSettings(settings, new JsonFileSettings({fs, log: () => {}}));
    const backup = new Backup({dir: paths.backupDir, fs, settings: composite});
    const applier = new Applier({settings: composite, fs, services, backup, paths,
        vendorDir: `${EXT_DIR}/vendor/adw-gtk3`, log: () => {}});
    return {fs, root, paths, settings, services, backup, applier, vscodeSettings,
        sol: loadBuiltin('solarized')};
}

export function otherFamily(sol) {
    const f = normalizeFamily(JSON.parse(JSON.stringify(sol)));
    f.id = 'other';
    f.name = 'Other';
    f.light.base.accent = '#d33682';
    return f;
}
