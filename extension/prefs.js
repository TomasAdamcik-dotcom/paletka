// Paletka preferences: theme list and editor, browsers.
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {GioFs} from './lib/adapters.js';
import {defaultPaths} from './lib/paths.js';
import {ThemeStore} from './lib/store.js';
import {FamilyListPage} from './lib/prefs/familyListPage.js';
import {BrowsersPage} from './lib/prefs/browsersPage.js';

export default class PaletkaPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const fs = new GioFs();
        const paths = defaultPaths();
        const store = new ThemeStore({builtinDir: `${this.path}/themes`, userDir: paths.userConfigThemesDir, fs});
        window.set_default_size(720, 860);
        window.add(new FamilyListPage({window, store, settings: this.getSettings(), fs, paths}));
        window.add(new BrowsersPage({settings: this.getSettings(), fs, paths}));
    }
}
