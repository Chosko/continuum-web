/**
 * Microsoft.Xna.Framework.Input.Touch shim on Pointer Events (mouse works as a single finger).
 *
 *   TouchPanel.enabledGestures = GestureType.Tap | GestureType.FreeDrag | GestureType.Flick;
 *   while (TouchPanel.isGestureAvailable) { const g = TouchPanel.readGesture(); g.gestureType / g.position / g.delta }
 *   const touches = TouchPanel.getState();  touches.count, touches.get(i), touches.findById(id) (null if absent)
 *   TouchPanel.getCapabilities() -> { isConnected, maximumTouchCount }
 *
 * Positions are in VIRTUAL (480x800) coordinates. Call TouchPanel.attach(element, mapClientToVirtual)
 * once (the Stage does it).
 *
 * Gesture recognition (single primary finger, approximating the WP7 engine):
 *  - Tap: released before moving more than TAP_TOLERANCE px and before HOLD_TIME.
 *  - DoubleTap: a second tap within DOUBLE_TAP_TIME and DOUBLE_TAP_DISTANCE (replaces the 2nd Tap).
 *  - Hold: finger kept still for HOLD_TIME.
 *  - FreeDrag / HorizontalDrag / VerticalDrag: after moving more than TAP_TOLERANCE;
 *    delta = movement since the previous drag sample. Unread consecutive drag samples are merged.
 *  - Flick: on release after a drag, if the release velocity >= FLICK_MIN_VELOCITY px/s;
 *    position = (0,0), delta = velocity in px/s (like XNA).
 *  - DragComplete: on release after a drag (after Flick).
 *  - Pinch / PinchComplete are not implemented (unused by the game). A second finger cancels the
 *    pending tap/flick of the first.
 */
import { Vector2 } from './math';
import { TimeSpan } from './timespan';

export enum GestureType {
  None = 0,
  Tap = 1,
  DoubleTap = 2,
  Hold = 4,
  HorizontalDrag = 8,
  VerticalDrag = 16,
  FreeDrag = 32,
  Pinch = 64,
  Flick = 128,
  DragComplete = 256,
  PinchComplete = 512,
}

export enum TouchLocationState {
  Invalid = 0,
  Moved = 1,
  Pressed = 2,
  Released = 3,
}

export class TouchLocation {
  constructor(
    readonly id: number,
    readonly state: TouchLocationState,
    readonly position: Vector2,
    readonly pressure = 0,
  ) {}
  /** Struct copy: position is cloned. */
  clone(): TouchLocation {
    return new TouchLocation(this.id, this.state, this.position.clone(), this.pressure);
  }
}

export class TouchCollection implements Iterable<TouchLocation> {
  readonly isConnected = true;
  readonly isReadOnly = true;
  constructor(private readonly items: TouchLocation[]) {}
  get count(): number {
    return this.items.length;
  }
  /** C# collection[i] */
  get(index: number): TouchLocation {
    return this.items[index];
  }
  /** C# FindById(id, out loc): returns the location or null. */
  findById(id: number): TouchLocation | null {
    return this.items.find((t) => t.id === id) ?? null;
  }
  toArray(): TouchLocation[] {
    return this.items.slice();
  }
  [Symbol.iterator](): Iterator<TouchLocation> {
    return this.items[Symbol.iterator]();
  }
}

export class GestureSample {
  constructor(
    readonly gestureType: GestureType,
    readonly timestamp: TimeSpan,
    readonly position: Vector2,
    readonly position2: Vector2,
    readonly delta: Vector2,
    readonly delta2: Vector2,
  ) {}
}

export interface TouchPanelCapabilities {
  isConnected: boolean;
  maximumTouchCount: number;
}

// Thresholds (virtual px / ms)
const TAP_TOLERANCE = 25;
const HOLD_TIME = 1024;
const DOUBLE_TAP_TIME = 300;
const DOUBLE_TAP_DISTANCE = 40;
const FLICK_MIN_VELOCITY = 400;
const FLICK_SAMPLE_WINDOW = 100;
const MAX_QUEUE = 256;

interface Contact {
  id: number;
  pointerId: number;
  position: Vector2;
  pressedReported: boolean;
  released: boolean;
}

