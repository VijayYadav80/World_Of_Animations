import { Component, computed, signal } from '@angular/core';
import { Ms, formatTime } from '../../core/models/scene-time';

interface TimelineTrack {
  id: string;
  label: string;
  note: string;
}

@Component({
  selector: 'app-timeline-panel',
  templateUrl: './timeline-panel.component.html',
  styleUrl: './timeline-panel.component.css'
})
export class TimelinePanelComponent {
  /** Scene length in ms. Becomes editable scene state in Phase 3. */
  readonly sceneDuration = signal<Ms>(10_000);
  readonly playhead = signal<Ms>(0);

  readonly ticks = computed(() => {
    const total = this.sceneDuration();
    const list: { left: number; label: string }[] = [];
    for (let t = 0; t <= total; t += 1000) {
      list.push({ left: (t / total) * 100, label: `${t / 1000}s` });
    }
    return list;
  });

  readonly playheadPercent = computed(() => (this.playhead() / this.sceneDuration()) * 100);

  readonly tracks: TimelineTrack[] = [
    { id: 'character', label: 'Character', note: 'Animation clips and position keyframes (Phase 3)' },
    { id: 'dialogue', label: 'Dialogue', note: 'Hindi dialogue clips (Phase 4)' },
    { id: 'audio', label: 'Audio', note: 'Imported voice audio (Phase 4)' }
  ];

  readonly format = formatTime;
}
