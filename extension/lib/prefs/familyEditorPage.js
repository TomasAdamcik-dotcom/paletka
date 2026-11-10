// Editor for one custom theme family: base colors, derived overrides, terminal,
// wallpaper and icon theme for the light and dark variant. Saves automatically.
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {BASE_KEYS, DERIVED_KEYS, resolveVariant} from '../palette.js';
import {
    setBaseColor, setOverride, clearOverride, setTerminalColor, resetTerminal,
    setWallpaper, setIconTheme, setVscodeTheme, rename, validateFamily,
} from '../model.js';
import {listIconThemes} from '../iconThemes.js';
import {listVscodeThemes, VSCODE_EXTENSION_DIRS} from '../vscodeThemes.js';
import {createColorRow} from './colorRow.js';
import {fmt} from '../format.js';

const SAVE_DELAY_MS = 500;

const BASE_LABELS = {
    background: () => _('Background'),
    foreground: () => _('Text'),
    accent: () => _('Accent'),
    surface: () => _('Panels and sidebars'),
    success: () => _('Success'),
    error: () => _('Error'),
};

const WALLPAPER_TYPES = ['none', 'solid', 'gradient', 'file'];

const prettyKey = key => key.replaceAll('_', ' ').replace(/\bbg\b/, 'background').replace(/\bfg\b/, 'text');

