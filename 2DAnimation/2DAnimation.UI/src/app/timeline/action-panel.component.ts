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
      @if (rig(); as r) {
        <header class="who">
          <span class="avatar">{{ r.displayName.charAt(0).toUpperCase() }}</span>
          <div>
            <h3>{{ r.displayName }}</h3>
            <small>Tap an action: it starts at the playhead (or after this character's last action)</small>
          </div>
        </header>

        <div class="card-box">
          <div class="box-head"><span>Add action</span>
            <label class="dur" title="Length used for looping actions such as Walk and Talk">
              Loop
              <input type="number" [formControl]="loopSeconds" min="0.5" step="0.5" /> s
            </label>
          </div>
          <div class="actions">
            @for (a of r.animations; track a.id) {
              <button type="button" [disabled]="!availability()[a.id].ok" [attr.title]="availability()[a.id].reason ?? a.note ?? ''" (click)="add(r, a.id)">
                {{ a.displayName }}@if (a.status !== 'complete') { <small>·wip</small> }
              </button>
            }
          </div>
          @if (message(); as m) { <p class="msg" role="status">{{ m }}</p> }
        </div>

        <div class="row-actions">
          <button type="button" class="primary" (click)="demo(r)">▶ Play demo sequence</button>
          <button type="button" class="danger" (click)="clear()" [disabled]="sequence().length === 0">Clear</button>
        </div>

        <div class="card-box">
          <div class="box-head"><span>Sequence</span><span class="count">{{ sequence().length }}</span></div>
          @if (sequence().length === 0) { <p class="empty">No actions yet — {{ r.displayName }} just idles.</p> }
          <ol class="seq">
            @for (c of sequence(); track c.id; let i = $index) {
              <li>
                <span class="no">{{ i + 1 }}</span>
                <span class="nm">{{ name(r, c.clipId) }}</span>
                <small>{{ fmt(c.start) }} – {{ fmt(c.start + c.duration) }}</small>
                <button type="button" class="ghost icon danger" (click)="remove(c.id)" aria-label="Remove action">✕</button>
              </li>
            }
          </ol>
        </div>
      } @else {
        <div class="empty-state">
          <span class="badge"><svg viewBox="0 0 24 24" class="i"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg></span>
          <strong>No character selected</strong>
          <span>Select a character to add actions like walk, sit and wave.</span>
        </div>
      }
    </section>
  `,
  styles: [`
    .ap { display: grid; gap: 12px; }
    .who { display: flex; align-items: center; gap: 11px; }
    .who h3 { margin: 0; font-size: 15px; font-weight: 650; }
    .who small { color: var(--text-dim); }
    .avatar { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-weight: 700; font-size: 17px; color: #fff; background: var(--accent-grad); }

    .card-box { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-2); }
    .box-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-dim); }
    .count { background: var(--bg-3); border-radius: 99px; padding: 0 8px; letter-spacing: 0; }
    .dur { display: inline-flex; align-items: center; gap: 5px; text-transform: none; letter-spacing: 0; font-weight: 500; }
    .dur input { width: 54px; padding: 3px 6px; }

    .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .actions button { padding: 8px 4px; font-size: 12.5px; }
    .actions button small { color: var(--warn); }
    .row-actions { display: grid; grid-template-columns: 1fr auto; gap: 8px; }

    .seq { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; }
    .seq li { display: flex; align-items: center; gap: 9px; background: var(--bg-1); border: 1px solid var(--border); border-radius: 10px; padding: 5px 6px 5px 8px; }
    .seq .no { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: var(--accent-soft); color: var(--accent); }
    .seq .nm { font-weight: 600; }
    .seq li small { color: var(--text-dim); margin-left: auto; font-variant-numeric: tabular-nums; }
    .seq li button { width: 24px; height: 24px; font-size: 11px; }
    .empty { color: var(--text-dim); margin: 0; }
    .msg { color: var(--warn); margin: 0; font-size: 12px; }
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
