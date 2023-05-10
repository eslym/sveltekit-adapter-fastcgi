import type { Params } from '@eslym/fastcgi';

export interface ReadyMessage {
    type: 'ready';
}

export interface BeginMessage {
    type: 'begin';
    request: number;
    params: Params;
}

export interface DataMessage {
    type: 'data';
    request: number;
    data: Uint8Array;
}

export interface EndMessage {
    type: 'end';
    request: number;
}

export interface AbortMessage {
    type: 'abort';
    request: number;
}

export type IPCMessage = ReadyMessage | BeginMessage | DataMessage | EndMessage | AbortMessage;
