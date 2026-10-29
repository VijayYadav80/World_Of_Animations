import { Injectable, computed, inject, signal } from '@angular/core';
import { AudioService } from './audio.service';
import { PlaybackService } from './playback.service';
import { SceneStateService } from './scene-state.service';

export interface ExportFormat {
  id: 'mp4' | 'webm';
  label: string;
  /** MIME type given to MediaRecorder. */
  mime: string;
  ext: string;
}

export type ExportStatus = 'idle' | 'recording' | 'finishing';

const MP4_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
const WEBM_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const VIDEO_BITS_PER_SECOND = 8_000_000;
/** Recording keeps going this long after the last frame so the final sound is not cut off. */
const TAIL_MS = 300;

/**
 * Phase 6: video export.
 * The scene is played once from the start at normal speed while the stage canvas and the preview audio are recorded
 * (MediaRecorder). The video therefore takes as long as the timeline, and the browser tab must stay open and visible.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly playback = inject(PlaybackService);
  private readonly scene = inject(SceneStateService);
  private readonly audio = inject(AudioService);

  /** The Pixi canvas. The stage registers it when it is ready. */
  readonly canvas = signal<HTMLCanvasElement | null>(null);
  readonly status = signal<ExportStatus>('idle');
  /** Result or error text for the dialog. */
  readonly message = signal<{ kind: 'ok' | 'err'; text: string } | null>(null);
  /** 0..1 while recording. */
  readonly progress = computed(() => {
    const d = this.playback.duration();
    return d > 0 ? Math.min(1, this.playback.time() / d) : 0;
  });
  /** Formats this browser can record (MP4 only in recent Chrome/Edge/Safari; WebM almost everywhere). */
  readonly formats: ExportFormat[] = detectFormats();

  private cancelled = false;

  setCanvas(canvas: HTMLCanvasElement | null): void { this.canvas.set(canvas); }

  cancel(): void {
    if (this.status() === 'idle') return;
    this.cancelled = true;
    this.playback.pause();
  }

  /** Records the whole timeline and downloads the file. `fileName` has no extension. */
  async start(format: ExportFormat, fps: number, fileName: string): Promise<void> {
    if (this.status() !== 'idle') return;
    this.message.set(null);
    const canvas = this.canvas();
    if (!canvas) { this.fail('The stage is not ready yet. Try again in a moment.'); return; }
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      this.fail('This browser cannot record video. Please use a recent Chrome or Edge.');
      return;
    }

    // Remember what the user had selected, then clear it so selection boxes and handles are not in the video.
    const before = { id: this.scene.selectedId(), prop: this.scene.selectedPropId(), rate: this.playback.rate(), time: this.playback.time() };
    this.cancelled = false;
    this.playback.pause();
    this.playback.setRate(1);
    this.scene.select(null);

    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    const chunks: Blob[] = [];
    try {
      const videoStream = canvas.captureStream(fps);
      const audioStream = this.audio.captureStream();
      stream = new MediaStream([...videoStream.getVideoTracks(), ...(audioStream?.getAudioTracks() ?? [])]);
      recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>(resolve => { recorder!.onstop = () => resolve(); });

      this.status.set('recording');
      await sleep(150); // let the stage redraw without selection boxes before the first frame is recorded
      recorder.start(500);
      this.playback.restart();
      this.playback.play();
      await this.waitForEnd();
      if (!this.cancelled) await sleep(TAIL_MS);

      this.status.set('finishing');
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;

      if (this.cancelled) {
        this.message.set({ kind: 'err', text: 'Export cancelled.' });
      } else if (chunks.length === 0) {
        this.message.set({ kind: 'err', text: 'Nothing was recorded. Keep this tab visible while exporting and try again.' });
      } else {
        const blob = new Blob(chunks, { type: format.mime.split(';')[0] });
        download(blob, `${safeFileName(fileName)}.${format.ext}`);
        this.message.set({ kind: 'ok', text: `Done. "${safeFileName(fileName)}.${format.ext}" was downloaded (${(blob.size / 1_048_576).toFixed(1)} MB).` });
      }
    } catch (e) {
      this.message.set({ kind: 'err', text: `Export failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
      stream?.getTracks().forEach(t => t.stop());
      this.audio.releaseCapture();
      this.playback.pause();
      this.playback.setRate(before.rate);
      this.playback.seek(before.time);
      if (before.prop) this.scene.selectProp(before.prop);
      else this.scene.select(before.id);
      this.status.set('idle');
    }
  }

  /** Resolves when playback reaches the end (it pauses itself there), the user pauses it, or the export is cancelled. */
  private waitForEnd(): Promise<void> {
    return new Promise(resolve => {
      const timer = setInterval(() => {
        if (this.cancelled || !this.playback.playing()) { clearInterval(timer); resolve(); }
      }, 100);
    });
  }

  private fail(text: string): void { this.message.set({ kind: 'err', text }); }
}

function detectFormats(): ExportFormat[] {
  if (typeof MediaRecorder === 'undefined') return [];
  const out: ExportFormat[] = [];
  const mp4 = MP4_TYPES.find(t => MediaRecorder.isTypeSupported(t));
  if (mp4) out.push({ id: 'mp4', label: 'MP4 (plays everywhere)', mime: mp4, ext: 'mp4' });
  const webm = WEBM_TYPES.find(t => MediaRecorder.isTypeSupported(t));
  if (webm) out.push({ id: 'webm', label: 'WebM', mime: webm, ext: 'webm' });
  return out;
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'animation';
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}
