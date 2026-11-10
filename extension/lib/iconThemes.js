// Lists installed icon themes (directories with an index.theme that has icon directories).
const INTERNAL = ['default', 'hicolor', 'locolor'];

export function listIconThemes(fs, iconDirs) {
    const names = new Set();
    for (const dir of iconDirs) {
        for (const name of fs.listDir(dir)) {
            if (INTERNAL.includes(name))
                continue;
            const index = fs.readText(`${dir}/${name}/index.theme`);
            if (index && /^Directories=/m.test(index))
                names.add(name);
        }
    }
    return [...names].sort((x, y) => x.localeCompare(y));
}
