export interface ListItem<T> {
    value(): T;
    next(): ListItem<T>;
    prev(): ListItem<T>;
    find(predicate: (value: T) => boolean): ListItem<T> | undefined;
    remove(): void;
}

export class List<T> {
    #size: number = 0;
    #pointer?: ListNode<T>;

    get size() {
        return this.#size;
    }

    get pointer(): ListItem<T> | undefined {
        return this.#pointer?.proxy;
    }

    push(value: T): ListItem<T> {
        this.#size++;
        if (!this.#pointer) {
            this.#pointer = new ListNode(value, this);
            return this.#pointer.proxy;
        }
        return this.#pointer.insert(value).proxy;
    }

    next(): ListItem<T> | undefined {
        if (!this.#pointer) return undefined;
        this.#pointer = this.#pointer.next;
        return this.#pointer.proxy;
    }

    findAndMoveTo(predicate: (value: T) => boolean): ListItem<T> | undefined {
        if (!this.#pointer) return undefined;
        let next = this.#pointer.next;
        let newPointer = this.#pointer;
        let found = false;
        do {
            if (predicate(next.value)) {
                newPointer = next;
                found = true;
                break;
            }
            next = next.next;
        } while (next !== this.#pointer);
        this.#pointer = newPointer;
        return found ? newPointer.proxy : undefined;
    }

    find(predicate: (value: T) => boolean): ListItem<T> | undefined {
        if (!this.#pointer) return undefined;
        return this.#pointer.find(predicate)?.proxy;
    }

    remove(node: ListNode<T>) {
        if (node === this.#pointer) {
            if (node.next === node) {
                this.#pointer = undefined;
            } else {
                this.#pointer = node.next;
            }
        }
        node.remove();
        this.#size--;
    }
}

class ListNode<T> {
    #list: List<T>;

    #next: ListNode<T>;
    #prev: ListNode<T>;

    #value: T;

    #proxy = Object.freeze({
        next: () => {
            return this.#next.proxy;
        },
        prev: () => {
            return this.#prev.proxy;
        },
        value: () => {
            return this.#value;
        },
        find: (predicate: (value: T) => boolean) => {
            return this.find(predicate)?.proxy;
        },
        remove: () => {
            this.#list.remove(this);
        }
    });

    get next() {
        return this.#next;
    }

    get prev() {
        return this.#prev;
    }

    get value() {
        return this.#value;
    }

    get proxy() {
        return this.#proxy;
    }

    constructor(value: T, list: List<T>) {
        this.#value = value;
        this.#next = this;
        this.#prev = this;
        this.#list = list;
    }

    remove() {
        if (!this.#list) return;
        if (this.#next) {
            this.#next.#prev = this.#prev;
        }
        if (this.#prev) {
            this.#prev.#next = this.#next;
        }
        this.#next = undefined as any;
        this.#prev = undefined as any;
        this.#list = undefined as any;
        this.#proxy = undefined as any;
    }

    insert(value: T) {
        if (!this.#list) throw new Error('Node has been removed');
        const node = new ListNode(value, this.#list);
        this.#prev.#next = node;
        node.#prev = this.#prev;
        node.#next = this;
        this.#prev = node;
        return node;
    }

    find(predicate: (value: T) => boolean) {
        let node: ListNode<T> = this;
        do {
            if (predicate(node.value)) return node;
            node = node.next;
        } while (node !== this);
        return undefined;
    }
}
