import { Injectable, NgZone, inject, signal } from '@angular/core';

/** The one clock for preview. Time unit: milliseconds. Pose/position are computed from this time, never accumulated. */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private readonly zone = inject(NgZone);
  readonly time = signal(0);
  readonly playing = signal(false);
  readonly duration = signal(10000);
  readonly rate = signal(1);

  private raf = 0;
  private last = 0;

  play(): void {
    if (this.playing()) return;
    if (this.time() >= this.duration()) this.time.set(0);
    this.playing.set(true);
    this.last = performance.now();
    this.zone.runOutsideAngular(() => { this.raf = requestAnimationFrame(this.step); });
  }

  pause(): void {
    this.playing.set(false);
    cancelAnimationFrame(this.raf);
  }

  toggle(): void { this.playing() ? this.pause() : this.play(); }

  seek(ms: number): void {
    this.time.set(Math.min(this.duration(), Math.max(0, ms)));
  }

  restart(): void { this.seek(0); }

  ensureDuration(ms: number): void {
    if (ms > this.duration()) this.duration.set(Math.ceil(ms / 1000) * 1000);
  }

  private step = (now: number): void => {
    if (!this.playing()) return;
    const next = this.time() + (now - this.last) * this.rate();
    this.last = now;
    if (next >= this.duration()) { this.time.set(this.duration()); this.pause(); return; }
    this.time.set(next);
    this.raf = requestAnimationFrame(this.step);
  };
}
