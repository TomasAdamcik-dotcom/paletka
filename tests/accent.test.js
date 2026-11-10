import {test, assertEq} from './harness.js';
import {nearestAccent} from '../extension/lib/accent.js';

test('accent: nearest gnome accent', () => {
    assertEq(nearestAccent('#268bd2'), 'blue');
    assertEq(nearestAccent('#dc322f'), 'red');
    assertEq(nearestAccent('#e95420'), 'orange');
    assertEq(nearestAccent('#2ec27e'), 'green');
    assertEq(nearestAccent('#808080'), 'slate');
});
