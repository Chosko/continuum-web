/**
 * C# `event EventHandler<T>` shim.
 *
 *   C#:  timer.Update += OnUpdate;          TS: timer.update.add(this.onUpdate);
 *   C#:  timer.Update -= OnUpdate;          TS: timer.update.remove(this.onUpdate);
 *   C#:  Update?.Invoke(this, e);           TS: this.update.invoke(this, e);
 *
 * Handlers receive (sender, args). Remember to bind methods (arrow functions or .bind(this)),
 * and keep the same function reference if you need to remove it later.
 */
export type EventHandler<TArgs> = (sender: unknown, e: TArgs) => void;

export class XnaEvent<TArgs> {
  private handlers: EventHandler<TArgs>[] = [];

  add(handler: EventHandler<TArgs>): void {
    this.handlers.push(handler);
  }
  /** Removes the LAST added occurrence (C# delegate removal semantics). */
  remove(handler: EventHandler<TArgs>): void {
    const i = this.handlers.lastIndexOf(handler);
    if (i >= 0) this.handlers.splice(i, 1);
  }
  clear(): void {
    this.handlers = [];
  }
  get hasHandlers(): boolean {
    return this.handlers.length > 0;
  }
  invoke(sender: unknown, e: TArgs): void {
    // Snapshot like a C# multicast delegate invocation list.
    const list = this.handlers.slice();
    for (const h of list) h(sender, e);
  }
}
