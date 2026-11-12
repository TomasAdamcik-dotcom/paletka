// Paletka: switch whole-desktop theme families from Quick Settings.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

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
import {continuousActivity, sampleIo, findProcesses} from './lib/activity.js';
import {BROWSERS, installHost, removeHost} from './lib/browsers.js';

const SCHEME_DEBOUNCE_MS = 150;
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
            openFolder: uri => this._openFilesWindow(uri),
            isPortalBusy: () => this._isPortalBusy(),
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
        this._cancellable = new Gio.Cancellable();
        this._noticeSource = null;
        // Families whose missing VS Code theme was already suggested this session.
        this._vscodeSuggested = new Set();
        this._stylesheet = null;
        this._schemeTimeoutId = 0;

        this._addIndicator();

        // Screen sharing and remote desktop sessions (not the shell's own
        // screen recordings), which a portal restart would end.
        this._sharing = new Set();
        global.backend.get_remote_access_controller()?.connectObject('new-handle', (_c, handle) => {
            if (handle.is_recording)
                return;
            this._sharing.add(handle);
            handle.connectObject('stopped', () => {
                handle.disconnectObject(this);
                this._sharing?.delete(handle);
            }, this);
        }, this);

        this._settings.connectObject('changed::active-family', () => this._enqueue(generation => this._applyActive(generation)), this);
        this._settings.connectObject('changed::browsers', () => this._syncBrowserHosts(), this);
        this._syncBrowserHosts();
        this._iface.connectObject('changed::color-scheme', () => {
            this._refreshToggle();
            this._scheduleVariant();
        }, this);
        this._familiesCache = null;
        this._stopMonitor = this._store.monitor(id => {
            this._familiesCache = null;
            this._onThemesChanged(id);
        });
        Main.sessionMode.connectObject('updated', () => this._syncLocked(), this);
        this._syncLocked();

        this._refreshToggle();
        this._enqueue(generation => this._restoreOnEnable(generation));
    }

    // session-modes includes unlock-dialog so the shell theme stays applied on the
    // lock screen (the tile is hidden while locked), and the shell does not
    // disable extensions at logout. When the user turns the extension off or
    // uninstalls it, the original look is restored; the chosen family stays in
    // the settings and is applied again by the next enable().
    disable() {
        this._generation++;
        if (this._isTurnedOff())
            this._restoreForDisable();
        if (this._schemeTimeoutId) {
            GLib.source_remove(this._schemeTimeoutId);
            this._schemeTimeoutId = 0;
        }
        this._stopMonitor?.();
        this._stopMonitor = null;
        this._services?.destroy();
        this._services = null;
        for (const id of this._sleepIds ?? [])
            GLib.source_remove(id);
        this._sleepIds = null;
        this._cancellable?.cancel();
        this._cancellable = null;
        // Its "Install theme" button must not outlive the extension.
        this._noticeSource?.destroy();
        this._noticeSource = null;
        this._vscodeSuggested = null;
        Main.sessionMode.disconnectObject(this);
        global.backend.get_remote_access_controller()?.disconnectObject(this);
        for (const handle of this._sharing ?? [])
            handle.disconnectObject(this);
        this._sharing = null;
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
        this._familiesCache = null;
        this._applier = null;
        this._fs = null;
        this._queue = null;
        this._logger = null;
    }

    // The browser host is installed for the browsers chosen in the preferences
    // (re-installed on enable so an updated extension ships its new host).
    _syncBrowserHosts() {
        const wanted = this._settings.get_strv('browsers');
        for (const browser of BROWSERS) {
            try {
                if (wanted.includes(browser.id))
                    installHost(this._fs, this._paths, browser, `${this.path}/browser-host`);
                else
                    removeHost(this._fs, this._paths, browser);
            } catch (e) {
                this._logger.warn(`cannot set up ${browser.name}: ${e.message}`);
            }
        }
    }

    // Disabling another extension that was enabled earlier makes the shell
    // disable and re-enable this one right away; only a real turn-off (or an
    // uninstall or update) marks this extension as deactivating.
    _isTurnedOff() {
        const state = Main.extensionManager.lookup(this.uuid)?.state;
        return state === ExtensionState.DEACTIVATING;
    }

    _restoreForDisable() {
        try {
            if (!isSystem(this._activeFamily()) || this._applier.isApplied())
                // Synchronous without the service restart; open apps pick it up when reopened.
                this._applier.restoreSystem(this._isDark(), {restartServices: false}).catch(e => this._logger.error(`restore failed: ${e.message}`));
            this._applier.removeLeftovers();
        } catch (e) {
            this._logger.error(`restore on disable failed: ${e.message}`);
        }
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
        // Place the tile right after the stock Dark Style tile. There is no public
        // API for the position or for that tile, so this uses the private
        // _darkMode indicator and falls back to the default place without it.
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

    // Theme files change only through the store's directory monitor.
    _families() {
        this._familiesCache ??= this._store.loadAll();
        return this._familiesCache;
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

    async _restoreOnEnable(generation) {
        this._applier.writeSourceSchemes(this._families());
        const family = this._activeFamily();
        if (isSystem(family) && !this._applier.isApplied())
            return;
        // Turned back on after disable() restored the original look, or the
        // active theme file is gone (back to Ubuntu): apply it fully.
        if (isSystem(family) || !this._applier.isApplied()) {
            await this._applyActive(generation);
            return;
        }
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
            if (!this._sleepIds) {
                resolve();
                return;
            }
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                this._sleepIds?.delete(id);
                resolve();
                return GLib.SOURCE_REMOVE;
            });
            this._sleepIds?.add(id);
        });
    }

    // PID of the process owning the app's D-Bus name in this session, if running.
    _pidsFor(appId) {
        const name = BUS_NAMES[appId];
        return name ? this._pidsForName(name) : Promise.resolve([]);
    }

    async _pidsForName(name) {
        try {
            const reply = await Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [name]),
                new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, 1000, this._cancellable);
            return [reply.deepUnpack()[0]];
        } catch {
            return [];
        }
    }

    // Files blocks logout and suspend for as long as a copy, move, delete or
    // trash operation runs, including while it waits on a question.
    async _inhibitsLogout(appId) {
        const id = appId.replace(/\.desktop$/, '');
        const call = (path, iface, method, type) => Gio.DBus.session.call('org.gnome.SessionManager', path,
            iface, method, null, new GLib.VariantType(type), Gio.DBusCallFlags.NO_AUTO_START, 1000, this._cancellable);
        try {
            const reply = await call('/org/gnome/SessionManager', 'org.gnome.SessionManager', 'GetInhibitors', '(ao)');
            for (const path of reply.deepUnpack()[0]) {
                const [owner] = (await call(path, 'org.gnome.SessionManager.Inhibitor', 'GetAppId', '(s)')).deepUnpack();
                if (owner === id)
                    return true;
            }
        } catch {
            // No session manager (e.g. a nested test shell): rely on the other checks.
        }
        return false;
    }

    // A dialog of the app (e.g. Files asking what to do with an existing file
    // in the middle of a copy) means work is waiting for the user.
    _hasDialog(appId) {
        const app = Shell.AppSystem.get_default().lookup_app(appId);
        return (app?.get_windows() ?? []).some(w => w.get_transient_for() !== null ||
            [Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG].includes(w.get_window_type()));
    }

    // True when the app has a dialog open, or shows file work in each of three
    // consecutive seconds. For Files this includes the gvfsd processes that do
    // the transfers for phones, cameras and network locations.
    async _isBusy(appId) {
        if (this._hasDialog(appId) || await this._inhibitsLogout(appId))
            return true;
        const pids = await this._pidsFor(appId);
        if (pids.length === 0 || !this._fs)
            return false;
        if (appId === NAUTILUS) {
            const uid = Number(/^Uid:\s*(\d+)/m.exec(this._fs.readText('/proc/self/status') ?? '')?.[1]);
            pids.push(...findProcesses(this._fs, 'gvfsd', uid));
        }
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

    // True while the portal shows a window (e.g. a file chooser) or the screen
    // is shared.
    async _isPortalBusy() {
        if (this._sharing?.size)
            return true;
        const pids = await this._pidsForName('org.freedesktop.impl.portal.desktop.gnome');
        return global.get_window_actors().some(a => pids.includes(a.meta_window.get_pid()));
    }

    // D-Bus activation starts Files as its own service, outside the shell.
    async _openFilesWindow(uri) {
        await Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1', 'ShowFolders', new GLib.Variant('(ass)', [[uri], '']),
            null, Gio.DBusCallFlags.NONE, 10000, this._cancellable);
    }

    // Open Files windows as arrays of URIs (org.freedesktop.FileManager1).
    async _filesWindowLocations() {
        try {
            const reply = await Gio.DBus.session.call('org.gnome.Nautilus', '/org/freedesktop/FileManager1',
                'org.freedesktop.DBus.Properties', 'Get',
                new GLib.Variant('(ss)', ['org.freedesktop.FileManager1', 'OpenWindowsWithLocations']),
                new GLib.VariantType('(v)'), Gio.DBusCallFlags.NO_AUTO_START, 2000, this._cancellable);
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

    _suggestVscodeInstall({family, name, extensions}) {
        if (this._vscodeSuggested.has(family))
            return;
        this._vscodeSuggested.add(family);
        const source = this._noticeSourceFor();
        const notification = new MessageTray.Notification({
            source,
            title: fmt(_('VS Code theme for %s is not installed'), name),
            body: _('Install it so VS Code switches together with the desktop theme.'),
        });
        const generation = this._generation;
        notification.addAction(_('Install theme'), () => {
            if (this._alive(generation))
                this._installVscodeThemes(extensions);
        });
        // A regular banner; it stays in the notification list with its button.
        source.addNotification(notification);
    }

    _noticeSourceFor() {
        if (!this._noticeSource) {
            this._noticeSource = new MessageTray.Source({
                title: _('Paletka'),
                iconName: 'applications-graphics-symbolic',
            });
            this._noticeSource.connect('destroy', () => (this._noticeSource = null));
            Main.messageTray.add(this._noticeSource);
        }
        return this._noticeSource;
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
        if (changedId !== null && /^[a-z0-9-]+$/.test(changedId) && changedId !== SYSTEM_ID) {
            const changed = this._store.get(changedId);
            if (changed)
                // Text Editor lists every theme, so keep its scheme current.
                this._applier.writeSourceSchemes([changed]);
            else
                // Deleted: after any switch back to Ubuntu below, drop its files.
                this._enqueue(() => this._applier.removeFamilyFiles(changedId));
        }
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
