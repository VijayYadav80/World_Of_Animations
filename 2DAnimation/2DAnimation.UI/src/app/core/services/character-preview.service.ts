import { Injectable, inject } from '@angular/core';
import { Rectangle, Renderer, autoDetectRenderer } from 'pixi.js';
import { RigCharacter } from '../../canvas/rig/rig-character';
import { AssetManifestService } from './asset-manifest.service';

const PREVIEW_RESOLUTION = 2;

/**
 * Renders a small picture of any character straight from its rig (standing, default pose), using the same
 * RigCharacter code as the stage. Works for library and imported characters, so there are no preview files to maintain.
 */
@Injectable({ providedIn: 'root' })
export class CharacterPreviewService {
  private readonly assets = inject(AssetManifestService);
  private readonly cache = new Map<string, Promise<string | null>>();
  private renderer?: Promise<Renderer>;
  /** One preview at a time: the shared renderer is not re-entrant. */
  private queue: Promise<unknown> = Promise.resolve();

  /** Data URL of the preview, or null if it could not be drawn (the UI falls back to the initial letter). */
  preview(characterId: string): Promise<string | null> {
    let p = this.cache.get(characterId);
    if (!p) {
      p = this.queue.then(() => this.render(characterId)).catch(err => { console.warn('Preview failed for', characterId, err); return null; });
      this.queue = p;
      this.cache.set(characterId, p);
    }
    return p;
  }

  forget(characterId: string): void { this.cache.delete(characterId); }

  private getRenderer(): Promise<Renderer> {
    this.renderer ??= autoDetectRenderer({ width: 16, height: 16, backgroundAlpha: 0, antialias: true, resolution: 1 });
    return this.renderer;
  }

  private async render(characterId: string): Promise<string | null> {
    const { def, baseUrl } = await this.assets.getRig(characterId);
    const rig = await RigCharacter.load(def, baseUrl);
    try {
      const renderer = await this.getRenderer();
      const b = def.bounds;
      const texture = renderer.generateTexture({
        target: rig.root,
        frame: new Rectangle(b.x, b.y, b.width, b.height),
        resolution: PREVIEW_RESOLUTION,
        antialias: true,
      });
      // The extract resolution must match the texture's, otherwise only part of the picture is read back.
      const url = await renderer.extract.base64({ target: texture, resolution: PREVIEW_RESOLUTION });
      texture.destroy(true);
      return url;
    } finally {
      rig.destroy();
    }
  }
}
