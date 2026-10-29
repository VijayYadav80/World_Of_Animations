import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AssetManifest, BackgroundDefinition, RigDefinition } from '../models/asset.models';
import { UserAssetsService } from './user-assets.service';

export const ASSET_ROOT = 'assets/';

/** Loads and caches asset metadata. Adding a new character/background needs no code change here. */
@Injectable({ providedIn: 'root' })
export class AssetManifestService {
  private readonly http = inject(HttpClient);
  private readonly userAssets = inject(UserAssetsService);
  private manifest?: Promise<AssetManifest>;
  private readonly rigs = new Map<string, Promise<RigDefinition>>();
  private readonly backgrounds = new Map<string, Promise<BackgroundDefinition>>();

  getManifest(): Promise<AssetManifest> {
    this.manifest ??= firstValueFrom(this.http.get<AssetManifest>(`${ASSET_ROOT}manifest.json`));
    return this.manifest;
  }

  async getRig(characterId: string): Promise<{ def: RigDefinition; baseUrl: string }> {
    if (this.userAssets.isUserCharacter(characterId)) {
      // Imported characters carry their parts as embedded data URLs, so there is no base URL.
      await this.userAssets.ready;
      const mine = this.userAssets.characters().find(c => c.id === characterId);
      if (!mine) throw new Error(`The imported character "${characterId}" is no longer stored in this browser.`);
      return { def: mine.rig, baseUrl: '' };
    }
    const entry = (await this.getManifest()).characters.find(c => c.id === characterId);
    if (!entry) throw new Error(`Character "${characterId}" is not listed in assets/manifest.json`);
    const url = ASSET_ROOT + entry.rig;
    if (!this.rigs.has(characterId)) this.rigs.set(characterId, firstValueFrom(this.http.get<RigDefinition>(url)));
    const def = await this.rigs.get(characterId)!;
    return { def, baseUrl: url.substring(0, url.lastIndexOf('/') + 1) };
  }

  async getBackground(backgroundId: string): Promise<{ def: BackgroundDefinition; baseUrl: string }> {
    if (this.userAssets.isUserBackground(backgroundId)) {
      await this.userAssets.ready;
      const mine = this.userAssets.backgrounds().find(b => b.id === backgroundId);
      if (!mine) throw new Error(`The imported scene "${backgroundId}" is no longer stored in this browser.`);
      const def: BackgroundDefinition = {
        schemaVersion: 1, id: mine.id, displayName: mine.displayName, assetVersion: 'user',
        image: mine.dataUrl, width: mine.width, height: mine.height, groundY: 640, defaultCharacterScale: 0.8,
      };
      return { def, baseUrl: '' };
    }
    const entry = (await this.getManifest()).backgrounds.find(b => b.id === backgroundId);
    if (!entry) throw new Error(`Background "${backgroundId}" is not listed in assets/manifest.json`);
    const url = ASSET_ROOT + entry.meta;
    if (!this.backgrounds.has(backgroundId))
      this.backgrounds.set(backgroundId, firstValueFrom(this.http.get<BackgroundDefinition>(url)));
    const def = await this.backgrounds.get(backgroundId)!;
    return { def, baseUrl: url.substring(0, url.lastIndexOf('/') + 1) };
  }
}
