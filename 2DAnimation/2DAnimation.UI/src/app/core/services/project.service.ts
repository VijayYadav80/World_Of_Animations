import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-health.service';
import { emptyTimeline } from '../animation/animation-engine';
import { ProjectDetail, ProjectSummary, SavedAudioAsset, SceneFileV2 } from '../models/project.models';
import { newScene } from '../models/scene-segments';
import { AssetManifestService } from './asset-manifest.service';
import { AudioService } from './audio.service';
import { PlaybackService } from './playback.service';
import { CharacterInstance, SceneStateService, STAGE_WIDTH } from './scene-state.service';

const LAST_PROJECT_KEY = 'woa.lastProjectId';
const DEFAULT_NAME = 'Untitled Project';
const DEFAULT_DURATION = 10000;
const AUTOSAVE_DELAY_MS = 3000;

export interface ProjectMessage { kind: 'ok' | 'info' | 'err'; text: string }

/**
 * Phase 5: saving and opening projects.
 * - Scene (characters, timelines, dialogue, audio placement) -> one JSON document in the database.
 * - Imported audio files -> uploaded as raw bytes next to the project on the server (never inside the JSON).
 */
@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly scene = inject(SceneStateService);
  private readonly playback = inject(PlaybackService);
  private readonly audio = inject(AudioService);
  private readonly assets = inject(AssetManifestService);

  readonly projectId = signal<string | null>(null);
  readonly name = signal(DEFAULT_NAME);
  /** True when the scene or name differs from what was last saved/opened. */
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly lastSaved = signal<Date | null>(null);
  readonly autosave = signal(true);
  readonly message = signal<ProjectMessage | null>(null);

  private savedFingerprint = '';
  /** Audio asset ids that already exist on the server for the current project. */
  private readonly uploaded = new Set<string>();
  /** Metadata of audio assets from the opened file, so a missing file does not make the reference disappear on save. */
  private readonly knownAudio = new Map<string, SavedAudioAsset>();
  private autosaveTimer?: ReturnType<typeof setTimeout>;
  private messageTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.savedFingerprint = this.fingerprint();
    // Any edit (scene, name, timeline length) re-checks whether there is something to save.
    effect(() => {
      this.scene.state();
      this.name();
      this.playback.duration();
      untracked(() => this.refreshDirty());
    });
  }

  // ------------------------------------------------------------------ API calls

  list(): Promise<ProjectSummary[]> {
    return firstValueFrom(this.http.get<ProjectSummary[]>(`${API_BASE_URL}/projects`));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${API_BASE_URL}/projects/${id}`));
    if (this.projectId() === id) {
      this.projectId.set(null);
      this.uploaded.clear();
      localStorage.removeItem(LAST_PROJECT_KEY);
      this.savedFingerprint = ''; // the open scene is no longer stored anywhere
      this.refreshDirty();
    }
  }

  // ------------------------------------------------------------------ save

  setName(value: string): void {
    this.name.set(value);
  }

  /** Saves the project (creates it on the first save). Returns false when it failed. */
  async save(): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    clearTimeout(this.autosaveTimer);
    try {
      const name = this.name().trim() || DEFAULT_NAME;
      if (name !== this.name()) this.name.set(name);

      let id = this.projectId();
      if (!id) {
        const created = await firstValueFrom(this.http.post<ProjectSummary>(`${API_BASE_URL}/projects`, { name }));
        id = created.id;
        this.projectId.set(id);
        this.uploaded.clear();
      }

      // Snapshot first: edits made while uploading stay "unsaved" and are picked up by the next save.
      const sceneJson = JSON.stringify(this.buildFile());
      const fingerprint = this.fingerprint();

      for (const a of this.usedAudio()) {
        if (this.uploaded.has(a.id)) continue;
        const asset = this.audio.asset(a.id);
        if (!asset) continue; // file could not be restored earlier; keep the reference only
        await firstValueFrom(this.http.put(`${API_BASE_URL}/projects/${id}/audio/${a.id}`, new Blob([asset.bytes]), {
          headers: { 'Content-Type': 'application/octet-stream' },
        }));
        this.uploaded.add(a.id);
      }

      await firstValueFrom(this.http.put<ProjectSummary>(`${API_BASE_URL}/projects/${id}`, { name, sceneJson }));
      this.savedFingerprint = fingerprint;
      this.lastSaved.set(new Date());
      localStorage.setItem(LAST_PROJECT_KEY, id);
      this.refreshDirty();
      this.notify('ok', 'Saved');
      return true;
    } catch (e) {
      this.notify('err', `Could not save: ${this.describe(e)}`, 8000);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  // ------------------------------------------------------------------ open / new

  /** Opens the project that was open last time (silently does nothing when there is none or the API is down). */
  async openLast(): Promise<void> {
    const id = localStorage.getItem(LAST_PROJECT_KEY);
    if (!id) return;
    try { await this.open(id, true); } catch { /* API offline or project deleted: keep the default scene */ }
  }

  async open(id: string, quiet = false): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const detail = await firstValueFrom(this.http.get<ProjectDetail>(`${API_BASE_URL}/projects/${id}`));
      const file = this.parse(detail.sceneJson);

      this.playback.pause();
      this.audio.clearAll();
      this.uploaded.clear();
      this.knownAudio.clear();

      const missing: string[] = [];
      for (const a of file.audioAssets) {
        this.knownAudio.set(a.id, a);
        try {
          const bytes = await firstValueFrom(this.http.get(`${API_BASE_URL}/projects/${id}/audio/${a.id}`, { responseType: 'arraybuffer' }));
          await this.audio.restore(a.id, a.name, bytes);
          this.uploaded.add(a.id);
        } catch { missing.push(a.name); }
      }

      const empty = file.scenes.length === 0 && file.characters.length === 0 && file.props.length === 0;
      if (empty) {
        this.scene.resetScene();
        await this.addDefaults();
      } else {
        this.scene.loadScene({
          scenes: file.scenes,
          characters: file.characters,
          props: file.props,
          dialogues: file.dialogues,
          audioClips: file.audioClips,
        });
      }
      this.playback.duration.set(Math.max(DEFAULT_DURATION, file.duration));
      this.playback.seek(0);

      this.projectId.set(detail.id);
      this.name.set(detail.name);
      this.lastSaved.set(new Date(detail.updatedUtc));
      localStorage.setItem(LAST_PROJECT_KEY, detail.id);
      // "Clean" baseline = exactly what was just loaded.
      this.savedFingerprint = this.fingerprint();
      this.refreshDirty();
      if (missing.length) this.notify('err', `Opened, but audio file(s) missing: ${missing.join(', ')}`, 9000);
      else if (!quiet) this.notify('ok', `Opened "${detail.name}"`);
    } catch (e) {
      if (!quiet) this.notify('err', `Could not open the project: ${this.describe(e)}`, 8000);
      throw e;
    } finally {
      this.busy.set(false);
    }
  }

  /** Starts an empty project (default background + first character). The caller asks the user about unsaved changes. */
  async newProject(): Promise<void> {
    this.playback.pause();
    this.audio.clearAll();
    this.uploaded.clear();
    this.knownAudio.clear();
    this.scene.resetScene();
    await this.addDefaults();
    this.playback.duration.set(DEFAULT_DURATION);
    this.playback.seek(0);
    this.projectId.set(null);
    this.name.set(DEFAULT_NAME);
    this.lastSaved.set(null);
    localStorage.removeItem(LAST_PROJECT_KEY);
    this.savedFingerprint = this.fingerprint();
    this.refreshDirty();
  }

  // ------------------------------------------------------------------ internals

  private async addDefaults(): Promise<void> {
    const manifest = await this.assets.getManifest();
    const bg = manifest.backgrounds[0];
    const ch = manifest.characters[0];
    if (bg) this.scene.addScene(bg.id, DEFAULT_DURATION);
    if (ch) {
      const def = bg ? (await this.assets.getBackground(bg.id)).def : undefined;
      this.scene.addCharacter(ch.id, STAGE_WIDTH / 2, def?.groundY ?? 640, def?.defaultCharacterScale ?? 0.8);
    }
  }

  private usedAudio(): SavedAudioAsset[] {
    const out = new Map<string, SavedAudioAsset>();
    for (const clip of this.scene.state().audioClips) {
      if (out.has(clip.assetId)) continue;
      const a = this.audio.asset(clip.assetId);
      const meta = a ? { id: a.id, name: a.name, duration: a.duration } : this.knownAudio.get(clip.assetId);
      if (meta) out.set(clip.assetId, meta);
    }
    return [...out.values()];
  }

  private buildFile(): SceneFileV2 {
    const s = this.scene.state();
    return {
      schemaVersion: 2,
      scenes: s.scenes,
      characters: s.characters,
      props: s.props,
      dialogues: s.dialogues,
      audioClips: s.audioClips,
      audioAssets: this.usedAudio(),
      duration: this.playback.duration(),
    };
  }

  private fingerprint(): string {
    return `${this.name().trim()}\n${JSON.stringify(this.buildFile())}`;
  }

  /** Tolerant reader: an empty "{}" document (a project created but never saved) becomes an empty scene.
   *  Old v1 files (one `backgroundId`) become a single scene that lasts the whole timeline. */
  private parse(json: string): SceneFileV2 {
    type Raw = Omit<Partial<SceneFileV2>, 'schemaVersion'> & { schemaVersion?: number; backgroundId?: string | null };
    let raw: Raw = {};
    try { raw = JSON.parse(json || '{}') as Raw; } catch { throw new Error('The saved scene is corrupted.'); }
    if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1 && raw.schemaVersion !== 2) {
      throw new Error(`This project was saved by a newer version (schema ${raw.schemaVersion}).`);
    }
    const duration = typeof raw.duration === 'number' ? raw.duration : DEFAULT_DURATION;
    let scenes = raw.scenes ?? [];
    if (raw.schemaVersion !== 2 && raw.backgroundId) scenes = [newScene(raw.backgroundId, Math.max(DEFAULT_DURATION, duration))];
    const characters: CharacterInstance[] = (raw.characters ?? []).map(c => ({ ...c, timeline: c.timeline ?? emptyTimeline() }));
    return {
      schemaVersion: 2,
      scenes,
      characters,
      props: (raw.props ?? []).map(p => ({ ...p, rotation: p.rotation ?? 0, flipX: p.flipX ?? false, layer: p.layer ?? 'auto' })),
      dialogues: raw.dialogues ?? [],
      audioClips: raw.audioClips ?? [],
      audioAssets: raw.audioAssets ?? [],
      duration,
    };
  }

  private refreshDirty(): void {
    const dirty = this.fingerprint() !== this.savedFingerprint;
    this.dirty.set(dirty);
    clearTimeout(this.autosaveTimer);
    // Auto-save only for projects that already exist, so it never creates surprise projects.
    if (dirty && this.autosave() && this.projectId() && !this.busy()) {
      this.autosaveTimer = setTimeout(() => { void this.save(); }, AUTOSAVE_DELAY_MS);
    }
  }

  private notify(kind: ProjectMessage['kind'], text: string, ms = 3000): void {
    clearTimeout(this.messageTimer);
    this.message.set({ kind, text });
    this.messageTimer = setTimeout(() => this.message.set(null), ms);
  }

  private describe(e: unknown): string {
    const err = e as { status?: number; message?: string; error?: { title?: string; detail?: string } };
    if (err?.status === 0) return 'the API is not running (start 2DAnimation.API).';
    return err?.error?.detail ?? err?.error?.title ?? err?.message ?? String(e);
  }
}
