import {test, assertEq} from './harness.js';
import {Services} from '../extension/lib/services.js';

test('services: restarts portal, quits apps without windows only', async () => {
    const calls = [];
    const services = new Services({
        spawn: async argv => calls.push(argv.join(' ')),
        hasWindows: id => id === 'org.gnome.Nautilus.desktop',
    });
    await services.restart();
    assertEq(calls, [
        'systemctl --user try-restart xdg-desktop-portal-gnome.service',
        'gnome-software --quit',
    ]);
});

test('services: a failing command does not stop the others', async () => {
    const calls = [];
    const services = new Services({
        spawn: async argv => {
            calls.push(argv[0]);
            if (argv[0] === 'systemctl')
                throw new Error('boom');
        },
        hasWindows: () => false,
        log: () => {},
    });
    await services.restart();
    assertEq(calls, ['systemctl', 'nautilus', 'gnome-software']);
});

function deferredHarness() {
    const calls = [];
    const watchers = new Map();
    const windows = new Set(['org.gnome.Nautilus.desktop']);
    const services = new Services({
        spawn: async argv => calls.push(argv.join(' ')),
        hasWindows: id => windows.has(id),
        whenHidden: (id, cb) => {
            watchers.set(id, cb);
            return () => watchers.delete(id);
        },
        log: () => {},
    });
    const closeLastWindow = async id => {
        windows.delete(id);
        const cb = watchers.get(id);
        watchers.delete(id);
        await cb?.();
    };
    return {services, calls, watchers, closeLastWindow};
}

test('services: an app with open windows is quit once its last window closes', async () => {
    const {services, calls, closeLastWindow} = deferredHarness();
    await services.restart();
    assertEq(calls.includes('nautilus --quit'), false);
    await closeLastWindow('org.gnome.Nautilus.desktop');
    assertEq(calls.filter(c => c === 'nautilus --quit').length, 1);
});

test('services: repeated switches register only one pending quit', async () => {
    const {services, calls, watchers, closeLastWindow} = deferredHarness();
    await services.restart();
    await services.restart();
    assertEq(watchers.size, 1);
    await closeLastWindow('org.gnome.Nautilus.desktop');
    assertEq(calls.filter(c => c === 'nautilus --quit').length, 1);
});

test('services: cancelPending drops deferred quits', async () => {
    const {services, calls, watchers} = deferredHarness();
    await services.restart();
    services.cancelPending();
    assertEq(watchers.size, 0);
    assertEq(calls.includes('nautilus --quit'), false);
});

function busyHarness({busy = false, windows = []} = {}) {
    const calls = [];
    const watchers = new Map();
    const timers = [];
    const open = new Set(windows);
    const state = {busy};
    const services = new Services({
        spawn: async argv => calls.push(argv.join(' ')),
        hasWindows: id => open.has(id),
        whenHidden: (id, cb) => {
            watchers.set(id, cb);
            return () => watchers.delete(id);
        },
        isBusy: async () => state.busy,
        later: (ms, cb) => {
            const t = {ms, cb, cancelled: false};
            timers.push(t);
            return () => (t.cancelled = true);
        },
        getWindowLocations: async () => [['file:///home/u/a', 'file:///home/u/b'], ['file:///home/u/c']],
        waitUntilStopped: async () => true,
        openFolder: async uri => calls.push(`open ${uri}`),
        log: () => {},
    });
    // Runs every timer that is due now (timers scheduled meanwhile wait).
    const fire = async () => {
        for (const t of timers.splice(0)) {
            if (!t.cancelled)
                await t.cb();
        }
    };
    const closeLastWindow = async id => {
        open.delete(id);
        const cb = watchers.get(id);
        watchers.delete(id);
        await cb?.();
    };
    return {services, calls, watchers, timers, state, open, fire, closeLastWindow};
}

const NAUTILUS = 'org.gnome.Nautilus.desktop';
const quits = calls => calls.filter(c => c === 'nautilus --quit').length;

test('services: a busy app without windows is not quit until it is idle', async () => {
    const h = busyHarness({busy: true});
    await h.services.restart();
    assertEq(quits(h.calls), 0);
    assertEq(h.timers[0].ms, 30000);
    await h.fire();
    assertEq(quits(h.calls), 0);
    h.state.busy = false;
    await h.fire();
    assertEq(quits(h.calls), 1);
});

test('services: closing the last window during a copy does not quit until idle', async () => {
    const h = busyHarness({busy: true, windows: [NAUTILUS]});
    await h.services.restart();
    await h.closeLastWindow(NAUTILUS);
    assertEq(quits(h.calls), 0);
    h.state.busy = false;
    await h.fire();
    assertEq(quits(h.calls), 1);
});

test('services: a window reopened before the retry waits for it to close again', async () => {
    const h = busyHarness({busy: true});
    await h.services.restart();
    h.open.add(NAUTILUS);
    h.state.busy = false;
    await h.fire();
    assertEq(quits(h.calls), 0);
    assertEq(h.watchers.has(NAUTILUS), true);
    await h.closeLastWindow(NAUTILUS);
    assertEq(quits(h.calls), 1);
});

