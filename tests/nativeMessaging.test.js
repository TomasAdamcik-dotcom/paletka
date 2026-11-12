import {test, assertEq} from './harness.js';
import {encodeMessage, MessageReader} from '../extension/browser-host/nativeMessaging.js';

test('nativeMessaging: a frame is a little-endian length and UTF-8 JSON', () => {
    const bytes = encodeMessage({a: 'č'});
    const json = new TextEncoder().encode('{"a":"č"}');
    assertEq([...bytes.slice(0, 4)], [json.length, 0, 0, 0]);
    assertEq([...bytes.slice(4)], [...json]);
});

test('nativeMessaging: frames split across chunks or sharing one are read whole', () => {
    const a = encodeMessage({n: 1});
    const b = encodeMessage({n: 2, text: 'x'.repeat(300)});
    const reader = new MessageReader();
    assertEq(reader.push(a.slice(0, 3)), []);
    assertEq(reader.push(a.slice(3, 6)), []);
    const both = new Uint8Array(a.length - 6 + b.length);
    both.set(a.slice(6));
    both.set(b, a.length - 6);
    assertEq(reader.push(both), [{n: 1}, {n: 2, text: 'x'.repeat(300)}]);
});
