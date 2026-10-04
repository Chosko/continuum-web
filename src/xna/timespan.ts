/**
 * System.TimeSpan shim (immutable, so no clone needed). 1 tick = 100 ns.
 *
 *   TimeSpan.Zero, TimeSpan.fromSeconds(s), fromMilliseconds, fromMinutes, fromTicks
 *   new TimeSpan(ticks) | new TimeSpan(h, m, s) | new TimeSpan(d, h, m, s) | new TimeSpan(d, h, m, s, ms)
 *   .ticks, .days/.hours/.minutes/.seconds/.milliseconds (components, truncated)
 *   .totalDays/.totalHours/.totalMinutes/.totalSeconds/.totalMilliseconds
 *   .compareTo(other), .equals(other), .add(other), .subtract(other), .negate(), .duration()
 */
export class TimeSpan {
  static readonly TicksPerMillisecond = 10_000;
  static readonly TicksPerSecond = 10_000_000;
  static readonly TicksPerMinute = 600_000_000;
  static readonly TicksPerHour = 36_000_000_000;
  static readonly TicksPerDay = 864_000_000_000;

  readonly ticks: number;

  constructor(ticks: number);
  constructor(hours: number, minutes: number, seconds: number);
  constructor(days: number, hours: number, minutes: number, seconds: number, milliseconds?: number);
  constructor(a: number, b?: number, c?: number, d?: number, e?: number) {
    if (b === undefined) {
      this.ticks = Math.trunc(a);
    } else if (d === undefined) {
      this.ticks = (a * 3600 + b * 60 + (c ?? 0)) * TimeSpan.TicksPerSecond;
    } else {
      const ms = (a * 86400 + b * 3600 + (c ?? 0) * 60 + d) * 1000 + (e ?? 0);
      this.ticks = ms * TimeSpan.TicksPerMillisecond;
    }
  }

  static get Zero(): TimeSpan {
    return ZERO;
  }
  /** .NET rounds FromXxx to the nearest millisecond. */
  static fromSeconds(value: number): TimeSpan {
    return TimeSpan.fromMilliseconds(value * 1000);
  }
  static fromMinutes(value: number): TimeSpan {
    return TimeSpan.fromMilliseconds(value * 60000);
  }
  static fromHours(value: number): TimeSpan {
    return TimeSpan.fromMilliseconds(value * 3600000);
  }
  static fromMilliseconds(value: number): TimeSpan {
    const ms = value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
    return new TimeSpan(ms * TimeSpan.TicksPerMillisecond);
  }
  static fromTicks(ticks: number): TimeSpan {
    return new TimeSpan(ticks);
  }

  get days(): number {
    return Math.trunc(this.ticks / TimeSpan.TicksPerDay);
  }
  get hours(): number {
    return Math.trunc(this.ticks / TimeSpan.TicksPerHour) % 24;
  }
  get minutes(): number {
    return Math.trunc(this.ticks / TimeSpan.TicksPerMinute) % 60;
  }
  get seconds(): number {
    return Math.trunc(this.ticks / TimeSpan.TicksPerSecond) % 60;
  }
  get milliseconds(): number {
    return Math.trunc(this.ticks / TimeSpan.TicksPerMillisecond) % 1000;
  }
  get totalDays(): number {
    return this.ticks / TimeSpan.TicksPerDay;
  }
  get totalHours(): number {
    return this.ticks / TimeSpan.TicksPerHour;
  }
  get totalMinutes(): number {
    return this.ticks / TimeSpan.TicksPerMinute;
  }
  get totalSeconds(): number {
    return this.ticks / TimeSpan.TicksPerSecond;
  }
  get totalMilliseconds(): number {
    return this.ticks / TimeSpan.TicksPerMillisecond;
  }

  add(ts: TimeSpan): TimeSpan {
    return new TimeSpan(this.ticks + ts.ticks);
  }
  subtract(ts: TimeSpan): TimeSpan {
    return new TimeSpan(this.ticks - ts.ticks);
  }
  negate(): TimeSpan {
    return new TimeSpan(-this.ticks);
  }
  duration(): TimeSpan {
    return new TimeSpan(Math.abs(this.ticks));
  }
  compareTo(other: TimeSpan): number {
    return this.ticks > other.ticks ? 1 : this.ticks < other.ticks ? -1 : 0;
  }
  equals(other: TimeSpan | null | undefined): boolean {
    return !!other && other.ticks === this.ticks;
  }
  static compare(a: TimeSpan, b: TimeSpan): number {
    return a.compareTo(b);
  }
  /** [-][d.]hh:mm:ss[.fffffff] like .NET */
  toString(): string {
    const neg = this.ticks < 0;
    const t = Math.abs(this.ticks);
    const d = Math.trunc(t / TimeSpan.TicksPerDay);
    const h = Math.trunc(t / TimeSpan.TicksPerHour) % 24;
    const m = Math.trunc(t / TimeSpan.TicksPerMinute) % 60;
    const s = Math.trunc(t / TimeSpan.TicksPerSecond) % 60;
    const f = t % TimeSpan.TicksPerSecond;
    const p2 = (n: number): string => String(n).padStart(2, '0');
    return (
      (neg ? '-' : '') +
      (d ? `${d}.` : '') +
      `${p2(h)}:${p2(m)}:${p2(s)}` +
      (f ? '.' + String(f).padStart(7, '0') : '')
    );
  }
}

const ZERO = new TimeSpan(0);
