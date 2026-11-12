// Minimal test harness for gjs -m.
import GLib from 'gi://GLib';

export const registry = [];

export function test(name, fn) {
    registry.push({name, fn});
}

export function assert(cond, msg = 'assertion failed') {
    if (!cond)
        throw new Error(msg);
}

export function assertEq(actual, expected, msg = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg ? `${msg}: ` : ''}expected ${e}, got ${a}`);
}

export function assertThrows(fn, msg = 'expected function to throw') {
    try {
        fn();
    } catch {
        return;
    }
    throw new Error(msg);
}

// Temporary directories, removed by run.js when all tests are done.
export const tmpDirs = [];

export function tmpDir() {
    const dir = GLib.dir_make_tmp('paletka-test-XXXXXX');
    tmpDirs.push(dir);
    return dir;
}
