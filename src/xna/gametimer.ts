/**
 * Microsoft.Xna.Framework.GameTimer shim (Silverlight/XNA shared-graphics apps).
 *
 *   const timer = new GameTimer();
 *   timer.updateInterval = TimeSpan.Zero;     // Continuum uses Zero: one Update per frame
 *   timer.update.add((sender, e) => { e.elapsedTime.totalSeconds; e.totalTime.milliseconds });
 *   timer.draw.add((sender, e) => { ... });
 *   timer.frameAction.add(...);               // fires once per frame before update/draw
 *   timer.start(); timer.stop();
 *
 * Semantics:
 *  - updateInterval > 0 (WP7 default 333333 ticks = 30 Hz): fixed-step updates driven by an
 *    accumulator (elapsedTime == updateInterval), at most MAX_CATCH_UP per frame; draw once per frame.
 *  - updateInterval == 0: exactly one update per frame with the real (variable) elapsed time.
 *  - Frames are capped at GameTimer.maxFrameRate (Silverlight's default MaxFrameRate is 60), so
 *    120/144 Hz displays run the game at the same rate as the phone did.
 *  - Per-frame elapsed time is clamped to GameTimer.maxElapsedMs (tab switches / breakpoints).
 *  - Draw is skipped for a frame if no update ran (fixed-step mode), like XNA.
 * All started timers share one requestAnimationFrame loop.
 */
import { XnaEvent } from './event';
import { TimeSpan } from './timespan';

export class GameTimerEventArgs {
  constructor(
    readonly elapsedTime: TimeSpan,
    readonly totalTime: TimeSpan,
  ) {}
}

const MAX_CATCH_UP = 5;

const timers = new Set<GameTimer>();
let rafId = 0;
let lastFrame = 0;

function frame(now: number): void {
  rafId = requestAnimationFrame(frame);
  const minFrame = 1000 / GameTimer.maxFrameRate;
  // small tolerance so a 60 Hz display never drops frames to jitter
  if (lastFrame !== 0 && now - lastFrame < minFrame - 2) return;
  const delta = lastFrame === 0 ? 0 : Math.min(now - lastFrame, GameTimer.maxElapsedMs);
  lastFrame = now;
  for (const t of [...timers].sort((a, b) => a.updateOrder - b.updateOrder)) t.tick(delta);
}

export class GameTimer {
  /** Frame-rate cap (Silverlight MaxFrameRate default 60). */
  static maxFrameRate = 60;
  /** Clamp for a single frame's elapsed time (ms). */
  static maxElapsedMs = 100;

  updateInterval: TimeSpan = TimeSpan.fromTicks(333333);
  /** Lower order ticks first when several timers are active. */
  updateOrder = 0;

  readonly update = new XnaEvent<GameTimerEventArgs>();
  readonly draw = new XnaEvent<GameTimerEventArgs>();
  readonly frameAction = new XnaEvent<GameTimerEventArgs>();

  private running = false;
  private totalMs = 0;
  private accumulatorMs = 0;

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.accumulatorMs = 0;
    timers.add(this);
    if (!rafId) {
      lastFrame = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    timers.delete(this);
    if (timers.size === 0 && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  /** Sets the shared total time (rarely needed). */
  resetTotalTime(): void {
    this.totalMs = 0;
  }

  /** @internal */
  tick(deltaMs: number): void {
    if (!this.running) return;
    const frameArgs = new GameTimerEventArgs(
      TimeSpan.fromTicks(Math.round(deltaMs * 10000)),
      TimeSpan.fromTicks(Math.round((this.totalMs + deltaMs) * 10000)),
    );
    this.frameAction.invoke(this, frameArgs);

    const intervalMs = this.updateInterval.totalMilliseconds;
    let updated = false;
    if (intervalMs <= 0) {
      this.totalMs += deltaMs;
      this.update.invoke(
        this,
        new GameTimerEventArgs(
          TimeSpan.fromTicks(Math.round(deltaMs * 10000)),
          TimeSpan.fromTicks(Math.round(this.totalMs * 10000)),
        ),
      );
      updated = true;
    } else {
      this.accumulatorMs += deltaMs;
      let n = 0;
      while (this.accumulatorMs >= intervalMs && n < MAX_CATCH_UP) {
        this.accumulatorMs -= intervalMs;
        this.totalMs += intervalMs;
        n++;
        this.update.invoke(
          this,
          new GameTimerEventArgs(this.updateInterval, TimeSpan.fromTicks(Math.round(this.totalMs * 10000))),
        );
        if (!this.running) return;
        updated = true;
      }
      if (n === MAX_CATCH_UP) this.accumulatorMs = 0;
    }
    if (!this.running) return;
    if (updated) {
      this.draw.invoke(
        this,
        new GameTimerEventArgs(
          TimeSpan.fromTicks(Math.round(deltaMs * 10000)),
          TimeSpan.fromTicks(Math.round(this.totalMs * 10000)),
        ),
      );
    }
  }
}
