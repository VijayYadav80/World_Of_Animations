import { Injectable, computed, inject, signal } from '@angular/core';
import { duplicateClip, resizeClip } from '../animation/clip-edits';
import { CharacterTimeline, canAppend, emptyTimeline, evaluatePosition, findClip, timelineEnd } from '../animation/animation-engine';
import { estimateSpeechMs } from '../dialogue/lipsync';
import * as Speech from '../dialogue/speech-edits';
import { RigDefinition } from '../models/asset.models';
import * as Scenes from '../models/scene-segments';
import { DEFAULT_SCENE_MS, SceneSegment, sceneAt, scenesEnd } from '../models/scene-segments';
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

/** Where a prop is drawn relative to the characters. 'auto' = by height on the stage (lower = in front). */
export type PropLayer = 'back' | 'auto' | 'front';

/** A prop (chair, pot, well ...) placed on the stage. Props do not animate: they stay for the whole video. */
export interface PropInstance {
  instanceId: string;
  propId: string;
  /** Position of the prop's anchor point (default: bottom centre of the picture) on the stage. */
  x: number;
  y: number;
  scale: number;
  /** Degrees. */
  rotation: number;
  flipX: boolean;
  layer: PropLayer;
}

export const MIN_PROP_SCALE = 0.05;
export const MAX_PROP_SCALE = 8;

