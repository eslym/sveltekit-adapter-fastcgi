import './env';
import cluster from 'node:cluster';
import type { IPCMessage } from './protocol';
import { Role, IncomingRequest } from '@eslym/fastcgi';
import { boot, handle } from '../handle';
import { Writable, Duplex, Readable } from 'node:stream';
import { toUint8Array } from '../utils';

let started = false;

function devnull() {
    const dup = new Duplex({
        read() {},
        write(
            chunk: ArrayBufferView | string,
            encoding: BufferEncoding,
            callback: (error?: Error | null) => void
        ) {
            callback();
        }
    });
    dup.push(null);
    return dup;
}

function readable() {
    return new Readable({
        read() {}
    });
}

async function startAsWorker() {
    if (started || cluster.isPrimary) return;
    started = true;
    await boot();
    const worker = cluster.worker!;
    const requests = new Map<number, IncomingRequest>();

    function writeOut(chunk: Uint8Array, id: number, callback: (error?: Error | null) => void) {
        worker.send(
            {
                type: 'data',
                request: id,
                data: chunk
            } as IPCMessage,
            callback
        );
    }

    function createWritable(id: number) {
        return new Writable({
            write(
                chunk: ArrayBufferView | string,
                encoding: BufferEncoding,
                callback: (error?: Error | null) => void
            ) {
                writeOut(toUint8Array(chunk, encoding), id, callback);
            },
            final(callback: (error?: Error | null) => void) {
                worker.send(
                    {
                        type: 'end',
                        request: id
                    } as IPCMessage,
                    callback
                );
            }
        });
    }

    worker.send({
        type: 'ready'
    });

    process.on('message', (message: IPCMessage) => {
        switch (message.type) {
            case 'begin': {
                if (requests.has(message.request)) return;
                const options = {
                    role: Role.RESPONDER,
                    params: message.params,
                    stdin: readable(),
                    stdout: createWritable(message.request),
                    stderr: devnull(),
                    data: devnull()
                };
                const req = new IncomingRequest(options);
                requests.set(message.request, req);

                const cleanup = () => {
                    requests.delete(message.request);

                    options.stdin.push(null);
                    options.stdout.end();
                    options.stderr.end();
                    options.data.end();

                    req.off('abort', cleanup);
                    req.off('end', cleanup);
                    req.off('error', cleanup);
                };

                req.once('abort', cleanup);
                req.once('end', cleanup);
                req.once('error', cleanup);

                process.nextTick(() => {
                    handle(req);
                });

                break;
            }
            case 'data': {
                const req = requests.get(message.request);
                if (!req) return;
                (req.stdin as Readable).push(message.data);
                break;
            }
            case 'abort': {
                const req = requests.get(message.request);
                if (!req) return;
                req.abort();
                break;
            }
        }
    });
}

if (cluster.isWorker) {
    startAsWorker();
} else {
    throw new Error('Misconfigured cluster');
}

export {};
