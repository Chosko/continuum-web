/**
 * Microsoft.Devices.Sensors.Accelerometer shim (WP7.1 API + legacy ReadingChanged).
 *
 *   const acc = new Accelerometer();
 *   acc.currentValueChanged.add((sender, e) => { const v = e.sensorReading.acceleration; ... });
 *   acc.readingChanged.add((sender, e) => { e.x, e.y, e.z });   // WP7.0 API
 *   acc.start(); acc.stop(); acc.currentValue; acc.isDataValid; acc.state
 *
 * Values are in g, in WP7 device axes: X to the right of the screen, Y towards the top of the
 * screen, Z out of the screen toward the user; the reading is the GRAVITY direction, so a
 * phone lying flat face-up reads (0, 0, -1) and held upright in portrait reads (0, -1, 0).
 *
 * Mobile: DeviceMotionEvent.accelerationIncludingGravity (m/s^2). The W3C spec frame has the
 * same axes but reports the reaction to gravity (flat face-up -> z = +9.81), so
 * WP7 = -browser / 9.80665. iOS Safari historically reports the opposite sign from the spec
 * (flat face-up -> z = -9.81), so on iOS WP7 = +browser / 9.80665. Override with
 * Accelerometer.signOverride = +1 / -1 if a device disagrees. The device frame is fixed to the
 * hardware (not the screen orientation), matching WP7 portrait-locked behaviour.
 *
 * iOS 13+: call requestMotionPermission() from a user gesture (e.g. the Start button).
 *
 * Desktop fallback: if no devicemotion data arrives within FALLBACK_DELAY ms after start(),
 * arrow keys / WASD simulate tilt: x/y ramp smoothly toward +-KEY_TILT g while held and back
 * to 0 when released; z = -sqrt(1 - x^2 - y^2). Right -> +x, Up -> +y.
 */
import { XnaEvent } from './event';
import { Vector3 } from './math';
import { TimeSpan } from './timespan';

export enum SensorState {
  NotSupported = 0,
  Ready = 1,
  Initializing = 2,
  NoData = 3,
  NoPermissions = 4,
  Disabled = 5,
}

export class AccelerometerReading {
  constructor(
    readonly acceleration: Vector3,
    readonly timestamp: number,
  ) {}
}

export class SensorReadingEventArgs<T> {
  constructor(readonly sensorReading: T) {}
}

/** WP7.0 AccelerometerReadingEventArgs */
export class AccelerometerReadingEventArgs {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly timestamp: number,
  ) {}
}

const G = 9.80665;
const FALLBACK_DELAY = 600;
const UPDATE_INTERVAL_MS = 20; // WP7 default TimeBetweenUpdates
const KEY_TILT = 0.5; // g
const KEY_RAMP_PER_SEC = 2.0; // g per second

const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

type MotionPermissionCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * iOS 13+ requires an explicit permission prompt from a user gesture. Resolves true when motion
 * data may be delivered (always true on platforms without the permission API).
 */
