import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-properties-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css'
})
export class PropertiesPanelComponent {
  private readonly fb = inject(FormBuilder);

  /** Disabled until a character can be selected on the stage (Phase 2). */
  readonly form = this.fb.nonNullable.group({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    animation: '',
    speed: 1,
    duration: 0,
    layer: 0
  });

  constructor() {
    this.form.disable();
  }
}
