import {test, assertEq, tmpDir} from './harness.js';
import {GioFs} from '../extension/lib/adapters.js';
import {listIconThemes} from '../extension/lib/iconThemes.js';

test('iconThemes: lists icon themes, skips cursor-only and internal ones', () => {
    const fs = new GioFs();
    const a = tmpDir(), b = tmpDir();
    fs.writeText(`${a}/Yaru/index.theme`, '[Icon Theme]\nName=Yaru\nDirectories=16x16/apps\n');
    fs.writeText(`${a}/DMZ-White/index.theme`, '[Icon Theme]\nName=DMZ-White\nInherits=x\n');
    fs.writeText(`${a}/hicolor/index.theme`, '[Icon Theme]\nDirectories=16x16/apps\n');
    fs.writeText(`${b}/Papirus/index.theme`, '[Icon Theme]\nDirectories=16x16/apps\n');
    fs.writeText(`${b}/Yaru/index.theme`, '[Icon Theme]\nDirectories=16x16/apps\n');
    fs.writeText(`${b}/broken/readme`, 'x');
    assertEq(listIconThemes(fs, [a, b, `${a}/missing`]), ['Papirus', 'Yaru']);
});
