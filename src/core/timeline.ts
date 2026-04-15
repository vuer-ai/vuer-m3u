/**
 * TimelineClock — pure time source.
 *
 * Advances time via internal RAF loop or external tick(delta).
 * Emits two events:
 * - 'tick' : every frame (~60fps)
 * - 'seek' : on explicit user actions (play/pause/seek/rate/loop)
 *
 * Does NOT know about playlists, segments, or data formats.
 */

export type TickEvent = { time: number; playing: boolean; rate: number };
export type SeekEvent = { time: number; source: 'seek' | 'play' | 'pause' | 'rate' | 'loop' };

export type TimelineEventMap = {
  tick: TickEvent;
  seek: SeekEvent;
};

type Listener<T> = (event: T) => void;

export class TimelineClock {
  private _time = 0;
  private _playing = false;
  private _rate = 1;
  private _duration = 0;
  private _loop = false;
  private _raf = 0;
  private _lastFrame = 0;

  private _listeners: {
    tick: Set<Listener<TickEvent>>;
    seek: Set<Listener<SeekEvent>>;
  } = {
    tick: new Set(),
    seek: new Set(),
  };

  constructor(duration = 0) {
    this._duration = duration;
  }

  get time(): number { return this._time; }
  get playing(): boolean { return this._playing; }
  get rate(): number { return this._rate; }
  get duration(): number { return this._duration; }
  get loop(): boolean { return this._loop; }

  play(): void {
    if (this._playing) return;
    if (this._time >= this._duration && this._duration > 0) this._time = 0;
    this._playing = true;
    this._lastFrame = 0;
    this._startRAF();
    this._emitSeek('play');
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    this._stopRAF();
    this._emitSeek('pause');
  }

  seek(time: number): void {
    this._time = Math.max(0, Math.min(time, this._duration));
    this._emitSeek('seek');
    this._emitTick();
  }

  setRate(rate: number): void {
    this._rate = rate;
    this._emitSeek('rate');
  }

  setLoop(v: boolean): void {
    this._loop = v;
    this._emitSeek('loop');
  }

  /** Set duration to exactly `d`. */
  setDuration(d: number): void {
    this._duration = d;
    this._emitSeek('seek');
  }

  /**
   * Extend duration to at least `d` (never shrink).
   * Safe for multiple engines sharing one clock — each calls
   * extendDuration(myDuration), clock keeps max(all).
   */
  extendDuration(d: number): void {
    if (d > this._duration) {
      this.setDuration(d);
    }
  }

  /**
   * Advance time by `delta` seconds (scaled by rate).
   * Called internally by the RAF loop, or externally (e.g. R3F useFrame).
   * Delta is clamped to 100ms to prevent jumps after tab switches.
   */
  tick(delta: number): void {
    if (delta <= 0) return;

    const d = Math.min(delta, 0.1);
    let t = this._time + d * this._rate;

    // Forward: past end
    if (this._rate > 0 && t >= this._duration) {
      if (this._loop && this._duration > 0) {
        this._time = t % this._duration;
        this._emitTick();
        this._emitSeek('loop');
        return;
      } else {
        this._time = this._duration;
        this._playing = false;
        this._stopRAF();
        this._emitTick();
        this._emitSeek('pause');
        return;
      }
    }

    // Reverse: before start
    if (this._rate < 0 && t < 0) {
      if (this._loop && this._duration > 0) {
        this._time = this._duration + (t % this._duration);
        this._emitTick();
        this._emitSeek('loop');
        return;
      } else {
        this._time = 0;
        this._playing = false;
        this._stopRAF();
        this._emitTick();
        this._emitSeek('pause');
        return;
      }
    }

    this._time = t;
    this._emitTick();
  }

  destroy(): void {
    this._stopRAF();
    this._listeners.tick.clear();
    this._listeners.seek.clear();
  }

  on<K extends keyof TimelineEventMap>(event: K, fn: Listener<TimelineEventMap[K]>): () => void {
    const set = this._listeners[event] as Set<Listener<TimelineEventMap[K]>>;
    set.add(fn);
    return () => { set.delete(fn); };
  }

  // ---- Internal ----

  private _startRAF(): void {
    const tick = (now: number) => {
      if (!this._playing) return;
      if (this._lastFrame === 0) {
        this._lastFrame = now;
        this._raf = requestAnimationFrame(tick);
        return;
      }
      const delta = (now - this._lastFrame) / 1000;
      this._lastFrame = now;
      this.tick(delta);
      if (this._playing) {
        this._raf = requestAnimationFrame(tick);
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  private _stopRAF(): void {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  private _emitTick(): void {
    const e: TickEvent = { time: this._time, playing: this._playing, rate: this._rate };
    for (const fn of this._listeners.tick) fn(e);
  }

  private _emitSeek(source: SeekEvent['source']): void {
    const e: SeekEvent = { time: this._time, source };
    for (const fn of this._listeners.seek) fn(e);
  }
}
