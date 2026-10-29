import type { AnimationClip, Pose, Posture, RigDefinition } from '../models/asset.models';

/** Everything here is pure and deterministic: pose = f(rig, timeline, t). No hidden state, so scrubbing is exact. */

export interface TimelineClip {
  id: string;
  clipId: string;
  /** ms */
  start: number;
  /** ms on the timeline */
  duration: number;
  /** playback speed multiplier (1 = normal) */
  speed: number;
}

export interface PositionKey { t: number; x: number; y: number }

export interface CharacterTimeline {
  clips: TimelineClip[];
  positionKeys: PositionKey[];
}

export const DEFAULT_BLEND_MS = 220;

export function emptyTimeline(): CharacterTimeline {
  return { clips: [], positionKeys: [] };
}

const smooth = (x: number): number => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

function sampleNumber(track: [number, number][] | undefined, t: number): number | undefined {
  if (!track || track.length === 0) return undefined;
  if (t <= track[0][0]) return track[0][1];
  const last = track[track.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < track.length; i++) {
    if (t <= track[i][0]) {
      const [t0, v0] = track[i - 1], [t1, v1] = track[i];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return last[1];
}

function sampleStep(track: [number, string][] | undefined, t: number): string | undefined {
  if (!track || track.length === 0) return undefined;
  let v = track[0][1];
  for (const [kt, kv] of track) { if (kt <= t) v = kv; else break; }
  return v;
}

export function findClip(rig: RigDefinition, clipId: string): AnimationClip | undefined {
  return rig.animations.find(a => a.id === clipId);
}

function sortedClips(tl: CharacterTimeline): TimelineClip[] {
  return [...tl.clips].sort((a, b) => a.start - b.start);
}

export function timelineEnd(tl: CharacterTimeline): number {
  return tl.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

/** Posture the character is in just before `clip` starts (or at the end of the timeline when clip is undefined). */
export function postureBefore(rig: RigDefinition, tl: CharacterTimeline, clip?: TimelineClip): Posture {
  const sorted = sortedClips(tl);
  const idx = clip ? sorted.findIndex(c => c.id === clip.id) : sorted.length;
  let posture: Posture = 'stand';
  for (let i = 0; i < idx; i++) {
    const def = findClip(rig, sorted[i].clipId);
    if (def && def.endPosture !== 'inherit') posture = def.endPosture;
  }
  return posture;
}

/** True when `clipId` may be appended after the current end of the timeline (posture rules). */
export function canAppend(rig: RigDefinition, tl: CharacterTimeline, clipId: string): { ok: boolean; reason?: string } {
  const def = findClip(rig, clipId);
  if (!def) return { ok: false, reason: 'Unknown action' };
  if (def.status !== 'complete') return { ok: false, reason: 'Incomplete action' };
  const posture = postureBefore(rig, tl);
  if (def.startPosture !== 'inherit' && def.startPosture !== posture)
    return { ok: false, reason: posture === 'sit' ? 'Character is sitting. Use Get Up first.' : 'Character is standing. Use Sit first.' };
  return { ok: true };
}

/** Evaluates one clip at timeline time `t` for a placement that started at `placement.start`. */
export function evaluateClip(rig: RigDefinition, tl: CharacterTimeline, placement: TimelineClip, t: number): Pose {
  const def = findClip(rig, placement.clipId);
  const posture = postureBefore(rig, tl, placement);
  const base: Pose = def?.additive ? rig.poses[posture] : { rotations: {}, offsets: {} };
  const rotations: Record<string, number> = { ...rig.defaultPose.rotations, ...base.rotations };
  const offsets: Record<string, { x: number; y: number }> = {};
  for (const [k, v] of Object.entries(base.offsets ?? {})) offsets[k] = { ...v };
  const variants: Record<string, string> = { ...(rig.defaultPose.variants ?? {}) };
  if (!def) return { rotations, offsets, variants };

  let local = Math.max(0, (t - placement.start) * placement.speed);
  if (def.loop) local = def.duration > 0 ? local % def.duration : 0;
  else local = Math.min(local, def.duration);

  for (const [bone, track] of Object.entries(def.rotations)) {
    const v = sampleNumber(track, local);
    if (v !== undefined) rotations[bone] = v;
  }
  for (const [bone, tr] of Object.entries(def.offsets)) {
    const cur = offsets[bone] ?? { x: 0, y: 0 };
    offsets[bone] = { x: sampleNumber(tr.x, local) ?? cur.x, y: sampleNumber(tr.y, local) ?? cur.y };
  }
  for (const [bone, track] of Object.entries(def.variants ?? {})) {
    const v = sampleStep(track, local);
    if (v !== undefined) variants[bone] = v;
  }
  return { rotations, offsets, variants };
}

/** Pose when no clip is placed at time t: posture rest pose, with idle breathing while standing. */
function evaluateGap(rig: RigDefinition, tl: CharacterTimeline, t: number): Pose {
  const posture = postureBefore(rig, tl);
  if (posture === 'sit') {
    const p = rig.poses.sit;
    return { rotations: { ...p.rotations }, offsets: { ...(p.offsets ?? {}) }, variants: { ...(rig.defaultPose.variants ?? {}) } };
  }
  return evaluateClip(rig, tl, { id: '__idle', clipId: 'idle', start: 0, duration: Infinity, speed: 1 }, t);
}

export function mixPoses(a: Pose, b: Pose, k: number): Pose {
  const rotations: Record<string, number> = {};
  for (const bone of new Set([...Object.keys(a.rotations), ...Object.keys(b.rotations)])) {
    const x = a.rotations[bone] ?? 0, y = b.rotations[bone] ?? 0;
    rotations[bone] = x + (y - x) * k;
  }
  const offsets: Record<string, { x: number; y: number }> = {};
  for (const bone of new Set([...Object.keys(a.offsets ?? {}), ...Object.keys(b.offsets ?? {})])) {
    const x = a.offsets?.[bone] ?? { x: 0, y: 0 }, y = b.offsets?.[bone] ?? { x: 0, y: 0 };
    offsets[bone] = { x: x.x + (y.x - x.x) * k, y: x.y + (y.y - x.y) * k };
  }
  return { rotations, offsets, variants: b.variants };
}

/** Pose of a character at timeline time t, with cross-fade between consecutive actions. */
export function evaluatePose(rig: RigDefinition, tl: CharacterTimeline, t: number, blendMs = DEFAULT_BLEND_MS): Pose {
  const sorted = sortedClips(tl);
  let activeIdx = -1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i].start <= t && t < sorted[i].start + sorted[i].duration) activeIdx = i;

  let pose: Pose, segStart: number, prev: TimelineClip | undefined;
  if (activeIdx >= 0) {
    const cur = sorted[activeIdx];
    pose = evaluateClip(rig, tl, cur, t);
    segStart = cur.start;
    prev = sorted[activeIdx - 1];
  } else {
    pose = evaluateGap(rig, tl, t);
    let lastEnded: TimelineClip | undefined;
    for (const c of sorted) if (c.start + c.duration <= t && (!lastEnded || c.start + c.duration >= lastEnded.start + lastEnded.duration)) lastEnded = c;
    segStart = lastEnded ? lastEnded.start + lastEnded.duration : 0;
    prev = lastEnded;
  }
  if (prev && blendMs > 0 && t - segStart < blendMs) {
    const k = smooth((t - segStart) / blendMs);
    pose = mixPoses(evaluateClip(rig, tl, prev, t), pose, k);
  }
  return pose;
}

/** Interpolated position, or undefined when the character has no position keyframes (use its static x/y). */
export function evaluatePosition(tl: CharacterTimeline, t: number): { x: number; y: number } | undefined {
  const keys = tl.positionKeys;
  if (keys.length === 0) return undefined;
  const k = [...keys].sort((a, b) => a.t - b.t);
  if (t <= k[0].t) return { x: k[0].x, y: k[0].y };
  const last = k[k.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i].t) {
      const a = k[i - 1], b = k[i], f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return { x: last.x, y: last.y };
}
