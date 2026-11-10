// Applies a theme family to the desktop through injected adapters.
import {gtk4Css, gtk3ThemeCss, gtk3ThemeName, gtk3IndexTheme, hasGeneratedHeader, hasLegacyColorDefinitions} from './gtkCss.js';
import {shellCss} from './shellCss.js';
import {resolveVariant} from './palette.js';
import {ptyxisPalette, ptyxisPaletteId, gnomeTerminalValues, GNOME_TERMINAL_KEYS} from './terminal.js';
import {wallpaperSvg} from './wallpaper.js';
import {nearestAccent} from './accent.js';
import {yaruForScheme} from './backup.js';
import {listVscodeThemes} from './vscodeThemes.js';
import {sourceSchemeXml, sourceSchemeId} from './sourceScheme.js';
import {isSystem} from './model.js';

export const ADW_GTK3_VERSION = '6.5';
const ADW_GTK3_NAMES = ['adw-gtk3', 'adw-gtk3-dark'];
const MARKER = '.paletka-version';

const iface = key => ({schema: 'org.gnome.desktop.interface', key});
const bg = key => ({schema: 'org.gnome.desktop.background', key});

export const REFS = {
    gtkTheme: iface('gtk-theme'),
    iconTheme: iface('icon-theme'),
    accent: iface('accent-color'),
    pictureUri: bg('picture-uri'),
    pictureUriDark: bg('picture-uri-dark'),
    pictureOptions: bg('picture-options'),
};

const editor = key => ({schema: 'org.gnome.TextEditor', key});
export const EDITOR_REFS = {scheme: editor('style-scheme'), variant: editor('style-variant')};

export const VSCODE_KEYS = {
    autoDetect: 'window.autoDetectColorScheme',
    light: 'workbench.preferredLightColorTheme',
    dark: 'workbench.preferredDarkColorTheme',
};

const variantName = isDark => (isDark ? 'dark' : 'light');

function versionLess(a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] ?? 0, y = pb[i] ?? 0;
        if (x !== y)
            return x < y;
    }
    return false;
}

export class Applier {
    constructor({settings, fs, services, backup, paths, vendorDir, log = console.warn}) {
        this._settings = settings;
        this._fs = fs;
        this._services = services;
        this._backup = backup;
        this._paths = paths;
        this._vendorDir = vendorDir;
        this._log = log;
        this._warnings = [];
    }

    // Default profile setting refs; empty when the terminal isn't installed.
    _ptyxisRefs() {
        const list = {schema: 'org.gnome.Ptyxis', key: 'default-profile-uuid'};
        if (!this._settings.exists(list))
            return {};
        const uuid = this._settings.get(list);
        if (!uuid)
            return {};
        const ref = {schema: 'org.gnome.Ptyxis.Profile', key: 'palette', path: `/org/gnome/Ptyxis/Profiles/${uuid}/`};
        if (!this._settings.exists(ref))
            return {};
        // Ptyxis picks the [Light]/[Dark] palette section from its own style setting.
        const style = {schema: 'org.gnome.Ptyxis', key: 'interface-style'};
        return this._settings.exists(style) ? {palette: ref, style} : {palette: ref};
    }

    _terminalRefs() {
        const list = {schema: 'org.gnome.Terminal.ProfilesList', key: 'default'};
        if (!this._settings.exists(list))
            return {};
        const uuid = this._settings.get(list);
        if (!uuid)
            return {};
        const path = `/org/gnome/terminal/legacy/profiles:/:${uuid}/`;
        const refs = {};
        for (const key of GNOME_TERMINAL_KEYS) {
            const ref = {schema: 'org.gnome.Terminal.Legacy.Profile', key, path};
            if (this._settings.exists(ref))
                refs[key] = ref;
        }
        return refs;
    }

    // One {autoDetect, light, dark} ref set per installed VS Code flavour.
    _vscodeRefs() {
        return (this._paths.vscodeUserDirs ?? [])
            .filter(dir => this._fs.isDir(dir))
            .map(dir => Object.fromEntries(Object.entries(VSCODE_KEYS)
                .map(([name, key]) => [name, {schema: 'jsonfile', path: `${dir}/settings.json`, key}])))
            .filter(refs => this._settings.exists(refs.autoDetect));
    }

