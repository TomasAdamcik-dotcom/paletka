// Every filesystem location the extension reads or writes.
import GLib from 'gi://GLib';

import {VSCODE_EXTENSION_DIRS} from './vscodeThemes.js';

export function defaultPaths({
    configDir = GLib.get_user_config_dir(),
    dataDir = GLib.get_user_data_dir(),
    cacheDir = GLib.get_user_cache_dir(),
} = {}) {
    return {
        gtk4Css: `${configDir}/gtk-4.0/gtk.css`,
        gtk3Css: `${configDir}/gtk-3.0/gtk.css`,
        userConfigThemesDir: `${configDir}/paletka/themes`,
        backupDir: `${dataDir}/paletka/backup`,
        shellCssDir: `${cacheDir}/paletka`,
        wallpaperDir: `${dataDir}/backgrounds/paletka`,
        sourceStylesDir: `${dataDir}/gtksourceview-5/styles`,
        ptyxisPaletteDir: `${dataDir}/org.gnome.Ptyxis/palettes`,
        userThemesDir: `${dataDir}/themes`,
        vscodeExtensionDirs: VSCODE_EXTENSION_DIRS(GLib.get_home_dir()),
        vscodeUserDirs: ['Code', 'Code - OSS', 'VSCodium'].map(n => `${configDir}/${n}/User`),
        systemThemesDirs: GLib.get_system_data_dirs().map(d => `${d}/themes`),
        iconDirs: [
            `${dataDir}/icons`,
            `${GLib.get_home_dir()}/.icons`,
            ...GLib.get_system_data_dirs().map(d => `${d}/icons`),
        ],
    };
}
