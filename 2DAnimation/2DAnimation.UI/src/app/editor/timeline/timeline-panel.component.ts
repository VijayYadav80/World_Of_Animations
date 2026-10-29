import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { MIN_CLIP_MS } from '../../core/animation/clip-edits';
import { estimateSpeechMs } from '../../core/dialogue/lipsync';
import type { RigDefinition } from '../../core/models/asset.models';
import { Ms, formatTime } from '../../core/models/scene-time';
import { MIN_SCENE_MS, layoutScenes } from '../../core/models/scene-segments';
import { AssetManifestService } from '../../core/services/asset-manifest.service';
import { AudioService } from '../../core/services/audio.service';
import { UserAssetsService } from '../../core/services/user-assets.service';
import { PlaybackService } from '../../core/services/playback.service';
import { SceneStateService } from '../../core/services/scene-state.service';

type BlockKind = 'scene' | 'action' | 'dialogue' | 'audio';

interface Block {
  id: string;
  kind: BlockKind;
  label: string;
  title: string;
  left: number;
  width: number;
  color: string;
  selected: boolean;
  /** Character instance id (action blocks select it). */
  characterId?: string;
  /** Audio waveform path (audio blocks). */
  wave?: string;
  /** SVG viewBox that shows only this clip's slice of the waveform (a split clip is part of a longer file). */
  waveBox?: string;
  /** Linked dialogue/audio pairs cannot be resized. */
  linked: boolean;
}

interface Row {
  key: string;
  kind: BlockKind;
  label: string;
  characterId?: string;
  blocks: Block[];
}

interface Tick { x: number; label: string; major: boolean }

const COLORS = ['#4da3ff', '#ff9f43', '#3ddc84', '#c792ea', '#ff6b8b'];
const DEFAULT_TEXT = 'नमस्ते, मैं राजू हूँ।';
const SNAP_MS = 10;
const SCENE_SNAP_MS = 100;
const SCENE_COLORS = ['#8b7bff', '#35c2b8', '#f0a04b', '#e8638a', '#5aa9f0'];

/**
 * The timeline: transport, ruler with scrubbing, one Action row and one Dialogue row per character, and an Audio row.
 * Dialogue and audio blocks can be dragged (move) and dialogue blocks can be resized (right edge).
 * Action blocks are shown read-only; edit them from the action panel.
 */
@Component({
  selector: 'app-timeline-panel',
  templateUrl: './timeline-panel.component.html',
  styleUrl: './timeline-panel.component.css'
})
export class TimelinePanelComponent {
  protected readonly playback = inject(PlaybackService);
  protected readonly scene = inject(SceneStateService);
  private readonly audio = inject(AudioService);
  private readonly assets = inject(AssetManifestService);
  private readonly mine = inject(UserAssetsService);

  /** Rigs of the characters on stage (needed to know how far a Walk travels when it is made longer/shorter). */
  private readonly rigs = new Map<string, RigDefinition>();
  private readonly rigFor = (characterId: string): RigDefinition | undefined => this.rigs.get(characterId);

  /** Names of the scenes that ship with the app (id -> name). Imported scenes are named by UserAssetsService. */
  private readonly libraryNames = signal<Record<string, string>>({});
  private bgName(id: string): string {
    return this.mine.backgrounds().find(b => b.id === id)?.displayName ?? this.libraryNames()[id] ?? 'Scene';
  }

  @ViewChild('scroll') private scrollEl?: ElementRef<HTMLElement>;
  @ViewChild('inner') private innerEl?: ElementRef<HTMLElement>;

  protected readonly format = formatTime;
  protected readonly pxPerSec = signal(80);
  protected readonly message = signal<string | null>(null);
  private readonly pxPerMs = computed(() => this.pxPerSec() / 1000);

