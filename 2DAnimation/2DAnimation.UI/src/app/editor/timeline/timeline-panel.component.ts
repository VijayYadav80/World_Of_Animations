import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { estimateSpeechMs } from '../../core/dialogue/lipsync';
import { Ms, formatTime } from '../../core/models/scene-time';
import { AudioService } from '../../core/services/audio.service';
import { PlaybackService } from '../../core/services/playback.service';
import { SceneStateService } from '../../core/services/scene-state.service';

type BlockKind = 'action' | 'dialogue' | 'audio';

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
    const { characters, dialogues, audioClips } = this.scene.state();
    const selClip = this.scene.selectedClip();
    const selChar = this.scene.selectedId();
    const rows: Row[] = [];
    characters.forEach((c, i) => {
      const color = COLORS[i % COLORS.length];
      rows.push({
        key: `a-${c.instanceId}`, kind: 'action', label: `${c.characterId} · Actions`, characterId: c.instanceId,
        blocks: c.timeline.clips.map(k => ({
          id: k.id, kind: 'action' as const, label: k.clipId.replace(/-/g, ' '), title: `${k.clipId}  ${formatTime(k.start)} – ${formatTime(k.start + k.duration)}`,
          left: k.start * ppm, width: Math.max(4, k.duration * ppm), color, selected: c.instanceId === selChar, characterId: c.instanceId, linked: false,
        })),
      });
      rows.push({
        key: `d-${c.instanceId}`, kind: 'dialogue', label: `${c.characterId} · Dialogue`, characterId: c.instanceId,
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
        wave: this.audio.asset(a.assetId)?.wave, linked: dialogues.some(d => d.audioId === a.id),
      })),
    });
    return rows;
  });

  private drag?: { kind: BlockKind; id: string; mode: 'move' | 'resize'; x0: number; start0: Ms; dur0: Ms };
  private scrubbing = false;
  private attachTarget: string | null = null;

  constructor() {
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
    if (b.kind === 'action') {
      this.scene.select(row.characterId ?? null);
      this.scene.selectClip(null);
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

  protected onBlockMove(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const dms = Math.round((ev.clientX - d.x0) / this.pxPerMs() / SNAP_MS) * SNAP_MS;
    if (d.mode === 'resize') this.scene.resizeDialogue(d.id, d.dur0 + dms);
    else if (d.kind === 'dialogue') this.scene.moveDialogue(d.id, d.start0 + dms);
    else this.scene.moveAudio(d.id, d.start0 + dms);
  }

  protected onBlockUp(): void { this.drag = undefined; }

  // ------------------------------------------------------------ add / edit

  protected addDialogue(): void {
    const chars = this.characters();
    if (chars.length === 0) return;
    const target = this.scene.selected() ?? chars[0];
    this.scene.addDialogue(target.instanceId, DEFAULT_TEXT, this.playback.time());
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

  @HostListener('window:keydown', ['$event'])
  protected onKey(ev: KeyboardEvent): void {
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && this.scene.selectedClip()) {
      ev.preventDefault();
      this.scene.removeSelectedClip();
    }
  }
}
