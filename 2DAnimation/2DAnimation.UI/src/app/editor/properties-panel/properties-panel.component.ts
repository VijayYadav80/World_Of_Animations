import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SceneStateService } from '../../core/services/scene-state.service';

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const DEFAULT_SCALE = 0.8;

/** Right-hand panel. Edits the selected character's transform through the shared scene state. */
@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (scene.selected(); as sel) {
      <form [formGroup]="form" class="props">
        <header class="who">
          <span class="avatar">{{ sel.characterId.charAt(0).toUpperCase() }}</span>
          <div>
            <h3>{{ sel.characterId }}</h3>
            <small>{{ sel.timeline.clips.length }} actions on the timeline</small>
          </div>
        </header>

        <section class="group size">
          <div class="group-head">
            <span>Size</span>
            <strong>{{ percent(sel.scale) }}%</strong>
          </div>
          <div class="size-row">
            <button type="button" class="icon" (click)="nudge(-0.1)" title="Smaller" aria-label="Make smaller">−</button>
            <input type="range" formControlName="scale" [min]="min" [max]="3" step="0.05" aria-label="Character size" />
            <button type="button" class="icon" (click)="nudge(0.1)" title="Bigger" aria-label="Make bigger">+</button>
          </div>
          <div class="seg presets">
            <button type="button" [class.on]="isPreset(sel.scale, 0.5)" (click)="setScale(0.5)">Small</button>
            <button type="button" [class.on]="isPreset(sel.scale, 0.8)" (click)="setScale(0.8)">Medium</button>
            <button type="button" [class.on]="isPreset(sel.scale, 1.2)" (click)="setScale(1.2)">Large</button>
          </div>
          <div class="size-foot">
            <small>Tip: drag the white dot on the character.</small>
            <button type="button" class="ghost" (click)="setScale(defaultScale)" title="Back to the default size">Reset</button>
          </div>
        </section>

        <section class="group">
          <div class="group-head"><span>Transform</span></div>
          <div class="fields">
            <label>X <input type="number" formControlName="x" step="1" /></label>
            <label>Y <input type="number" formControlName="y" step="1" /></label>
            <label>Scale <input type="number" formControlName="scale" step="0.05" [min]="min" [max]="max" /></label>
            <label>Rotation ° <input type="number" formControlName="rotation" step="1" /></label>
          </div>
          <label class="flip">
            <span>Flip horizontally</span>
            <input type="checkbox" formControlName="flipX" />
          </label>
        </section>
      </form>
    } @else {
      <div class="empty-state">
        <span class="badge">
          <svg viewBox="0 0 24 24" class="i"><path d="m4 4 7 16 2.5-6.5L20 11z"/></svg>
        </span>
        <strong>Nothing selected</strong>
        <span>Click a character on the stage to edit its size and position.</span>
      </div>
    }
  `,
  styles: [`
    .props { display: grid; gap: 12px; }
    .who { display: flex; align-items: center; gap: 11px; }
    .who h3 { margin: 0; font-size: 15px; font-weight: 650; text-transform: capitalize; }
    .who small { color: var(--text-dim); }
    .avatar { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-weight: 700; font-size: 17px; color: #fff; background: var(--accent-grad); }

    .group { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-2); }
    .group-head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-dim); }
    .group-head strong { color: var(--text); font-size: 15px; letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }

    .size-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 30px; gap: 8px; align-items: center; }
    .size-row button { width: 30px; height: 30px; font-size: 17px; line-height: 1; }
    .size-row input[type=range] { width: 100%; }
    .presets button { padding: 5px 0; font-size: 12px; }
    .size-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .size-foot small { color: var(--text-faint); font-size: 11.5px; }
    .size-foot button { padding: 3px 9px; font-size: 12px; }

    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    label { display: grid; gap: 4px; font-size: 12px; color: var(--text-dim); font-weight: 500; }
    label input[type=number] { width: 100%; color: var(--text); font-variant-numeric: tabular-nums; }
    label.flip { display: flex; align-items: center; justify-content: space-between; padding-top: 4px; font-size: 13px; color: var(--text); }
  `],
})
export class PropertiesPanelComponent {
  protected readonly scene = inject(SceneStateService);
  protected readonly min = MIN_SCALE;
  protected readonly max = MAX_SCALE;
  protected readonly defaultScale = DEFAULT_SCALE;

  protected readonly form = new FormGroup({
    x: new FormControl(0, { nonNullable: true }),
    y: new FormControl(0, { nonNullable: true }),
    scale: new FormControl(1, { nonNullable: true }),
    rotation: new FormControl(0, { nonNullable: true }),
    flipX: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    // scene state -> form (e.g. while dragging or resizing on the stage)
    effect(() => {
      const sel = this.scene.selected();
      if (sel) this.form.patchValue({ x: sel.x, y: sel.y, scale: sel.scale, rotation: sel.rotation, flipX: sel.flipX }, { emitEvent: false });
    });
    // form -> scene state
    this.form.valueChanges.subscribe(v => {
      const id = this.scene.selectedId();
      if (!id) return;
      const n = (val: unknown, fallback: number) => (typeof val === 'number' && Number.isFinite(val) ? val : fallback);
      this.scene.updateCharacter(id, {
        x: n(v.x, 0), y: n(v.y, 0), scale: this.clampScale(n(v.scale, 1)), rotation: n(v.rotation, 0), flipX: !!v.flipX,
      });
    });
  }

  protected percent(scale: number): number { return Math.round(scale * 100); }

  protected isPreset(scale: number, preset: number): boolean { return Math.abs(scale - preset) < 0.025; }

  protected nudge(delta: number): void {
    const sel = this.scene.selected();
    if (sel) this.setScale(sel.scale + delta);
  }

  protected setScale(value: number): void {
    const id = this.scene.selectedId();
    if (!id) return;
    const scale = this.clampScale(value);
    this.scene.updateCharacter(id, { scale });
    this.form.patchValue({ scale }, { emitEvent: false });
  }

  private clampScale(v: number): number {
    return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, v)) * 100) / 100;
  }
}
