/**
 * Minimal port of System.Collections.Generic.LinkedList<T> (O(1) at both ends).
 * C#: list.AddFirst(v) / AddLast / RemoveFirst / RemoveLast / Remove(v) / First / Last / Count / node.Value / node.Next
 * TS: list.addFirst(v) / addLast / removeFirst / removeLast / remove(v) / first / last / count / node.value / node.next
 */
export class LinkedListNode<T> {
  value: T;
  /** @internal */ _next: LinkedListNode<T> | null = null;
  /** @internal */ _prev: LinkedListNode<T> | null = null;
  /** @internal */ _list: LinkedList<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }

  /** C# node.Next (null at the end of the list). */
  get next(): LinkedListNode<T> | null {
    return this._next;
  }
  /** C# node.Previous (null at the start of the list). */
  get previous(): LinkedListNode<T> | null {
    return this._prev;
  }
  get list(): LinkedList<T> | null {
    return this._list;
  }
}

export class LinkedList<T> implements Iterable<T> {
  private head: LinkedListNode<T> | null = null;
  private tail: LinkedListNode<T> | null = null;
  private _count = 0;

  get first(): LinkedListNode<T> | null {
    return this.head;
  }
  get last(): LinkedListNode<T> | null {
    return this.tail;
  }
  get count(): number {
    return this._count;
  }

  addFirst(value: T): LinkedListNode<T> {
    const n = new LinkedListNode(value);
    n._list = this;
    n._next = this.head;
    if (this.head) this.head._prev = n;
    else this.tail = n;
    this.head = n;
    this._count++;
    return n;
  }

  addLast(value: T): LinkedListNode<T> {
    const n = new LinkedListNode(value);
    n._list = this;
    n._prev = this.tail;
    if (this.tail) this.tail._next = n;
    else this.head = n;
    this.tail = n;
    this._count++;
    return n;
  }

  /** C# RemoveFirst (throws on an empty list). */
  removeFirst(): void {
    if (!this.head) throw new Error('InvalidOperationException: The LinkedList is empty.');
    this.removeNode(this.head);
  }

  /** C# RemoveLast (throws on an empty list). */
  removeLast(): void {
    if (!this.tail) throw new Error('InvalidOperationException: The LinkedList is empty.');
    this.removeNode(this.tail);
  }

  /** C# Remove(T): removes the first node holding this value (reference equality). */
  remove(value: T): boolean {
    for (let n = this.head; n; n = n._next) {
      if (n.value === value) {
        this.removeNode(n);
        return true;
      }
    }
    return false;
  }

  removeNode(n: LinkedListNode<T>): void {
    if (n._list !== this) throw new Error('InvalidOperationException: node not in this list.');
    if (n._prev) n._prev._next = n._next;
    else this.head = n._next;
    if (n._next) n._next._prev = n._prev;
    else this.tail = n._prev;
    n._prev = n._next = null;
    n._list = null;
    this._count--;
  }

  find(value: T): LinkedListNode<T> | null {
    for (let n = this.head; n; n = n._next) if (n.value === value) return n;
    return null;
  }

  contains(value: T): boolean {
    return this.find(value) !== null;
  }

  clear(): void {
    for (let n = this.head; n; ) {
      const nx: LinkedListNode<T> | null = n._next;
      n._prev = n._next = null;
      n._list = null;
      n = nx;
    }
    this.head = this.tail = null;
    this._count = 0;
  }

  toArray(): T[] {
    const a: T[] = [];
    for (let n = this.head; n; n = n._next) a.push(n.value);
    return a;
  }

  *[Symbol.iterator](): Iterator<T> {
    let n = this.head;
    while (n) {
      const nx: LinkedListNode<T> | null = n._next;
      yield n.value;
      n = nx;
    }
  }
}
