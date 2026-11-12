import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {test, assert, assertEq, tmpDir} from './harness.js';
import {encodeMessage, MessageReader} from '../extension/browser-host/nativeMessaging.js';
import {EXT_DIR} from './fixtures.js';

const HOST = `${EXT_DIR}/browser-host/paletka-host.js`;

function writeAtomic(path, obj) {
    GLib.file_set_contents(`${path}.tmp`, JSON.stringify(obj));
    GLib.rename(`${path}.tmp`, path);
}

// Starts the host like a browser does; returns helpers to talk to it.
function startHost(dir) {
    const launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE,
    });
    launcher.setenv('PALETKA_CURRENT', `${dir}/current.json`, true);
    launcher.setenv('XDG_DATA_HOME', `${dir}/data`, true);
    const proc = launcher.spawnv(['gjs', '-m', HOST, 'chrome-extension://abc/']);
    const reader = new MessageReader();
    const queue = [];
    const out = proc.get_stdout_pipe();
    const readMore = () => out.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null, (s, res) => {
        const bytes = s.read_bytes_finish(res);
        if (bytes.get_size() > 0) {
            queue.push(...reader.push(bytes.toArray()));
            readMore();
        }
    });
    readMore();
    const next = timeoutMs => new Promise((resolve, reject) => {
        const end = Date.now() + timeoutMs;
        const poll = () => {
            if (queue.length)
                return resolve(queue.shift());
            if (Date.now() > end)
                return reject(new Error('no message from host'));
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
                poll();
                return GLib.SOURCE_REMOVE;
            });
        };
        poll();
    });
    const send = obj => proc.get_stdin_pipe().write_all(encodeMessage(obj), null);
    return {proc, next, send};
}

const waitExit = (proc, timeoutMs) => new Promise((resolve, reject) => {
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
        reject(new Error('host did not exit'));
        return GLib.SOURCE_REMOVE;
    });
    proc.wait_async(null, (p, res) => {
        GLib.source_remove(id);
        p.wait_finish(res);
        resolve(p.get_exit_status());
    });
});

test('host: sends current.json on start and again when it is replaced', async () => {
    const dir = tmpDir();
    const first = {version: 1, active: true, family: 'solarized', dark: true, colors: {background: '#00252e'}};
    writeAtomic(`${dir}/current.json`, first);
    const host = startHost(dir);
    assertEq(await host.next(3000), {type: 'palette', ...first});
    const second = {...first, family: 'nord', colors: {background: '#2e3440'}};
    writeAtomic(`${dir}/current.json`, second);
    assertEq(await host.next(1000), {type: 'palette', ...second});
    host.proc.get_stdin_pipe().close(null);
    assertEq(await waitExit(host.proc, 1000), 0);
});

test('host: a missing or broken file means the inactive palette', async () => {
    const dir = tmpDir();
    const host = startHost(dir);
    assertEq(await host.next(3000), {type: 'palette', version: 1, active: false});
    GLib.file_set_contents(`${dir}/current.json`, '{ broken');
    assertEq(await host.next(1000), {type: 'palette', version: 1, active: false});
    host.proc.get_stdin_pipe().close(null);
    await waitExit(host.proc, 1000);
});

test('host: hello from the extension is recorded per browser', async () => {
    const dir = tmpDir();
    const host = startHost(dir);
    await host.next(3000);
    host.send({type: 'hello', browser: 'chrome', version: '1.1.0'});
    const seen = `${dir}/data/paletka/browser-host/seen-chrome.json`;
    const end = Date.now() + 1000;
    while (!GLib.file_test(seen, GLib.FileTest.EXISTS) && Date.now() < end)
        await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => r() ?? GLib.SOURCE_REMOVE));
    assert(GLib.file_test(seen, GLib.FileTest.EXISTS), 'seen file written');
    const record = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(seen)[1]));
    assertEq(record.version, '1.1.0');
    assert(typeof record.time === 'number', 'time recorded');
    // Anything else, including a browser name with a path in it, is ignored.
    host.send({type: 'hello', browser: '../evil', version: 'x'});
    host.send({type: 'other'});
    host.proc.get_stdin_pipe().close(null);
    assertEq(await waitExit(host.proc, 1000), 0);
    assert(!GLib.file_test(`${dir}/data/paletka/evil.json`, GLib.FileTest.EXISTS), 'no path traversal');
});
