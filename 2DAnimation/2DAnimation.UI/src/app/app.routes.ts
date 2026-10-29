import { Routes } from '@angular/router';
import { EditorShellComponent } from './editor/editor-shell.component';

export const routes: Routes = [
  { path: '', component: EditorShellComponent },
  { path: '**', redirectTo: '' }
];
