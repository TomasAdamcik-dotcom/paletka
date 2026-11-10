// Opens the real preferences (list page, optionally the editor page) in an
// Adw window inside the nested session so the E2E scenario can screenshot them.
// Usage: gjs -m prefs-smoke.js <extension-dir> <list|editor> <seconds>
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import 'gi://Gtk?version=4.0';

Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();

const [extDir, mode = 'list', seconds = '4'] = ARGV;
const {ExtensionPreferences} = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
const {default: Prefs} = await import(`file://${extDir}/prefs.js`);
const {FamilyEditorPage} = await import(`file://${extDir}/lib/prefs/familyEditorPage.js`);
const {GioFs} = await import(`file://${extDir}/lib/adapters.js`);
const {defaultPaths} = await import(`file://${extDir}/lib/paths.js`);
const {ThemeStore} = await import(`file://${extDir}/lib/store.js`);

const metadata = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${extDir}/metadata.json`)[1]));
metadata.path = extDir;
metadata.dir = Gio.File.new_for_path(extDir);
const prefs = new Prefs(metadata);
ExtensionPreferences.lookupByUUID = uuid => (uuid === metadata.uuid ? prefs : null);

Adw.init();
const loop = GLib.MainLoop.new(null, false);
const window = new Adw.PreferencesWindow({title: metadata.name, default_width: 720, default_height: 900});
await prefs.fillPreferencesWindow(window);
if (mode === 'editor') {
    const fs = new GioFs();
    const paths = defaultPaths();
    const store = new ThemeStore({builtinDir: `${extDir}/themes`, userDir: paths.userConfigThemesDir, fs});
    const family = store.loadAll().find(f => f.kind === 'custom' && f.id !== 'solarized');
    window.push_subpage(new FamilyEditorPage({family, store, fs, paths, window}));
}
window.connect('close-request', () => loop.quit());
window.present();
GLib.timeout_add(GLib.PRIORITY_DEFAULT, Number(seconds) * 1000, () => {
    print('prefs-smoke: ok');
    window.close();
    return GLib.SOURCE_REMOVE;
});
loop.run();
