import {test, assertEq} from './harness.js';
import {encodeMessage, MessageReader, MAX_MESSAGE} from '../extension/browser-host/nativeMessaging.js';

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

test('nativeMessaging: a malformed message is skipped, the next ones still arrive', () => {
    const bad = new TextEncoder().encode('{nope');
    const frame = new Uint8Array(4 + bad.length);
    new DataView(frame.buffer).setUint32(0, bad.length, true);
    frame.set(bad, 4);
    const reader = new MessageReader();
    assertEq(reader.push(frame), []);
    assertEq(reader.push(encodeMessage({n: 1})), [{n: 1}]);
});

test('nativeMessaging: a frame longer than the limit is refused', () => {
    const frame = new Uint8Array(4);
    new DataView(frame.buffer).setUint32(0, MAX_MESSAGE + 1, true);
    let error = null;
    try {
        new MessageReader().push(frame);
    } catch (e) {
        error = e;
    }
    assertEq(error?.message, 'message too long');
});
