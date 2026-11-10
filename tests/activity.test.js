import {test, assertEq} from './harness.js';
import {continuousActivity, parseProcIo} from '../extension/lib/activity.js';

const s = (chars, calls) => ({chars, calls});

test('activity: continuous I/O across all intervals means busy', () => {
    assertEq(continuousActivity([s(0, 0), s(24e6, 46000), s(48e6, 92000), s(70e6, 140000)]), true);
    // slow network copy: ~100 KB/s, few syscalls
    assertEq(continuousActivity([s(0, 0), s(100e3, 10), s(200e3, 20), s(300e3, 30)]), true);
});

test('activity: idle or a single burst is not busy', () => {
    assertEq(continuousActivity([s(7e6, 7669), s(7e6, 7669), s(7e6, 7669), s(7e6, 7669)]), false);
    assertEq(continuousActivity([s(0, 0), s(522e3, 79), s(522e3, 85), s(522e3, 85)]), false);
    assertEq(continuousActivity([s(0, 0), s(1e6, 500)]), false);
});

test('activity: parses /proc/<pid>/io', () => {
    const io = 'rchar: 100\nwchar: 50\nsyscr: 7\nsyscw: 3\nread_bytes: 0\nwrite_bytes: 0\n';
    assertEq(parseProcIo(io), {chars: 150, calls: 10});
    assertEq(parseProcIo(null), null);
});

import {sampleIo} from '../extension/lib/activity.js';

test('activity: samples the given processes', () => {
    const files = {
        '/proc/12/io': 'rchar: 10\nwchar: 5\nsyscr: 1\nsyscw: 1\n',
        '/proc/14/io': null,
    };
    const fs = {readText: p => files[p] ?? null};
    assertEq(sampleIo(fs, [12, 14]), {chars: 15, calls: 2});
    assertEq(sampleIo(fs, []), {chars: 0, calls: 0});
});