    _snapshotRefs() {
        return [
            ...Object.values(REFS),
            ...Object.values(this._ptyxisRefs()),
            ...Object.values(this._terminalRefs()),
            ...Object.values(EDITOR_REFS),
            ...this._vscodeRefs().flatMap(refs => Object.values(refs)),
        ];
    }

    _set(ref, value) {
        if (!ref || !this._settings.exists(ref))
            return;
        try {
            this._settings.set(ref, value);
            this._backup.recordWritten(ref, value);
        } catch (e) {
            this._log(`cannot set ${ref.schema} ${ref.key}: ${e.message}`);
        }
    }

    _setOriginal(ref, isDark) {
        try {
            this._revert(ref, isDark);
        } catch (e) {
            this._log(`cannot revert ${ref.schema} ${ref.key}: ${e.message}`);
        }
    }

    _revert(ref, isDark) {
        const entry = this._backup.originalEntry(ref);
        if (!entry || !this._settings.exists(ref))
            return;
        const variantAware = ref === REFS.gtkTheme || ref === REFS.iconTheme;
        const value = variantAware ? yaruForScheme(entry.value, isDark) : entry.value;
        if (entry.isDefault && JSON.stringify(value) === JSON.stringify(entry.value)) {
            // It was never set by the user: unset it instead of pinning a value.
            if (this._settings.isUserSet(ref)) {
                this._settings.reset(ref);
                this._backup.recordWritten(ref, this._settings.get(ref));
            }
            return;
        }
        this._set(ref, value);
    }

    // Path of an installed theme's gtk-3.0/gtk.css, or null.
    _themeCss(name) {
        return [this._paths.userThemesDir, ...this._paths.systemThemesDirs]
            .map(d => `${d}/${name}/gtk-3.0/gtk.css`)
            .find(path => this._fs.exists(path)) ?? null;
    }

    _themeAvailable(name) {
        return this._themeCss(name) !== null;
    }

    // Named GTK3 themes for both variants of the family (see gtk3ThemeName).
    _writeGtk3Themes(family) {
        for (const isDark of [false, true]) {
            const name = gtk3ThemeName(family, isDark);
            const dir = `${this._paths.userThemesDir}/${name}`;
            this._fs.writeText(`${dir}/index.theme`, gtk3IndexTheme(name));
            this._fs.writeText(`${dir}/gtk-3.0/gtk.css`,
                gtk3ThemeCss(family, isDark, this._themeCss(isDark ? 'adw-gtk3-dark' : 'adw-gtk3')));
        }
        // A user gtk-3.0/gtk.css would override the theme colors (and pins them
        // until restart). Set it aside only when it is ours or the snapshot holds
        // an identical copy that Ubuntu puts back; never delete anything else.
        const gtk3 = this._fs.readText(this._paths.gtk3Css);
        if (gtk3 !== null && (hasGeneratedHeader(gtk3) || this._backup.hasCopyOf(this._paths.gtk3Css)))
            this._fs.remove(this._paths.gtk3Css);
        else if (gtk3 !== null)
            this._log(`${this._paths.gtk3Css} overrides GTK3 theme colors; leaving it in place`);
    }

    _iconThemeExists(name) {
        return typeof name === 'string' && name !== '' &&
            this._paths.iconDirs.some(d => this._fs.exists(`${d}/${name}/index.theme`));
    }

    // Installs the bundled adw-gtk3 into ~/.local/share/themes unless the user has
    // their own copy. Returns whether adw-gtk3 is usable.
    ensureAdwGtk3() {
        try {
            for (const name of ADW_GTK3_NAMES) {
                const dest = `${this._paths.userThemesDir}/${name}`;
                const marker = `${dest}/${MARKER}`;
                if (this._fs.exists(dest)) {
                    if (!this._fs.exists(marker))
                        continue;
                    if (!versionLess(this._fs.readText(marker).trim(), ADW_GTK3_VERSION))
                        continue;
                    this._fs.removeTree(dest);
                } else if (this._paths.systemThemesDirs.some(d => this._fs.exists(`${d}/${name}/gtk-3.0/gtk.css`))) {
                    continue;
                }
                this._fs.copyDir(`${this._vendorDir}/${name}`, dest);
                this._fs.writeText(marker, ADW_GTK3_VERSION);
            }
        } catch (e) {
            this._log(`cannot install adw-gtk3: ${e.message}`);
        }
        return ADW_GTK3_NAMES.every(n => this._themeAvailable(n));
    }

