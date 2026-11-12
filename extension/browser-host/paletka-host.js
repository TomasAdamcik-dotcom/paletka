#!/usr/bin/env -S gjs -m
// Paletka's native messaging host. Browsers start it for the Paletka browser
// extension; it sends the active palette (current.json) now and whenever it
// changes, records which browser connected, and exits when the browser
// closes its end. It reads nothing else and accepts no other requests.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {encodeMessage, MessageReader} from './nativeMessaging.js';

const DATA = `${GLib.get_user_data_dir()}/paletka`;
const CURRENT = GLib.getenv('PALETKA_CURRENT') ?? `${DATA}/current.json`;
const INACTIVE = {version: 1, active: false};
const BROWSERS = ['chrome', 'chromium', 'firefox'];

const loop = new GLib.MainLoop(null, false);
const output = new Gio.UnixOutputStream({fd: 1, close_fd: false});
const input = new Gio.UnixInputStream({fd: 0, close_fd: false});

function send(obj) {
    output.write_all(encodeMessage(obj), null);
    output.flush(null);
}

function readCurrent() {
    try {
        const [, bytes] = GLib.file_get_contents(CURRENT);
        const palette = JSON.parse(new TextDecoder().decode(bytes));
        return palette?.version === 1 ? palette : INACTIVE;
    } catch {
        return INACTIVE;
    }
}

function sendCurrent() {
    send({type: 'palette', ...readCurrent()});
}

// Lets Paletka's preferences show that the extension is connected.
function recordHello(msg) {
    if (!BROWSERS.includes(msg.browser))
        return;
    const dir = `${DATA}/browser-host`;
    GLib.mkdir_with_parents(dir, 0o755);
    const record = {version: String(msg.version ?? ''), time: Date.now()};
    GLib.file_set_contents(`${dir}/seen-${msg.browser}.json`, JSON.stringify(record));
}

const monitor = Gio.File.new_for_path(CURRENT).monitor_file(Gio.FileMonitorFlags.WATCH_MOVES, null);
monitor.set_rate_limit(50);
const EVENTS = [
    Gio.FileMonitorEvent.CHANGES_DONE_HINT, Gio.FileMonitorEvent.CREATED, Gio.FileMonitorEvent.DELETED,
    Gio.FileMonitorEvent.MOVED_IN, Gio.FileMonitorEvent.RENAMED,
];
monitor.connect('changed', (_m, _file, _other, event) => {
    if (EVENTS.includes(event))
        sendCurrent();
});

const reader = new MessageReader();
function readNext() {
    input.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, null, (stream, res) => {
        let bytes;
        try {
            bytes = stream.read_bytes_finish(res);
        } catch {
            loop.quit();
            return;
        }
        if (bytes.get_size() === 0) {
            loop.quit();
            return;
        }
        try {
            for (const msg of reader.push(bytes.toArray())) {
                if (msg?.type === 'hello')
                    recordHello(msg);
            }
        } catch {
            // A malformed message from the browser: ignore it.
        }
        readNext();
    });
}

readNext();
sendCurrent();
loop.run();
