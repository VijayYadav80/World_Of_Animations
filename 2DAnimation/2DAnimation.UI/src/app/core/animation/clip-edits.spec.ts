import type { RigDefinition } from '../models/asset.models';
import { CharacterTimeline } from './animation-engine';
import { duplicateClip, resizeClip } from './clip-edits';

const rig = { animations: [
  { id: 'walk', displayName: 'Walk', loop: true, duration: 1000, groundSpeed: 100, startPosture: 'stand', endPosture: 'inherit', status: 'complete' },
  { id: 'talk', displayName: 'Talk', loop: true, duration: 1000, startPosture: 'stand', endPosture: 'inherit', status: 'complete' },
  { id: 'sit', displayName: 'Sit', loop: false, duration: 1000, startPosture: 'stand', endPosture: 'sit', status: 'complete' },
], poses: {}, defaultPose: { rotations: {} } } as unknown as RigDefinition;
const P = { scale: 1, flipX: false };
const clip = (id: string, clipId: string, start: number, duration: number) => ({ id, clipId, start, duration, speed: 1 });
const timeline = (): CharacterTimeline => ({
  clips: [clip('w1', 'walk', 0, 3000), clip('t', 'talk', 3000, 2000), clip('w2', 'walk', 5000, 2000)],
  positionKeys: [{ t: 0, x: 100, y: 600 }, { t: 3000, x: 400, y: 600 }, { t: 5000, x: 400, y: 600 }, { t: 7000, x: 600, y: 600 }],
});

describe('clip-edits', () => {
  it('lengthening a walk moves it further and slides everything after it', () => {
    const r = resizeClip(rig, P, timeline(), 'w1', 4000);
    expect(r.clips.map(c => [c.id, c.start, c.duration])).toEqual([['w1', 0, 4000], ['t', 4000, 2000], ['w2', 6000, 2000]]);
    expect(r.positionKeys.map(k => [k.t, k.x])).toEqual([[0, 100], [4000, 500], [6000, 500], [8000, 700]]);
  });

  it('shortening a non-walk action pulls later actions in without moving the character', () => {
    const r = resizeClip(rig, P, timeline(), 't', 500);
    expect(r.clips.map(c => c.start)).toEqual([0, 3000, 3500]);
    expect(r.positionKeys.map(k => [k.t, k.x])).toEqual([[0, 100], [3000, 400], [3500, 400], [5500, 600]]);
  });

  it('never goes below the minimum length', () => {
    expect(resizeClip(rig, P, timeline(), 't', 5).clips[1].duration).toBe(100);
  });

  it('duplicates an action right after itself', () => {
    const d = duplicateClip(rig, P, timeline(), 't', 'copy');
    expect(d.ok).toBeTrue();
    if (d.ok) {
      expect(d.timeline.clips.map(c => [c.id, c.start]).sort()).toEqual([['copy', 5000], ['t', 3000], ['w1', 0], ['w2', 7000]]);
      expect(d.timeline.positionKeys.map(k => [k.t, k.x])).toEqual([[0, 100], [3000, 400], [7000, 400], [9000, 600]]);
    }
  });

  it('refuses to repeat Sit right after Sit', () => {
    const tl: CharacterTimeline = { clips: [clip('s', 'sit', 0, 1000)], positionKeys: [] };
    expect(duplicateClip(rig, P, tl, 's', 'x').ok).toBeFalse();
  });
});
