import { Injectable, computed, inject, signal } from '@angular/core';
import { CharacterTimeline, canAppend, emptyTimeline, evaluatePosition, findClip, timelineEnd } from '../animation/animation-engine';
import { RigDefinition } from '../models/asset.models';
import { PlaybackService } from './playback.service';

/** Stage coordinates: 1280x720, origin top-left, y down. Time unit (later phases): milliseconds. */
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

export interface CharacterInstance {
  instanceId: string;
  characterId: string;
  /** Position of the character's feet on the stage. */
  x: number;
  y: number;
  scale: number;
  /** Degrees. */
  rotation: number;
  flipX: boolean;
  /** Animation clips + position keyframes (times in ms). */
  timeline: CharacterTimeline;
}

export interface SceneState {
  backgroundId: string | null;
  characters: CharacterInstance[];
}

/** Single source of truth for the scene. Stage, properties panel (and later timeline) all read this. */
@Injectable({ providedIn: 'root' })
export class SceneStateService {
  private readonly playback = inject(PlaybackService);
  readonly state = signal<SceneState>({ backgroundId: null, characters: [] });
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(
    () => this.state().characters.find(c => c.instanceId === this.selectedId()) ?? null
  );

  setBackground(backgroundId: string): void {
    this.state.update(s => ({ ...s, backgroundId }));
  }

  addCharacter(characterId: string, x: number, y: number, scale: number): string {
    const instanceId = `${characterId}-${crypto.randomUUID().slice(0, 8)}`;
    const inst: CharacterInstance = { instanceId, characterId, x, y, scale, rotation: 0, flipX: false, timeline: emptyTimeline() };
    this.state.update(s => ({ ...s, characters: [...s.characters, inst] }));
    this.selectedId.set(instanceId);
    return instanceId;
  }

  updateCharacter(instanceId: string, patch: Partial<Omit<CharacterInstance, 'instanceId' | 'characterId'>>): void {
    this.state.update(s => ({
      ...s,
      characters: s.characters.map(c => (c.instanceId === instanceId ? { ...c, ...patch } : c)),
    }));
  }

  /** Appends an action after the last clip. Walk/run also add position keyframes so Raju really travels. */
  appendClip(instanceId: string, rig: RigDefinition, clipId: string, durationMs?: number): { ok: boolean; reason?: string } {
    const inst = this.state().characters.find(c => c.instanceId === instanceId);
    const def = findClip(rig, clipId);
    if (!inst || !def) return { ok: false, reason: 'Unknown character or action' };
    const check = canAppend(rig, inst.timeline, clipId);
    if (!check.ok) return check;

    const start = timelineEnd(inst.timeline);
    const duration = Math.max(100, Math.round(durationMs ?? (def.loop ? def.duration * 2 : def.duration)));
    const clips = [...inst.timeline.clips, { id: crypto.randomUUID().slice(0, 8), clipId, start, duration, speed: 1 }];
    let positionKeys = [...inst.timeline.positionKeys];
    if (def.groundSpeed) {
      const from = evaluatePosition(inst.timeline, start) ?? { x: inst.x, y: inst.y };
      const dir = inst.flipX ? -1 : 1;
      const dx = dir * def.groundSpeed * inst.scale * (duration / 1000);
      if (!positionKeys.some(k => k.t === start)) positionKeys.push({ t: start, x: from.x, y: from.y });
      positionKeys.push({ t: start + duration, x: Math.round(Math.min(1380, Math.max(-100, from.x + dx))), y: from.y });
    }
    this.patchTimeline(instanceId, { clips, positionKeys });
    this.playback.ensureDuration(start + duration + 1000);
    return { ok: true };
  }

  removeClip(instanceId: string, timelineClipId: string): void {
    const inst = this.state().characters.find(c => c.instanceId === instanceId);
    if (inst) this.patchTimeline(instanceId, { clips: inst.timeline.clips.filter(c => c.id !== timelineClipId) });
  }

  clearTimeline(instanceId: string): void {
    this.patchTimeline(instanceId, emptyTimeline());
  }

  /** Drag on the stage: moves the static position, or edits the position keyframe at the playhead if the character travels. */
  moveCharacter(instanceId: string, x: number, y: number, timeMs: number): void {
    const inst = this.state().characters.find(c => c.instanceId === instanceId);
    if (!inst) return;
    if (inst.timeline.positionKeys.length === 0) { this.updateCharacter(instanceId, { x, y }); return; }
    const t = Math.round(timeMs);
    const keys = inst.timeline.positionKeys.filter(k => Math.abs(k.t - t) > 1);
    keys.push({ t, x, y });
    this.patchTimeline(instanceId, { positionKeys: keys.sort((a, b) => a.t - b.t) });
  }

  private patchTimeline(instanceId: string, patch: Partial<CharacterTimeline>): void {
    this.state.update(s => ({
      ...s,
      characters: s.characters.map(c => (c.instanceId === instanceId ? { ...c, timeline: { ...c.timeline, ...patch } } : c)),
    }));
  }

  removeCharacter(instanceId: string): void {
    this.state.update(s => ({ ...s, characters: s.characters.filter(c => c.instanceId !== instanceId) }));
    if (this.selectedId() === instanceId) this.selectedId.set(null);
  }

  select(instanceId: string | null): void {
    this.selectedId.set(instanceId);
  }
}