  protected readonly characters = computed(() => this.scene.state().characters);
  protected readonly hasCharacters = computed(() => this.characters().length > 0);
  protected readonly selectedDialogue = this.scene.selectedDialogue;
  protected readonly selectedAudio = this.scene.selectedAudio;
  /** The action block selected in the timeline. */
  protected readonly selectedActionInfo = computed(() => {
    const sel = this.scene.selectedAction();
    const inst = sel ? this.scene.state().characters.find(c => c.instanceId === sel.instanceId) : undefined;
    const clip = inst?.timeline.clips.find(k => k.id === sel?.id);
    return sel && inst && clip
      ? { instanceId: sel.instanceId, id: clip.id, name: clip.clipId.replace(/-/g, ' '), who: this.scene.label(inst.instanceId), start: clip.start, duration: clip.duration }
      : null;
  });
  /** The scene block selected in the timeline, with its computed start/end. */
  protected readonly selectedScene = computed(() => {
    const id = this.scene.selectedSceneId();
    const hit = id ? layoutScenes(this.scene.state().scenes).find(s => s.id === id) : undefined;
    return hit ? { ...hit, name: this.bgName(hit.backgroundId) } : null;
  });

  protected readonly contentWidth = computed(() => Math.ceil(this.playback.duration() * this.pxPerMs()) + 60);
  protected readonly playheadX = computed(() => this.playback.time() * this.pxPerMs());

  protected readonly ticks = computed<Tick[]>(() => {
    const ppm = this.pxPerMs();
    const total = this.playback.duration();
    const minor = this.pxPerSec() >= 140 ? 500 : 1000;
    const labelEvery = this.pxPerSec() < 40 ? 5000 : 1000;
    const out: Tick[] = [];
    for (let t = 0; t <= total; t += minor) {
      const major = t % labelEvery === 0;
      out.push({ x: t * ppm, label: major ? `${t / 1000}s` : '', major });
    }
    return out;
  });

  protected readonly rows = computed<Row[]>(() => {
    const ppm = this.pxPerMs();
    const { scenes, characters, dialogues, audioClips } = this.scene.state();
    const selClip = this.scene.selectedClip();
    const selAction = this.scene.selectedAction();
    const selScene = this.scene.selectedSceneId();
    const rows: Row[] = [];
    rows.push({
      key: 'scenes', kind: 'scene', label: 'Scenes',
      blocks: layoutScenes(scenes).map((s, i) => ({
        id: s.id, kind: 'scene' as const, label: `${i + 1}. ${this.bgName(s.backgroundId)}`,
        title: `${this.bgName(s.backgroundId)}\n${formatTime(s.start)} – ${formatTime(s.end)}`,
        left: s.start * ppm, width: Math.max(10, s.duration * ppm), color: SCENE_COLORS[i % SCENE_COLORS.length],
        selected: s.id === selScene, linked: false,
      })),
    });
    characters.forEach((c, i) => {
      const color = COLORS[i % COLORS.length];
      rows.push({
        key: `a-${c.instanceId}`, kind: 'action', label: `${this.scene.label(c.instanceId)} · Actions`, characterId: c.instanceId,
        blocks: c.timeline.clips.map(k => ({
          id: k.id, kind: 'action' as const, label: k.clipId.replace(/-/g, ' '), title: `${k.clipId}  ${formatTime(k.start)} – ${formatTime(k.start + k.duration)}`,
          left: k.start * ppm, width: Math.max(4, k.duration * ppm), color, selected: selAction?.id === k.id, characterId: c.instanceId, linked: false,
        })),
      });
      rows.push({
        key: `d-${c.instanceId}`, kind: 'dialogue', label: `${this.scene.label(c.instanceId)} · Dialogue`, characterId: c.instanceId,
        blocks: dialogues.filter(d => d.characterId === c.instanceId).map(d => ({
          id: d.id, kind: 'dialogue' as const, label: d.text || '(empty)', title: `${d.text}\n${formatTime(d.start)} – ${formatTime(d.start + d.duration)}`,
          left: d.start * ppm, width: Math.max(6, d.duration * ppm), color, selected: selClip?.kind === 'dialogue' && selClip.id === d.id, linked: !!d.audioId,
        })),
      });
    });
    rows.push({
      key: 'audio', kind: 'audio', label: 'Audio',
      blocks: audioClips.map(a => ({
        id: a.id, kind: 'audio' as const, label: a.name, title: `${a.name}\n${formatTime(a.start)} – ${formatTime(a.start + a.duration)}`,
        left: a.start * ppm, width: Math.max(6, a.duration * ppm), color: '#7d8597', selected: selClip?.kind === 'audio' && selClip.id === a.id,
        wave: this.audio.asset(a.assetId)?.wave, waveBox: this.waveBox(a.assetId, a.offset ?? 0, a.duration), linked: dialogues.some(d => d.audioId === a.id),
      })),
    });
    return rows;
  });

