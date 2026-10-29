import { Component, ElementRef, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { AssetManifestService } from '../../core/services/asset-manifest.service';
import { AudioService } from '../../core/services/audio.service';
import { CharacterPreviewService } from '../../core/services/character-preview.service';
import { PlaybackService } from '../../core/services/playback.service';
import { SceneStateService, STAGE_WIDTH, prettyCharacterName, prettyPropName } from '../../core/services/scene-state.service';
import { UserAssetsService } from '../../core/services/user-assets.service';

type TabId = 'backgrounds' | 'characters' | 'props' | 'dialogue' | 'audio';

interface SidebarTab { id: TabId; label: string; title: string }
interface BgItem { id: string; name: string; thumb: string; mine: boolean }
interface CharItem { id: string; name: string; mine: boolean }
interface PropItem { id: string; name: string; thumb: string; mine: boolean }

/** A newly added prop is shrunk (never enlarged) so its longest side is about this many stage pixels. */
const PROP_FIT_PX = 260;

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
  @ViewChild('propInput') private propInput?: ElementRef<HTMLInputElement>;

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
  private readonly libraryProps = signal<PropItem[]>([]);
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

  /** Props the user imported come first, then the ones that ship with the app. */
  readonly propItems = computed<PropItem[]>(() => [
    ...this.mine.props().map(p => ({ id: p.id, name: p.displayName, thumb: p.dataUrl, mine: true })),
    ...this.libraryProps(),
  ]);

  /** characterId -> preview image (undefined while drawing, null if it failed). */
  readonly previewUrls = signal<Record<string, string | null>>({});

  readonly bgMessage = signal<string | null>(null);
  readonly charMessage = signal<string | null>(null);
  readonly audioMessage = signal<string | null>(null);
  readonly propMessage = signal<string | null>(null);
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
    void this.loadProps();
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

  // ------------------------------------------------------------ props

  pickProp(): void { this.propInput?.nativeElement.click(); }

  /** Imports one or more prop pictures into the library (they are not placed on the stage yet). */
  async onPropPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    this.propMessage.set(null);
    this.busy.set(true);
    const added: string[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try { added.push((await this.mine.addProp(file)).displayName); }
      catch (e) { problems.push(`${file.name}: ${errorText(e)}`); }
    }
    this.busy.set(false);
    const done = added.length ? `Imported: ${added.join(', ')}. Press + Add to put it on the stage.` : '';
    this.propMessage.set([done, ...problems].filter(Boolean).join('\n'));
  }

  /** How many times this prop is on the stage. */
  propUses(propId: string): number {
    return this.scene.state().props.filter(p => p.propId === propId).length;
  }

  propThumb(propId: string): string | null {
    return this.propItems().find(p => p.id === propId)?.thumb ?? null;
  }

  propLabel(instanceId: string): string { return this.scene.propLabel(instanceId); }

  async addProp(propId: string): Promise<void> {
    this.propMessage.set(null);
    try {
      const [{ def }, size] = await Promise.all([this.assets.getProp(propId), this.assets.getPropSize(propId)]);
      const bgId = this.scene.currentBackgroundId();
      const bg = bgId ? (await this.assets.getBackground(bgId)).def : undefined;
      // Alternate right / left of the centre so new props do not stack on top of each other.
      const n = this.scene.state().props.length;
      const offset = (n % 2 === 0 ? 1 : -1) * (260 + 140 * Math.floor(n / 2));
      const x = Math.min(STAGE_WIDTH - 80, Math.max(80, STAGE_WIDTH / 2 + offset));
      const fit = Math.min(1, PROP_FIT_PX / Math.max(1, size.width, size.height));
      this.scene.addProp(propId, x, bg?.groundY ?? 640, def.defaultScale ?? fit);
    } catch (e) {
      this.propMessage.set(errorText(e));
    }
  }

  async removePropAsset(id: string): Promise<void> {
    if (this.propUses(id) > 0) {
      this.propMessage.set('This prop is on the stage. Remove it from the stage first.');
      return;
    }
    this.propMessage.set(null);
    await this.mine.removeProp(id);
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

  /** Loads the props listed in assets/manifest.json. One broken prop must not hide the others. */
  private async loadProps(): Promise<void> {
    try {
      const manifest = await this.assets.getManifest();
      const items: PropItem[] = [];
      const broken: string[] = [];
      for (const entry of manifest.props ?? []) {
        try {
          const { def, baseUrl } = await this.assets.getProp(entry.id);
          items.push({ id: entry.id, name: def.displayName || entry.displayName || prettyPropName(entry.id), thumb: baseUrl + def.image, mine: false });
        } catch (e) {
          console.warn('Prop skipped', entry.id, e);
          broken.push(entry.id);
        }
      }
      this.libraryProps.set(items);
      if (broken.length) this.propMessage.set(`These props could not be read from assets: ${broken.join(', ')}. Check their paths in assets/manifest.json.`);
    } catch {
      /* the manifest error is already shown by loadLibrary */
    }
  }

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