export interface SceneState {
  /** Scenes (backgrounds) that play one after another on the timeline. */
  scenes: SceneSegment[];
  characters: CharacterInstance[];
  /** Props standing on the stage. */
  props: PropInstance[];
  /** Speech bubbles (Phase 4). */
  dialogues: DialogueClip[];
  /** Imported voice audio placed on the Audio track (Phase 4). */
  audioClips: AudioClip[];
}
/** "raju" -> "Raju"; imported "user-char-my-hero-1a2b3c4d" -> "My hero". */
export function prettyCharacterName(characterId: string): string {
  const name = characterId.replace(/^user-char-/, '').replace(/-[0-9a-f]{8}$/, '').replace(/-/g, ' ').trim() || characterId;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "chair" -> "Chair"; imported "user-prop-big-pot-1a2b3c4d" -> "Big pot". */
export function prettyPropName(propId: string): string {
  const name = propId.replace(/^user-prop-/, '').replace(/-[0-9a-f]{8}$/, '').replace(/[-_]+/g, ' ').trim() || propId;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The action block currently selected in the timeline. `id` is the TimelineClip id. */
export interface ActionSelection { instanceId: string; id: string }

/** The dialogue/audio block currently selected in the timeline. */
export interface ClipSelection { kind: 'dialogue' | 'audio'; id: string }

/** Single source of truth for the scene. Stage, properties panel (and later timeline) all read this. */
@Injectable({ providedIn: 'root' })
export class SceneStateService {
  private readonly playback = inject(PlaybackService);
  readonly state = signal<SceneState>({ scenes: [], characters: [], props: [], dialogues: [], audioClips: [] });
  readonly selectedId = signal<string | null>(null);
  /** Background that is on screen at the playhead. Only changes when the playhead crosses into another scene. */
  readonly currentBackgroundId = computed(() => sceneAt(this.state().scenes, this.playback.time())?.backgroundId ?? null);
  /** Scene block selected in the timeline (null when none). */
  readonly selectedSceneId = signal<string | null>(null);
  /** Action block selected in the timeline (null when none). Only one block of any kind is selected at a time. */
  readonly selectedAction = signal<ActionSelection | null>(null);
  readonly selected = computed(
    () => this.state().characters.find(c => c.instanceId === this.selectedId()) ?? null
  );
  /** Prop selected on the stage (null when none). A prop and a character are never selected together. */
  readonly selectedPropId = signal<string | null>(null);
  readonly selectedProp = computed(
    () => this.state().props.find(p => p.instanceId === this.selectedPropId()) ?? null
  );
  /** Unique, readable name for every prop ("Chair", "Chair 2", ...). */
  readonly propLabels = computed(() => {
    const seen = new Map<string, number>();
    const out = new Map<string, string>();
    for (const p of this.state().props) {
      const n = (seen.get(p.propId) ?? 0) + 1;
      seen.set(p.propId, n);
      const base = prettyPropName(p.propId);
      out.set(p.instanceId, n === 1 ? base : `${base} ${n}`);
    }
    return out;
  });
  propLabel(instanceId: string): string { return this.propLabels().get(instanceId) ?? '—'; }
  /** Unique, readable name for every character in the scene ("Raju", "Raju 2", ...), so two copies are never confused. */
  readonly labels = computed(() => {
    const seen = new Map<string, number>();
    const out = new Map<string, string>();
    for (const c of this.state().characters) {
      const n = (seen.get(c.characterId) ?? 0) + 1;
      seen.set(c.characterId, n);
      const base = prettyCharacterName(c.characterId);
      out.set(c.instanceId, n === 1 ? base : `${base} ${n}`);
    }
    return out;
  });
  label(instanceId: string): string { return this.labels().get(instanceId) ?? '—'; }

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

  /** Replaces the whole scene (opening a project / starting a new one). Selection is cleared. */
  loadScene(scene: SceneState): void {
    this.state.set(scene);
    this.selectedId.set(scene.characters[0]?.instanceId ?? null);
    this.selectedPropId.set(null);
    this.selectedClip.set(null);
    this.selectedSceneId.set(null);
    this.selectedAction.set(null);
  }

  resetScene(): void {
    this.loadScene({ scenes: [], characters: [], props: [], dialogues: [], audioClips: [] });
  }

  // ------------------------------------------------------------ scenes (backgrounds one after another)

  /** Adds a scene after the last one and makes the timeline long enough to show it. */
  addScene(backgroundId: string, durationMs: number = DEFAULT_SCENE_MS): string {
    const scene = Scenes.newScene(backgroundId, durationMs);
    this.applyScenes(Scenes.appendScene(this.state().scenes, scene));
    this.selectedSceneId.set(scene.id);
    return scene.id;
  }

  removeScene(id: string): void {
    this.applyScenes(Scenes.removeScene(this.state().scenes, id));
    if (this.selectedSceneId() === id) this.selectedSceneId.set(null);
  }

  resizeScene(id: string, durationMs: number): void { this.applyScenes(Scenes.resizeScene(this.state().scenes, id, durationMs)); }

  moveScene(id: string, toIndex: number): void { this.applyScenes(Scenes.moveScene(this.state().scenes, id, toIndex)); }

  changeSceneBackground(id: string, backgroundId: string): void {
    this.applyScenes(Scenes.setSceneBackground(this.state().scenes, id, backgroundId));
  }

  /** Cuts the scene under `timeMs` in two (same background). Does nothing near a scene edge. */
  splitSceneAt(timeMs: number): void { this.applyScenes(Scenes.splitScene(this.state().scenes, timeMs)); }

  selectScene(id: string | null): void {
    this.selectedSceneId.set(id);
    if (id) { this.selectedClip.set(null); this.selectedAction.set(null); this.selectedPropId.set(null); }
  }

  duplicateScene(id: string): void {
    const before = new Set(this.state().scenes.map(s => s.id));
    this.applyScenes(Scenes.duplicateScene(this.state().scenes, id));
    const copy = this.state().scenes.find(s => !before.has(s.id));
    if (copy) this.selectScene(copy.id);
  }

  private applyScenes(scenes: SceneSegment[]): void {
    this.state.update(s => ({ ...s, scenes }));
    this.playback.ensureDuration(scenesEnd(scenes));
  }

  addCharacter(characterId: string, x: number, y: number, scale: number): string {
    const instanceId = `${characterId}-${crypto.randomUUID().slice(0, 8)}`;
    const inst: CharacterInstance = { instanceId, characterId, x, y, scale, rotation: 0, flipX: false, timeline: emptyTimeline() };
    this.state.update(s => ({ ...s, characters: [...s.characters, inst] }));
    this.select(instanceId);
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

    // Starts at the playhead, but never before this character's previous action ends. This lets two characters act one after the other.
    const start = Math.max(timelineEnd(inst.timeline), Math.round(this.playback.time()));
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
    const sel = this.selectedAction();
    if (sel?.id === timelineClipId) this.selectedAction.set(null);
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
    this.selectedPropId.set(null); // clicking empty stage (null) also un-selects a prop
  }

  // ------------------------------------------------------------ props

  addProp(propId: string, x: number, y: number, scale: number): string {
    const instanceId = `${propId}-${crypto.randomUUID().slice(0, 8)}`;
    const inst: PropInstance = { instanceId, propId, x, y, scale: clampPropScale(scale), rotation: 0, flipX: false, layer: 'auto' };
    this.state.update(s => ({ ...s, props: [...s.props, inst] }));
    this.selectProp(instanceId);
    return instanceId;
  }

  updateProp(instanceId: string, patch: Partial<Omit<PropInstance, 'instanceId' | 'propId'>>): void {
    const next = patch.scale === undefined ? patch : { ...patch, scale: clampPropScale(patch.scale) };
    this.state.update(s => ({ ...s, props: s.props.map(p => (p.instanceId === instanceId ? { ...p, ...next } : p)) }));
  }

  removeProp(instanceId: string): void {
    this.state.update(s => ({ ...s, props: s.props.filter(p => p.instanceId !== instanceId) }));
    if (this.selectedPropId() === instanceId) this.selectedPropId.set(null);
  }

  /** Puts a copy of the prop a little to the side of the original and selects it. */
  duplicateProp(instanceId: string): void {
    const src = this.state().props.find(p => p.instanceId === instanceId);
    if (!src) return;
    const copy = this.addProp(src.propId, Math.min(STAGE_WIDTH, src.x + 40), Math.min(STAGE_HEIGHT, src.y + 20), src.scale);
    this.updateProp(copy, { rotation: src.rotation, flipX: src.flipX, layer: src.layer });
  }

  /** Selects a prop (null = none). Only one block of any kind is selected at a time. */
  selectProp(instanceId: string | null): void {
    this.selectedPropId.set(instanceId);
    if (instanceId) {
      this.selectedId.set(null);
      this.selectedClip.set(null);
      this.selectedSceneId.set(null);
      this.selectedAction.set(null);
    }
  }

  // ------------------------------------------------------------ Phase 4: dialogue + audio

  selectClip(sel: ClipSelection | null): void {
    this.selectedClip.set(sel);
    if (sel) { this.selectedSceneId.set(null); this.selectedAction.set(null); this.selectedPropId.set(null); }
  }

  selectAction(sel: ActionSelection | null): void {
    this.selectedAction.set(sel);
    if (sel) { this.selectedSceneId.set(null); this.selectedClip.set(null); this.selectedId.set(sel.instanceId); this.selectedPropId.set(null); }
  }

  /** Makes an action longer/shorter. Later actions of the same character slide along. */
  resizeClip(instanceId: string, rig: RigDefinition, timelineClipId: string, durationMs: number): void {
    const inst = this.state().characters.find(c => c.instanceId === instanceId);
    if (!inst) return;
    const timeline = resizeClip(rig, inst, inst.timeline, timelineClipId, durationMs);
    if (timeline === inst.timeline) return;
    this.patchTimeline(instanceId, timeline);
    this.playback.ensureDuration(timelineEnd(timeline) + 1000);
  }

  /** Copies an action right after the original. */
  duplicateClip(instanceId: string, rig: RigDefinition, timelineClipId: string): { ok: boolean; reason?: string } {
    const inst = this.state().characters.find(c => c.instanceId === instanceId);
    if (!inst) return { ok: false, reason: 'Unknown character' };
    const newId = crypto.randomUUID().slice(0, 8);
    const res = duplicateClip(rig, inst, inst.timeline, timelineClipId, newId);
    if (!res.ok) return res;
    this.patchTimeline(instanceId, res.timeline);
    this.playback.ensureDuration(timelineEnd(res.timeline) + 1000);
    this.selectAction({ instanceId, id: newId });
    return { ok: true };
  }

  duplicateDialogue(id: string): void {
    const newId = crypto.randomUUID().slice(0, 8);
    this.applySpeech(Speech.duplicateDialogue(this.speech(), id, newId));
    if (this.state().dialogues.some(d => d.id === newId)) this.selectClip({ kind: 'dialogue', id: newId });
  }

  duplicateAudio(id: string): void {
    const newId = crypto.randomUUID().slice(0, 8);
    this.applySpeech(Speech.duplicateAudio(this.speech(), id, newId));
    if (this.state().audioClips.some(a => a.id === newId)) this.selectClip({ kind: 'audio', id: newId });
  }

  /** Duplicates whatever block is selected (Ctrl+D). Returns an error text when it is refused. */
  duplicateSelected(rigFor: (characterId: string) => RigDefinition | undefined): string | null {
    const clip = this.selectedClip();
    if (clip) { if (clip.kind === 'dialogue') this.duplicateDialogue(clip.id); else this.duplicateAudio(clip.id); return null; }
    const sceneId = this.selectedSceneId();
    if (sceneId) { this.duplicateScene(sceneId); return null; }
    const propId = this.selectedPropId();
    if (propId) { this.duplicateProp(propId); return null; }
    const act = this.selectedAction();
    if (act) {
      const inst = this.state().characters.find(c => c.instanceId === act.instanceId);
      const rig = inst ? rigFor(inst.characterId) : undefined;
      if (!rig) return 'Character is still loading. Try again in a moment.';
      return this.duplicateClip(act.instanceId, rig, act.id).reason ?? null;
    }
    return null;
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

  /** Splits an audio clip at `timeMs`. Returns false when the time is not inside the clip. The right-hand part becomes selected. */
  splitAudioAt(id: string, timeMs: number): boolean {
    const newId = crypto.randomUUID().slice(0, 8);
    const next = Speech.splitAudio(this.speech(), id, timeMs, newId);
    if (!next) return false;
    this.applySpeech(next);
    this.selectClip({ kind: 'audio', id: newId });
    return true;
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

function clampPropScale(v: number): number {
  return Math.round(Math.min(MAX_PROP_SCALE, Math.max(MIN_PROP_SCALE, v)) * 100) / 100;
}
