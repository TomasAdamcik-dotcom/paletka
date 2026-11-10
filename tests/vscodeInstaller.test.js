import {test, assertEq} from './harness.js';
import {installVscodeExtensions} from '../extension/lib/vscodeInstaller.js';

test('vscodeInstaller: runs the VS Code CLI once per extension', async () => {
    const calls = [];
    const r = await installVscodeExtensions(['a.b', 'c.d'], {
        findProgram: name => (name === 'code' ? '/snap/bin/code' : null),
        spawn: async argv => calls.push(argv.join(' ')),
    });
    assertEq(r, {ok: true});
    assertEq(calls, ['/snap/bin/code --install-extension a.b', '/snap/bin/code --install-extension c.d']);
});

test('vscodeInstaller: falls back to codium and reports a missing CLI', async () => {
    const calls = [];
    const r = await installVscodeExtensions(['a.b'], {
        findProgram: name => (name === 'codium' ? '/usr/bin/codium' : null),
        spawn: async argv => calls.push(argv[0]),
    });
    assertEq(calls, ['/usr/bin/codium']);
    assertEq(r.ok, true);
    const none = await installVscodeExtensions(['a.b'], {findProgram: () => null, spawn: async () => {}});
    assertEq(none, {ok: false, error: 'no-cli'});
});

test('vscodeInstaller: reports a failed install', async () => {
    const r = await installVscodeExtensions(['a.b'], {
        findProgram: () => '/snap/bin/code',
        spawn: async () => {
            throw new Error('exit 1');
        },
    });
    assertEq(r, {ok: false, error: 'exit 1'});
});
