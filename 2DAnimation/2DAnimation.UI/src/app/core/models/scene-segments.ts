import type { Ms } from './scene-time';

/**
 * One scene on the timeline = one background shown for `duration` ms.
 * Scenes play one after another in array order (no gaps, no overlap), so `start` is never stored:
 * it is always the sum of the durations before it. That makes it impossible to save an overlapping layout.
 */
export interface SceneSegment {
  id: string;
  backgroundId: string;
  duration: Ms;
}

/** A segment together with its computed place on the timeline. */
export interface PlacedScene extends SceneSegment {
  start: Ms;
  end: Ms;
}

export const DEFAULT_SCENE_MS = 5000;
export const MIN_SCENE_MS = 500;

/** Adds `start`/`end` to every scene. */
export function layoutScenes(scenes: readonly SceneSegment[]): PlacedScene[] {
  let t = 0;
  return scenes.map(s => {
    const placed = { ...s, start: t, end: t + s.duration };
    t = placed.end;
    return placed;
  });
}

/** Total length of all scenes in ms. */
export function scenesEnd(scenes: readonly SceneSegment[]): Ms {
  return scenes.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * The scene that is on screen at time `t`.
 * Before 0 -> first scene. After the last scene ends (dialogue/audio may run longer) -> the last scene stays visible.
 */
export function sceneAt(scenes: readonly SceneSegment[], t: Ms): SceneSegment | undefined {
  if (scenes.length === 0) return undefined;
  let end = 0;
  for (const s of scenes) {
    end += s.duration;
    if (t < end) return s;
  }
  return scenes[scenes.length - 1];
}

export function newScene(backgroundId: string, duration: Ms = DEFAULT_SCENE_MS): SceneSegment {
  return { id: crypto.randomUUID().slice(0, 8), backgroundId, duration: Math.max(MIN_SCENE_MS, Math.round(duration)) };
}

/** Appends a scene after the last one. */
export function appendScene(scenes: readonly SceneSegment[], scene: SceneSegment): SceneSegment[] {
  return [...scenes, scene];
}

export function removeScene(scenes: readonly SceneSegment[], id: string): SceneSegment[] {
  return scenes.filter(s => s.id !== id);
}

export function resizeScene(scenes: readonly SceneSegment[], id: string, duration: Ms): SceneSegment[] {
  const d = Math.max(MIN_SCENE_MS, Math.round(duration));
  return scenes.map(s => (s.id === id ? { ...s, duration: d } : s));
}

export function setSceneBackground(scenes: readonly SceneSegment[], id: string, backgroundId: string): SceneSegment[] {
  return scenes.map(s => (s.id === id ? { ...s, backgroundId } : s));
}

/** Moves a scene to position `toIndex` (0-based, clamped). Later scenes shift automatically. */
export function moveScene(scenes: readonly SceneSegment[], id: string, toIndex: number): SceneSegment[] {
  const from = scenes.findIndex(s => s.id === id);
  if (from < 0) return [...scenes];
  const next = [...scenes];
  const [item] = next.splice(from, 1);
  next.splice(Math.min(next.length, Math.max(0, toIndex)), 0, item);
  return next;
}

/** Puts a copy of a scene (same background, same length) right after it. Later scenes shift automatically. */
export function duplicateScene(scenes: readonly SceneSegment[], id: string): SceneSegment[] {
  const i = scenes.findIndex(s => s.id === id);
  if (i < 0) return [...scenes];
  const next = [...scenes];
  next.splice(i + 1, 0, newScene(scenes[i].backgroundId, scenes[i].duration));
  return next;
}

/** Cuts the scene at time `t` into two scenes with the same background. Returns the input when `t` is not inside a scene. */
export function splitScene(scenes: readonly SceneSegment[], t: Ms): SceneSegment[] {
  const placed = layoutScenes(scenes);
  const hit = placed.find(s => t > s.start + MIN_SCENE_MS && t < s.end - MIN_SCENE_MS);
  if (!hit) return [...scenes];
  const first = Math.round(t - hit.start);
  return placed.flatMap<SceneSegment>(s =>
    s.id === hit.id
      ? [{ id: s.id, backgroundId: s.backgroundId, duration: first }, newScene(s.backgroundId, s.duration - first)]
      : [{ id: s.id, backgroundId: s.backgroundId, duration: s.duration }]);
}
