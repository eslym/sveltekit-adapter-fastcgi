import 'SHIMS';
import { Server } from 'SERVER';
import { manifest, prerendered } from 'MANIFEST';
import { type IncomingRequest, getURL } from '@eslym/fastcgi';
import sirv from 'sirv';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { env, numeric } from './env';
import { setResponse } from '@sveltejs/kit/node';
import { unescape } from 'node:querystring';
import { error as svelteError } from '@sveltejs/kit';
import type { IncomingMessage } from 'node:http';

const dir = path.dirname(fileURLToPath(import.meta.url));

const server = new Server(manifest);

const body_size_limit = numeric(env('BODY_SIZE_LIMIT'), 524288);
const request_timeout = numeric(env('REQUEST_READ_TIMEOUT'), 10000);

const too_large = Symbol('too large');

function log_error(error?: Error | null) {
    if (error) {
        console.error(error);
    }
}

function lines(...lines: string[]) {
    return lines.join('\r\n');
}

function serve(path: string, client = false) {
    if (!fs.existsSync(path)) return undefined;
    const handler = sirv(path, {
        etag: true,
        gzip: true,
        brotli: true,
        setHeaders: client
            ? (res, pathname) => {
                  // only apply to build directory, not e.g. version.json
                  if (
                      pathname.startsWith(`/${manifest.appPath}/immutable/`) &&
                      res.statusCode === 200
                  ) {
                      res.setHeader('cache-control', 'public,max-age=31536000,immutable');
                  }
              }
            : undefined
    });
    return (req: IncomingRequest, next: () => void) => {
        handler(req.incomingMessage, req.serverResponse, next);
    };
}

function serve_prerendered() {
    const hander = serve(path.join(dir, 'prerendered'));
    if (!hander) return undefined;
    return (req: IncomingRequest, next: () => void) => {
        let path = unescape(req.params.REQUEST_URI!);
        if (prerendered.has(path)) {
            hander(req, next);
            return;
        }
        if (!path.endsWith('/')) {
            next();
            return;
        }
        path = path.slice(0, -1);
        if (!prerendered.has(path)) {
            next();
            return;
        }
        req.stdout.write(
            lines('Status: 308', 'Location: ' + req.params.REQUEST_URI!.slice(0, -1), '', ''),
            log_error
        );
        req.end(0);
        return;
    };
}

function readable(req: IncomingMessage, timeout: number): ReadableStream | null {
    const h = req.headers;

    if (!h['content-type']) {
        return null;
    }

    // fastcgi would guarantee content-length is always present,
    // but it might mismatch with actual body length if the client
    // overrides the header.

    const contentLength = Number(h['content-length']);

    if (
        (req.httpVersionMajor === 1 && isNaN(contentLength) && h['transfer-encoding'] == null) ||
        contentLength === 0
    ) {
        return null;
    }

    let length = contentLength;

    if (body_size_limit) {
        if (!length) {
            length = body_size_limit;
        } else if (length > body_size_limit) {
            throw too_large;
        }
    }

    if (req.destroyed) {
        const stream = new ReadableStream();
        stream.cancel();
        return stream;
    }

    return new ReadableStream({
        start(controller) {
            let bytesRead = 0;

            const timer = setTimeout(() => {
                cleanup();
                controller.error(svelteError(408, 'Request Timeout'));
            }, timeout);

            const read = (chunk: Buffer) => {
                bytesRead += chunk.length;
                if (bytesRead > length) {
                    cleanup();
                    controller.error(svelteError(413, 'Content Length Mismatch'));
                    return;
                }
                controller.enqueue(chunk);

                if (controller.desiredSize === null || controller.desiredSize <= 0) {
                    req.pause();
                }
            };

            const end = () => {
                cleanup();
                if (bytesRead < length) {
                    controller.error(svelteError(400, 'Incomplete Request Body'));
                    return;
                }
                controller.close();
            };
            const error = (error: Error) => {
                controller.error(error);
                cleanup();
            };
            const cleanup = () => {
                req.off('data', read);
                req.off('end', end);
                req.off('error', error);
                clearTimeout(timer);
            };
            req.on('data', read);
            req.once('end', end);
            req.on('error', error);
        }
    });
}

async function serve_ssr(req: IncomingRequest, next: (error?: Error) => void) {
    const headers: [string, string][] = Object.entries(req.params)
        .filter(([key]) => key.startsWith('HTTP_'))
        .map(([key, value]) => [key.slice(5).toLowerCase().replace(/_/g, '-'), value]) as any;
    try {
        const init: RequestInit = {
            method: req.params.REQUEST_METHOD,
            signal: req.abortedSignal,
            body: readable(req.incomingMessage, request_timeout),
            headers
        };
        const request = new Request(getURL(req), init);
        const response = await server.respond(request, {
            getClientAddress() {
                return req.params.REMOTE_ADDR!;
            },
            platform: {
                fastcgiRequest: req
            }
        });
        setResponse(req.serverResponse, response);
    } catch (error) {
        if (error === too_large) {
            req.stdout.write(
                lines('Status: 413', 'Content-Type: text/plain', '', 'Request Entity Too Large'),
                log_error
            );
            req.end(0);
            return;
        }
        next(error as Error);
    }
}

let booted = false;

const handlers = [
    serve(path.join(dir, 'client'), true),
    serve(path.join(dir, 'static')),
    serve_prerendered(),
    serve_ssr
].filter(Boolean);

export async function boot() {
    if (booted) return;
    booted = true;
    await server.init({ env: process.env as any });
}

export function handle(request: IncomingRequest) {
    const fallback = (error?: Error) => {
        if (request.ended || request.serverResponse.headersSent) {
            return;
        }
        if (error) {
            request.stdout.write(
                lines('Status: 500', 'Content-Type: text/plain', '', 'Internal Server Error'),
                log_error
            );
        } else {
            request.stdout.write(
                lines('Status: 501', 'Content-Type: text/plain', '', 'Not Implemented'),
                log_error
            );
        }
        request.end(0);
    };
    let i = 0;
    next();
    function next() {
        if (i >= handlers.length) {
            fallback();
            return;
        }
        const handler = handlers[i++]!;
        handler(request, next);
    }
}
