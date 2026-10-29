import { Injectable, computed, signal } from '@angular/core';

/** Stage coordinates: 1280x720, origin top-left, y down. Time unit (later phases): milliseconds. */
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

export interface CharacterInstance {
  instanceId: string;
  characterId: string;
  /** Position of the character's feet on the stage. */
  x: number;
  y: number;
  scale: number;
  /** Degrees. */
  rotation: number;
  flipX: boolean;
}

export interface SceneState {
  backgroundId: string | null;
  characters: CharacterInstance[];
}

/** Single source of truth for the scene. Stage, properties panel (and later timeline) all read this. */
@Injectable({ providedIn: 'root' })
export class SceneStateService {
  readonly state = signal<SceneState>({ backgroundId: null, characters: [] });
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(
    () => this.state().characters.find(c => c.instanceId === this.selectedId()) ?? null
  );

  setBackground(backgroundId: string): void {
    this.state.update(s => ({ ...s, backgroundId }));
  }

  addCharacter(characterId: string, x: number, y: number, scale: number): string {
    const instanceId = `${characterId}-${crypto.randomUUID().slice(0, 8)}`;
    const inst: CharacterInstance = { instanceId, characterId, x, y, scale, rotation: 0, flipX: false };
    this.state.update(s => ({ ...s, characters: [...s.characters, inst] }));
    this.selectedId.set(instanceId);
    return instanceId;
  }

  updateCharacter(instanceId: string, patch: Partial<Omit<CharacterInstance, 'instanceId' | 'characterId'>>): void {
    this.state.update(s => ({
      ...s,
      characters: s.characters.map(c => (c.instanceId === instanceId ? { ...c, ...patch } : c)),
    }));
  }

  removeCharacter(instanceId: string): void {
    this.state.update(s => ({ ...s, characters: s.characters.filter(c => c.instanceId !== instanceId) }));
    if (this.selectedId() === instanceId) this.selectedId.set(null);
  }

  select(instanceId: string | null): void {
    this.selectedId.set(instanceId);
  }
}
