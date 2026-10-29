import { Component } from '@angular/core';
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
export class EditorShellComponent {}
