#!/usr/bin/env python3
# E2E probe: a libadwaita window; prints the label foreground color.
# Usage: probe-gtk4.py print | show SECONDS
import sys, gi
gi.require_version('Gtk', '4.0'); gi.require_version('Adw', '1')
from gi.repository import Gtk, Adw, GLib

mode = sys.argv[1] if len(sys.argv) > 1 else 'print'
seconds = int(sys.argv[2]) if len(sys.argv) > 2 else 5

def activate(app):
    win = Adw.ApplicationWindow(application=app, title='Paletka probe', default_width=520, default_height=360)
    view = Adw.ToolbarView()
    view.add_top_bar(Adw.HeaderBar())
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin_top=24, margin_start=24, margin_end=24)
    label = Gtk.Label(label='The quick brown fox')
    box.append(label)
    btn = Gtk.Button(label='Suggested'); btn.add_css_class('suggested-action'); box.append(btn)
    box.append(Gtk.Button(label='Normal'))
    box.append(Gtk.Entry(text='entry'))
    box.append(Gtk.CheckButton(label='check', active=True))
    view.set_content(box)
    win.set_content(view)
    win.present()

    def report():
        print(label.get_color().to_string(), flush=True)
        if mode == 'print':
            app.quit()
        return False
    GLib.timeout_add(800, report)
    if mode == 'show':
        GLib.timeout_add(seconds * 1000, lambda: app.quit() or False)

app = Adw.Application(application_id='io.github.adamciktomas.PaletkaProbe')
app.connect('activate', activate)
app.run([])
