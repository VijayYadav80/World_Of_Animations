import { Injectable, computed, inject, signal } from '@angular/core';
import { CharacterTimeline, canAppend, emptyTimeline, evaluatePosition, findClip, timelineEnd } from '../animation/animation-engine';
import { estimateSpeechMs } from '../dialogue/lipsync';
import * as Speech from '../dialogue/speech-edits';
import { RigDefinition } from '../models/asset.models';
import { AudioClip, DialogueClip, SpeechData } from '../models/dialogue.models';
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
  /** Speech bubbles (Phase 4). */
  dialogues: DialogueClip[];
  /** Imported voice audio placed on the Audio track (Phase 4). */
  audioClips: AudioClip[];
}

/** The dialogue/audio block currently selected in the timeline. */
export interface ClipSelection { kind: 'dialogue' | 'audio'; id: string }

/** Single source of truth for the scene. Stage, properties panel (and later timeline) all read this. */
@Injectable({ providedIn: 'root' })
export class SceneStateService {
  private readonly playback = inject(PlaybackService);
  readonly state = signal<SceneState>({ backgroundId: null, characters: [], dialogues: [], audioClips: [] });
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(
    () => this.state().characters.find(c => c.instanceId === this.selectedId()) ?? null
  );
  /** Selected dialogue/audio block in the timeline (null when none). */
  readonly selectedClip = signal<ClipSelection | null>(null);
  readonly selectedDialogue = computed(() => {
    const s = this.selectedClip();
    return s?.kind === 'dialogue' ? this.state().dialogues.find(d => d.id === s.id) ?? null : null;
  });
  readonly selectedAudio = computed(() => {
    const s = this.selectedClip();
    return s?.kind === 'audio' ? this.state().audioClips.find(a => a.id === s.id) ?? null : null;
  });

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
    this.state.update(s => ({ ...s, ...Speech.removeCharacterSpeech(s, instanceId), characters: s.characters.filter(c => c.instanceId !== instanceId) }));
    if (this.selectedId() === instanceId) this.selectedId.set(null);
    this.dropStaleClipSelection();
  }

  select(instanceId: string | null): void {
    this.selectedId.set(instanceId);
  }

  // ------------------------------------------------------------ Phase 4: dialogue + audio

  selectClip(sel: ClipSelection | null): void {
    this.selectedClip.set(sel);
  }

  /** Adds a speech bubble for a character. Length defaults to a natural speaking time for the text. */
  addDialogue(characterId: string, text: string, start: number, durationMs?: number): string {
    const id = crypto.randomUUID().slice(0, 8);
    const duration = Math.max(Speech.MIN_DIALOGUE_MS, Math.round(durationMs ?? estimateSpeechMs(text)));
    const clip: DialogueClip = { id, characterId, text, start: Math.max(0, Math.round(start)), duration };
    this.state.update(s => ({ ...s, dialogues: [...s.dialogues, clip] }));
    this.selectedClip.set({ kind: 'dialogue', id });
    this.playback.ensureDuration(clip.start + clip.duration + 1000);
    return id;
  }

  patchDialogue(id: string, patch: { text?: string; characterId?: string }): void {
    this.applySpeech(Speech.patchDialogue(this.speech(), id, patch));
  }

  moveDialogue(id: string, start: number): void { this.applySpeech(Speech.moveDialogue(this.speech(), id, start)); }

  resizeDialogue(id: string, duration: number): void { this.applySpeech(Speech.resizeDialogue(this.speech(), id, duration)); }

  removeDialogue(id: string): void {
    this.applySpeech(Speech.removeDialogue(this.speech(), id));
    this.dropStaleClipSelection();
  }

  /** Puts an imported audio file on the Audio track. The character's mouth follows it when `characterId` is set. */
  addAudio(asset: { id: string; name: string; duration: number }, start: number, characterId?: string): string {
    const id = crypto.randomUUID().slice(0, 8);
    const clip: AudioClip = { id, name: asset.name, assetId: asset.id, start: Math.max(0, Math.round(start)), duration: Math.round(asset.duration), characterId };
    this.state.update(s => ({ ...s, audioClips: [...s.audioClips, clip] }));
    this.selectedClip.set({ kind: 'audio', id });
    this.playback.ensureDuration(clip.start + clip.duration + 1000);
    return id;
  }

  /** Attaches audio to a dialogue line: the line takes the audio's start, character and length. */
  attachAudio(dialogueId: string, asset: { id: string; name: string; duration: number }): void {
    const audio: AudioClip = { id: crypto.randomUUID().slice(0, 8), name: asset.name, assetId: asset.id, start: 0, duration: Math.round(asset.duration) };
    this.applySpeech(Speech.attachAudio(this.speech(), dialogueId, audio));
    const d = this.state().dialogues.find(x => x.id === dialogueId);
    if (d) this.playback.ensureDuration(d.start + d.duration + 1000);
  }

  moveAudio(id: string, start: number): void { this.applySpeech(Speech.moveAudio(this.speech(), id, start)); }

  patchAudioCharacter(id: string, characterId: string | undefined): void {
    this.state.update(s => ({ ...s, audioClips: s.audioClips.map(a => (a.id === id ? { ...a, characterId } : a)) }));
  }

  removeAudio(id: string): void {
    this.applySpeech(Speech.removeAudio(this.speech(), id));
    this.dropStaleClipSelection();
  }

  removeSelectedClip(): void {
    const sel = this.selectedClip();
    if (!sel) return;
    if (sel.kind === 'dialogue') this.removeDialogue(sel.id); else this.removeAudio(sel.id);
  }

  private speech(): SpeechData {
    const { dialogues, audioClips } = this.state();
    return { dialogues, audioClips };
  }

  private applySpeech(next: SpeechData): void {
    this.state.update(s => ({ ...s, dialogues: next.dialogues, audioClips: next.audioClips }));
    this.playback.ensureDuration(Speech.speechEnd(next) + 1000);
  }

  private dropStaleClipSelection(): void {
    const sel = this.selectedClip();
    if (!sel) return;
    const s = this.state();
    const exists = sel.kind === 'dialogue' ? s.dialogues.some(d => d.id === sel.id) : s.audioClips.some(a => a.id === sel.id);
    if (!exists) this.selectedClip.set(null);
  }
}