interface Primary {
  pointerId: number;
  start: Vector2;
  startTime: number;
  lastDrag: Vector2;
  dragging: boolean;
  dragAxis: 'h' | 'v' | 'free' | null;
  holdFired: boolean;
  cancelled: boolean;
  holdTimer: number | undefined;
  samples: Array<{ t: number; p: Vector2 }>;
}

type Mapper = (clientX: number, clientY: number) => Vector2;

class TouchPanelImpl {
  enabledGestures: GestureType = GestureType.None;
  displayWidth = 480;
  displayHeight = 800;

  private queue: GestureSample[] = [];
  private contacts = new Map<number, Contact>(); // by pointerId
  private nextId = 1;
  private primary: Primary | null = null;
  private lastTap: { t: number; p: Vector2 } | null = null;
  private mapper: Mapper = (x, y) => new Vector2(x, y);
  private attached: HTMLElement | null = null;

  /** Starts listening on `element` (pointerdown) and window (move/up/cancel). */
  attach(element: HTMLElement, mapper: Mapper): void {
    if (this.attached) return;
    this.attached = element;
    this.mapper = mapper;
    element.addEventListener('pointerdown', this.onDown, true);
    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('pointerup', this.onUp, true);
    window.addEventListener('pointercancel', this.onCancel, true);
    window.addEventListener('blur', this.onBlur);
  }

  get isGestureAvailable(): boolean {
    return this.queue.length > 0;
  }

  readGesture(): GestureSample {
    const g = this.queue.shift();
    if (!g) throw new Error('InvalidOperationException: no gesture available (check isGestureAvailable)');
    return g;
  }

  getCapabilities(): TouchPanelCapabilities {
    return { isConnected: true, maximumTouchCount: 4 };
  }

  /** XNA TouchPanel.GetState(): Pressed on the first report, then Moved, then Released once. */
  getState(): TouchCollection {
    const out: TouchLocation[] = [];
    for (const [pid, c] of this.contacts) {
      let state: TouchLocationState;
      if (!c.pressedReported) {
        state = TouchLocationState.Pressed;
        c.pressedReported = true;
      } else if (c.released) {
        state = TouchLocationState.Released;
        this.contacts.delete(pid);
      } else {
        state = TouchLocationState.Moved;
      }
      out.push(new TouchLocation(c.id, state, c.position.clone(), 1));
    }
    return new TouchCollection(out);
  }

  /** Drops queued gestures and touch state (e.g. when switching pages). */
  reset(): void {
    this.queue.length = 0;
    this.contacts.clear();
    if (this.primary) clearTimeout(this.primary.holdTimer);
    this.primary = null;
  }

  // ------------------------------------------------------------ internals

  private enabled(t: GestureType): boolean {
    return (this.enabledGestures & t) !== 0;
  }

  private push(type: GestureType, position: Vector2, delta: Vector2 = Vector2.Zero): void {
    if (!this.enabled(type)) return;
    const ts = TimeSpan.fromMilliseconds(performance.now());
    const last = this.queue[this.queue.length - 1];
    const isDrag =
      type === GestureType.FreeDrag || type === GestureType.HorizontalDrag || type === GestureType.VerticalDrag;
    if (isDrag && last && last.gestureType === type) {
      // merge unread drag samples
      this.queue[this.queue.length - 1] = new GestureSample(
        type, ts, position.clone(), Vector2.Zero, Vector2.add(last.delta, delta), Vector2.Zero,
      );
      return;
    }
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(new GestureSample(type, ts, position.clone(), Vector2.Zero, delta.clone(), Vector2.Zero));
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = this.mapper(e.clientX, e.clientY);
    const c: Contact = { id: this.nextId++, pointerId: e.pointerId, position: p, pressedReported: false, released: false };
    this.contacts.set(e.pointerId, c);
    const now = performance.now();
    if (!this.primary) {
      const pr: Primary = {
        pointerId: e.pointerId,
        start: p.clone(),
        startTime: now,
        lastDrag: p.clone(),
        dragging: false,
        dragAxis: null,
        holdFired: false,
        cancelled: false,
        holdTimer: undefined,
        samples: [{ t: now, p: p.clone() }],
      };
      pr.holdTimer = window.setTimeout(() => {
        if (this.primary === pr && !pr.dragging && !pr.cancelled) {
          pr.holdFired = true;
          this.push(GestureType.Hold, pr.start);
        }
      }, HOLD_TIME);
      this.primary = pr;
    } else {
      // second finger: no single-finger tap/flick for this sequence
      this.primary.cancelled = true;
      clearTimeout(this.primary.holdTimer);
    }
  };

