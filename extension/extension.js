// Paletka: switch whole-desktop theme families from Quick Settings.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {GioFs, GioSettingsAdapter} from './lib/adapters.js';
import {CompositeSettings, JsonFileSettings} from './lib/jsonFileSettings.js';
import {Applier} from './lib/applier.js';
import {Backup} from './lib/backup.js';
import {resolveActiveId, isSystem, SYSTEM_ID} from './lib/model.js';
import {defaultPaths} from './lib/paths.js';
import {Services} from './lib/services.js';
import {ThemeStore} from './lib/store.js';
import {ThemeIndicator} from './lib/toggle.js';
import {fmt} from './lib/format.js';
import {installVscodeExtensions} from './lib/vscodeInstaller.js';
import {continuousActivity, sampleIo} from './lib/activity.js';

const SCHEME_DEBOUNCE_MS = 150;
// How long the VS Code install suggestion stays on screen.
const VSCODE_NOTICE_MS = 10000;
const NAUTILUS = 'org.gnome.Nautilus.desktop';
// D-Bus names owned by the apps' processes in this session.
const BUS_NAMES = {
    'org.gnome.Nautilus.desktop': 'org.gnome.Nautilus',
    'org.gnome.Software.desktop': 'org.gnome.Software',
};

export default class PaletkaExtension extends Extension {
    enable() {
        // Bumped on every enable/disable; async work started under an older
        // generation must not touch the shell after it resumes.
        this._generation = (this._generation ?? 0) + 1;
        this._logger = this.getLogger();
        const log = msg => this._logger.warn(msg);
        this._settings = this.getSettings();
        this._iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._fs = new GioFs();
        this._gsettings = new CompositeSettings(new GioSettingsAdapter(), new JsonFileSettings({fs: this._fs, log}));
        this._paths = defaultPaths();
        this._store = new ThemeStore({
            builtinDir: `${this.path}/themes`,
            userDir: this._paths.userConfigThemesDir,
            fs: this._fs,
            log,
        });
        const appSystem = Shell.AppSystem.get_default();
        const services = this._services = new Services({
            hasWindows: id => (appSystem.lookup_app(id)?.get_n_windows() ?? 0) > 0,
            whenHidden: (id, cb) => {
                const app = appSystem.lookup_app(id);
                if (!app)
                    return () => {};
                let handlerId = app.connect('windows-changed', () => {
                    if (app.get_n_windows() > 0)
                        return;
                    app.disconnect(handlerId);
                    handlerId = 0;
                    cb();
                });
                return () => {
                    if (handlerId)
                        app.disconnect(handlerId);
                    handlerId = 0;
                };
            },
            isBusy: id => this._isBusy(id),
            getWindowLocations: () => this._filesWindowLocations(),
            waitUntilStopped: id => this._waitUntilStopped(id),
            log,
        });
        this._applier = new Applier({
            settings: this._gsettings,
            fs: this._fs,
            services,
            backup: new Backup({dir: this._paths.backupDir, fs: this._fs, settings: this._gsettings}),
            paths: this._paths,
            vendorDir: `${this.path}/vendor/adw-gtk3`,
            log,
        });
        this._queue = Promise.resolve();
        this._sleepIds = new Set();
        // Families whose missing VS Code theme was already suggested this session.
        this._vscodeSuggested = new Set();
        this._stylesheet = null;
        this._schemeTimeoutId = 0;

        this._addIndicator();

        this._settings.connectObject('changed::active-family', () => this._enqueue(generation => this._applyActive(generation)), this);
        this._iface.connectObject('changed::color-scheme', () => {
            this._refreshToggle();
            this._scheduleVariant();
        }, this);
        this._stopMonitor = this._store.monitor(id => this._onThemesChanged(id));
        Main.sessionMode.connectObject('updated', () => this._syncLocked(), this);
        this._syncLocked();

        this._refreshToggle();
        this._enqueue(() => this._restoreOnEnable());
    }