    _wallpaperUri(family, isDark) {
        const spec = family[variantName(isDark)].wallpaper;
        const svg = wallpaperSvg(spec);
        if (svg) {
            const path = `${this._paths.wallpaperDir}/${family.id}-${variantName(isDark)}.svg`;
            this._fs.writeText(path, svg);
            return `file://${path}`;
        }
        if (spec?.type === 'file' && this._fs.exists(spec.path))
            return `file://${spec.path}`;
        return null;
    }

    _applyWallpapers(family) {
        let ours = false;
        for (const [isDark, ref] of [[false, REFS.pictureUri], [true, REFS.pictureUriDark]]) {
            const uri = this._wallpaperUri(family, isDark);
            if (uri) {
                ours = true;
                this._set(ref, uri);
            } else {
                this._setOriginal(ref, isDark);
            }
        }
        if (ours)
            this._set(REFS.pictureOptions, 'zoom');
        else
            this._setOriginal(REFS.pictureOptions, false);
    }

    _applyPtyxis(family) {
        const {palette, style} = this._ptyxisRefs();
        if (!palette)
            return;
        if (style) {
            this._backup.extend([style]);
            this._set(style, 'system');
        }
        const id = ptyxisPaletteId(family);
        this._fs.writeText(`${this._paths.ptyxisPaletteDir}/${id}.palette`, ptyxisPalette(family));
        this._set(palette, id);
    }

    // Snapshot the user's original state once, before anything is written.
    _ensureSnapshot() {
        const gtk4Original = this._fs.readText(this._paths.gtk4Css);
        const taken = this._backup.snapshot(this._snapshotRefs(), [this._paths.gtk4Css, this._paths.gtk3Css]);
        if (taken && hasLegacyColorDefinitions(gtk4Original))
            this._warnings.push({code: 'legacy-gtk-css', path: this._paths.gtk4Css});
    }

    // VS Code follows the system light/dark itself once autoDetect is on.
    // Returns marketplace ids of family themes VS Code lacks (only when VS Code is used).
    _applyVscode(family) {
        const allRefs = this._vscodeRefs();
        if (allRefs.length === 0)
            return [];
        // Only themes VS Code actually has; an unknown id would make it fall back.
        const installed = new Set(listVscodeThemes(this._fs, this._paths.vscodeExtensionDirs ?? []).map(t => t.id));
        const pick = id => (id && installed.has(id) ? id : null);
        const themes = {light: pick(family.light.vscodeTheme), dark: pick(family.dark.vscodeTheme)};
        const missing = [...new Set(['light', 'dark']
            .filter(v => family[v].vscodeTheme && !themes[v] && family[v].vscodeExtension)
            .map(v => family[v].vscodeExtension))];
        this._backup.extend(allRefs.flatMap(refs => Object.values(refs)));
        for (const refs of allRefs) {
            if (!themes.light && !themes.dark) {
                Object.values(refs).forEach(ref => this._setOriginal(ref, false));
                continue;
            }
            this._set(refs.autoDetect, true);
            for (const name of ['light', 'dark']) {
                if (themes[name])
                    this._set(refs[name], themes[name]);
                else
                    this._setOriginal(refs[name], false);
            }
        }
        return missing;
    }

    // GtkSourceView schemes for Text Editor. A running editor only discovers
    // scheme files that existed when it started, so all are written up front.
    writeSourceSchemes(families) {
        for (const family of families) {
            if (isSystem(family))
                continue;
            for (const isDark of [false, true]) {
                this._fs.writeText(`${this._paths.sourceStylesDir}/${sourceSchemeId(family, isDark)}.xml`,
                    sourceSchemeXml(family, isDark));
            }
        }
    }

    _applyTextEditor(family) {
        if (!this._settings.exists(EDITOR_REFS.scheme))
            return;
        this.writeSourceSchemes([family]);
        this._backup.extend(Object.values(EDITOR_REFS));
        // The light scheme names its dark pair; "follow" switches with the desktop.
        this._set(EDITOR_REFS.scheme, sourceSchemeId(family, false));
        this._set(EDITOR_REFS.variant, 'follow');
    }

