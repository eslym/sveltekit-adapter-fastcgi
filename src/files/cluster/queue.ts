import EventEmitter from 'node:events';

export class Queue<T> extends EventEmitter {
    #head: QueueItem<T> | undefined;
    #tail: QueueItem<T> | undefined;
    #size = 0;

    get size() {
        return this.#size;
    }

    get head() {
        return this.#head?.value;
    }

    get tail() {
        return this.#tail?.value;
    }

    push(value: T, timeout?: number) {
        const item = new QueueItem(value);
        if (this.#tail) {
            this.#tail.next = item;
            item.prev = this.#tail;
            this.#tail = item;
        } else {
            this.#head = item;
            this.#tail = item;
        }
        this.#size++;
        if (timeout) {
            item.timeout = setTimeout(() => {
                this.remove(item);
                this.emit('timeout', item.value);
            }, timeout);
        }
    }

    shift() {
        const item = this.#head;
        if (item) {
            this.#head = item.next;
            if (this.#head) {
                this.#head.prev = undefined;
            } else {
                this.#tail = undefined;
            }
            this.#size--;
            clearTimeout(item.timeout);
            item.exsits = false;
            return item.value;
        }
        return undefined;
    }

    remove(item: QueueItem<T>) {
        if (!item.exsits) return;
        item.exsits = false;
        if (item.prev) {
            item.prev.next = item.next;
        } else {
            this.#head = item.next;
        }
        if (item.next) {
            item.next.prev = item.prev;
        } else {
            this.#tail = item.prev;
        }
        this.#size--;
        clearTimeout(item.timeout);
    }
}

class QueueItem<T> {
    exsits = true;
    timeout?: NodeJS.Timeout;

    next?: QueueItem<T>;
    prev?: QueueItem<T>;

    constructor(public value: T) {}
}
