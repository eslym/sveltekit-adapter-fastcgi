import './env';
import { type IncomingRequest, Status as FCGIStatus } from '@eslym/fastcgi';
import cluster from 'node:cluster';
import { env, numeric } from '../env';
import { cpus } from 'node:os';
import { start } from '../server';
import { Queue } from './queue';
import type { Worker } from 'cluster';
import { toUint8Array } from '../utils';
import type { DataMessage, BeginMessage, EndMessage, AbortMessage, IPCMessage } from './protocol';
import { List } from './list';
import { fileURLToPath } from 'node:url';

const queue_timeout = numeric(env('QUEUE_TIMEOUT'), 10000);
const idle_kill_timeout = numeric(env('IDLE_KILL_TIMEOUT'), 30000);

const worker_max_requests = numeric(env('WORKER_MAX_REQUESTS'), 5);
const worker_count_max = numeric(env('WORKER_COUNT_MAX'), cpus().length);
const worker_count_min = numeric(env('WORKER_COUNT_MIN'), 1);

const workerScript = fileURLToPath(new URL('worker.js', import.meta.url));

let started = false;

if (worker_count_min > worker_count_max) {
    throw new Error('WORKER_COUNT_MIN must be less than or equal to WORKER_COUNT_MAX');
}

export const Status = {
    BOOT: Symbol('boot'),
    IDLE: Symbol('idle'),
    BUSY: Symbol('busy'),
    DEAD: Symbol('dead')
} as const;

const booting = new Set<WorkerController>();

class WorkerController {
    #worker: Worker;

    #idleSince: number = performance.now();
    #startedSince: number = performance.now();

    #requestId: number = 0;
    #requestIndex: Map<number, IncomingRequest> = new Map();
    #status: Symbol = Status.BOOT;

    get status() {
        return this.#status;
    }

    get worker() {
        return this.#worker;
    }

    get idleSince() {
        return this.#idleSince;
    }

    get startedSince() {
        return this.#startedSince;
    }

    get requests() {
        return this.#requestIndex.size;
    }

    constructor(worker: Worker) {
        this.#worker = worker;

        booting.add(this);

        const onMessage = (message: IPCMessage) => {
            switch (message.type) {
                case 'data': {
                    const req = this.#requestIndex.get(message.request);
                    if (!req) return;
                    req.stdout.write(Buffer.from(message.data));
                    break;
                }
                case 'end': {
                    const req = this.#requestIndex.get(message.request);
                    if (!req) return;
                    this.#requestIndex.delete(message.request);
                    req.stdout.end();
                    req.end();
                    break;
                }
                case 'abort': {
                    const req = this.#requestIndex.get(message.request);
                    if (!req) return;
                    req.abort();
                    this.#requestIndex.delete(message.request);
                    break;
                }
                case 'ready': {
                    this.#status = Status.IDLE;
                    this.#idleSince = performance.now();
                    booting.delete(this);
                    break;
                }
            }
        };

        worker.on('message', onMessage);

        worker.once('exit', () => {
            worker.off('message', onMessage);
            this.#status = Status.DEAD;
            booting.delete(this);
        });
    }

    forward(req: IncomingRequest) {
        const id = this.#requestId++;
        if (this.#requestId >= Number.MAX_SAFE_INTEGER) {
            this.#requestId = 0;
        }
        this.#status = Status.BUSY;
        this.#requestIndex.set(id, req);
        const readIn = (chunk: Buffer) => {
            this.#worker.send({
                type: 'data',
                request: id,
                data: toUint8Array(chunk)
            } satisfies DataMessage);
        };
        const endIn = () => {
            this.#worker.send({
                type: 'end',
                request: id
            } satisfies EndMessage);
            cleanupListener();
        };
        const abort = () => {
            this.#worker.send({
                type: 'abort',
                request: id
            } satisfies AbortMessage);
        };
        const finish = () => {
            this.#requestIndex.delete(id);
            if (this.requests === 0) {
                this.#status = Status.IDLE;
                this.#idleSince = performance.now();
            }
            req.off('abort', abort);
            req.off('end', finish);
            cleanupListener();
        };
        const cleanupListener = () => {
            req.stdin.off('data', readIn);
            req.stdin.off('end', endIn);
        };
        req.stdin.on('data', readIn);
        req.stdin.once('end', endIn);
        req.once('abort', abort);
        req.once('end', finish);
        this.#worker.send({
            type: 'begin',
            request: id,
            params: req.params
        } satisfies BeginMessage);
    }

    kill() {
        this.#status = Status.DEAD;
        this.#worker.kill();
        return this;
    }
}

function nextExpired(worker: WorkerController) {
    if (worker.status === Status.BUSY || worker.status === Status.BOOT) return false;
    if (performance.now() - worker.idleSince < idle_kill_timeout) return false;
    return true;
}

function nextAvailable(worker: WorkerController) {
    if (worker.status === Status.BOOT || worker.status === Status.DEAD) return false;
    if (worker.requests >= worker_max_requests) return false;
    return true;
}

function startAsMaster() {
    if (started || cluster.isWorker) return;
    started = true;
    const queue = new Queue<IncomingRequest>();
    const workers = new List<WorkerController>();

    queue.on('timeout', (req: IncomingRequest) => {
        req.end(0, FCGIStatus.OVERLOADED);
    });

    let cycling = false;

    cluster.setupPrimary({
        serialization: 'advanced',
        exec: workerScript
    } as any);

    function cycle() {
        if (queue.size === 0) {
            cycling = false;
            return;
        }
        cycling = true;
        const operated = _cycle();
        if (operated) {
            process.nextTick(() => cycle());
        } else {
            setTimeout(() => cycle(), 10);
        }
    }

    function _cycle() {
        const select = workers.findAndMoveTo(nextAvailable);
        if (select) {
            select.value().forward(queue.shift()!);
            workers.next();
            return true;
        } else if (workers.size < worker_count_max && booting.size === 0) {
            spawnWorker();
            return true;
        }
        return false;
    }

    function spawnWorker() {
        const worker = cluster.fork();
        const newNode = workers.push(new WorkerController(worker));

        worker.once('exit', () => {
            newNode.remove();
        });
    }

    setInterval(() => {
        if (workers.size > worker_count_min) {
            const toKill = workers.find(nextExpired);
            if (toKill) {
                toKill.value().kill();
            }
        } else if (workers.size < worker_count_min) {
            spawnWorker();
        }
    }, 100);

    cycle();

    start((req) => {
        queue.push(req, queue_timeout);
        if (!cycling) {
            cycle();
        }
    });
}

if (cluster.isPrimary) {
    startAsMaster();
} else {
    throw new Error('Misconfigured cluster');
}

export {};