    async applyFamily(family, isDark, {restartServices}) {
        this._ensureSnapshot();
        this._adwGtk3 = this.ensureAdwGtk3();
        this._fs.writeText(this._paths.gtk4Css, gtk4Css(family));
        if (this._adwGtk3)
            this._writeGtk3Themes(family);
        this._applyPtyxis(family);
        this._applyWallpapers(family);
        this._applyTextEditor(family);
        const missing = this._applyVscode(family);
        if (missing.length)
            this._warnings.push({code: 'vscode-theme-missing', family: family.id, name: family.name, extensions: missing});
        const result = this.applyVariant(family, isDark);
        if (restartServices)
            await this._services.restart();
        return result;
    }

    applyVariant(family, isDark) {
        const v = family[variantName(isDark)];
        this._ensureSnapshot();
        if (this._adwGtk3 === undefined) {
            this._adwGtk3 = this.ensureAdwGtk3();
            if (this._adwGtk3)
                this._writeGtk3Themes(family);
        }
        const gtkTheme = this._adwGtk3 && this._themeAvailable(gtk3ThemeName(family, isDark))
            ? gtk3ThemeName(family, isDark)
            : `Adwaita${isDark ? '-dark' : ''}`;
        this._set(REFS.gtkTheme, gtkTheme);
        this._set(REFS.accent, nearestAccent(v.base.accent));

        const termRefs = this._terminalRefs();
        for (const [key, value] of Object.entries(gnomeTerminalValues(v.terminal)))
            this._set(termRefs[key], value);

        if (this._iconThemeExists(v.iconTheme))
            this._set(REFS.iconTheme, v.iconTheme);
        else
            this._setOriginal(REFS.iconTheme, isDark);

        const shellCssPath = `${this._paths.shellCssDir}/shell-${family.id}-${variantName(isDark)}.css`;
        this._fs.writeText(shellCssPath, shellCss(resolveVariant(v, isDark), isDark));
        return {shellCssPath, warnings: this._takeWarnings()};
    }

    _takeWarnings() {
        const warnings = this._warnings;
        this._warnings = [];
        return warnings;
    }

    async restoreSystem(isDark, {restartServices}) {
        if (this._backup.has()) {
            this._backup.restore(isDark, this._log);
        } else {
            // No snapshot (lost or never taken): at least drop our generated files.
            for (const path of [this._paths.gtk4Css, this._paths.gtk3Css]) {
                if (hasGeneratedHeader(this._fs.readText(path)))
                    this._fs.remove(path);
            }
        }
        for (const name of this._fs.listDir(this._paths.userThemesDir)) {
            if (name.startsWith('paletka-'))
                this._fs.removeTree(`${this._paths.userThemesDir}/${name}`);
        }
        for (const name of this._fs.listDir(this._paths.ptyxisPaletteDir)) {
            if (name.startsWith('paletka-'))
                this._fs.remove(`${this._paths.ptyxisPaletteDir}/${name}`);
        }
        this._fs.removeTree(this._paths.shellCssDir);
        const wallpaperInUse = [REFS.pictureUri, REFS.pictureUriDark]
            .filter(ref => this._settings.exists(ref))
            .some(ref => String(this._settings.get(ref)).startsWith(`file://${this._paths.wallpaperDir}/`));
        if (!wallpaperInUse)
            this._fs.removeTree(this._paths.wallpaperDir);
        if (restartServices)
            await this._services.restart();
    }

    // Whether a custom family is applied (its snapshot of the original look exists).
    isApplied() {
        return this._backup.has();
    }

    // Files that stay useful while the extension is on but must not outlive it:
    // the Text Editor schemes and the adw-gtk3 copy we installed (unless in use).
    removeLeftovers() {
        for (const name of this._fs.listDir(this._paths.sourceStylesDir)) {
            if (name.startsWith('paletka-') && name.endsWith('.xml'))
                this._fs.remove(`${this._paths.sourceStylesDir}/${name}`);
        }
        // Our GTK3 themes import adw-gtk3; keep it while one of them is still there.
        const current = this._settings.exists(REFS.gtkTheme) ? this._settings.get(REFS.gtkTheme) : '';
        if (ADW_GTK3_NAMES.includes(current) || current.startsWith('paletka-') ||
            this._fs.listDir(this._paths.userThemesDir).some(n => n.startsWith('paletka-')))
            return;
        for (const name of ADW_GTK3_NAMES) {
            const dir = `${this._paths.userThemesDir}/${name}`;
            if (this._fs.exists(`${dir}/${MARKER}`))
                this._fs.removeTree(dir);
        }
    }
}
