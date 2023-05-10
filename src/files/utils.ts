export function toUint8Array(chunk: ArrayBufferView | string, encoding?: BufferEncoding) {
    if (typeof chunk === 'string') {
        chunk = Buffer.from(chunk, encoding);
    }
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}
