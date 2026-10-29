import type { AudioClip, DialogueClip } from './dialogue.models';
import type { CharacterInstance } from '../services/scene-state.service';

/** One row of the "Open project" list (matches the API's ProjectSummaryDto). */
export interface ProjectSummary {
  id: string;
  name: string;
  createdUtc: string;
  updatedUtc: string;
}

/** Full project as returned by GET /api/projects/{id}. `sceneJson` is a JSON string of SceneFileV1. */
export interface ProjectDetail extends ProjectSummary {
  sceneJson: string;
}

export interface SavedAudioAsset {
  id: string;
  name: string;
  /** ms */
  duration: number;
}

/** The scene document stored in Projects.SceneJson. Bump schemaVersion when the shape changes. */
export interface SceneFileV1 {
  schemaVersion: 1;
  backgroundId: string | null;
  characters: CharacterInstance[];
  dialogues: DialogueClip[];
  audioClips: AudioClip[];
  /** Audio files used by audioClips. The bytes live on the server: /api/projects/{id}/audio/{assetId}. */
  audioAssets: SavedAudioAsset[];
  /** Length of the timeline in ms. */
  duration: number;
}
