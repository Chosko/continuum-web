/**
 * XNA audio shims on the Web Audio API.
 *
 *   SoundEffect (decoded with decodeAudioData):
 *     effect.play(): boolean / effect.play(volume, pitch, pan): boolean
 *     effect.createInstance(): SoundEffectInstance
 *     effect.duration: TimeSpan            SoundEffect.masterVolume (static)
 *   SoundEffectInstance:
 *     play() / pause() / resume() / stop(immediate?) / isLooped / volume / pitch / pan / state
 *   MediaPlayer (static) + Song (streamed through an <audio> element routed into Web Audio,
 *   so a multi-MB mp3 is not fully decoded into memory):
 *     MediaPlayer.play(song) / stop() / pause() / resume() / isRepeating / volume / isMuted
 *     MediaPlayer.state / MediaPlayer.gameHasControl (always true)
 *
 * Autoplay: browsers keep audio locked until a user gesture. installAudioUnlock() (called by
 * the Stage) resumes the AudioContext on the first pointer/key event. While locked,
 * fire-and-forget SoundEffect plays are dropped (they would otherwise all burst at unlock),
 * looped instances start when unlocked, and MediaPlayer.play() is retried on unlock.
 */
import { TimeSpan } from './timespan';

export enum SoundState {
  Playing = 0,
  Paused = 1,
  Stopped = 2,
}

export enum MediaState {
  Stopped = 0,
  Playing = 1,
  Paused = 2,
}

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const unlockCallbacks: Array<() => void> = [];

/** Shared AudioContext (created lazily). */
export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
  }
  return ctx;
}
function master(): GainNode {
  getAudioContext();
  return masterGain!;
}

export function isAudioUnlocked(): boolean {
  return !!ctx && ctx.state === 'running';
}

function runUnlockCallbacks(): void {
  const list = unlockCallbacks.splice(0);
  for (const cb of list) cb();
}

/** Resumes audio. Must be called from inside a user-gesture handler to succeed. */
export function unlockAudio(): void {
  const c = getAudioContext();
  if (c.state !== 'running') {
    c.resume().then(runUnlockCallbacks, () => {});
    // iOS: playing a silent buffer inside the gesture helps unlock.
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  } else {
    runUnlockCallbacks();
  }
  MediaPlayerImpl.retryPending();
}

let unlockInstalled = false;
/** Installs one-shot-until-success unlock listeners on the window. */
export function installAudioUnlock(): void {
  if (unlockInstalled) return;
  unlockInstalled = true;
  const handler = (): void => {
    unlockAudio();
    if (isAudioUnlocked() && !MediaPlayerImpl.hasPending()) {
      for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const)
        window.removeEventListener(t, handler, true);
    }
  };
  for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const)
    window.addEventListener(t, handler, true);
}

