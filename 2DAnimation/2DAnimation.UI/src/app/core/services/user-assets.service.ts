import { Injectable, signal } from '@angular/core';
import { RigDefinition } from '../models/asset.models';
import { findPartFile, rigProblem } from '../assets/rig-import';

/** A background image the user imported. The image is stored as a data URL so it can be loaded like any other texture. */
export interface UserBackground {
  id: string;
  displayName: string;
  dataUrl: string;
  width: number;
  height: number;
}

/** A character the user imported. Its rig.json is rewritten so every part is an embedded data URL. */
export interface UserCharacter {
  id: string;
  displayName: string;
  rig: RigDefinition;
}

export const USER_BACKGROUND_PREFIX = 'user-bg-';
export const USER_CHARACTER_PREFIX = 'user-char-';

const DB_NAME = 'world-of-animations-user-assets';
const BG_STORE = 'backgrounds';
const CHAR_STORE = 'characters';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_CHARACTER_BYTES = 40 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Assets the user adds from inside the editor (scenes and characters).
 * They stay on this computer, inside the browser's IndexedDB: nothing is uploaded anywhere.
 * Assets that ship with the app live in /assets and are described by assets/manifest.json instead.
 */
@Injectable({ providedIn: 'root' })
export class UserAssetsService {
  readonly backgrounds = signal<UserBackground[]>([]);
  readonly characters = signal<UserCharacter[]>([]);
  /** Resolves once the stored assets have been read. Await it before looking up a user asset by id. */
  readonly ready: Promise<void>;

  private db?: Promise<IDBDatabase>;

  constructor() {
    this.ready = this.loadAll().catch(err => console.warn('User assets could not be loaded', err));
  }

  isUserBackground(id: string): boolean { return id.startsWith(USER_BACKGROUND_PREFIX); }
  isUserCharacter(id: string): boolean { return id.startsWith(USER_CHARACTER_PREFIX); }

  // ------------------------------------------------------------ backgrounds

  async addBackground(file: File): Promise<UserBackground> {
    if (!IMAGE_TYPES.includes(file.type)) throw new Error('Please choose a PNG, JPG, WebP or SVG image.');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('This image is larger than 15 MB. Please use a smaller one.');
    const dataUrl = await readAsDataUrl(file);
    const { width, height } = await measureImage(dataUrl);
    const bg: UserBackground = {
      id: USER_BACKGROUND_PREFIX + randomId(),
      displayName: baseName(file.name) || 'My scene',
      dataUrl, width, height,
    };
    await this.put(BG_STORE, bg);
    this.backgrounds.update(list => [...list, bg]);
    return bg;
  }

  async removeBackground(id: string): Promise<void> {
    await this.delete(BG_STORE, id);
    this.backgrounds.update(list => list.filter(b => b.id !== id));
  }

  // ------------------------------------------------------------ characters

  /**
   * Imports a character from a rig.json and the part images it refers to.
   * Pick the whole character folder, or select rig.json together with all part files.
   */
  async addCharacter(files: File[]): Promise<UserCharacter> {
    const rigFile = files.find(f => f.name.toLowerCase() === 'rig.json') ?? files.find(f => f.name.toLowerCase().endsWith('.json'));
    if (!rigFile) throw new Error('rig.json was not found. Select the character folder, or rig.json together with its part images.');

    let rig: RigDefinition;
    try {
      rig = JSON.parse(await rigFile.text()) as RigDefinition;
    } catch {
      throw new Error('rig.json is not valid JSON.');
    }
    const problem = rigProblem(rig);
    if (problem) throw new Error(`rig.json is not a valid character: ${problem}`);

    const wanted = new Set<string>();
    for (const b of rig.bones) {
      if (!b.part) continue;
      if (b.part.src) wanted.add(b.part.src);
      Object.values(b.part.variants ?? {}).forEach(v => wanted.add(v));
    }

    const byRef = new Map<string, string>();
    const missing: string[] = [];
    let total = 0;
    for (const ref of wanted) {
      const file = findPartFile(files, rig.partsBasePath ?? '', ref);
      if (!file) { missing.push(ref); continue; }
      total += file.size;
      if (total > MAX_CHARACTER_BYTES) throw new Error('This character is larger than 40 MB.');
      byRef.set(ref, await readAsDataUrl(file, mimeFor(file.name)));
    }
    if (missing.length) throw new Error(`These part files are missing: ${missing.join(', ')}`);

    const embedded: RigDefinition = JSON.parse(JSON.stringify(rig));
    embedded.partsBasePath = '';
    for (const b of embedded.bones) {
      if (!b.part) continue;
      if (b.part.src) b.part.src = byRef.get(b.part.src)!;
      if (b.part.variants) {
        for (const [name, ref] of Object.entries(b.part.variants)) b.part.variants[name] = byRef.get(ref)!;
      }
    }
    const displayName = (rig.displayName || rig.id || 'My character').toString();
    embedded.id = USER_CHARACTER_PREFIX + slug(displayName) + '-' + randomId();
    embedded.displayName = displayName;

    const ch: UserCharacter = { id: embedded.id, displayName, rig: embedded };
    await this.put(CHAR_STORE, ch);
    this.characters.update(list => [...list, ch]);
    return ch;
  }

  async removeCharacter(id: string): Promise<void> {
    await this.delete(CHAR_STORE, id);
    this.characters.update(list => list.filter(c => c.id !== id));
  }

  // ------------------------------------------------------------ IndexedDB plumbing

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(BG_STORE, { keyPath: 'id' });
        req.result.createObjectStore(CHAR_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB is not available'));
    });
    return this.db;
  }

  private async loadAll(): Promise<void> {
    this.backgrounds.set(await this.getAll<UserBackground>(BG_STORE));
    this.characters.set(await this.getAll<UserCharacter>(CHAR_STORE));
  }

  private async getAll<T>(store: string): Promise<T[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  private async put(store: string, value: unknown): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save to this browser (storage full?)'));
    });
  }

  private async delete(store: string, id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ---------------------------------------------------------------- helpers (pure)

function randomId(): string { return crypto.randomUUID().slice(0, 8); }
function baseName(name: string): string { return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(); }
function slug(name: string): string { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'; }

function mimeFor(name: string): string | undefined {
  const n = name.toLowerCase();
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  return undefined;
}

function readAsDataUrl(file: File, forceType?: string): Promise<string> {
  const source = forceType && file.type !== forceType ? new Blob([file], { type: forceType }) : file;
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(`Could not read ${file.name}`));
    r.readAsDataURL(source);
  });
}

function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
    img.onerror = () => resolve({ width: 1280, height: 720 });
    img.src = dataUrl;
  });
}