    // session-modes includes unlock-dialog so the shell theme stays applied on the
    // lock screen (the tile is hidden while locked); disable() therefore only runs
    // when the extension is really turned off, and it never reverts the user's
    // gsettings or gtk.css (that is what choosing the Ubuntu theme does).
    disable() {
        this._generation++;
        if (this._schemeTimeoutId) {
            GLib.source_remove(this._schemeTimeoutId);
            this._schemeTimeoutId = 0;
        }
        this._stopMonitor?.();
        this._stopMonitor = null;
        this._services?.cancelPending();
        this._services = null;
        for (const id of this._sleepIds ?? [])
            GLib.source_remove(id);
        this._sleepIds = null;
        this._vscodeSuggested = null;
        Main.sessionMode.disconnectObject(this);
        this._settings?.disconnectObject(this);
        this._iface?.disconnectObject(this);
        this._unloadStylesheet();
        if (this._darkClickedId)
            this._darkItem?.disconnect(this._darkClickedId);
        this._darkClickedId = 0;
        this._darkItem = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._gsettings?.destroy();
        this._gsettings = null;
        this._iface = null;
        this._settings = null;
        this._store = null;
        this._applier = null;
        this._fs = null;
        this._queue = null;
        this._logger = null;
    }

    _addIndicator() {
        this._indicator = new ThemeIndicator();
        const toggle = this._indicator.toggle;
        toggle.connect('family-selected', (_t, id) => this._settings.set_string('active-family', id));
        toggle.connect('variant-selected', (_t, id, dark) => this._selectVariant(id, dark));
        toggle.connect('edit-requested', () => {
            Main.panel.closeQuickSettings();
            this.openPreferences();
        });
        const quickSettings = Main.panel.statusArea.quickSettings;
        quickSettings.addExternalIndicator(this._indicator);
        // Place the tile right after the stock Dark Style tile.
        const darkItem = quickSettings._darkMode?.quickSettingsItems?.[0];
        if (darkItem && darkItem.get_parent() === toggle.get_parent())
            toggle.get_parent().set_child_above_sibling(toggle, darkItem);
        // The stock Dark Style tile always goes back to Ubuntu (light or dark);
        // custom families are picked from the Theme tile.
        if (darkItem) {
            this._darkItem = darkItem;
            this._darkClickedId = darkItem.connect('clicked', () => {
                if (!isSystem(this._activeFamily()))
                    this._settings.set_string('active-family', SYSTEM_ID);
            });
        }
    }

    _syncLocked() {
        if (this._indicator)
            this._indicator.toggle.visible = !Main.sessionMode.isLocked;
    }

    _isDark() {
        return this._iface.get_string('color-scheme') === 'prefer-dark';
    }

    _families() {
        return this._store.loadAll();
    }

    _activeFamily(families = this._families()) {
        const id = resolveActiveId(families, this._settings.get_string('active-family'));
        return families.find(f => f.id === id);
    }

    _refreshToggle() {
        if (!this._indicator)
            return;
        const families = this._families();
        const active = this._activeFamily(families);
        const lastId = resolveActiveId(families, this._settings.get_string('last-custom-family'));
        this._indicator.toggle.setFamilies(families, active.id, this._isDark(), lastId === SYSTEM_ID ? null : lastId);
    }

    // A Dark/Light button in the Theme menu: family and light/dark in one click.
    _selectVariant(id, dark) {
        const scheme = dark ? 'prefer-dark' : 'default';
        const ubuntuActive = isSystem(this._activeFamily());
        if (id === SYSTEM_ID && ubuntuActive) {
            // Let the stock Dark Style toggle switch Yaru between light and dark.
            if (this._isDark() !== dark) {
                if (this._darkItem)
                    this._darkItem.emit('clicked', 1);
                else
                    this._iface.set_string('color-scheme', scheme);
            }
            return;
        }
        if (this._iface.get_string('color-scheme') !== scheme)
            this._iface.set_string('color-scheme', scheme);
        this._settings.set_string('active-family', id);
    }

    _alive(generation) {
        return generation === this._generation && this._settings !== null;
    }

