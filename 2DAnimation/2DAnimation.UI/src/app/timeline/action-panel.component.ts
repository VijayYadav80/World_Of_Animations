import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { canAppend, findClip } from '../core/animation/animation-engine';
import { RigDefinition } from '../core/models/asset.models';
import { AssetManifestService } from '../core/services/asset-manifest.service';
import { PlaybackService } from '../core/services/playback.service';
import { SceneStateService } from '../core/services/scene-state.service';

/** Phase 3 control surface: transport, action list, per-character sequence. (The graphical timeline arrives in Phase 4.) */
@Component({
  selector: 'app-action-panel',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ap">
      <div class="transport">
        <button type="button" (click)="playback.restart()" aria-label="Go to start">⏮</button>
        <button type="button" (click)="playback.toggle()" [attr.aria-label]="playback.playing() ? 'Pause' : 'Play'">{{ playback.playing() ? '⏸' : '▶' }}</button>
        <span class="time">{{ fmt(playback.time()) }} / {{ fmt(playback.duration()) }}</span>
      </div>
      <input class="seek" type="range" min="0" [max]="playback.duration()" step="10"
             [value]="playback.time()" (input)="playback.seek(+$any($event.target).value)" aria-label="Playhead" />

      @if (rig(); as r) {
        <h4>Actions for {{ r.displayName }}</h4>
        <label class="dur">Duration for looping actions (s)
          <input type="number" [formControl]="loopSeconds" min="0.5" step="0.5" />
        </label>
        <div class="actions">
          @for (a of r.animations; track a.id) {
            <button type="button" [disabled]="!availability()[a.id]?.ok" [attr.title]="availability()[a.id]?.reason ?? a.note ?? ''" (click)="add(r, a.id)">
              {{ a.displayName }}@if (a.status !== 'complete') { <small> (incomplete)</small> }
            </button>
          }
        </div>
        <div class="row-actions">
          <button type="button" (click)="demo(r)">Demo: Walk → Idle → Sit → Talk → Get Up → Walk</button>
          <button type="button" (click)="clear()">Clear sequence</button>
        </div>
        @if (message(); as m) { <p class="msg" role="status">{{ m }}</p> }

        <h4>Sequence</h4>
        @if (sequence().length === 0) { <p class="empty">No actions yet. Raju idles. Add an action above.</p> }
        <ol class="seq">
          @for (c of sequence(); track c.id) {
            <li>
              <span>{{ name(r, c.clipId) }}</span>
              <small>{{ fmt(c.start) }} – {{ fmt(c.start + c.duration) }}</small>
              <button type="button" (click)="remove(c.id)" aria-label="Remove action">✕</button>
            </li>
          }
        </ol>
      } @else {
        <p class="empty">Select a character to add actions.</p>
      }
    </section>
  `,
  styles: [`
    .ap { display: grid; gap: 8px; font: 13px system-ui, sans-serif; color: #d6d9df; }
    h4 { margin: 8px 0 0; font-size: 13px; font-weight: 600; }
    button { background: #23262d; color: #eef0f4; border: 1px solid #3a3f4a; border-radius: 4px; padding: 5px 9px; cursor: pointer; }
    button:hover:not(:disabled) { background: #2d313a; }
    button:disabled { opacity: .4; cursor: not-allowed; }
    button:focus-visible, input:focus-visible { outline: 2px solid #4da3ff; outline-offset: 1px; }
    .transport { display: flex; align-items: center; gap: 6px; }
    .time { margin-left: auto; font-variant-numeric: tabular-nums; }
    .seek { width: 100%; }
    .dur { display: grid; gap: 4px; }
    .dur input { background: #14161a; color: #eef0f4; border: 1px solid #343842; border-radius: 4px; padding: 5px 8px; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .row-actions { display: grid; gap: 6px; }
    .seq { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
    .seq li { display: flex; align-items: center; gap: 8px; background: #1a1d23; border-radius: 4px; padding: 4px 8px; }
    .seq li small { color: #8b909b; margin-left: auto; font-variant-numeric: tabular-nums; }
    .seq li button { padding: 1px 6px; }
    .empty, .msg { color: #8b909b; margin: 0; }
    .msg { color: #ffb36b; }
  `],
})
export class ActionPanelComponent {
  protected readonly scene = inject(SceneStateService);
  protected readonly playback = inject(PlaybackService);
  private readonly assets = inject(AssetManifestService);

  protected readonly rig = signal<RigDefinition | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly loopSeconds = new FormControl(2, { nonNullable: true });
  private loadedFor: string | null = null;

  protected readonly sequence = computed(() => [...(this.scene.selected()?.timeline.clips ?? [])].sort((a, b) => a.start - b.start));
  protected readonly availability = computed(() => {
    const r = this.rig(), sel = this.scene.selected();
    const out: Record<string, { ok: boolean; reason?: string }> = {};
    if (r && sel) for (const a of r.animations) out[a.id] = canAppend(r, sel.timeline, a.id);
    return out;
  });

  constructor() {
    effect(() => {
      const id = this.scene.selected()?.characterId ?? null;
      if (id === this.loadedFor) return;
      this.loadedFor = id;
      this.rig.set(null);
      if (id) void this.assets.getRig(id).then(r => { if (this.loadedFor === id) this.rig.set(r.def); });
    });
  }

  protected fmt(ms: number): string {
    const s = Math.max(0, ms) / 1000;
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  }

  protected name(r: RigDefinition, clipId: string): string { return findClip(r, clipId)?.displayName ?? clipId; }

  protected add(r: RigDefinition, clipId: string, seconds?: number): boolean {
    const id = this.scene.selectedId();
    if (!id) return false;
    const def = findClip(r, clipId);
    const dur = seconds !== undefined ? seconds * 1000 : def?.loop ? Math.max(0.5, this.loopSeconds.value) * 1000 : undefined;
    const res = this.scene.appendClip(id, r, clipId, dur);
    this.message.set(res.ok ? null : (res.reason ?? 'Cannot add this action'));
    return res.ok;
  }

  protected demo(r: RigDefinition): void {
    const id = this.scene.selectedId();
    if (!id) return;
    this.scene.clearTimeline(id);
    for (const [clip, s] of [['walk', 3], ['idle', 0.8], ['sit'], ['talk', 2.5], ['get-up'], ['walk', 2.5]] as [string, number?][]) {
      if (!this.add(r, clip, s)) return;
    }
    this.playback.seek(0);
    this.playback.play();
  }

  protected clear(): void {
    const id = this.scene.selectedId();
    if (id) { this.scene.clearTimeline(id); this.message.set(null); }
  }

  protected remove(timelineClipId: string): void {
    const id = this.scene.selectedId();
    if (id) this.scene.removeClip(id, timelineClipId);
  }
}