function whenUnlocked(cb: () => void): void {
  if (isAudioUnlocked()) cb();
  else unlockCallbacks.push(cb);
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------
// SoundEffect
// ---------------------------------------------------------------------------

export class SoundEffect {
  static masterVolume = 1;
  name = '';
  readonly buffer: AudioBuffer;

  constructor(buffer: AudioBuffer) {
    this.buffer = buffer;
  }

  /** Decodes an encoded audio file (wav/mp3/ogg). */
  static async fromArrayBuffer(data: ArrayBuffer): Promise<SoundEffect> {
    const c = getAudioContext();
    const buf = await new Promise<AudioBuffer>((resolve, reject) => {
      // callback form for older Safari
      const p = c.decodeAudioData(data, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
    return new SoundEffect(buf);
  }

  get duration(): TimeSpan {
    return TimeSpan.fromSeconds(this.buffer.duration);
  }

  /** Fire-and-forget. pitch -1..1 (octaves), pan -1..1. Returns false if not played. */
  play(volume = 1, pitch = 0, pan = 0): boolean {
    if (!isAudioUnlocked()) return false;
    const inst = new SoundEffectInstance(this);
    inst.volume = volume;
    inst.pitch = pitch;
    inst.pan = pan;
    inst.play();
    return true;
  }

  createInstance(): SoundEffectInstance {
    return new SoundEffectInstance(this);
  }

  dispose(): void {}
}

export class SoundEffectInstance {
  isLooped = false;
  private _volume = 1;
  private _pitch = 0;
  private _pan = 0;
  private _state = SoundState.Stopped;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private startedAt = 0; // ctx time when (re)started
  private offset = 0; // seconds into the buffer at startedAt
  private pendingStart = false;

  constructor(readonly soundEffect: SoundEffect) {}

  get state(): SoundState {
    return this._state;
  }
  get volume(): number {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = clamp(v, 0, 1);
    if (this.gain) this.gain.gain.value = this._volume * SoundEffect.masterVolume;
  }
  get pitch(): number {
    return this._pitch;
  }
  set pitch(v: number) {
    this._pitch = clamp(v, -1, 1);
    if (this.source) this.source.playbackRate.value = Math.pow(2, this._pitch);
  }
  get pan(): number {
    return this._pan;
  }
  set pan(v: number) {
    this._pan = clamp(v, -1, 1);
    if (this.panner) this.panner.pan.value = this._pan;
  }

  play(): void {
    if (this._state === SoundState.Playing) return;
    if (this._state === SoundState.Paused) {
      this.resume();
      return;
    }
    this.offset = 0;
    this._state = SoundState.Playing;
    if (!isAudioUnlocked()) {
      if (this.isLooped && !this.pendingStart) {
        // start looped sounds once audio unlocks
        this.pendingStart = true;
        whenUnlocked(() => {
          this.pendingStart = false;
          if (this._state === SoundState.Playing && !this.source) this.startSource();
        });
      } else if (!this.isLooped) {
        this._state = SoundState.Stopped; // dropped while locked
      }
      return;
    }
    this.startSource();
  }

  private startSource(): void {
    const c = getAudioContext();
    const src = c.createBufferSource();
    src.buffer = this.soundEffect.buffer;
    src.loop = this.isLooped;
    src.playbackRate.value = Math.pow(2, this._pitch);
    const gain = c.createGain();
    gain.gain.value = this._volume * SoundEffect.masterVolume;
    let node: AudioNode = src;
    if (this._pan !== 0 && typeof c.createStereoPanner === 'function') {
      this.panner = c.createStereoPanner();
      this.panner.pan.value = this._pan;
      src.connect(this.panner);
      node = this.panner;
    } else {
      this.panner = null;
    }
    node.connect(gain);
    gain.connect(master());
    src.onended = (): void => {
      if (this.source === src) {
        this.source = null;
        this._state = SoundState.Stopped;
        this.offset = 0;
      }
    };
    this.source = src;
    this.gain = gain;
    this.startedAt = c.currentTime;
    src.start(0, this.offset % src.buffer!.duration);
  }

  private killSource(): void {
    const src = this.source;
    this.source = null;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    }
    this.gain?.disconnect();
    this.panner?.disconnect();
    this.gain = null;
    this.panner = null;
  }

  pause(): void {
    if (this._state !== SoundState.Playing) return;
    if (this.source) {
      const c = getAudioContext();
      const rate = Math.pow(2, this._pitch);
      this.offset += (c.currentTime - this.startedAt) * rate;
      const dur = this.soundEffect.buffer.duration;
      if (this.isLooped) this.offset %= dur;
      this.killSource();
    }
    this._state = SoundState.Paused;
  }

  resume(): void {
    if (this._state !== SoundState.Paused) return;
    this._state = SoundState.Playing;
    if (isAudioUnlocked()) this.startSource();
    else whenUnlocked(() => this._state === SoundState.Playing && !this.source && this.startSource());
  }

  /** XNA Stop(immediate = true). Non-immediate stop lets a looped sound finish its pass. */
  stop(immediate = true): void {
    if (!immediate && this.source && this._state === SoundState.Playing) {
      this.source.loop = false;
      return;
    }
    this.killSource();
    this._state = SoundState.Stopped;
    this.offset = 0;
  }

  dispose(): void {
    this.stop();
  }
}

// ---------------------------------------------------------------------------
// Song / MediaPlayer
// ---------------------------------------------------------------------------

export class Song {
  name = '';
  /** @internal */ readonly element: HTMLAudioElement;
  /** @internal */ sourceNode: MediaElementAudioSourceNode | null = null;
  constructor(readonly url: string) {
    this.element = new Audio();
    this.element.preload = 'auto';
    this.element.src = url;
  }
  get duration(): TimeSpan {
    const d = this.element.duration;
    return TimeSpan.fromSeconds(Number.isFinite(d) ? d : 0);
  }
  /** Resolves when enough data is buffered (or on error/timeout; never rejects). */
  ready(timeoutMs = 8000): Promise<void> {
    return new Promise((resolve) => {
      if (this.element.readyState >= 3) return resolve();
      const done = (): void => {
        this.element.removeEventListener('canplaythrough', done);
        this.element.removeEventListener('error', done);
        resolve();
      };
      this.element.addEventListener('canplaythrough', done);
      this.element.addEventListener('error', done);
      setTimeout(done, timeoutMs);
    });
  }
}

class MediaPlayerImpl {
  static queue: Song | null = null;
  static _state = MediaState.Stopped;
  static _volume = 1;
  static _muted = false;
  static _repeating = false;
  static pending = false;
  static gain: GainNode | null = null;

  static hasPending(): boolean {
    return MediaPlayerImpl.pending;
  }

  static applyVolume(): void {
    const v = MediaPlayerImpl._muted ? 0 : MediaPlayerImpl._volume;
    const song = MediaPlayerImpl.queue;
    if (MediaPlayerImpl.gain) MediaPlayerImpl.gain.gain.value = v;
    else if (song) song.element.volume = v;
  }

  static route(song: Song): void {
    if (song.sourceNode) return;
    try {
      const c = getAudioContext();
      song.sourceNode = c.createMediaElementSource(song.element);
      MediaPlayerImpl.gain ??= c.createGain();
      MediaPlayerImpl.gain.connect(c.destination);
      song.sourceNode.connect(MediaPlayerImpl.gain);
    } catch {
      song.sourceNode = null; // fall back to element volume
    }
  }

  static startElement(): void {
    const song = MediaPlayerImpl.queue;
    if (!song) return;
    song.element.loop = MediaPlayerImpl._repeating;
    MediaPlayerImpl.applyVolume();
    const p = song.element.play();
    MediaPlayerImpl.pending = false;
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // autoplay blocked: retry on the next user gesture
        if (MediaPlayerImpl._state === MediaState.Playing) MediaPlayerImpl.pending = true;
      });
    }
  }

  static retryPending(): void {
    if (MediaPlayerImpl.pending && MediaPlayerImpl._state === MediaState.Playing) MediaPlayerImpl.startElement();
  }
}

