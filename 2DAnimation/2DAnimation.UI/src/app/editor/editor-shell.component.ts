import { Component, signal } from '@angular/core';
import { StageComponent } from '../canvas/stage.component';
import { ActionPanelComponent } from '../timeline/action-panel.component';
import { LeftSidebarComponent } from './left-sidebar/left-sidebar.component';
import { PropertiesPanelComponent } from './properties-panel/properties-panel.component';
import { TimelinePanelComponent } from './timeline/timeline-panel.component';
import { ToolbarComponent } from './toolbar/toolbar.component';

@Component({
  selector: 'app-editor-shell',
  imports: [
    ToolbarComponent,
    LeftSidebarComponent,
    StageComponent,
    PropertiesPanelComponent,
    ActionPanelComponent,
    TimelinePanelComponent,
  ],
  templateUrl: './editor-shell.component.html',
  styleUrl: './editor-shell.component.css'
})
export class EditorShellComponent {
  /** Which tab of the right-hand panel is open. */
  readonly rightTab = signal<'props' | 'actions'>('props');

  /** Timeline height in px (drag the handle on its top edge). */
  readonly timelineHeight = signal(300);
  readonly resizing = signal(false);
  private resizeFrom?: { y: number; h: number };

  protected startResize(ev: PointerEvent): void {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.resizeFrom = { y: ev.clientY, h: this.timelineHeight() };
    this.resizing.set(true);
  }

  protected onResize(ev: PointerEvent): void {
    if (!this.resizeFrom) return;
    const max = Math.max(200, window.innerHeight - 320); // always leave room for the stage
    const h = this.resizeFrom.h + (this.resizeFrom.y - ev.clientY);
    this.timelineHeight.set(Math.round(Math.min(max, Math.max(160, h))));
  }

  protected endResize(ev: PointerEvent): void {
    this.resizeFrom = undefined;
    this.resizing.set(false);
    const el = ev.currentTarget as HTMLElement;
    if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
  }
}
