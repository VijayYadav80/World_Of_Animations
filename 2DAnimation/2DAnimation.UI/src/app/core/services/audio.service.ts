import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { buildMouthTrack, computeEnvelope } from '../dialogue/lipsync';
import { AudioClip, MouthTrack } from '../models/dialogue.models';
import { PlaybackService } from './playback.service';
import { SceneStateService } from './scene-state.service';

export interface AudioAsset {
  id: string;
  name: string;
  /** ms */
  duration: number;
  buffer: AudioBuffer;
  /** The original file bytes, kept so the project can upload them when saving. */
  bytes: ArrayBuffer;
  mouth: MouthTrack;
  /** SVG path (viewBox 0 0 240 20) of the loudness shape, drawn inside the timeline block. */
  wave: string;
}

const WAVE_COLUMNS = 240;

/**
 * Imported voice audio: decoding, loudness analysis (for lip-sync) and playback that follows the PlaybackService clock.
 * Audio data lives in memory only (saving projects comes in Phase 5).
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly playback = inject(PlaybackService);
  private readonly scene = inject(SceneStateService);
  private readonly assets = new Map<string, AudioAsset>();
  private readonly clips = computed(() => this.scene.state().audioClips);
  private ctx?: AudioContext;
  private master?: GainNode;
  private sources: AudioBufferSourceNode[] = [];

  constructor() {
    // Re-schedule the sounds when play/pause, a seek, the speed or the audio clips change (not on every frame).
    effect(() => {
      const playing = this.playback.playing();
      this.playback.seeked();
      const rate = this.playback.rate();
      const clips = this.clips();
      untracked(() => this.sync(playing, rate, clips));
    });
  }

  /** Decodes an audio file and analyses it. Call from a click handler so the browser allows sound. */
  async importFile(file: File): Promise<AudioAsset> {
    return this.load(crypto.randomUUID().slice(0, 8), file.name, await file.arrayBuffer());
  }

  /** Re-creates an asset with its original id from saved bytes (opening a project). */
  restore(id: string, name: string, bytes: ArrayBuffer): Promise<AudioAsset> {
    return this.load(id, name, bytes);
  }

  /** Forgets every imported audio (new / opened project) and stops the sound. */
  clearAll(): void {
    this.stopAll();
    this.assets.clear();
  }

  private async load(id: string, name: string, original: ArrayBuffer): Promise<AudioAsset> {
    const ctx = this.context();
    const bytes = original.slice(0); // decodeAudioData detaches its input, so keep a copy for saving
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(original);
    } catch {
      throw new Error(`"${name}" could not be decoded. Use a WAV, MP3, OGG or M4A file.`);
    }
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buffer.numberOfChannels;
    }
    const env = computeEnvelope(mono, buffer.sampleRate);
    const asset: AudioAsset = {
      id,
      name,
      duration: Math.round(buffer.duration * 1000),
      buffer,
      bytes,
      mouth: buildMouthTrack(env),
      wave: this.wavePath(env),
    };
    this.assets.set(asset.id, asset);
    return asset;
  }

  asset(id: string): AudioAsset | undefined { return this.assets.get(id); }

  /** Lip-sync data for the engine (stage calls this every frame, so it must stay a plain lookup). */
  mouthTrack(assetId: string): MouthTrack | undefined { return this.assets.get(assetId)?.mouth; }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private stopAll(): void {
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
    this.sources = [];
  }

  private sync(playing: boolean, rate: number, clips: AudioClip[]): void {
    this.stopAll();
    if (!playing || !this.ctx || !this.master) return;
    void this.ctx.resume();
    const now = this.ctx.currentTime;
    const t = this.playback.time();
    for (const clip of clips) {
      const asset = this.assets.get(clip.assetId);
      const end = clip.start + clip.duration;
      if (!asset || t >= end) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = asset.buffer;
      src.playbackRate.value = rate;
      src.connect(this.master);
      const offset = (clip.offset ?? 0) / 1000; // seconds into the file (non-zero for the later part of a split clip)
      if (t < clip.start) src.start(now + (clip.start - t) / 1000 / rate, offset, clip.duration / 1000);
      else src.start(now, offset + (t - clip.start) / 1000, (end - t) / 1000);
      this.sources.push(src);
    }
  }

  private wavePath(env: Float32Array): string {
    if (env.length === 0) return '';
    const bins = Math.min(WAVE_COLUMNS, env.length);
    const peaks: number[] = [];
    let max = 0;
    for (let i = 0; i < bins; i++) {
      const from = Math.floor((i * env.length) / bins), to = Math.max(from + 1, Math.floor(((i + 1) * env.length) / bins));
      let m = 0;
      for (let j = from; j < to && j < env.length; j++) m = Math.max(m, env[j]);
      peaks.push(m);
      max = Math.max(max, m);
    }
    const scale = max > 0 ? 9 / max : 0;
    const x = (i: number) => ((i * WAVE_COLUMNS) / bins).toFixed(1);
    const top = peaks.map((p, i) => `${x(i)},${(10 - p * scale).toFixed(1)}`);
    const bottom = peaks.map((p, i) => `${x(i)},${(10 + p * scale).toFixed(1)}`).reverse();
    return `M${top.join(' L')} L${bottom.join(' L')} Z`;
  }
}
