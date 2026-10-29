import { Component, signal } from '@angular/core';

interface SidebarTab {
  id: string;
  label: string;
  note: string;
}

@Component({
  selector: 'app-left-sidebar',
  templateUrl: './left-sidebar.component.html',
  styleUrl: './left-sidebar.component.css'
})
export class LeftSidebarComponent {
  readonly tabs: SidebarTab[] = [
    { id: 'backgrounds', label: 'Backgrounds', note: 'Phase 2: the village street background will be listed here from the asset manifest.' },
    { id: 'characters', label: 'Characters', note: 'Phase 2: Raju will be listed here from the asset manifest.' },
    { id: 'props', label: 'Props', note: 'Not planned for the MVP. Props will use the same manifest later.' },
    { id: 'dialogue', label: 'Dialogue', note: 'Phase 4: Hindi dialogue lines and timing.' },
    { id: 'audio', label: 'Audio', note: 'Phase 4: import voice recordings.' }
  ];

  readonly activeId = signal<string>('backgrounds');

  get active(): SidebarTab {
    return this.tabs.find(t => t.id === this.activeId()) ?? this.tabs[0];
  }
}
