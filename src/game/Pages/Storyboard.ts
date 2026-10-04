/**
 * Silverlight Storyboard of DoubleAnimationUsingKeyFrames with linear EasingDoubleKeyFrames
 * (no EasingFunction) and FillBehavior HoldEnd, on the Web Animations API.
 */
export interface DoubleKeyFrame {
  /** KeyTime in seconds */
  t: number;
  value: number;
}

export type CssProperty = 'opacity' | 'translateX' | 'translateY';

interface Track {
  target: HTMLElement;
  property: CssProperty;
  frames: DoubleKeyFrame[];
}

function cssFor(property: CssProperty, v: number): Keyframe {
  switch (property) {
    case 'opacity':
      return { opacity: v };
    case 'translateX':
      return { transform: `translateX(${v}px)` };
    case 'translateY':
      return { transform: `translateY(${v}px)` };
  }
}

export class Storyboard {
  private readonly tracks: Track[] = [];
  private animations: Animation[] = [];

  /** Adds a DoubleAnimationUsingKeyFrames. */
  add(target: HTMLElement, property: CssProperty, frames: DoubleKeyFrame[]): this {
    this.tracks.push({ target, property, frames });
    return this;
  }

  /** Total duration = the latest KeyTime of all tracks (all tracks share one timeline). */
  get duration(): number {
    let d = 0;
    for (const tr of this.tracks) for (const f of tr.frames) d = Math.max(d, f.t);
    return d;
  }

  /** Storyboard.Begin(): starts all tracks from time 0. */
  begin(): void {
    this.stop();
    const total = this.duration * 1000;
    for (const tr of this.tracks) {
      const kfs: Keyframe[] = [];
      const fr = tr.frames;
      if (fr[0].t > 0) kfs.push({ ...cssFor(tr.property, fr[0].value), offset: 0 });
      for (const f of fr) kfs.push({ ...cssFor(tr.property, f.value), offset: total > 0 ? (f.t * 1000) / total : 1 });
      if (fr[fr.length - 1].t * 1000 < total) kfs.push({ ...cssFor(tr.property, fr[fr.length - 1].value), offset: 1 });
      const anim = tr.target.animate(kfs, { duration: Math.max(total, 1), fill: 'both', easing: 'linear' });
      this.animations.push(anim);
    }
  }

  pause(): void {
    for (const a of this.animations) if (a.playState === 'running') a.pause();
  }

  resume(): void {
    for (const a of this.animations) if (a.playState === 'paused') a.play();
  }

  stop(): void {
    for (const a of this.animations) a.cancel();
    this.animations = [];
  }
}