  /** Part of the waveform (viewBox 0 0 240 20) that belongs to [offset, offset + duration] of the file. */
  private waveBox(assetId: string, offset: Ms, duration: Ms): string {
    const total = this.audio.asset(assetId)?.duration ?? 0;
    if (total <= 0) return '0 0 240 20';
    const x = Math.min(239, (offset / total) * 240);
    const w = Math.max(1, Math.min(240 - x, (duration / total) * 240));
    return `${x.toFixed(2)} 0 ${w.toFixed(2)} 20`;
  }

  private drag?: { kind: BlockKind; id: string; mode: 'move' | 'resize'; x0: number; start0: Ms; dur0: Ms };
  private actionDrag?: { instanceId: string; id: string; x0: number; dur0: Ms };
  private sceneDrag?: { id: string; mode: 'move' | 'resize'; x0: number; start0: Ms; dur0: Ms };
  private scrubbing = false;
  private attachTarget: string | null = null;

  constructor() {
    // Load the rig of every character on stage (cached by AssetManifestService, so this is cheap).
    effect(() => {
      for (const c of this.scene.state().characters) {
        if (this.rigs.has(c.characterId)) continue;
        void this.assets.getRig(c.characterId).then(r => this.rigs.set(c.characterId, r.def)).catch(() => undefined);
      }
    });
    void this.assets.getManifest().then(m => this.libraryNames.set(Object.fromEntries(m.backgrounds.map(b => [b.id, b.displayName] as const)))).catch(() => undefined);
    // While playing, keep the playhead inside the visible part of the timeline.
    effect(() => {
      const x = this.playheadX();
      const el = this.scrollEl?.nativeElement;
      if (!el || !this.playback.playing()) return;
      if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 24) el.scrollLeft = Math.max(0, x - 40);
    });
  }

  // ------------------------------------------------------------ transport + zoom

  protected setRate(ev: Event): void { this.playback.setRate(+(ev.target as HTMLSelectElement).value); }
  protected setZoom(ev: Event): void { this.pxPerSec.set(+(ev.target as HTMLInputElement).value); }
  protected zoomBy(factor: number): void { this.pxPerSec.update(v => Math.round(Math.min(300, Math.max(20, v * factor)))); }

  // ------------------------------------------------------------ scrubbing

  private timeAt(ev: PointerEvent): Ms {
    const rect = this.innerEl!.nativeElement.getBoundingClientRect();
    return Math.round((ev.clientX - rect.left) / this.pxPerMs());
  }

  protected onScrubDown(ev: PointerEvent): void {
    if ((ev.target as HTMLElement).closest('.block')) return;
    this.scrubbing = true;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.playback.seek(this.timeAt(ev));
  }
  protected onScrubMove(ev: PointerEvent): void { if (this.scrubbing) this.playback.seek(this.timeAt(ev)); }
  protected onScrubUp(): void { this.scrubbing = false; }

  // ------------------------------------------------------------ blocks

  protected onBlockDown(ev: PointerEvent, row: Row, b: Block, mode: 'move' | 'resize' = 'move'): void {
    ev.stopPropagation();
    if (b.kind === 'scene') {
      const placed = layoutScenes(this.scene.state().scenes).find(s => s.id === b.id);
      this.scene.selectClip(null);
      this.scene.selectScene(b.id);
      if (!placed) return;
      this.sceneDrag = { id: b.id, mode, x0: ev.clientX, start0: placed.start, dur0: placed.duration };
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
      return;
    }
    if (b.kind === 'action') {
      const instanceId = row.characterId;
      if (!instanceId) return;
      const clip = this.scene.state().characters.find(c => c.instanceId === instanceId)?.timeline.clips.find(k => k.id === b.id);
      this.scene.selectAction({ instanceId, id: b.id });
      if (clip && mode === 'resize') {
        this.actionDrag = { instanceId, id: b.id, x0: ev.clientX, dur0: clip.duration };
        (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
      }
      return;
    }
    this.scene.selectClip({ kind: b.kind, id: b.id });
    const s = this.scene.state();
    const clip = b.kind === 'dialogue' ? s.dialogues.find(d => d.id === b.id) : s.audioClips.find(a => a.id === b.id);
    if (!clip) return;
    if (mode === 'resize' && b.linked) return;
    this.drag = { kind: b.kind, id: b.id, mode, x0: ev.clientX, start0: clip.start, dur0: clip.duration };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }

  /** Listening on the window (not on the block) means a fast drag never loses the block, even if the pointer leaves it. */
  @HostListener('window:pointermove', ['$event'])
  protected onBlockMove(ev: PointerEvent): void {
    const sd = this.sceneDrag;
    if (sd) { this.dragScene(sd, ev); return; }
    const ad = this.actionDrag;
    if (ad) { this.dragAction(ad, ev); return; }
    const d = this.drag;
    if (!d) return;
    const dms = Math.round((ev.clientX - d.x0) / this.pxPerMs() / SNAP_MS) * SNAP_MS;
    if (d.mode === 'resize') this.scene.resizeDialogue(d.id, d.dur0 + dms);
    else if (d.kind === 'dialogue') this.scene.moveDialogue(d.id, d.start0 + dms);
    else this.scene.moveAudio(d.id, d.start0 + dms);
  }

  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  protected onBlockUp(): void { this.drag = undefined; this.sceneDrag = undefined; this.actionDrag = undefined; }

  /** Drag the right edge of an action: its length changes in 100 ms steps, later actions slide along. */
  private dragAction(ad: { instanceId: string; id: string; x0: number; dur0: Ms }, ev: PointerEvent): void {
    const inst = this.scene.state().characters.find(c => c.instanceId === ad.instanceId);
    const rig = inst ? this.rigs.get(inst.characterId) : undefined;
    if (!rig) return;
    const dms = Math.round((ev.clientX - ad.x0) / this.pxPerMs() / SCENE_SNAP_MS) * SCENE_SNAP_MS;
    this.scene.resizeClip(ad.instanceId, rig, ad.id, Math.max(MIN_CLIP_MS, ad.dur0 + dms));
  }

  /** Resize: change the length (100 ms steps). Move: the scene jumps to the slot its centre is over; the others shift automatically. */
  private dragScene(sd: { id: string; mode: 'move' | 'resize'; x0: number; start0: Ms; dur0: Ms }, ev: PointerEvent): void {
    const dms = Math.round((ev.clientX - sd.x0) / this.pxPerMs() / SCENE_SNAP_MS) * SCENE_SNAP_MS;
    if (sd.mode === 'resize') { this.scene.resizeScene(sd.id, sd.dur0 + dms); return; }
    const centre = sd.start0 + sd.dur0 / 2 + (ev.clientX - sd.x0) / this.pxPerMs();
    const others = layoutScenes(this.scene.state().scenes).filter(s => s.id !== sd.id);
    this.scene.moveScene(sd.id, others.filter(s => (s.start + s.end) / 2 < centre).length);
  }

  // ------------------------------------------------------------ add / edit

  protected addDialogue(): void {
    const chars = this.characters();
    if (chars.length === 0) return;
    const target = this.scene.selected() ?? chars[0];
    // If someone is already speaking at the playhead, the new line goes right after them (lines play one after another, not on top of each other).
    const t = Math.round(this.playback.time());
    const speaking = this.scene.state().dialogues.filter(d => d.start <= t && t < d.start + d.duration);
    const start = speaking.length ? Math.max(...speaking.map(d => d.start + d.duration)) : t;
    this.scene.addDialogue(target.instanceId, DEFAULT_TEXT, start);
    this.message.set(null);
  }

  protected pickAudio(): void { this.attachTarget = null; this.openFilePicker(); }
  protected attach(dialogueId: string): void { this.attachTarget = dialogueId; this.openFilePicker(); }

  private openFilePicker(): void {
    const input = document.getElementById('tl-audio-input') as HTMLInputElement | null;
    input?.click();
  }

  protected async onAudioPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const target = this.attachTarget;
    this.attachTarget = null;
    try {
      const asset = await this.audio.importFile(file);
      if (target) this.scene.attachAudio(target, asset);
      else this.scene.addAudio(asset, this.playback.time(), this.scene.selected()?.instanceId);
      this.message.set(null);
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected sec(ms: Ms): number { return Math.round(ms / 10) / 100; }

  protected onDialogueText(id: string, ev: Event): void { this.scene.patchDialogue(id, { text: (ev.target as HTMLInputElement).value }); }
  protected onDialogueChar(id: string, ev: Event): void { this.scene.patchDialogue(id, { characterId: (ev.target as HTMLSelectElement).value }); }
  protected onDialogueStart(id: string, ev: Event): void { this.scene.moveDialogue(id, Math.max(0, +(ev.target as HTMLInputElement).value) * 1000); }
  protected onDialogueLength(id: string, ev: Event): void { this.scene.resizeDialogue(id, Math.max(0.2, +(ev.target as HTMLInputElement).value) * 1000); }
  protected fitText(id: string, text: string): void { this.scene.resizeDialogue(id, estimateSpeechMs(text)); }

  protected onAudioStart(id: string, ev: Event): void { this.scene.moveAudio(id, Math.max(0, +(ev.target as HTMLInputElement).value) * 1000); }
  protected onAudioChar(id: string, ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    this.scene.patchAudioCharacter(id, v || undefined);
  }

  protected removeSelected(): void { this.scene.removeSelectedClip(); }

  protected onActionLength(a: { instanceId: string; id: string }, ev: Event): void {
    const inst = this.scene.state().characters.find(c => c.instanceId === a.instanceId);
    const rig = inst ? this.rigs.get(inst.characterId) : undefined;
    if (!rig) { this.message.set('Character is still loading. Try again in a moment.'); return; }
    this.scene.resizeClip(a.instanceId, rig, a.id, Math.max(MIN_CLIP_MS / 1000, +(ev.target as HTMLInputElement).value) * 1000);
  }
  protected removeAction(a: { instanceId: string; id: string }): void { this.scene.removeClip(a.instanceId, a.id); }

  /** Duplicate button / Ctrl+D: copies the selected block (action, dialogue, audio or scene) right after itself. */
  protected duplicateSelected(): void { this.message.set(this.scene.duplicateSelected(this.rigFor)); }

  protected splitAudio(id: string): void {
    const ok = this.scene.splitAudioAt(id, this.playback.time());
    this.message.set(ok ? null : 'Move the playhead inside the audio block (not at its very edge), then press Split.');
  }

  protected onSceneLength(id: string, ev: Event): void { this.scene.resizeScene(id, Math.max(MIN_SCENE_MS / 1000, +(ev.target as HTMLInputElement).value) * 1000); }
  protected splitAtPlayhead(): void { this.scene.splitSceneAt(this.playback.time()); }
  protected removeScene(id: string): void { this.scene.removeScene(id); }

  @HostListener('window:keydown', ['$event'])
  protected onKey(ev: KeyboardEvent): void {
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') {
      ev.preventDefault(); // the browser would bookmark the page
      this.duplicateSelected();
      return;
    }
    if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
    const sceneId = this.scene.selectedSceneId();
    const action = this.scene.selectedAction();
    if (this.scene.selectedClip()) {
      ev.preventDefault();
      this.scene.removeSelectedClip();
    } else if (sceneId) {
      ev.preventDefault();
      this.scene.removeScene(sceneId);
    } else if (action) {
      ev.preventDefault();
      this.scene.removeClip(action.instanceId, action.id);
    }
  }
}
