import { Component, inject, signal } from '@angular/core';
import { AssetManifestService } from '../../core/services/asset-manifest.service';
import { PlaybackService } from '../../core/services/playback.service';
import { SceneStateService, STAGE_WIDTH } from '../../core/services/scene-state.service';

type TabId = 'backgrounds' | 'characters' | 'props' | 'dialogue' | 'audio';

interface SidebarTab { id: TabId; label: string; title: string }
interface BgItem { id: string; name: string; thumb: string }
interface CharItem { id: string; name: string }

const SAMPLE_LINE = 'नमस्ते, मैं राजू हूँ।';

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

  readonly tabs: SidebarTab[] = [
    { id: 'backgrounds', label: 'Scenes', title: 'Backgrounds' },
    { id: 'characters', label: 'Cast', title: 'Characters' },
    { id: 'props', label: 'Props', title: 'Props' },
    { id: 'dialogue', label: 'Lines', title: 'Dialogue' },
    { id: 'audio', label: 'Audio', title: 'Audio' },
  ];
  readonly activeId = signal<TabId>('backgrounds');
  readonly backgrounds = signal<BgItem[]>([]);
  readonly characters = signal<CharItem[]>([]);
  readonly loadError = signal<string | null>(null);

  constructor() {
    void this.loadLibrary();
  }

  get active(): SidebarTab {
    return this.tabs.find(t => t.id === this.activeId()) ?? this.tabs[0];
  }

  setBackground(id: string): void {
    this.scene.setBackground(id);
  }

  async addCharacter(characterId: string): Promise<void> {
    const state = this.scene.state();
    const bgId = state.backgroundId;
    const def = bgId ? (await this.assets.getBackground(bgId)).def : undefined;
    // Spread new characters left/right of the centre so they do not stack on top of each other.
    const n = state.characters.length;
    const offset = n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 150;
    const x = Math.min(STAGE_WIDTH - 80, Math.max(80, STAGE_WIDTH / 2 + offset));
    this.scene.addCharacter(characterId, x, def?.groundY ?? 640, def?.defaultCharacterScale ?? 0.8);
  }

  addDialogue(): void {
    const target = this.scene.selected() ?? this.scene.state().characters[0];
    if (!target) return;
    this.scene.addDialogue(target.instanceId, SAMPLE_LINE, this.playback.time());
  }

  openDialogue(id: string, start: number): void {
    this.scene.selectClip({ kind: 'dialogue', id });
    this.playback.seek(start);
  }

  openAudio(id: string, start: number): void {
    this.scene.selectClip({ kind: 'audio', id });
    this.playback.seek(start);
  }

  characterName(instanceId: string): string {
    return this.scene.state().characters.find(c => c.instanceId === instanceId)?.characterId ?? '—';
  }

  seconds(ms: number): string { return (ms / 1000).toFixed(1); }

  private async loadLibrary(): Promise<void> {
    try {
      const manifest = await this.assets.getManifest();
      this.characters.set(manifest.characters.map(c => ({ id: c.id, name: c.displayName })));
      const bgs: BgItem[] = [];
      for (const b of manifest.backgrounds) {
        const { def, baseUrl } = await this.assets.getBackground(b.id);
        bgs.push({ id: b.id, name: def.displayName || b.displayName, thumb: baseUrl + def.image });
      }
      this.backgrounds.set(bgs);
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Could not load the asset library.');
    }
  }
}