export async function requestMotionPermission(): Promise<boolean> {
  const DME = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as
    | (typeof DeviceMotionEvent & MotionPermissionCtor)
    | undefined;
  if (!DME || typeof DME.requestPermission !== 'function') return true;
  try {
    return (await DME.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Shared hardware source (one listener set, many Accelerometer objects). */
class MotionSource {
  mode: 'none' | 'device' | 'keyboard' = 'none';
  /** Incremented whenever the data source changes (keyboard fallback -> real sensor), so consumers can recalibrate. */
  generation = 0;
  value = new Vector3(0, 0, -1);
  timestamp = 0;
  hasData = false;
  private listeners = new Set<() => void>();
  private started = false;
  private fallbackTimer: number | undefined;
  private keyTimer: number | undefined;
  private keys = new Set<string>();
  private kx = 0;
  private ky = 0;
  private lastKeyTick = 0;

  subscribe(fn: () => void): void {
    this.listeners.add(fn);
    this.ensureStarted();
  }
  unsubscribe(fn: () => void): void {
    this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('devicemotion', this.onMotion);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    this.fallbackTimer = window.setTimeout(() => {
      if (this.mode === 'none') this.startKeyboard();
    }, FALLBACK_DELAY);
  }

  private onMotion = (e: DeviceMotionEvent): void => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    if (this.mode !== 'device') {
      this.mode = 'device';
      this.generation++;
      clearTimeout(this.fallbackTimer);
      if (this.keyTimer !== undefined) {
        clearInterval(this.keyTimer);
        this.keyTimer = undefined;
      }
    }
    const sign = Accelerometer.signOverride ?? (isIOS() ? 1 : -1);
    this.value = new Vector3((sign * a.x) / G, (sign * a.y) / G, (sign * a.z) / G);
    this.timestamp = performance.now();
    this.hasData = true;
    this.emit();
  };

  private static readonly KEYMAP: Record<string, 'l' | 'r' | 'u' | 'd'> = {
    ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
  };

  private static isTyping(): boolean {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = MotionSource.KEYMAP[e.code];
    if (!k || MotionSource.isTyping()) return;
    if (this.mode === 'keyboard') e.preventDefault();
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    const k = MotionSource.KEYMAP[e.code];
    if (k) this.keys.delete(k);
  };

  private startKeyboard(): void {
    this.generation++;
    this.mode = 'keyboard';
    this.lastKeyTick = performance.now();
    const tick = (): void => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastKeyTick) / 1000);
      this.lastKeyTick = now;
      const tx = (this.keys.has('r') ? KEY_TILT : 0) - (this.keys.has('l') ? KEY_TILT : 0);
      const ty = (this.keys.has('u') ? KEY_TILT : 0) - (this.keys.has('d') ? KEY_TILT : 0);
      const step = KEY_RAMP_PER_SEC * dt;
      const approach = (v: number, t: number): number => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));
      this.kx = approach(this.kx, tx);
      this.ky = approach(this.ky, ty);
      const z = -Math.sqrt(Math.max(0, 1 - this.kx * this.kx - this.ky * this.ky));
      this.value = new Vector3(this.kx, this.ky, z);
      this.timestamp = now;
      this.hasData = true;
      this.emit();
    };
    tick();
    this.keyTimer = window.setInterval(tick, UPDATE_INTERVAL_MS);
  }
}

const source = new MotionSource();

export class Accelerometer {
  /** Force the browser->WP7 sign (+1 or -1). null = auto (iOS +1, others -1). */
  static signOverride: 1 | -1 | null = null;

  /** Always true: the keyboard fallback makes it available everywhere. */
  static get isSupported(): boolean {
    return true;
  }

  readonly currentValueChanged = new XnaEvent<SensorReadingEventArgs<AccelerometerReading>>();
  readonly readingChanged = new XnaEvent<AccelerometerReadingEventArgs>();
  /** Accepted for API compatibility; events follow the source rate (~50 Hz keyboard). */
  timeBetweenUpdates = TimeSpan.fromMilliseconds(UPDATE_INTERVAL_MS);
  private running = false;

  get state(): SensorState {
    if (!this.running) return SensorState.Disabled;
    return source.hasData ? SensorState.Ready : SensorState.Initializing;
  }
  get isDataValid(): boolean {
    return source.hasData;
  }
  /** 'device' (real sensor), 'keyboard' (desktop fallback) or 'none' (no data yet). */
  static get mode(): 'none' | 'device' | 'keyboard' {
    return source.mode;
  }
  /** Changes when the data source switches (e.g. keyboard fallback -> real sensor). */
  static get sourceGeneration(): number {
    return source.generation;
  }
  get currentValue(): AccelerometerReading {
    return new AccelerometerReading(source.value.clone(), source.timestamp);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    source.subscribe(this.onSource);
  }
  stop(): void {
    if (!this.running) return;
    this.running = false;
    source.unsubscribe(this.onSource);
  }
  dispose(): void {
    this.stop();
  }

  private onSource = (): void => {
    const v = source.value;
    this.currentValueChanged.invoke(
      this,
      new SensorReadingEventArgs(new AccelerometerReading(v.clone(), source.timestamp)),
    );
    this.readingChanged.invoke(this, new AccelerometerReadingEventArgs(v.x, v.y, v.z, source.timestamp));
  };
}
