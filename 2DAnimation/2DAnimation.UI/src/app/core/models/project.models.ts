import type { AudioClip, DialogueClip } from './dialogue.models';
import type { CharacterInstance } from '../services/scene-state.service';
import type { SceneSegment } from './scene-segments';

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

/** The scene document stored in Projects.SceneJson. Bump schemaVersion when the shape changes.
 *  v1 had a single `backgroundId`; v2 has `scenes[]`. Old v1 files are upgraded when opened (see ProjectService.parse). */
export interface SceneFileV2 {
  schemaVersion: 2;
  scenes: SceneSegment[];
  characters: CharacterInstance[];
  dialogues: DialogueClip[];
  audioClips: AudioClip[];
  /** Audio files used by audioClips. The bytes live on the server: /api/projects/{id}/audio/{assetId}. */
  audioAssets: SavedAudioAsset[];
  /** Length of the timeline in ms. */
  duration: number;
}
