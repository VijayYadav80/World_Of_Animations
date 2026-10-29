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
        <h3>{{ sel.characterId }}</h3>

        <div class="size">
          <div class="size-head">
            <span>Size</span>
            <strong>{{ percent(sel.scale) }}%</strong>
          </div>
          <div class="size-row">
            <button type="button" (click)="nudge(-0.1)" title="Smaller" aria-label="Make smaller">−</button>
            <input type="range" formControlName="scale" [min]="min" [max]="3" step="0.05" aria-label="Character size" />
            <button type="button" (click)="nudge(0.1)" title="Bigger" aria-label="Make bigger">+</button>
          </div>
          <div class="size-presets">
            <button type="button" (click)="setScale(0.5)">Small</button>
            <button type="button" (click)="setScale(0.8)">Medium</button>
            <button type="button" (click)="setScale(1.2)">Large</button>
            <button type="button" (click)="setScale(defaultScale)" title="Back to the default size">Reset</button>
          </div>
          <small>Tip: drag the white dot on the selected character to resize on the stage.</small>
        </div>

        <label>Position X <input type="number" formControlName="x" step="1" /></label>
        <label>Position Y <input type="number" formControlName="y" step="1" /></label>
        <label>Scale <input type="number" formControlName="scale" step="0.05" [min]="min" [max]="max" /></label>
        <label>Rotation (°) <input type="number" formControlName="rotation" step="1" /></label>
        <label class="check"><input type="checkbox" formControlName="flipX" /> Flip horizontally</label>
      </form>
    } @else {
      <p class="empty">Select a character on the stage to edit it.</p>
    }
  `,
  styles: [`
    .props { display: grid; gap: 10px; font: 13px system-ui, sans-serif; color: #d6d9df; }
    h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
    label { display: grid; gap: 4px; }
    label.check { display: flex; align-items: center; gap: 8px; }
    input[type=number] { background: #14161a; color: #eef0f4; border: 1px solid #343842; border-radius: 4px; padding: 6px 8px; }
    input:focus-visible { outline: 2px solid #4da3ff; outline-offset: 1px; }
    .empty { color: #8b909b; font: 13px system-ui, sans-serif; }
    .size { display: grid; gap: 6px; padding: 8px; border: 1px solid #30343d; border-radius: 8px; background: #161a21; }
    .size-head { display: flex; justify-content: space-between; align-items: center; }
    .size-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 30px; gap: 8px; align-items: center; }
    .size-row button { padding: 2px 0; font-size: 16px; line-height: 1.2; }
    .size-row input[type=range] { width: 100%; accent-color: #4da3ff; padding: 0; }
    .size-presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .size-presets button { padding: 4px 0; font-size: 12px; }
    small { color: #8b909b; }
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
