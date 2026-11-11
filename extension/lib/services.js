// Restarts long-running background GTK processes so they pick up a new gtk.css.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function defaultSpawn(argv) {
    return new Promise((resolve, reject) => {
        try {
            const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            proc.wait_async(null, (p, res) => {
                try {
                    p.wait_finish(res);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

function defaultLater(ms, cb) {
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        cb();
        return GLib.SOURCE_REMOVE;
    });
    return () => GLib.source_remove(id);
}

const QUIT_WHEN_HIDDEN = [
    ['org.gnome.Nautilus.desktop', ['nautilus', '--quit']],
    ['org.gnome.Software.desktop', ['gnome-software', '--quit']],
];

const NAUTILUS = 'org.gnome.Nautilus.desktop';
const RETRY_MS = 30000;
const FILES_RESTART = 'files-restart';
const PORTAL = 'portal';

export class Services {
    // whenHidden(appId, cb) calls cb once the app has no windows left and
    // returns a function that cancels the watch.
    // isBusy(appId) resolves true while the app is doing file I/O.
    // later(ms, cb) schedules cb and returns a cancel function.
    // getWindowLocations() resolves Nautilus' open windows as arrays of URIs.
    // waitUntilStopped(appId) resolves once the app's process has exited.
    // openFolder(uri) opens a new Files window at uri.
    // isPortalBusy() resolves true while the desktop portal shows a dialog or
    // shares the screen; restarting it then would end those.
    constructor({
        spawn = defaultSpawn, hasWindows, whenHidden = null, isBusy = async () => false,
        later = defaultLater, getWindowLocations = async () => [], waitUntilStopped = async () => true,
        openFolder = async () => {}, isPortalBusy = async () => false, log = console.warn,
    }) {
        this._spawn = spawn;
        this._hasWindows = hasWindows;
        this._whenHidden = whenHidden;
        this._isBusy = isBusy;
        this._later = later;
        this._getWindowLocations = getWindowLocations;
        this._waitUntilStopped = waitUntilStopped;
        this._openFolder = openFolder;
        this._isPortalBusy = isPortalBusy;
        this._log = log;
        this._pending = new Map();
        this._epoch = 0;
        this._destroyed = false;
    }

    async _run(argv) {
        if (this._destroyed)
            return;
        try {
            await this._spawn(argv);
        } catch (e) {
            this._log(`${argv.join(' ')} failed: ${e.message}`);
        }
    }

    async restart() {
        const epoch = this._epoch;
        await this._restartPortal(epoch);
        for (const [appId, argv] of QUIT_WHEN_HIDDEN)
            await this._quitSafely(appId, argv, epoch);
    }

    // The portal's file chooser keeps the old colors until the portal restarts.
    async _restartPortal(epoch) {
        this._pending.get(PORTAL)?.();
        this._pending.delete(PORTAL);
        if (epoch !== this._epoch)
            return;
        if (await this._isPortalBusy()) {
            if (epoch === this._epoch && !this._destroyed)
                this._pending.set(PORTAL, this._later(RETRY_MS, () => {
                    this._pending.delete(PORTAL);
                    this._restartPortal(epoch);
                }));
            return;
        }
        if (epoch === this._epoch)
            await this._run(['systemctl', '--user', 'try-restart', 'xdg-desktop-portal-gnome.service']);
    }

    // The app's background service outlives its windows and keeps the old
    // gtk.css. Quit it once it has no windows and is not copying files
    // (quitting Nautilus aborts running file operations).
    async _quitSafely(appId, argv, epoch) {
        if (this._pending.has(appId))
            return;
        const attempt = async () => {
            this._pending.delete(appId);
            if (epoch !== this._epoch)
                return;
            if (appId === NAUTILUS && this._filesRestarting)
                return;
            if (this._hasWindows(appId)) {
                if (this._whenHidden)
                    this._pending.set(appId, this._whenHidden(appId, attempt));
                return;
            }
            if (await this._isBusy(appId)) {
                if (epoch === this._epoch)
                    this._pending.set(appId, this._later(RETRY_MS, attempt));
                return;
            }
            if (epoch !== this._epoch)
                return;
            // The check takes a few seconds; the user may have reopened it meanwhile.
            if (appId === NAUTILUS && this._filesRestarting)
                return;
            if (this._hasWindows(appId)) {
                await attempt();
                return;
            }
            await this._run(argv);
        };
        await attempt();
    }

    // User-requested restart of Files that reopens its windows (first tab each).
    async restartFiles() {
        const epoch = this._epoch;
        if (await this._isBusy(NAUTILUS))
            return {ok: false, reason: 'busy'};
        const windows = await this._getWindowLocations();
        if (epoch !== this._epoch)
            return {ok: false, reason: 'cancelled'};
        this._pending.get(NAUTILUS)?.();
        this._pending.delete(NAUTILUS);
        await this._run(['nautilus', '--quit']);
        await this._waitUntilStopped(NAUTILUS);
        // Not `nautilus --new-window`: the first one becomes the new Files
        // process and never exits, so the next windows would never open.
        for (const uris of windows) {
            if (uris.length && !this._destroyed) {
                try {
                    await this._openFolder(uris[0]);
                } catch (e) {
                    this._log(`cannot reopen ${uris[0]}: ${e.message}`);
                }
            }
        }
        return {ok: true};
    }

    // Restart open Files so its windows pick up the new theme; while it is
    // copying, try again later. Closed Files is left to the normal quit.
    // Only one restart runs at a time; switches made meanwhile are covered by
    // one more restart afterwards.
    async restartFilesWhenIdle() {
        if (this._filesRestarting) {
            this._filesAgain = true;
            return;
        }
        this._pending.get(FILES_RESTART)?.();
        this._pending.delete(FILES_RESTART);
        const epoch = this._epoch;
        const attempt = async () => {
            this._pending.delete(FILES_RESTART);
            if (epoch !== this._epoch || !this._hasWindows(NAUTILUS))
                return;
            this._filesRestarting = true;
            let result;
            try {
                result = await this.restartFiles();
            } finally {
                this._filesRestarting = false;
            }
            if (epoch !== this._epoch)
                return;
            const again = this._filesAgain;
            this._filesAgain = false;
            if (!result.ok)
                this._pending.set(FILES_RESTART, this._later(RETRY_MS, attempt));
            else if (again)
                await this.restartFilesWhenIdle();
        };
        await attempt();
    }

    cancelPending() {
        this._epoch++;
        for (const cancel of this._pending.values())
            cancel();
        this._pending.clear();
    }

    // After this nothing is spawned, watched or scheduled any more.
    destroy() {
        this._destroyed = true;
        this.cancelPending();
    }
}
