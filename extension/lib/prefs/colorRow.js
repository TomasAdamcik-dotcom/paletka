// An Adw.ActionRow with a color picker button and an optional reset button.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import {toHex} from '../color.js';

function toRgba(css) {
    const rgba = new Gdk.RGBA();
    rgba.parse(css);
    return rgba;
}

function rgbaToHex(rgba) {
    return toHex({r: rgba.red * 255, g: rgba.green * 255, b: rgba.blue * 255, a: 1});
}

// Returns the row; row.setValue(css) updates it without firing onChange.
export function createColorRow({title, subtitle = '', value, onChange, onReset = null, resetTooltip = ''}) {
    const row = new Adw.ActionRow({title, subtitle});
    const button = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({with_alpha: false, modal: true}),
        valign: Gtk.Align.CENTER,
        rgba: toRgba(value),
    });
    let updating = false;
    button.connect('notify::rgba', () => {
        if (!updating)
            onChange(rgbaToHex(button.rgba));
    });

    if (onReset) {
        const reset = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: resetTooltip,
            css_classes: ['flat'],
        });
        reset.connect('clicked', () => onReset());
        row.add_suffix(reset);
        row._resetButton = reset;
    }
    row.add_suffix(button);
    row.activatable_widget = button;

    row.setValue = css => {
        updating = true;
        button.rgba = toRgba(css);
        updating = false;
    };
    return row;
}
