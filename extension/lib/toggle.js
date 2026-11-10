// Quick Settings tile: shows the active theme family and lists all families.
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {SYSTEM_ID} from './model.js';

const ICON = 'applications-graphics-symbolic';

export const ThemeToggle = GObject.registerClass({
    Signals: {
        'family-selected': {param_types: [GObject.TYPE_STRING]},
        'variant-selected': {param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN]},
        'edit-requested': {},
    },
}, class ThemeToggle extends QuickMenuToggle {
    _init() {
        super._init({
            title: _('Theme'),
            iconName: ICON,
            toggleMode: false,
            menuButtonAccessibleName: _('Open theme menu'),
        });
        this._activeId = SYSTEM_ID;
        this._lastCustomId = null;

        this.menu.setHeader(ICON, _('Theme'));
        this._section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._section);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const edit = this.menu.addAction(_('Edit Themes…'), () => this.emit('edit-requested'));
        edit.add_style_class_name('paletka-edit');

        this.connect('clicked', () => {
            const target = this._activeId === SYSTEM_ID ? this._lastCustomId : SYSTEM_ID;
            if (target)
                this.emit('family-selected', target);
        });
    }

    // One row per family: its name and a Dark and a Light button.
    // families: [{id, name}], activeId: string, isDark: boolean, lastCustomId: string|null
    setFamilies(families, activeId, isDark, lastCustomId) {
        this._activeId = activeId;
        this._lastCustomId = lastCustomId;
        this._section.removeAll();
        for (const family of families) {
            const item = new PopupMenu.PopupBaseMenuItem({
                activate: false,
                can_focus: false,
                style_class: 'paletka-row',
            });
            item.add_child(new St.Label({
                text: family.name,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            const variants = new St.BoxLayout({style_class: 'paletka-variants'});
            for (const [dark, label] of [[true, _('Dark')], [false, _('Light')]]) {
                const active = family.id === activeId && dark === isDark;
                const button = new St.Button({
                    label,
                    can_focus: true,
                    style_class: `button paletka-variant${active ? ' paletka-variant-active' : ''}`,
                    accessible_name: `${family.name} ${label}`,
                });
                button.connect('clicked', () => this.emit('variant-selected', family.id, dark));
                variants.add_child(button);
            }
            item.add_child(variants);
            this._section.addMenuItem(item);
        }
        const active = families.find(f => f.id === activeId);
        this.subtitle = active ? `${active.name} ${isDark ? _('Dark') : _('Light')}` : null;
        this.checked = activeId !== SYSTEM_ID;
    }
});

export const ThemeIndicator = GObject.registerClass(
class ThemeIndicator extends SystemIndicator {
    _init() {
        super._init();
        this.toggle = new ThemeToggle();
        this.quickSettingsItems.push(this.toggle);
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});