  private onMove = (e: PointerEvent): void => {
    const c = this.contacts.get(e.pointerId);
    if (!c || c.released) return;
    const p = this.mapper(e.clientX, e.clientY);
    c.position = p;
    const pr = this.primary;
    if (!pr || pr.pointerId !== e.pointerId) return;
    const now = performance.now();
    pr.samples.push({ t: now, p: p.clone() });
    while (pr.samples.length > 2 && now - pr.samples[0].t > FLICK_SAMPLE_WINDOW) pr.samples.shift();

    if (!pr.dragging) {
      if (Vector2.distance(p, pr.start) <= TAP_TOLERANCE) return;
      pr.dragging = true;
      clearTimeout(pr.holdTimer);
      const dx = Math.abs(p.x - pr.start.x);
      const dy = Math.abs(p.y - pr.start.y);
      if (this.enabled(GestureType.FreeDrag)) pr.dragAxis = 'free';
      else if (this.enabled(GestureType.HorizontalDrag) && (dx >= dy || !this.enabled(GestureType.VerticalDrag)))
        pr.dragAxis = 'h';
      else if (this.enabled(GestureType.VerticalDrag)) pr.dragAxis = 'v';
      else pr.dragAxis = null;
    }
    if (pr.cancelled) return;
    const delta = Vector2.subtract(p, pr.lastDrag);
    pr.lastDrag = p.clone();
    if (pr.dragAxis === 'free') this.push(GestureType.FreeDrag, p, delta);
    else if (pr.dragAxis === 'h') this.push(GestureType.HorizontalDrag, p, new Vector2(delta.x, 0));
    else if (pr.dragAxis === 'v') this.push(GestureType.VerticalDrag, p, new Vector2(0, delta.y));
  };

  private onUp = (e: PointerEvent): void => {
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    const p = this.mapper(e.clientX, e.clientY);
    c.position = p;
    c.released = true;
    const pr = this.primary;
    if (!pr || pr.pointerId !== e.pointerId) return;
    clearTimeout(pr.holdTimer);
    this.primary = null;
    if (pr.cancelled) return;
    const now = performance.now();

    if (!pr.dragging) {
      if (pr.holdFired) return;
      if (
        this.lastTap &&
        now - this.lastTap.t <= DOUBLE_TAP_TIME &&
        Vector2.distance(this.lastTap.p, p) <= DOUBLE_TAP_DISTANCE &&
        this.enabled(GestureType.DoubleTap)
      ) {
        this.push(GestureType.DoubleTap, pr.start);
        this.lastTap = null;
      } else {
        this.push(GestureType.Tap, pr.start);
        this.lastTap = { t: now, p: p.clone() };
      }
      return;
    }

    // velocity over the recent sample window
    pr.samples.push({ t: now, p: p.clone() });
    let first = pr.samples[0];
    for (const s of pr.samples) {
      if (now - s.t <= FLICK_SAMPLE_WINDOW) {
        first = s;
        break;
      }
    }
    const dt = (now - first.t) / 1000;
    if (dt > 0) {
      const v = Vector2.divide(Vector2.subtract(p, first.p), dt);
      if (v.length() >= FLICK_MIN_VELOCITY) this.push(GestureType.Flick, Vector2.Zero, v);
    }
    this.push(GestureType.DragComplete, Vector2.Zero);
  };

  private onCancel = (e: PointerEvent): void => {
    const c = this.contacts.get(e.pointerId);
    if (c) c.released = true;
    if (this.primary && this.primary.pointerId === e.pointerId) {
      clearTimeout(this.primary.holdTimer);
      this.primary = null;
    }
  };

  private onBlur = (): void => {
    for (const c of this.contacts.values()) c.released = true;
    if (this.primary) clearTimeout(this.primary.holdTimer);
    this.primary = null;
  };
}

export const TouchPanel = new TouchPanelImpl();
