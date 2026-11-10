// Preferences page listing all theme families with apply/edit/duplicate/export/delete.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {BUILTIN_IDS, SYSTEM_ID, duplicateFamily, isSystem, resolveActiveId} from '../model.js';
import {FamilyEditorPage} from './familyEditorPage.js';
import {fmt} from '../format.js';

export const FamilyListPage = GObject.registerClass(
class FamilyListPage extends Adw.PreferencesPage {
    _init({window, store, settings, fs, paths}) {
        super._init({title: _('Themes'), icon_name: 'applications-graphics-symbolic'});
        this._window = window;
        this._store = store;
        this._settings = settings;
        this._fs = fs;
        this._paths = paths;
        this._rows = [];

        this._group = new Adw.PreferencesGroup({
            title: _('Themes'),
            description: _('Pick a theme here or in the Theme tile of Quick Settings.'),
        });
        const actions = new Gtk.Box({spacing: 6});
        const newButton = new Gtk.Button({icon_name: 'list-add-symbolic', tooltip_text: _('New Theme'), css_classes: ['flat']});
        newButton.connect('clicked', () => this._newFamily());
        const importButton = new Gtk.Button({icon_name: 'document-open-symbolic', tooltip_text: _('Import…'), css_classes: ['flat']});
        importButton.connect('clicked', () => this._import());
        actions.append(newButton);
        actions.append(importButton);
        this._group.set_header_suffix(actions);
        this.add(this._group);

        const restoreGroup = new Adw.PreferencesGroup({
            title: _('Restore'),
            description: _('Switch back to your original Ubuntu look. Do this before uninstalling the extension.'),
        });
        const restore = new Adw.ButtonRow({title: _('Restore Ubuntu Defaults')});
        restore.connect('activated', () => this._apply(SYSTEM_ID));
        restoreGroup.add(restore);
        this.add(restoreGroup);

        const settingsId = this._settings.connect('changed::active-family', () => this.refresh());
        this._stopMonitor = this._store.monitor(() => this.refresh());
        this.connect('destroy', () => {
            this._stopMonitor?.();
            this._settings.disconnect(settingsId);
        });
        this.refresh();
    }

    _toast(title) {
        this._window.add_toast(new Adw.Toast({title}));
    }

    refresh() {
        for (const row of this._rows)
            this._group.remove(row);
        this._rows = [];
        const families = this._store.loadAll();
        const activeId = resolveActiveId(families, this._settings.get_string('active-family'));
        for (const family of families) {
            const row = this._row(family, family.id === activeId);
            this._group.add(row);
            this._rows.push(row);
        }
    }

    _button(icon, tooltip, onClick) {
        const b = new Gtk.Button({icon_name: icon, tooltip_text: tooltip, valign: Gtk.Align.CENTER, css_classes: ['flat']});
        b.connect('clicked', onClick);
        return b;
    }

    _row(family, active) {
        const builtin = BUILTIN_IDS.includes(family.id);
        const editable = !builtin && !isSystem(family);
        let subtitle = builtin ? _('Built-in') : _('Custom');
        if (isSystem(family))
            subtitle = _('Your original look');
        const row = new Adw.ActionRow({title: family.name, subtitle, activatable: editable});
        row.add_prefix(new Gtk.Image({
            icon_name: active ? 'object-select-symbolic' : 'radio-symbolic',
            opacity: active ? 1 : 0.3,
        }));
        if (!active)
            row.add_suffix(this._button('emblem-ok-symbolic', _('Apply'), () => this._apply(family.id)));
        if (editable)
            row.add_suffix(this._button('document-edit-symbolic', _('Edit'), () => this._edit(family)));
        row.add_suffix(this._button('edit-copy-symbolic', _('Duplicate'), () => this._duplicate(family)));
        if (!isSystem(family))
            row.add_suffix(this._button('document-save-symbolic', _('Export…'), () => this._export(family)));
        if (editable)
            row.add_suffix(this._button('user-trash-symbolic', _('Delete'), () => this._delete(family)));
        if (editable)
            row.connect('activated', () => this._edit(family));
        return row;
    }

    _apply(id) {
        this._settings.set_string('active-family', id);
    }

    _edit(family) {
        this._window.push_subpage(new FamilyEditorPage({
            family, store: this._store, fs: this._fs, paths: this._paths, window: this._window,
        }));
    }

    _ids() {
        return this._store.takenIds();
    }

    _duplicate(family) {
        const copy = duplicateFamily(family, fmt(_('%s (copy)'), family.name), this._ids());
        this._store.save(copy);
        this.refresh();
        this._edit(copy);
    }

    _newFamily() {
        const fresh = duplicateFamily(this._store.get('solarized'), _('My Theme'), this._ids());
        this._store.save(fresh);
        this.refresh();
        this._edit(fresh);
    }

    _delete(family) {
        const dialog = new Adw.AlertDialog({
            heading: fmt(_('Delete “%s”?'), family.name),
            body: _('This theme will be removed permanently.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_d, response) => {
            if (response !== 'delete')
                return;
            if (this._settings.get_string('active-family') === family.id)
                this._apply(SYSTEM_ID);
            this._store.remove(family.id);
            this.refresh();
        });
        dialog.present(this._window);
    }

    _jsonFilter() {
        const filter = new Gtk.FileFilter({name: _('Theme files (JSON)')});
        filter.add_pattern('*.json');
        return filter;
    }

    _export(family) {
        const dialog = new Gtk.FileDialog({title: _('Export Theme'), initial_name: `${family.id}.json`});
        dialog.save(this._window, null, (d, res) => {
            let file;
            try {
                file = d.save_finish(res);
            } catch {
                return;
            }
            try {
                this._store.exportTo(family.id, file.get_path());
                this._toast(_('Theme exported'));
            } catch (e) {
                this._toast(e.message);
            }
        });
    }

    _import() {
        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        filters.append(this._jsonFilter());
        const dialog = new Gtk.FileDialog({title: _('Import Theme'), filters});
        dialog.open(this._window, null, (d, res) => {
            let file;
            try {
                file = d.open_finish(res);
            } catch {
                return;
            }
            try {
                const family = this._store.importFrom(file.get_path());
                this.refresh();
                this._toast(fmt(_('Imported “%s”'), family.name));
            } catch (e) {
                this._toast(fmt(_('Cannot import: %s'), e.message));
            }
        });
    }
});
