import { Component, ElementRef, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { AssetManifestService } from '../../core/services/asset-manifest.service';
import { AudioService } from '../../core/services/audio.service';
import { CharacterPreviewService } from '../../core/services/character-preview.service';
import { PlaybackService } from '../../core/services/playback.service';
import { SceneStateService, STAGE_WIDTH, prettyCharacterName } from '../../core/services/scene-state.service';
import { UserAssetsService } from '../../core/services/user-assets.service';

type TabId = 'backgrounds' | 'characters' | 'props' | 'dialogue' | 'audio';

interface SidebarTab { id: TabId; label: string; title: string }
interface BgItem { id: string; name: string; thumb: string; mine: boolean }
interface CharItem { id: string; name: string; mine: boolean }

/** Asset library + quick lists of what is in the scene. Everything here reads the manifest / scene state. */
@Component({
  selector: 'app-left-sidebar',
  templateUrl: './left-sidebar.component.html',
  styleUrl: './left-sidebar.component.css'
})
export class LeftSidebarComponent {
  protected readonly scene = inject(SceneStateService);
  protected readonly playback = inject(PlaybackService);
  private readonly assets = inject(AssetManifestService);
  private readonly mine = inject(UserAssetsService);
  private readonly previews = inject(CharacterPreviewService);
  private readonly audio = inject(AudioService);

  @ViewChild('bgInput') private bgInput?: ElementRef<HTMLInputElement>;
  @ViewChild('folderInput') private folderInput?: ElementRef<HTMLInputElement>;
  @ViewChild('filesInput') private filesInput?: ElementRef<HTMLInputElement>;
  @ViewChild('audioInput') private audioInput?: ElementRef<HTMLInputElement>;

  readonly tabs: SidebarTab[] = [
    { id: 'backgrounds', label: 'Scenes', title: 'Scenes' },
    { id: 'characters', label: 'Cast', title: 'Characters' },
    { id: 'props', label: 'Props', title: 'Props' },
    { id: 'dialogue', label: 'Lines', title: 'Dialogue' },
    { id: 'audio', label: 'Audio', title: 'Audio' },
  ];
  readonly activeId = signal<TabId>('backgrounds');
  private readonly libraryBackgrounds = signal<BgItem[]>([]);
  private readonly libraryCharacters = signal<CharItem[]>([]);
  readonly loadError = signal<string | null>(null);

  /** Scenes and characters the user imported come first, then the ones that ship with the app. */
  readonly backgrounds = computed<BgItem[]>(() => [
    ...this.mine.backgrounds().map(b => ({ id: b.id, name: b.displayName, thumb: b.dataUrl, mine: true })),
    ...this.libraryBackgrounds(),
  ]);
  readonly characters = computed<CharItem[]>(() => [
    ...this.mine.characters().map(c => ({ id: c.id, name: c.displayName, mine: true })),
    ...this.libraryCharacters(),
  ]);

  /** characterId -> preview image (undefined while drawing, null if it failed). */
  readonly previewUrls = signal<Record<string, string | null>>({});

  readonly bgMessage = signal<string | null>(null);
  readonly charMessage = signal<string | null>(null);
  readonly audioMessage = signal<string | null>(null);
  readonly busy = signal(false);

  readonly draftText = signal('');
  readonly draftCharacter = signal('');
  readonly audioVoice = signal('');
  private attachTarget: string | null = null;

  /** Instance the new dialogue line is written for: the dropdown choice, else the selected character, else the first. */
  readonly dialogueTarget = computed(() => {
    const chars = this.scene.state().characters;
    const chosen = this.draftCharacter();
    if (chosen && chars.some(c => c.instanceId === chosen)) return chosen;
    return this.scene.selectedId() ?? chars[0]?.instanceId ?? '';
  });

  constructor() {
    void this.loadLibrary();
    // Draw a preview for every character that can be shown (library, imported, or already in the scene).
    effect(() => {
      const ids = new Set<string>([
        ...this.characters().map(c => c.id),
        ...this.scene.state().characters.map(c => c.characterId),
      ]);
      untracked(() => ids.forEach(id => this.requestPreview(id)));
    });
  }

  get active(): SidebarTab {
    return this.tabs.find(t => t.id === this.activeId()) ?? this.tabs[0];
  }

  private requestPreview(id: string): void {
    if (id in this.previewUrls()) return;
    this.previewUrls.update(p => ({ ...p, [id]: undefined as unknown as null }));
    void this.previews.preview(id).then(url => this.previewUrls.update(p => ({ ...p, [id]: url })));
  }

  preview(characterId: string): string | null { return this.previewUrls()[characterId] ?? null; }
  initial(name: string): string { return name.charAt(0).toUpperCase(); }
  prettyName(characterId: string): string { return prettyCharacterName(characterId); }

  // ------------------------------------------------------------ scenes

  /** Clicking a scene adds it to the end of the timeline (it plays after the scenes already there). */
  addSceneToTimeline(id: string): void {
    this.scene.addScene(id);
  }

  /** How many times this image is used on the timeline. */
  sceneUses(id: string): number {
    return this.scene.state().scenes.filter(s => s.backgroundId === id).length;
  }

  pickBackground(): void { this.bgInput?.nativeElement.click(); }

  async onBackgroundPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.bgMessage.set(null);
    try {
      const bg = await this.mine.addBackground(file);
      this.scene.addScene(bg.id);
    } catch (e) {
      this.bgMessage.set(errorText(e));
    }
  }

  async removeBackground(id: string): Promise<void> {
    if (this.sceneUses(id) > 0) {
      this.bgMessage.set('This image is used on the timeline. Delete its scene block from the timeline first, then remove it.');
      return;
    }
    this.bgMessage.set(null);
    await this.mine.removeBackground(id);
  }

  // ------------------------------------------------------------ cast

  async addCharacter(characterId: string): Promise<void> {
    const state = this.scene.state();
    const bgId = this.scene.currentBackgroundId();
    const def = bgId ? (await this.assets.getBackground(bgId)).def : undefined;
    // Spread new characters left/right of the centre so they do not stack on top of each other.
    const n = state.characters.length;
    const offset = n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 150;
    const x = Math.min(STAGE_WIDTH - 80, Math.max(80, STAGE_WIDTH / 2 + offset));
    this.scene.addCharacter(characterId, x, def?.groundY ?? 640, def?.defaultCharacterScale ?? 0.8);
  }

  pickCharacterFolder(): void { this.folderInput?.nativeElement.click(); }
  pickCharacterFiles(): void { this.filesInput?.nativeElement.click(); }

  async onCharacterPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    this.charMessage.set(null);
    this.busy.set(true);
    try {
      const ch = await this.mine.addCharacter(files);
      this.charMessage.set(`"${ch.displayName}" was imported. Press + Add to put it in the scene.`);
    } catch (e) {
      this.charMessage.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  async removeCharacterAsset(id: string): Promise<void> {
    if (this.scene.state().characters.some(c => c.characterId === id)) {
      this.charMessage.set('This character is in the scene. Remove it from the scene first.');
      return;
    }
    this.charMessage.set(null);
    this.previews.forget(id);
    await this.mine.removeCharacter(id);
  }

  // ------------------------------------------------------------ dialogue

  onDraftText(ev: Event): void { this.draftText.set((ev.target as HTMLTextAreaElement).value); }
  onDraftCharacter(ev: Event): void { this.draftCharacter.set((ev.target as HTMLSelectElement).value); }

  addDialogue(): void {
    const target = this.dialogueTarget();
    const text = this.draftText().trim();
    if (!target || !text) return;
    this.scene.addDialogue(target, text, this.playback.time());
    this.draftText.set('');
  }

  openDialogue(id: string, start: number): void {
    this.scene.selectClip({ kind: 'dialogue', id });
    this.playback.seek(start);
  }

  // ------------------------------------------------------------ audio

  onAudioVoice(ev: Event): void { this.audioVoice.set((ev.target as HTMLSelectElement).value); }

  pickAudio(): void { this.attachTarget = null; this.audioInput?.nativeElement.click(); }

  attachAudio(dialogueId: string): void { this.attachTarget = dialogueId; this.audioInput?.nativeElement.click(); }

  async onAudioPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const target = this.attachTarget;
    this.attachTarget = null;
    this.audioMessage.set(null);
    this.busy.set(true);
    try {
      const asset = await this.audio.importFile(file);
      if (target) this.scene.attachAudio(target, asset);
      else this.scene.addAudio(asset, this.playback.time(), this.audioVoice() || this.scene.selectedId() || undefined);
    } catch (e) {
      this.audioMessage.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  openAudio(id: string, start: number): void {
    this.scene.selectClip({ kind: 'audio', id });
    this.playback.seek(start);
  }

  characterName(instanceId: string): string { return this.scene.label(instanceId); }

  seconds(ms: number): string { return (ms / 1000).toFixed(1); }

  private async loadLibrary(): Promise<void> {
    try {
      const manifest = await this.assets.getManifest();
      this.libraryCharacters.set(manifest.characters.map(c => ({ id: c.id, name: c.displayName, mine: false })));
      const bgs: BgItem[] = [];
      for (const b of manifest.backgrounds) {
        const { def, baseUrl } = await this.assets.getBackground(b.id);
        bgs.push({ id: b.id, name: def.displayName || b.displayName, thumb: baseUrl + def.image, mine: false });
      }
      this.libraryBackgrounds.set(bgs);
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Could not load the asset library.');
    }
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
