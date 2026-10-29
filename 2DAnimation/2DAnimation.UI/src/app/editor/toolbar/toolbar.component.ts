import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { ApiHealthService } from '../../core/api/api-health.service';
import { ProjectSummary } from '../../core/models/project.models';
import { ExportFormat, ExportService } from '../../core/services/export.service';
import { PlaybackService } from '../../core/services/playback.service';
import { ProjectService } from '../../core/services/project.service';
import { ThemeService } from '../../core/services/theme.service';

type LinkState = 'checking' | 'ok' | 'error';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css'
})
export class ToolbarComponent implements OnInit, OnDestroy {
  private readonly health = inject(ApiHealthService);
  private readonly playback = inject(PlaybackService);
  protected readonly project = inject(ProjectService);
  protected readonly theme = inject(ThemeService);
  protected readonly exporter = inject(ExportService);
  private sub?: Subscription;

  readonly apiState = signal<LinkState>('checking');
  readonly dbState = signal<LinkState>('checking');

  readonly dialogOpen = signal(false);

  // ------------------------------------------------------------ video export
  readonly exportOpen = signal(false);
  readonly exportFormatId = signal<ExportFormat['id']>(this.exporter.formats[0]?.id ?? 'webm');
  readonly exportFps = signal(30);
  readonly projects = signal<ProjectSummary[]>([]);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);

  ngOnInit(): void {
    // Poll every 10 s so the status chips follow the backend starting/stopping.
    this.sub = timer(0, 10_000)
      .pipe(
        switchMap(() =>
          this.health.getHealth().pipe(
            catchError(() => of(null))
          )
        )
      )
      .subscribe(result => {
        if (!result) {
          this.apiState.set('error');
          this.dbState.set('error');
          return;
        }
        this.apiState.set(result.api === 'ok' ? 'ok' : 'error');
        this.dbState.set(result.database === 'ok' ? 'ok' : 'error');
      });

    // Continue where the user left off last time.
    void this.project.openLast();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Plays the whole scene from the beginning. */
  preview(): void {
    this.playback.pause();
    this.playback.restart();
    this.playback.play();
  }

  onName(event: Event): void {
    this.project.setName((event.target as HTMLInputElement).value);
  }

  save(): void { void this.project.save(); }

  async newProject(): Promise<void> {
    if (this.project.dirty() && !confirm('You have unsaved changes. Start a new project anyway?')) return;
    await this.project.newProject();
  }

  async openDialog(): Promise<void> {
    this.dialogOpen.set(true);
    await this.refreshList();
  }

  closeDialog(): void { this.dialogOpen.set(false); }

  openExport(): void { this.playback.pause(); this.exportOpen.set(true); }

  closeExport(): void {
    if (this.exporter.status() !== 'idle') return; // cancel first
    this.exportOpen.set(false);
  }

  onExportFormat(ev: Event): void { this.exportFormatId.set((ev.target as HTMLSelectElement).value as ExportFormat['id']); }
  onExportFps(ev: Event): void { this.exportFps.set(+(ev.target as HTMLSelectElement).value); }

  startExport(): void {
    const format = this.exporter.formats.find(f => f.id === this.exportFormatId()) ?? this.exporter.formats[0];
    if (!format) return;
    void this.exporter.start(format, this.exportFps(), this.project.name());
  }

  exportSeconds(): string { return (this.playback.duration() / 1000).toFixed(1); }
  exportPercent(): number { return Math.round(this.exporter.progress() * 100); }

  async openProject(p: ProjectSummary): Promise<void> {
    if (this.project.dirty() && !confirm('You have unsaved changes. Open another project anyway?')) return;
    try {
      await this.project.open(p.id);
      this.closeDialog();
    } catch { /* the message is shown in the toolbar */ }
  }

  async deleteProject(p: ProjectSummary): Promise<void> {
    if (!confirm(`Delete "${p.name}" permanently? This cannot be undone.`)) return;
    try {
      await this.project.remove(p.id);
      await this.refreshList();
    } catch {
      this.listError.set('Could not delete the project.');
    }
  }

  toggleAutosave(event: Event): void {
    this.project.autosave.set((event.target as HTMLInputElement).checked);
  }

  stamp(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  statusText(): string {
    if (this.project.busy()) return 'Working…';
    if (!this.project.projectId()) return 'Not saved yet';
    if (this.project.dirty()) return 'Unsaved changes';
    const t = this.project.lastSaved();
    return t ? `Saved ${t.toLocaleTimeString()}` : 'Saved';
  }

  private async refreshList(): Promise<void> {
    this.listLoading.set(true);
    this.listError.set(null);
    try {
      this.projects.set(await this.project.list());
    } catch {
      this.projects.set([]);
      this.listError.set('Could not load projects. Is the API running?');
    } finally {
      this.listLoading.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.save();
    } else if (e.key === 'Escape' && this.dialogOpen()) {
      this.closeDialog();
    } else if (e.key === 'Escape' && this.exportOpen()) {
      this.closeExport();
    }
  }

  /** Browser warning when closing the tab with unsaved work. */
  @HostListener('window:beforeunload', ['$event'])
  onUnload(e: BeforeUnloadEvent): void {
    if (this.project.dirty()) e.preventDefault();
  }
}