    _enqueue(fn) {
        const generation = this._generation;
        this._queue = this._queue.then(() => (this._alive(generation) ? fn(generation) : null)).catch(e => {
            if (!this._alive(generation))
                return;
            this._logger.error(`apply failed: ${e.message}\n${e.stack}`);
            Main.notifyError(_('Paletka'), e.message);
        });
        return this._queue;
    }

    _loadStylesheet(path) {
        this._unloadStylesheet();
        const file = Gio.File.new_for_path(path);
        St.ThemeContext.get_for_stage(global.stage).get_theme().load_stylesheet(file);
        this._stylesheet = file;
    }

    _unloadStylesheet() {
        if (!this._stylesheet)
            return;
        St.ThemeContext.get_for_stage(global.stage).get_theme().unload_stylesheet(this._stylesheet);
        this._stylesheet = null;
    }

    _hasOpenAppWindows() {
        return Shell.AppSystem.get_default().get_running().some(app => app.get_n_windows() > 0);
    }

    async _restoreOnEnable() {
        this._applier.writeSourceSchemes(this._families());
        const family = this._activeFamily();
        if (isSystem(family))
            return;
        const {shellCssPath, warnings} = this._applier.applyVariant(family, this._isDark());
        this._loadStylesheet(shellCssPath);
        this._showWarnings(warnings);
    }

    async _applyActive(generation) {
        const families = this._families();
        const family = this._activeFamily(families);
        const restartServices = this._settings.get_boolean('restart-background-services');
        if (isSystem(family)) {
            this._unloadStylesheet();
            await this._applier.restoreSystem(this._isDark(), {restartServices});
            if (!this._alive(generation))
                return;
        } else {
            if (this._settings.get_string('last-custom-family') !== family.id)
                this._settings.set_string('last-custom-family', family.id);
            const {shellCssPath, warnings} = await this._applier.applyFamily(family, this._isDark(), {restartServices});
            if (!this._alive(generation))
                return;
            this._loadStylesheet(shellCssPath);
            this._showWarnings(warnings);
        }
        this._refreshToggle();
        if (restartServices && this._hasWindows(NAUTILUS))
            this._services.restartFilesWhenIdle();
        else if (this._hasOpenAppWindows())
            Main.notify(_('Theme changed'), _('Open apps will use the new colors after they are reopened.'));
    }

    _hasWindows(appId) {
        return (Shell.AppSystem.get_default().lookup_app(appId)?.get_n_windows() ?? 0) > 0;
    }

