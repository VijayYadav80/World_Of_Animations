import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../core/models/stage';

@Component({
  selector: 'app-stage',
  templateUrl: './stage.component.html',
  styleUrl: './stage.component.css'
})
export class StageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('viewport', { static: true }) private viewport!: ElementRef<HTMLElement>;

  readonly stageWidth = STAGE_WIDTH;
  readonly stageHeight = STAGE_HEIGHT;

  readonly zoom = signal(1);
  readonly showGuides = signal(true);
  private readonly fitScale = signal(1);

  /** Total CSS scale applied to the logical 1280x720 stage. */
  readonly scale = computed(() => this.fitScale() * this.zoom());
  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  private observer?: ResizeObserver;

  ngAfterViewInit(): void {
    const el = this.viewport.nativeElement;
    const update = () => {
      const pad = 32;
      const w = Math.max(el.clientWidth - pad, 100);
      const h = Math.max(el.clientHeight - pad, 100);
      this.fitScale.set(Math.min(w / STAGE_WIDTH, h / STAGE_HEIGHT));
    };
    update();
    this.observer = new ResizeObserver(update);
    this.observer.observe(el);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  zoomIn(): void { this.zoom.update(z => Math.min(4, +(z + 0.25).toFixed(2))); }
  zoomOut(): void { this.zoom.update(z => Math.max(0.25, +(z - 0.25).toFixed(2))); }
  resetZoom(): void { this.zoom.set(1); }
}
