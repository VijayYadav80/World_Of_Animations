import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AssetManifest, BackgroundDefinition, PropDefinition, PropManifestEntry, RigDefinition } from '../models/asset.models';
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
  private readonly props = new Map<string, Promise<{ def: PropDefinition; baseUrl: string }>>();
  private readonly propSizes = new Map<string, Promise<{ width: number; height: number }>>();

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

  /**
   * Props work like backgrounds: a manifest entry points to a small JSON file (`meta`) with the image name.
   * An entry may also point straight to an image (`image`), so a prop needs no JSON file at all.
   */
  getProp(propId: string): Promise<{ def: PropDefinition; baseUrl: string }> {
    let p = this.props.get(propId);
    if (!p) {
      p = this.loadProp(propId);
      this.props.set(propId, p);
      // A failed load is not kept, so the next try loads it again.
      p.catch(() => this.props.delete(propId));
    }
    return p;
  }

  /** Natural size of the prop picture in px (from its JSON when given, otherwise measured from the image). */
  getPropSize(propId: string): Promise<{ width: number; height: number }> {
    let p = this.propSizes.get(propId);
    if (!p) {
      p = this.getProp(propId).then(async ({ def, baseUrl }) => {
        if (def.width && def.height) return { width: def.width, height: def.height };
        return measureImage(baseUrl + def.image);
      });
      this.propSizes.set(propId, p);
      p.catch(() => this.propSizes.delete(propId));
    }
    return p;
  }

  private async loadProp(propId: string): Promise<{ def: PropDefinition; baseUrl: string }> {
    if (this.userAssets.isUserProp(propId)) {
      await this.userAssets.ready;
      const mine = this.userAssets.props().find(x => x.id === propId);
      if (!mine) throw new Error(`The imported prop "${propId}" is no longer stored in this browser.`);
      const def: PropDefinition = {
        schemaVersion: 1, id: mine.id, displayName: mine.displayName, image: mine.dataUrl,
        width: mine.width, height: mine.height, anchorX: 0.5, anchorY: 1,
      };
      return { def, baseUrl: '' };
    }
    const entry: PropManifestEntry | undefined = ((await this.getManifest()).props ?? []).find(x => x.id === propId);
    if (!entry) throw new Error(`Prop "${propId}" is not listed in assets/manifest.json`);

    if (entry.meta) {
      const url = ASSET_ROOT + entry.meta;
      const raw = await firstValueFrom(this.http.get<Record<string, unknown>>(url));
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      return { def: normalizeProp(raw, entry), baseUrl };
    }
    if (entry.image) {
      return { def: normalizeProp({ image: entry.image }, entry), baseUrl: ASSET_ROOT };
    }
    throw new Error(`Prop "${propId}" in assets/manifest.json needs a "meta" (JSON file) or an "image".`);
  }
}

/** Accepts the usual spellings of the image field so a hand-written prop JSON does not need to match exactly. */
function normalizeProp(raw: Record<string, unknown>, entry: PropManifestEntry): PropDefinition {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const image = str(raw['image']) ?? str(raw['src']) ?? str(raw['file']) ?? str(raw['path']) ?? entry.image;
  if (!image) throw new Error(`Prop "${entry.id}" has no image. Add an "image" field to its JSON.`);
  return {
    schemaVersion: num(raw['schemaVersion']),
    id: entry.id,
    displayName: str(raw['displayName']) ?? entry.displayName ?? entry.id,
    image,
    width: num(raw['width']),
    height: num(raw['height']),
    anchorX: num(raw['anchorX']),
    anchorY: num(raw['anchorY']),
    defaultScale: num(raw['defaultScale']),
  };
}

function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 200, height: img.naturalHeight || 200 });
    img.onerror = () => resolve({ width: 200, height: 200 });
    img.src = url;
  });
}