    _sleep(ms) {
        return new Promise(resolve => {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                this._sleepIds?.delete(id);
                resolve();
                return GLib.SOURCE_REMOVE;
            });
            this._sleepIds?.add(id);
        });
    }

    // PID of the process owning the app's D-Bus name in this session, if running.
    async _pidsFor(appId) {
        const name = BUS_NAMES[appId];
        if (!name)
            return [];
        try {
            const reply = await Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [name]),
                new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, 1000, null);
            return [reply.deepUnpack()[0]];
        } catch {
            return [];
        }
    }

    // True when the app shows file I/O in each of three consecutive seconds.
    async _isBusy(appId) {
        const pids = await this._pidsFor(appId);
        if (pids.length === 0 || !this._fs)
            return false;
        const samples = [];
        for (let i = 0; i < 4; i++) {
            if (i)
                await this._sleep(1000);
            if (!this._fs)
                return true;
            samples.push(sampleIo(this._fs, pids));
        }
        return continuousActivity(samples);
    }

    async _waitUntilStopped(appId) {
        for (let i = 0; i < 50 && this._fs; i++) {
            if ((await this._pidsFor(appId)).length === 0)
                return true;
            await this._sleep(100);
        }
        return false;
    }

    // Open Files windows as arrays of URIs (org.freedesktop.FileManager1).
    async _filesWindowLocations() {
        try {
            const reply = await Gio.DBus.session.call('org.gnome.Nautilus', '/org/freedesktop/FileManager1',
                'org.freedesktop.DBus.Properties', 'Get',
                new GLib.Variant('(ss)', ['org.freedesktop.FileManager1', 'OpenWindowsWithLocations']),
                new GLib.VariantType('(v)'), Gio.DBusCallFlags.NO_AUTO_START, 2000, null);
            return Object.values(reply.recursiveUnpack()[0]);
        } catch (e) {
            this._logger?.warn(`cannot read Files windows: ${e.message}`);
            return [];
        }
    }

    _scheduleVariant() {
        if (this._schemeTimeoutId)
            GLib.source_remove(this._schemeTimeoutId);
        this._schemeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SCHEME_DEBOUNCE_MS, () => {
            this._schemeTimeoutId = 0;
            this._enqueue(() => this._applyVariant());
            return GLib.SOURCE_REMOVE;
        });
    }

    async _applyVariant() {
        const family = this._activeFamily();
        if (isSystem(family))
            return;
        const {shellCssPath, warnings} = this._applier.applyVariant(family, this._isDark());
        this._loadStylesheet(shellCssPath);
        this._showWarnings(warnings);
    }

    _showWarnings(warnings) {
        for (const warning of warnings ?? []) {
            if (warning.code === 'legacy-gtk-css') {
                Main.notify(_('Old color settings found'),
                    _('%s pins light colors with the old @define-color syntax. Apps may be unreadable in dark mode when you switch back to Ubuntu. Move or delete that file if you see this.')
                        .replace('%s', warning.path.replace(GLib.get_home_dir(), '~')));
            } else if (warning.code === 'vscode-theme-missing') {
                this._suggestVscodeInstall(warning);
            }
        }
    }

    // Shows a banner for `ms` instead of GNOME's 4 s: critical banners stay
    // (expanded, with their buttons) until hidden; it remains in the list.
    _showFor(source, notification, ms) {
        notification.urgency = MessageTray.Urgency.CRITICAL;
        source.addNotification(notification);
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._sleepIds?.delete(id);
            notification.urgency = MessageTray.Urgency.NORMAL;
            const tray = Main.messageTray;
            if (tray._notification === notification)
                tray._expireNotification?.();
            return GLib.SOURCE_REMOVE;
        });
        this._sleepIds?.add(id);
    }

    _suggestVscodeInstall({family, name, extensions}) {
        if (this._vscodeSuggested.has(family))
            return;
        this._vscodeSuggested.add(family);
        const source = MessageTray.getSystemSource();
        const notification = new MessageTray.Notification({
            source,
            title: fmt(_('VS Code theme for %s is not installed'), name),
            body: _('Install it so VS Code switches together with the desktop theme.'),
        });
        notification.addAction(_('Install theme'), () => this._installVscodeThemes(extensions));
        this._showFor(source, notification, VSCODE_NOTICE_MS);
    }

    async _installVscodeThemes(extensions) {
        const generation = this._generation;
        const result = await installVscodeExtensions(extensions);
        if (!this._alive(generation))
            return;
        if (!result.ok) {
            Main.notifyError(_('VS Code theme was not installed'),
                result.error === 'no-cli' ? _('The VS Code command line (code) was not found.') : result.error);
            return;
        }
        Main.notify(_('VS Code theme installed'), _('VS Code now follows the desktop theme.'));
        // Write the VS Code settings now that the theme exists.
        this._enqueue(async gen => {
            const family = this._activeFamily();
            if (isSystem(family))
                return;
            const {shellCssPath} = await this._applier.applyFamily(family, this._isDark(), {restartServices: false});
            if (this._alive(gen))
                this._loadStylesheet(shellCssPath);
        });
    }

    _onThemesChanged(changedId) {
        this._refreshToggle();
        const activeId = this._settings.get_string('active-family');
        if (activeId === SYSTEM_ID)
            return;
        const family = this._store.get(activeId);
        if (!family) {
            // Active family was deleted or became invalid: go back to Ubuntu.
            this._settings.set_string('active-family', SYSTEM_ID);
            return;
        }
        if (changedId === activeId || changedId === null) {
            this._enqueue(async generation => {
                const {shellCssPath, warnings} = await this._applier.applyFamily(family, this._isDark(), {restartServices: false});
                if (this._alive(generation)) {
                    this._loadStylesheet(shellCssPath);
                    this._showWarnings(warnings);
                }
            });
        }
    }
}
