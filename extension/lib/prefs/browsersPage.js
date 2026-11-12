// Preferences page: which browsers get the theme colors through the Paletka
// browser extension. The shell side installs and removes the host; this page
// only changes the settings and shows how far each browser got.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {HOST_NAME, detectBrowsers, hostState} from '../browsers.js';

const REFRESH_MS = 2000;

function stateText(state) {
    return {
        'off': _('Off'),
        'waiting': _('Install the Paletka extension in this browser'),
        'needs-permission': _('Focus Firefox and allow Paletka in the system dialog'),
        'active': _('Active'),
    }[state];
}

// Whether the desktop portal lets the Firefox snap start Paletka's host.
async function firefoxAllowed() {
    try {
        const reply = await Gio.DBus.session.call('org.freedesktop.impl.portal.PermissionStore',
            '/org/freedesktop/impl/portal/PermissionStore', 'org.freedesktop.impl.portal.PermissionStore',
            'Lookup', new GLib.Variant('(ss)', ['webextensions', HOST_NAME]),
            new GLib.VariantType('(a{sas}v)'), Gio.DBusCallFlags.NONE, 1000, null);
        const [permissions] = reply.deepUnpack();
        return (permissions['snap.firefox'] ?? []).includes('yes');
    } catch {
        return false;
    }
}

export const BrowsersPage = GObject.registerClass(
class BrowsersPage extends Adw.PreferencesPage {
    _init({settings, fs, paths}) {
        super._init({title: _('Browsers'), icon_name: 'web-browser-symbolic', name: 'browsers'});
        this._settings = settings;
        this._fs = fs;
        this._paths = paths;
        this._rows = [];

        const group = new Adw.PreferencesGroup({
            title: _('Web pages'),
            description: _('Recolor web pages with the active theme. Each browser needs the Paletka browser extension.'),
        });
        this.add(group);
        const browsers = detectBrowsers(fs, paths);
        if (browsers.length === 0)
            group.add(new Adw.ActionRow({title: _('No supported browser found')}));
        for (const browser of browsers) {
            const row = new Adw.SwitchRow({title: browser.name});
            row.active = settings.get_strv('browsers').includes(browser.id);
            row.connect('notify::active', () => this._setEnabled(browser.id, row.active));
            const button = new Gtk.Button({label: _('Get Extension'), valign: Gtk.Align.CENTER, visible: false});
            button.connect('clicked', () => Gio.AppInfo.launch_default_for_uri(browser.storeUrl, null));
            row.add_suffix(button);
            group.add(row);
            this._rows.push({browser, row, button});

            if (browser.id === 'chrome') {
                const windowRow = new Adw.SwitchRow({
                    title: _('Theme Chrome’s window'),
                    subtitle: _('Restarts Chrome with GTK 3 from now on. Also choose Appearance → Mode → GTK in Chrome’s settings.'),
                });
                settings.bind('chrome-window', windowRow, 'active', Gio.SettingsBindFlags.DEFAULT);
                group.add(windowRow);
            }
        }

        this._refresh();
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REFRESH_MS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
        this.connect('destroy', () => {
            if (this._timeoutId)
                GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        });
    }

    _setEnabled(id, enabled) {
        const ids = this._settings.get_strv('browsers').filter(b => b !== id);
        this._settings.set_strv('browsers', enabled ? [...ids, id] : ids);
    }

    async _refresh() {
        const allowed = await firefoxAllowed();
        for (const {browser, row, button} of this._rows) {
            const state = hostState(this._fs, this._paths, browser, allowed);
            row.subtitle = stateText(state);
            button.visible = state === 'waiting';
        }
    }
});
