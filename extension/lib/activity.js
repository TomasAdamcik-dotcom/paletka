// Detects whether processes are busy with file work (e.g. Nautilus copying or
// deleting files, gvfsd transferring from a phone or over sftp), from
// cumulative /proc samples taken one second apart.

const MIN_CHARS = 64 * 1024;
const MIN_CALLS = 200;
// CPU ticks (usually 1/100 s) per second: deleting many files uses CPU
// without reading or writing data.
const MIN_CPU = 3;

// {chars, calls} from /proc/<pid>/io text, or null.
export function parseProcIo(text) {
    if (typeof text !== 'string')
        return null;
    const v = key => Number(new RegExp(`^${key}:\\s*(\\d+)`, 'm').exec(text)?.[1] ?? 0);
    return {chars: v('rchar') + v('wchar'), calls: v('syscr') + v('syscw')};
}

// utime + stime from /proc/<pid>/stat text; the name in parentheses may
// contain spaces, so fields are counted after its closing parenthesis.
export function parseProcCpu(text) {
    if (typeof text !== 'string')
        return 0;
    const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
    // fields[0] is field 3 (state); utime and stime are fields 14 and 15.
    return (Number(fields[11]) || 0) + (Number(fields[12]) || 0);
}

// Busy only when every interval shows activity: a copy keeps reading and
// writing, while an idle file manager only has occasional short bursts.
export function continuousActivity(samples) {
    if (samples.length < 4)
        return false;
    for (let i = 1; i < samples.length; i++) {
        const delta = key => (samples[i][key] ?? 0) - (samples[i - 1][key] ?? 0);
        if (delta('chars') < MIN_CHARS && delta('calls') < MIN_CALLS && delta('cpu') < MIN_CPU)
            return false;
    }
    return true;
}

// Summed {chars, calls, cpu} of the given processes.
export function sampleIo(fs, pids) {
    const total = {chars: 0, calls: 0, cpu: 0};
    for (const pid of pids) {
        const io = parseProcIo(fs.readText(`/proc/${pid}/io`));
        if (!io)
            continue;
        total.chars += io.chars;
        total.calls += io.calls;
        total.cpu += parseProcCpu(fs.readText(`/proc/${pid}/stat`));
    }
    return total;
}

// PIDs of the user's processes whose name starts with `prefix`.
export function findProcesses(fs, prefix, uid) {
    const pids = [];
    for (const name of fs.listDir('/proc')) {
        if (!/^\d+$/.test(name))
            continue;
        if (!fs.readText(`/proc/${name}/comm`)?.startsWith(prefix))
            continue;
        const owner = /^Uid:\s*(\d+)/m.exec(fs.readText(`/proc/${name}/status`) ?? '')?.[1];
        if (Number(owner) === uid)
            pids.push(Number(name));
    }
    return pids;
}
