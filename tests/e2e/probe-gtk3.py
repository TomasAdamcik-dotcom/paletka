#!/usr/bin/env python3
# E2E probe: a GTK3 window that prints its background color every 0.5 s,
# the value Chromium/Electron use to decide between light and dark.
# Usage: probe-gtk3.py SECONDS
import sys, gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib

seconds = int(sys.argv[1]) if len(sys.argv) > 1 else 10
w = Gtk.Window(title='Paletka GTK3 probe')
w.add(Gtk.Label(label='GTK3'))
w.show_all()

def report():
    c = w.get_style_context().get_background_color(Gtk.StateFlags.NORMAL)
    print('#%02x%02x%02x' % (round(c.red * 255), round(c.green * 255), round(c.blue * 255)), flush=True)
    return True

GLib.timeout_add(500, report)
GLib.timeout_add(seconds * 1000, lambda: Gtk.main_quit() or False)
Gtk.main()
