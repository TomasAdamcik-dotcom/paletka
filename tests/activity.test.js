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
        '/proc/12/stat': '12 (x) S 1 1 1 0 -1 0 0 0 0 0 3 4 0 0',
        '/proc/14/io': null,
    };
    const fs = {readText: p => files[p] ?? null};
    assertEq(sampleIo(fs, [12, 14]), {chars: 15, calls: 2, cpu: 7});
    assertEq(sampleIo(fs, []), {chars: 0, calls: 0, cpu: 0});
});

import {parseProcCpu, findProcesses} from '../extension/lib/activity.js';

test('activity: steady CPU use counts as busy (e.g. deleting many files)', () => {
    const c = (cpu) => ({chars: 0, calls: 0, cpu});
    assertEq(continuousActivity([c(0), c(20), c(40), c(60)]), true);
    assertEq(continuousActivity([c(0), c(1), c(1), c(2)]), false);
});

test('activity: parses CPU ticks from /proc/<pid>/stat, even with spaces in the name', () => {
    const stat = '4242 (my (odd) app) S 1 4242 4242 0 -1 4194560 100 0 0 0 17 25 0 0 20 0 5 0 99 0 0';
    assertEq(parseProcCpu(stat), 42);
    assertEq(parseProcCpu(null), 0);
});

test('activity: finds the user\'s processes by name prefix', () => {
    const files = {
        '/proc/10/comm': 'gvfsd\n', '/proc/10/status': 'Name:\tgvfsd\nUid:\t1000\t1000\t1000\t1000\n',
        '/proc/11/comm': 'gvfsd-sftp\n', '/proc/11/status': 'Uid:\t1000\t1000\t1000\t1000\n',
        '/proc/12/comm': 'gvfsd-mtp\n', '/proc/12/status': 'Uid:\t1001\t1001\t1001\t1001\n',
        '/proc/13/comm': 'bash\n', '/proc/13/status': 'Uid:\t1000\t1000\t1000\t1000\n',
    };
    const fs = {readText: p => files[p] ?? null, listDir: () => ['10', '11', '12', '13', 'self', 'sys']};
    assertEq(findProcesses(fs, 'gvfsd', 1000), [10, 11]);
});
