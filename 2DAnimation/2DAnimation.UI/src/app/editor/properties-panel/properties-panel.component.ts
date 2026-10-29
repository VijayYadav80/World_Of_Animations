import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SceneStateService } from '../../core/services/scene-state.service';

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
        <label>Position X <input type="number" formControlName="x" step="1" /></label>
        <label>Position Y <input type="number" formControlName="y" step="1" /></label>
        <label>Scale <input type="number" formControlName="scale" step="0.05" min="0.1" max="4" /></label>
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
  `],
})
export class PropertiesPanelComponent {
  protected readonly scene = inject(SceneStateService);

  protected readonly form = new FormGroup({
    x: new FormControl(0, { nonNullable: true }),
    y: new FormControl(0, { nonNullable: true }),
    scale: new FormControl(1, { nonNullable: true }),
    rotation: new FormControl(0, { nonNullable: true }),
    flipX: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    // scene state -> form (e.g. while dragging on the stage)
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
        x: n(v.x, 0), y: n(v.y, 0), scale: Math.max(0.1, n(v.scale, 1)), rotation: n(v.rotation, 0), flipX: !!v.flipX,
      });
    });
  }
}
