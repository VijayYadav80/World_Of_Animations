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
      return { def: withBuiltInActions(mine.rig), baseUrl: '' };
    }
    const entry = (await this.getManifest()).characters.find(c => c.id === characterId);
    if (!entry) throw new Error(`Character "${characterId}" is not listed in assets/manifest.json`);
    const url = ASSET_ROOT + entry.rig;
    if (!this.rigs.has(characterId)) this.rigs.set(characterId, firstValueFrom(this.http.get<RigDefinition>(url)));
    const def = withBuiltInActions(await this.rigs.get(characterId)!);
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

/** Adds reusable, rig-bone based actions to every built-in and imported character. */
function withBuiltInActions(rig: RigDefinition): RigDefinition {
  const existing = new Set(rig.animations.map(a => a.id));
  const track = (...values: [number, number][]) => values;
  const action = (id: string, displayName: string, duration: number, loop: boolean, rotations: Record<string, [number, number][]>) => ({
    id, displayName, duration, loop, additive: true, startPosture: 'inherit' as const,
    endPosture: 'inherit' as const, status: 'complete' as const, rotations, offsets: {},
  });
  const generated = [
    action('dance', 'Dance', 1600, true, {
      torso: track([0, -5], [400, 6], [800, -5], [1200, 6], [1600, -5]),
      upperArmF: track([0, -28], [400, -72], [800, -28], [1200, -72], [1600, -28]),
      forearmF: track([0, -18], [400, 28], [800, -18], [1200, 28], [1600, -18]),
      upperArmB: track([0, 28], [400, 72], [800, 28], [1200, 72], [1600, 28]),
      forearmB: track([0, 18], [400, -28], [800, 18], [1200, -28], [1600, 18]),
      upperLegF: track([0, -8], [400, 12], [800, -8], [1200, 12], [1600, -8]),
      upperLegB: track([0, 8], [400, -12], [800, 8], [1200, -12], [1600, 8]),
      head: track([0, 3], [400, -3], [800, 3], [1200, -3], [1600, 3]),
    }),
    action('fight', 'Fight', 1200, false, {
      torso: track([0, 0], [250, -12], [500, 10], [850, -16], [1200, 0]),
      upperArmF: track([0, -10], [250, -80], [500, 42], [850, -92], [1200, -10]),
      forearmF: track([0, -10], [250, 35], [500, -92], [850, 25], [1200, -10]),
      upperArmB: track([0, 14], [250, 70], [500, -40], [850, 80], [1200, 14]),
      forearmB: track([0, 10], [250, -30], [500, 82], [850, -25], [1200, 10]),
      upperLegF: track([0, 0], [250, -12], [500, 9], [850, -8], [1200, 0]),
      head: track([0, 0], [250, -8], [500, 8], [850, -10], [1200, 0]),
    }),
    action('angry', 'Angry', 1400, true, {
      torso: track([0, 0], [180, 3], [360, 0], [540, 3], [700, 0], [1400, 0]),
      head: track([0, -4], [180, 3], [360, -4], [540, 3], [700, -4], [1400, -4]),
      upperArmF: track([0, -12], [180, -20], [360, -12], [540, -20], [700, -12], [1400, -12]),
      forearmF: track([0, -12], [180, -24], [360, -12], [540, -24], [700, -12], [1400, -12]),
      upperArmB: track([0, 12], [180, 20], [360, 12], [540, 20], [700, 12], [1400, 12]),
      forearmB: track([0, 12], [180, 24], [360, 12], [540, 24], [700, 12], [1400, 12]),
    }),
  ].filter(a => !existing.has(a.id));
  return generated.length ? { ...rig, animations: [...rig.animations, ...generated] } : rig;
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
