#!/usr/bin/env bash
# Runs the E2E scenario in a headless nested GNOME Shell with isolated XDG dirs,
# its own D-Bus session and its own dconf database. Never touches the real session.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UUID="paletka@adamciktomas.github.io"
HELPER="helper@paletka.test"
ZIP="$ROOT/dist/$UUID.shell-extension.zip"
OUT="$ROOT/tests/e2e/out/run-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

[ -f "$ZIP" ] || { echo "missing $ZIP (run make zip)"; exit 2; }

# Wayland socket paths are limited to 108 bytes: keep the environment short.
E2E="$(mktemp -d "/run/user/$(id -u)/dt-e2e-XXXX")"
cleanup() {
    for m in $(mount | awk -v d="$E2E" 'index($3, d) == 1 {print $3}'); do
        fusermount3 -u "$m" 2>/dev/null || fusermount -u "$m" 2>/dev/null || true
    done
    rm -rf "$E2E"
}
trap cleanup EXIT
mkdir -p "$E2E"/{config,data,cache,runtime}
chmod 700 "$E2E/runtime"

# A foreign (non-generated) gtk.css that must survive byte-identical.
mkdir -p "$E2E/config/gtk-4.0"
printf '@define-color accent_color #1c71d8;\n@define-color window_bg_color #fafafa;\n' > "$E2E/config/gtk-4.0/gtk.css"
# A VS Code settings.json (JSONC with a comment) that must come back byte-identical.
mkdir -p "$E2E/config/Code/User"
printf '{\n    // mine\n    "editor.fontSize": 14\n}\n' > "$E2E/config/Code/User/settings.json"

# Isolated home and a fake VS Code CLI that records calls and "installs" Nord.
mkdir -p "$E2E/home" "$E2E/bin"
cat > "$E2E/bin/code" <<'CODE'
#!/bin/sh
echo "$@" >> "$HOME/code-calls.log"
dir="$HOME/.vscode/extensions/arcticicestudio.nord-visual-studio-code-0.19.0"
mkdir -p "$dir"
echo '{"contributes":{"themes":[{"label":"Nord","uiTheme":"vs-dark"}]}}' > "$dir/package.json"
CODE
chmod +x "$E2E/bin/code"
# Never touch the real user systemd from the nested session.
printf '#!/bin/sh\necho "$@" >> "$HOME/systemctl-calls.log"\n' > "$E2E/bin/systemctl"
chmod +x "$E2E/bin/systemctl"
# Many small files so a copy in Files lasts long enough to be "busy".
mkdir -p "$E2E/home/Documents" "$E2E/home/copy-src"
python3 -c "
import sys
for i in range(150000):
    open(f'{sys.argv[1]}/f{i:06d}.txt', 'w').write('x' * 256)
" "$E2E/home/copy-src"

EXT_DIR="$E2E/data/gnome-shell/extensions"
mkdir -p "$EXT_DIR/$UUID"
unzip -q "$ZIP" -d "$EXT_DIR/$UUID"
glib-compile-schemas "$EXT_DIR/$UUID/schemas"
cp -r "$ROOT/tests/e2e/$HELPER" "$EXT_DIR/"

export XDG_CONFIG_HOME="$E2E/config" XDG_DATA_HOME="$E2E/data" XDG_CACHE_HOME="$E2E/cache" \
    XDG_RUNTIME_DIR="$E2E/runtime" XDG_CURRENT_DESKTOP="ubuntu:GNOME" \
    GSETTINGS_SCHEMA_DIR="$EXT_DIR/$UUID/schemas:/usr/share/glib-2.0/schemas" \
    E2E_ROOT="$ROOT" E2E_OUT="$OUT" E2E_UUID="$UUID" HOME="$E2E/home" PATH="$E2E/bin:$PATH"
unset WAYLAND_DISPLAY DISPLAY DBUS_SESSION_BUS_ADDRESS

set +e
dbus-run-session -- bash -c '
    set -e
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell enabled-extensions "[\"$E2E_UUID\", \"helper@paletka.test\"]"
    gsettings set org.gnome.shell.extensions.paletka restart-background-services false
    gsettings set org.gnome.desktop.interface gtk-theme Yaru
    gsettings set org.gnome.desktop.interface icon-theme Yaru
    gsettings set org.gnome.desktop.interface color-scheme default
    # Keep desktop icons and file indexers away from the real home directory.
    gsettings set org.gnome.shell disabled-extensions "[\"ding@rastersoft.com\"]"

    gsettings set org.freedesktop.Tracker3.Miner.Files index-recursive-directories "[]" || true
    gsettings set org.freedesktop.Tracker3.Miner.Files index-single-directories "[]" || true
    gsettings set org.freedesktop.Tracker3.Miner.Files crawling-interval -2 || true
    gnome-shell --headless --wayland --no-x11 --mode=ubuntu --virtual-monitor 1600x1000 \
        > "$E2E_OUT/shell.log" 2>&1 &
    SHELL_PID=$!
    for _ in $(seq 1 60); do
        gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell \
            -m org.freedesktop.DBus.Properties.Get org.gnome.Shell ShellVersion >/dev/null 2>&1 && break
        sleep 0.5
    done
    sleep 2
    set +e
    gjs -m "$E2E_ROOT/tests/e2e/scenario.js" > "$E2E_OUT/scenario.txt" 2>&1
    STATUS=$?
    kill $SHELL_PID 2>/dev/null
    wait $SHELL_PID 2>/dev/null
    exit $STATUS
' > "$OUT/session.log" 2>&1
STATUS=$?
cat "$OUT/scenario.txt" 2>/dev/null
grep -E "paletka|Paletka|JS ERROR" "$OUT/shell.log" > "$OUT/extension-log.txt" || true
echo "artifacts: $OUT"
exit $STATUS
