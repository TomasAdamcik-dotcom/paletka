# Paletka

GNOME Shell 50 extension (Ubuntu 26.04) that switches whole-desktop color themes from
Quick Settings — shell, GTK4/libadwaita and GTK3 apps, accent, terminal (Ptyxis, GNOME
Terminal), GNOME Text Editor, VS Code, wallpaper and icon theme — and lets you create your
own themes in a built-in editor.

Ships **Ubuntu** (your original look), **Solarized**, **Gruvbox**, **Nord** and **Dracula**
families (Nord light uses the official Snow Storm colors, Dracula light the official Alucard
palette). Each family has a light and a dark variant.

- [User guide](docs/user-guide.md) · [Návod v slovenčine](docs/navod.sk.md)
- [Technical documentation](docs/technical.md)

## Install

Download `paletka@adamciktomas.github.io.shell-extension.zip` from the
[latest release](https://github.com/TomasAdamcik-dotcom/paletka/releases/latest) and install it:

```bash
gnome-extensions install --force paletka@adamciktomas.github.io.shell-extension.zip
```

Or build and install from source with `make install`.

Then log out and back in (Wayland loads new extensions only at login) and enable it with
`gnome-extensions enable paletka@adamciktomas.github.io` (or in the Extensions app).

## Web pages and browsers

The **Paletka browser extension** recolors web pages with the active theme — white pages and
dark ones — in Google Chrome, Chromium and Firefox, and follows every theme switch live.
Firefox also gets the theme on its own window; Chrome's window can follow it too.

1. Open **Settings…** in the Theme menu → **Browsers** and turn on your browser.
2. Install the extension in that browser (see the [user guide](docs/user-guide.md#web-pages)).

## Turning it off and uninstalling

> **Note:** turning Paletka off — in the Extensions app, in Extension Manager, on
> extensions.gnome.org or with `gnome-extensions disable` — **restores your original look**:
> your own `gtk.css`, GTK theme, wallpaper, accent, icon theme, terminal colors, Text Editor
> scheme and VS Code settings come back, and the files Paletka generated are removed
> (including the browser host and Chrome's launcher copy).
> Uninstalling turns the extension off first, so it restores everything the same way.
>
> Your theme choice is remembered: turning Paletka on again applies that theme again.
> Locking the screen or logging out does not count as turning it off.
>
> Settings you changed yourself while a Paletka theme was active are kept.

Apps that are open while Paletka is turned off show the original colors after they are
reopened (light/dark-only apps such as VS Code switch immediately).

## Limitations

GTK apps read their colors only at startup: switching to a different family recolors
already-open app windows the next time they are opened (Files is restarted for you, waiting
while it copies, moves, deletes or shows a dialog). Light/dark within a family is live. Firefox, Chrome, Electron
(other than the light/dark choice), Qt, Flatpak and Snap apps only follow light/dark.

## Development

```bash
make test   # unit tests (gjs)
make e2e    # headless nested GNOME Shell scenario with screenshots
make zip    # build dist/*.shell-extension.zip
make browser        # build browser/dist/{chrome,firefox} and their zips
make browser-test   # web-ext lint + browser tests in real Chrome
make pot    # refresh po/paletka.pot
```

See [docs/technical.md](docs/technical.md) for the architecture.

## License

Paletka is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 2 of
the License, or (at your option) any later version. See [LICENSE](LICENSE).

## Credits

Bundles [adw-gtk3](https://github.com/lassekongo83/adw-gtk3) v6.5 (LGPL-2.1, see
`extension/vendor/adw-gtk3/LICENSE`) for theming GTK3 apps.

VS Code follows the theme when the matching VS Code color theme is installed: Solarized is
built into VS Code; for the others Paletka offers a one-click install of *Gruvbox Theme*
(jdinhlife), *Nord* (arcticicestudio) and *Dracula Theme* (dracula-theme). Without it VS Code
keeps your theme.
