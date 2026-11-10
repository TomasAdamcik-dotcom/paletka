import {test, assertEq} from './harness.js';
import {fmt} from '../extension/lib/format.js';

test('format: replaces %s and %d in order', () => {
    assertEq(fmt('Delete “%s”?', 'Mine'), 'Delete “Mine”?');
    assertEq(fmt('Color %d', 7), 'Color 7');
    assertEq(fmt('%s and %s', 'a', 'b'), 'a and b');
    assertEq(fmt('100%% %s', 'x'), '100% x');
});
