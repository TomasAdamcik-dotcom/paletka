# Paletka — user guide

Paletka changes the colors of your whole Ubuntu desktop with one click: the top bar and
menus, apps, the terminal, the text editor, VS Code, the wallpaper and the icons. Every theme
comes as a *family* with a light and a dark variant.

## Requirements

- Ubuntu 26.04 (GNOME Shell 50).
- Optional: VS Code (for themed VS Code), Ptyxis or GNOME Terminal, GNOME Text Editor.

## Installing

1. Open [extensions.gnome.org](https://extensions.gnome.org), search for **Paletka** and
   switch it on — or install it from the *Extension Manager* app.
2. If it does not show up right away, log out and back in.

## Switching themes

Open **Quick Settings** (the menu in the top-right corner). Next to the **Dark Style** tile
there is a **Theme** tile.

- Click the arrow on the **Theme** tile to see all themes. Each row has a **Dark** and a
  **Light** button; the highlighted button is the one in use.
- Click the **Theme** tile itself to switch between Ubuntu and the last theme you used.
- The stock **Dark Style** tile always returns to the plain Ubuntu look (light or dark).

What changes right away:

- the top bar, menus and Quick Settings,
- light/dark in every app,
- the terminal colors, the wallpaper, the accent color and the icon theme,
- VS Code, if the matching VS Code theme is installed.

When you switch to a *different* theme family, apps that are already open keep their old
colors until you reopen them. **Files** is restarted for you and reopens its windows. It
waits while Files is working — copying, moving, deleting, transferring to a phone or a network
location, or asking you something in a dialog. The check watches activity, so with very large
file operations it is safest to switch themes after they finish.

### VS Code

Paletka sets VS Code's preferred light and dark themes. Solarized is built into VS Code. For
Gruvbox, Nord and Dracula Paletka shows a notification with an **Install theme** button the
first time you pick the family; one click installs the VS Code theme. If VS Code is not
installed, this part is skipped.

### Claude Code and other terminal apps

Terminal apps use the terminal's 16 colors. For Claude Code run `/theme dark-ansi` (or
`light-ansi`) once, and it follows the terminal colors from then on.

## Creating your own theme

Click **Edit Themes…** at the bottom of the Theme menu (or open Paletka's settings in the
Extensions app).

- **New Theme** starts from the Solarized colors; **Duplicate** copies any theme (duplicating
  Ubuntu gives you its standard colors to start from).
- Pick the **Light** or **Dark** tab and set the six **Base colors**: background, text,
  accent, panels and sidebars, success and error. Everything else is calculated from them.
- **Advanced → Derived colors** lets you override any calculated color; **Back to
  automatic** undoes it.
- **Terminal**: text, background, cursor and the 16 ANSI colors (or **Reset from base
  colors**).
- **Wallpaper**: none, a solid color, a gradient or an image file.
- **Icons**: keep your icons or pick an installed icon theme.
- **VS Code**: the VS Code color theme for this variant.

Changes to the active theme are applied as you edit. **Export…** saves a theme as a JSON
file you can share; **Import…** adds one.

## Turning Paletka off and uninstalling

Turning Paletka off **puts your original look back** — your own GTK settings, wallpaper,
accent, icons, terminal colors, Text Editor scheme and VS Code settings — and removes the
files Paletka created. You can turn it off in any of these places:

- the **Extensions** app or **Extension Manager**,
- [extensions.gnome.org → Installed extensions](https://extensions.gnome.org/local/),
- a terminal: `gnome-extensions disable paletka@adamciktomas.github.io`.

Uninstalling (from the same places, or with
`gnome-extensions uninstall paletka@adamciktomas.github.io`) turns Paletka off first, so it
restores everything the same way.

Good to know:

- Paletka remembers your theme: when you turn it on again, the theme comes back.
- Locking the screen or logging out does **not** turn it off.
- Anything you changed yourself while a theme was active (for example a different wallpaper)
  is kept.
- Apps that were open show the original colors after you reopen them.

If the Paletka folder was deleted by hand without turning it off, install Paletka again, log
out and back in, then turn it off: it restores your look from the backup it keeps in
`~/.local/share/paletka/backup`.

## Troubleshooting

- **"Old color settings found"**: a `~/.config/gtk-4.0/gtk.css` from another tool (for
  example Gradience) fixes some colors, which can make text unreadable in dark mode. Move
  or delete that file.
- **An app still has the old colors**: close it and open it again.
- **VS Code does not change**: install the VS Code theme named in the theme's settings, or
  use the **Install theme** button in the notification.