test('services: cancelPending stops retries', async () => {
    const h = busyHarness({busy: true});
    await h.services.restart();
    h.services.cancelPending();
    h.state.busy = false;
    await h.fire();
    assertEq(quits(h.calls), 0);
});

test('services: restartFiles refuses while busy', async () => {
    const h = busyHarness({busy: true, windows: [NAUTILUS]});
    assertEq(await h.services.restartFiles(), {ok: false, reason: 'busy'});
    assertEq(quits(h.calls), 0);
});

test('services: restartFiles quits and reopens each window at its first location', async () => {
    const h = busyHarness({windows: [NAUTILUS]});
    await h.services.restart();
    assertEq(await h.services.restartFiles(), {ok: true});
    assertEq(h.calls.slice(-3), [
        'nautilus --quit',
        'open file:///home/u/a',
        'open file:///home/u/c',
    ]);
    assertEq(h.watchers.has(NAUTILUS), false);
});

test('services: a window reopened during the busy check is not closed', async () => {
    const calls = [];
    const open = new Set([NAUTILUS]);
    const watchers = new Map();
    const services = new Services({
        spawn: async argv => calls.push(argv.join(' ')),
        hasWindows: id => open.has(id),
        whenHidden: (id, cb) => {
            watchers.set(id, cb);
            return () => watchers.delete(id);
        },
        // the user reopens Files while the 3 s I/O sampling runs
        isBusy: async id => {
            if (id === NAUTILUS)
                open.add(NAUTILUS);
            return false;
        },
        later: () => () => {},
        log: () => {},
    });
    await services.restart();
    open.delete(NAUTILUS);
    const cb = watchers.get(NAUTILUS);
    watchers.delete(NAUTILUS);
    await cb();
    assertEq(quits(calls), 0);
    assertEq(watchers.has(NAUTILUS), true);
});

test('services: restartFilesWhenIdle restarts open Files right away when idle', async () => {
    const h = busyHarness({windows: [NAUTILUS]});
    await h.services.restart();
    await h.services.restartFilesWhenIdle();
    assertEq(h.calls.slice(-3), [
        'nautilus --quit',
        'open file:///home/u/a',
        'open file:///home/u/c',
    ]);
});

test('services: restartFilesWhenIdle waits for a copy to finish, then restarts', async () => {
    const h = busyHarness({busy: true, windows: [NAUTILUS]});
    await h.services.restartFilesWhenIdle();
    assertEq(quits(h.calls), 0);
    h.state.busy = false;
    await h.fire();
    assertEq(quits(h.calls), 1);
    assertEq(h.calls.at(-1), 'open file:///home/u/c');
});

test('services: restartFilesWhenIdle leaves closed Files to the normal quit', async () => {
    const h = busyHarness({busy: true, windows: [NAUTILUS]});
    await h.services.restartFilesWhenIdle();
    h.open.delete(NAUTILUS);
    h.state.busy = false;
    await h.fire();
    assertEq(h.calls.some(c => c.startsWith('open ')), false);
});

test('services: nothing runs or is watched after destroy during a restart', async () => {
    const calls = [];
    const watchers = new Map();
    let releasePortal;
    const services = new Services({
        spawn: argv => {
            calls.push(argv.join(' '));
            return argv[0] === 'systemctl' ? new Promise(r => (releasePortal = r)) : Promise.resolve();
        },
        hasWindows: id => id === NAUTILUS,
        whenHidden: (id, cb) => {
            watchers.set(id, cb);
            return () => watchers.delete(id);
        },
        log: () => {},
    });
    const done = services.restart();
    services.destroy();
    releasePortal();
    await done;
    assertEq(calls, ['systemctl --user try-restart xdg-desktop-portal-gnome.service']);
    assertEq(watchers.size, 0);
});

test('services: restartFiles stops when destroyed during the busy check', async () => {
    const calls = [];
    let services;
    services = new Services({
        spawn: async argv => calls.push(argv.join(' ')),
        hasWindows: () => true,
        isBusy: async () => {
            services.destroy();
            return false;
        },
        getWindowLocations: async () => [['file:///home/u/a']],
        log: () => {},
    });
    assertEq((await services.restartFiles()).ok, false);
    assertEq(calls, []);
});

test('services: rapid switches never run two Files restarts at once', async () => {
    const calls = [];
    let running = 0, maxRunning = 0;
    const services = new Services({
        spawn: async argv => calls.push(argv.join(' ')),
        hasWindows: id => id === NAUTILUS,
        isBusy: async () => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            await new Promise(r => setTimeout(r, 20));
            running--;
            return false;
        },
        getWindowLocations: async () => [['file:///home/u/a']],
        openFolder: async uri => calls.push(`open ${uri}`),
        later: () => () => {},
        log: () => {},
    });
    await Promise.all([services.restartFilesWhenIdle(), services.restartFilesWhenIdle(), services.restartFilesWhenIdle()]);
    assertEq(maxRunning, 1);
    // the switches made meanwhile are covered by one more restart
    assertEq(calls.filter(c => c === 'nautilus --quit').length, 2);
});
