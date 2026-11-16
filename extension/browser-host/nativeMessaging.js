// Browser native messaging framing: a 4-byte little-endian length, then UTF-8 JSON.

export function encodeMessage(obj) {
    const json = new TextEncoder().encode(JSON.stringify(obj));
    const bytes = new Uint8Array(4 + json.length);
    new DataView(bytes.buffer).setUint32(0, json.length, true);
    bytes.set(json, 4);
    return bytes;
}

// The extension sends only small messages; anything longer is not ours.
export const MAX_MESSAGE = 1024 * 1024;

// Collects chunks from stdin and returns the complete messages in them.
// A message that is not JSON is skipped; one over the limit throws.
export class MessageReader {
    constructor() {
        this._buffer = new Uint8Array(0);
    }

    push(chunk) {
        const joined = new Uint8Array(this._buffer.length + chunk.length);
        joined.set(this._buffer);
        joined.set(chunk, this._buffer.length);
        const messages = [];
        let offset = 0;
        while (joined.length - offset >= 4) {
            const length = new DataView(joined.buffer, offset, 4).getUint32(0, true);
            if (length > MAX_MESSAGE)
                throw new Error('message too long');
            if (joined.length - offset - 4 < length)
                break;
            const json = new TextDecoder().decode(joined.subarray(offset + 4, offset + 4 + length));
            offset += 4 + length;
            try {
                messages.push(JSON.parse(json));
            } catch {
                // not JSON: skip it
            }
        }
        this._buffer = joined.slice(offset);
        return messages;
    }
}
