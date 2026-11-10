// Detects whether a process is doing file I/O (e.g. Nautilus copying files),
// from cumulative /proc/<pid>/io samples taken one second apart.

const MIN_CHARS = 64 * 1024;
const MIN_CALLS = 200;

// {chars, calls} from /proc/<pid>/io text, or null.
export function parseProcIo(text) {
    if (typeof text !== 'string')
        return null;
    const v = key => Number(new RegExp(`^${key}:\\s*(\\d+)`, 'm').exec(text)?.[1] ?? 0);
    return {chars: v('rchar') + v('wchar'), calls: v('syscr') + v('syscw')};
}

// Busy only when every interval shows I/O: a copy keeps reading and writing,
// while an idle file manager only has occasional short bursts.
export function continuousActivity(samples) {
    if (samples.length < 4)
        return false;
    for (let i = 1; i < samples.length; i++) {
        const chars = samples[i].chars - samples[i - 1].chars;
        const calls = samples[i].calls - samples[i - 1].calls;
        if (chars < MIN_CHARS && calls < MIN_CALLS)
            return false;
    }
    return true;
}

// Summed {chars, calls} of the given processes.
export function sampleIo(fs, pids) {
    return pids
        .map(pid => parseProcIo(fs.readText(`/proc/${pid}/io`)))
        .filter(Boolean)
        .reduce((a, b) => ({chars: a.chars + b.chars, calls: a.calls + b.calls}), {chars: 0, calls: 0});
}
