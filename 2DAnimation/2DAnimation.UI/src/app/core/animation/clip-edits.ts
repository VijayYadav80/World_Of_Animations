import type { RigDefinition } from '../models/asset.models';
import { CharacterTimeline, findClip, postureBefore } from './animation-engine';

/** Pure edits for action blocks on a character's timeline (resize, duplicate). SceneStateService calls these. */

export const MIN_CLIP_MS = 100;
const X_MIN = -100;
const X_MAX = 1380;

export interface Placement { scale: number; flipX: boolean }

const clampX = (x: number): number => Math.round(Math.min(X_MAX, Math.max(X_MIN, x)));

/** Distance a ground-speed action (walk/run) travels in `ms`. */
function travel(speed: number, p: Placement, ms: number): number {
  return (p.flipX ? -1 : 1) * speed * p.scale * (ms / 1000);
}

/**
 * Changes the length of one action. Later actions slide along (ripple) so the order and gaps stay the same.
 * Walk/run: the character travels further/less far, and everything after the walk is moved by the same amount,
 * so the character never "jumps" at the next action.
 */
export function resizeClip(rig: RigDefinition, p: Placement, tl: CharacterTimeline, id: string, duration: number): CharacterTimeline {
  const c = tl.clips.find(k => k.id === id);
  if (!c) return tl;
  const newDur = Math.max(MIN_CLIP_MS, Math.round(duration));
  const delta = newDur - c.duration;
  if (delta === 0) return tl;
  const oldEnd = c.start + c.duration;
  const speed = findClip(rig, c.clipId)?.groundSpeed;

  let dx = 0;
  if (speed) {
    const startKey = tl.positionKeys.find(k => k.t === c.start);
    const endKey = tl.positionKeys.find(k => k.t === oldEnd);
    if (startKey && endKey) dx = clampX(startKey.x + travel(speed, p, newDur)) - endKey.x;
  }
  return {
    clips: tl.clips.map(k => (k.id === id ? { ...k, duration: newDur } : k.start >= oldEnd ? { ...k, start: k.start + delta } : k)),
    positionKeys: tl.positionKeys.map(k => (k.t >= oldEnd ? { t: k.t + delta, x: clampX(k.x + dx), y: k.y } : { ...k })),
  };
}

/**
 * Puts a copy of an action right after the original; later actions slide along.
 * Refused when the copy cannot start from the posture the original leaves (e.g. "Sit" twice in a row).
 */
export function duplicateClip(rig: RigDefinition, p: Placement, tl: CharacterTimeline, id: string, newId: string):
  { ok: true; timeline: CharacterTimeline } | { ok: false; reason: string } {
  const c = tl.clips.find(k => k.id === id);
  const def = c ? findClip(rig, c.clipId) : undefined;
  if (!c || !def) return { ok: false, reason: 'Unknown action' };

  const after = def.endPosture !== 'inherit' ? def.endPosture : postureBefore(rig, tl, c);
  if (def.startPosture !== 'inherit' && def.startPosture !== after) {
    return { ok: false, reason: `${def.displayName} cannot be repeated right after itself (the character is ${after === 'sit' ? 'sitting' : 'standing'} then).` };
  }

  const oldEnd = c.start + c.duration;
  const dur = c.duration;
  const copy = { ...c, id: newId, start: oldEnd };
  const clips = [...tl.clips.map(k => (k.id !== id && k.start >= oldEnd ? { ...k, start: k.start + dur } : k)), copy];

  let positionKeys: CharacterTimeline['positionKeys'];
  const endKey = def.groundSpeed ? tl.positionKeys.find(k => k.t === oldEnd) : undefined;
  if (def.groundSpeed && endKey) {
    const dx = clampX(endKey.x + travel(def.groundSpeed, p, dur)) - endKey.x;
    positionKeys = [
      ...tl.positionKeys.filter(k => k.t < oldEnd).map(k => ({ ...k })),
      { t: oldEnd, x: endKey.x, y: endKey.y },
      { t: oldEnd + dur, x: endKey.x + dx, y: endKey.y },
      ...tl.positionKeys.filter(k => k.t > oldEnd).map(k => ({ t: k.t + dur, x: clampX(k.x + dx), y: k.y })),
    ];
  } else {
    positionKeys = tl.positionKeys.map(k => (k.t >= oldEnd ? { ...k, t: k.t + dur } : { ...k }));
  }
  return { ok: true, timeline: { clips, positionKeys } };
}