export const MediaPlayer = {
  /** Always true in the browser (no other music app owns playback). */
  get gameHasControl(): boolean {
    return true;
  },
  get state(): MediaState {
    return MediaPlayerImpl._state;
  },
  get isRepeating(): boolean {
    return MediaPlayerImpl._repeating;
  },
  set isRepeating(v: boolean) {
    MediaPlayerImpl._repeating = v;
    if (MediaPlayerImpl.queue) MediaPlayerImpl.queue.element.loop = v;
  },
  get volume(): number {
    return MediaPlayerImpl._volume;
  },
  set volume(v: number) {
    MediaPlayerImpl._volume = clamp(v, 0, 1);
    MediaPlayerImpl.applyVolume();
  },
  get isMuted(): boolean {
    return MediaPlayerImpl._muted;
  },
  set isMuted(v: boolean) {
    MediaPlayerImpl._muted = v;
    MediaPlayerImpl.applyVolume();
  },
  get playPosition(): TimeSpan {
    const s = MediaPlayerImpl.queue;
    return TimeSpan.fromSeconds(s ? s.element.currentTime : 0);
  },
  play(song: Song): void {
    const prev = MediaPlayerImpl.queue;
    if (prev && prev !== song) {
      prev.element.pause();
      prev.element.currentTime = 0;
    }
    MediaPlayerImpl.queue = song;
    MediaPlayerImpl.route(song);
    song.element.onended = (): void => {
      if (MediaPlayerImpl.queue === song && !song.element.loop) MediaPlayerImpl._state = MediaState.Stopped;
    };
    song.element.currentTime = 0;
    MediaPlayerImpl._state = MediaState.Playing;
    MediaPlayerImpl.startElement();
  },
  pause(): void {
    if (MediaPlayerImpl._state !== MediaState.Playing) return;
    MediaPlayerImpl.queue?.element.pause();
    MediaPlayerImpl.pending = false;
    MediaPlayerImpl._state = MediaState.Paused;
  },
  resume(): void {
    if (MediaPlayerImpl._state !== MediaState.Paused) return;
    MediaPlayerImpl._state = MediaState.Playing;
    MediaPlayerImpl.startElement();
  },
  stop(): void {
    const s = MediaPlayerImpl.queue;
    if (s) {
      s.element.pause();
      s.element.currentTime = 0;
    }
    MediaPlayerImpl.pending = false;
    MediaPlayerImpl._state = MediaState.Stopped;
  },
};