export const FamilyEditorPage = GObject.registerClass(
class FamilyEditorPage extends Adw.NavigationPage {
    _init({family, store, fs, paths, window}) {
        super._init({title: family.name, tag: 'editor'});
        this._family = family;
        this._store = store;
        this._fs = fs;
        this._paths = paths;
        this._window = window;
        this._variant = 'light';
        this._saveId = 0;

        const toggle = new Adw.ToggleGroup({css_classes: ['round']});
        toggle.add(new Adw.Toggle({name: 'light', label: _('Light')}));
        toggle.add(new Adw.Toggle({name: 'dark', label: _('Dark')}));
        toggle.active_name = 'light';
        toggle.connect('notify::active-name', () => {
            this._variant = toggle.active_name;
            this._rebuild();
        });

        const header = new Adw.HeaderBar({title_widget: toggle});
        this._view = new Adw.ToolbarView();
        this._view.add_top_bar(header);
        this.set_child(this._view);
        this._rebuild();

        this.connect('hidden', () => this.flush());
    }

    _v() {
        return this._family[this._variant];
    }

    _update(family, {rebuild = false} = {}) {
        this._family = family;
        this._scheduleSave();
        if (rebuild)
            this._rebuild();
        else
            this._refreshDerived();
    }

    _scheduleSave() {
        if (this._saveId)
            GLib.source_remove(this._saveId);
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._saveId = 0;
            this._save();
            return GLib.SOURCE_REMOVE;
        });
    }

    _save() {
        try {
            this._store.save(this._family);
        } catch (e) {
            this._window.add_toast(new Adw.Toast({title: e.message}));
        }
    }

    flush() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
            this._save();
        }
    }

    _rebuild() {
        const page = new Adw.PreferencesPage();
        page.add(this._generalGroup());
        page.add(this._baseGroup());
        page.add(this._advancedGroup());
        page.add(this._terminalGroup());
        page.add(this._wallpaperGroup());
        page.add(this._iconGroup());
        const vscode = this._vscodeGroup();
        if (vscode)
            page.add(vscode);
        this._view.set_content(page);
    }

    _generalGroup() {
        const group = new Adw.PreferencesGroup();
        const name = new Adw.EntryRow({title: _('Name'), text: this._family.name});
        name.connect('changed', () => {
            const text = name.text.trim();
            // Keep the last valid name rather than saving a theme that no longer loads.
            const valid = text && validateFamily(rename(this._family, text)).ok;
            if (valid) {
                name.remove_css_class('error');
                this.title = text;
                this._update(rename(this._family, text));
            } else {
                name.add_css_class('error');
            }
        });
        group.add(name);
        return group;
    }

    _baseGroup() {
        const group = new Adw.PreferencesGroup({
            title: _('Base colors'),
            description: _('Everything else is derived from these six colors.'),
        });
        for (const key of BASE_KEYS) {
            group.add(createColorRow({
                title: BASE_LABELS[key](),
                value: this._v().base[key],
                onChange: hex => this._update(setBaseColor(this._family, this._variant, key, hex)),
            }));
        }
        return group;
    }

    _advancedGroup() {
        const group = new Adw.PreferencesGroup({title: _('Advanced')});
        const expander = new Adw.ExpanderRow({
            title: _('Derived colors'),
            subtitle: _('Override any computed color'),
        });
        this._derivedRows = new Map();
        const resolved = resolveVariant(this._v(), this._variant === 'dark');
        for (const key of DERIVED_KEYS) {
            const row = createColorRow({
                title: prettyKey(key),
                value: resolved[key],
                onChange: hex => this._update(setOverride(this._family, this._variant, key, hex)),
                onReset: () => this._update(clearOverride(this._family, this._variant, key)),
                resetTooltip: _('Back to automatic'),
            });
            expander.add_row(row);
            this._derivedRows.set(key, row);
        }
        group.add(expander);
        this._refreshDerived();
        return group;
    }

    _refreshDerived() {
        if (!this._derivedRows)
            return;
        const resolved = resolveVariant(this._v(), this._variant === 'dark');
        const overrides = this._v().overrides ?? {};
        for (const [key, row] of this._derivedRows) {
            row.setValue(resolved[key]);
            const custom = key in overrides;
            row.subtitle = custom ? _('Custom') : _('Automatic');
            row._resetButton.visible = custom;
        }
    }

    _terminalGroup() {
        const group = new Adw.PreferencesGroup({title: _('Terminal')});
        const t = this._v().terminal;
        const setT = field => hex => this._update(setTerminalColor(this._family, this._variant, field, hex));
        group.add(createColorRow({title: _('Text'), value: t.foreground, onChange: setT('foreground')}));
        group.add(createColorRow({title: _('Background'), value: t.background, onChange: setT('background')}));
        group.add(createColorRow({title: _('Cursor'), value: t.cursor, onChange: setT('cursor')}));
        const palette = new Adw.ExpanderRow({title: _('Palette'), subtitle: _('16 ANSI colors')});
        t.palette.forEach((color, i) => {
            palette.add_row(createColorRow({title: fmt(_('Color %d'), i), value: color, onChange: setT(i)}));
        });
        group.add(palette);
        const reset = new Adw.ButtonRow({title: _('Reset from base colors')});
        reset.connect('activated', () => this._update(resetTerminal(this._family, this._variant), {rebuild: true}));
        group.add(reset);
        return group;
    }

    _wallpaperGroup() {
        const group = new Adw.PreferencesGroup({title: _('Wallpaper')});
        const spec = this._v().wallpaper ?? {type: 'none'};
        const base = this._v().base;
        const labels = [_('Keep current wallpaper'), _('Solid color'), _('Gradient'), _('Image file')];
        const combo = new Adw.ComboRow({title: _('Type'), model: Gtk.StringList.new(labels)});
        combo.selected = Math.max(0, WALLPAPER_TYPES.indexOf(spec.type));
        combo.connect('notify::selected', () => {
            const type = WALLPAPER_TYPES[combo.selected];
            const next = {
                none: {type},
                solid: {type, color: spec.color ?? base.background},
                gradient: {type, from: spec.from ?? base.background, to: spec.to ?? base.surface},
                file: {type, path: spec.path ?? ''},
            }[type];
            this._update(setWallpaper(this._family, this._variant, next), {rebuild: true});
        });
        group.add(combo);

        const set = patch => this._update(setWallpaper(this._family, this._variant, {...spec, ...patch}));
        if (spec.type === 'solid')
            group.add(createColorRow({title: _('Color'), value: spec.color, onChange: color => set({color})}));
        if (spec.type === 'gradient') {
            group.add(createColorRow({title: _('From'), value: spec.from, onChange: from => set({from})}));
            group.add(createColorRow({title: _('To'), value: spec.to, onChange: to => set({to})}));
        }
        if (spec.type === 'file') {
            const row = new Adw.ActionRow({title: _('Image'), subtitle: spec.path || _('None selected')});
            const pick = new Gtk.Button({label: _('Choose…'), valign: Gtk.Align.CENTER});
            pick.connect('clicked', () => this._chooseImage(path => {
                row.subtitle = path;
                set({path});
            }));
            row.add_suffix(pick);
            group.add(row);
        }
        return group;
    }

    _chooseImage(done) {
        const filter = new Gtk.FileFilter({name: _('Images')});
        filter.add_mime_type('image/*');
        const dialog = new Gtk.FileDialog({title: _('Choose Wallpaper'), default_filter: filter});
        dialog.open(this._window, null, (d, res) => {
            try {
                const file = d.open_finish(res);
                if (file?.get_path())
                    done(file.get_path());
            } catch {
                // cancelled
            }
        });
    }

    _iconGroup() {
        const group = new Adw.PreferencesGroup({title: _('Icons')});
        const themes = listIconThemes(this._fs, this._paths.iconDirs);
        const current = this._v().iconTheme;
        const names = [null, ...themes];
        if (current && !themes.includes(current))
            names.push(current);
        const labels = names.map(n => n ?? _('Keep current icons'));
        const combo = new Adw.ComboRow({title: _('Icon theme'), model: Gtk.StringList.new(labels)});
        combo.selected = Math.max(0, names.indexOf(current ?? null));
        combo.connect('notify::selected', () =>
            this._update(setIconTheme(this._family, this._variant, names[combo.selected])));
        group.add(combo);
        return group;
    }

    _vscodeGroup() {
        const dark = this._variant === 'dark';
        const themes = listVscodeThemes(this._fs, VSCODE_EXTENSION_DIRS(GLib.get_home_dir()))
            .filter(t => t.dark === dark)
            .map(t => t.id);
        if (themes.length === 0)
            return null;
        const group = new Adw.PreferencesGroup({
            title: _('VS Code'),
            description: _('VS Code switches to this color theme together with the desktop.'),
        });
        const current = this._v().vscodeTheme ?? null;
        const names = [null, ...themes];
        if (current && !themes.includes(current))
            names.push(current);
        const labels = names.map(n => n ?? _('Keep current VS Code theme'));
        const combo = new Adw.ComboRow({title: _('Color theme'), model: Gtk.StringList.new(labels)});
        combo.selected = Math.max(0, names.indexOf(current));
        combo.connect('notify::selected', () =>
            this._update(setVscodeTheme(this._family, this._variant, names[combo.selected])));
        group.add(combo);
        return group;
    }
});
