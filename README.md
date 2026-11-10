# Paletka

GNOME Shell 50 extension (Ubuntu 26.04) that switches whole-desktop color themes from
Quick Settings — shell, GTK4/libadwaita and GTK3 apps, accent, terminal (Ptyxis, GNOME
Terminal), wallpaper and icon theme — and lets you create your own themes in a built-in editor.
Ships **Ubuntu** (your original look), **Solarized**, **Gruvbox**, **Nord** and **Dracula** families (Nord light uses the official Snow Storm colors, Dracula light the official Alucard palette); each family has a light and
dark variant that follows the Dark Style toggle.

## Install (from source)

```bash
make install
```

Then log out and back in (Wayland loads new extensions only at login) and enable it with
`gnome-extensions enable paletka@adamciktomas.github.io`.

## Limitations

GTK apps read their colors only at startup: switching to a different family recolors
already-open app windows the next time they are opened. Light/dark within a family is live.
Firefox, Chrome, Electron, Qt, Flatpak and Snap apps only follow light/dark.

## Before uninstalling

Pick **Ubuntu** in the tile (or "Restore Ubuntu defaults" in preferences) so your original
`gtk.css`, wallpaper, terminal colors, icon theme and accent are restored.

## Development

```bash
make test   # unit tests (gjs)
make e2e    # headless nested GNOME Shell scenario with screenshots
make zip    # build dist/*.shell-extension.zip
```

## Credits

Bundles [adw-gtk3](https://github.com/lassekongo83/adw-gtk3) v6.5 (LGPL-2.1, see
`extension/vendor/adw-gtk3/LICENSE`) for theming GTK3 apps.

VS Code follows the theme when the matching VS Code color theme is installed: Solarized is
built into VS Code; for the others install e.g. *Gruvbox Theme* (jdinhlife), *Nord*
(arcticicestudio) and *Dracula Theme* (dracula-theme). Without it VS Code keeps your theme.
