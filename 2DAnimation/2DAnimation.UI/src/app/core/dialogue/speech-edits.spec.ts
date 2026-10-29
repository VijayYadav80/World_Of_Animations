import type { SpeechData } from '../models/dialogue.models';
import { audioLocalMs, mouthState } from './lipsync';
import { splitAudio } from './speech-edits';

const make = (): SpeechData => ({
  dialogues: [{ id: 'd', characterId: 'c', text: 'hi', start: 1000, duration: 4000, audioId: 'a' }],
  audioClips: [{ id: 'a', name: 'v', assetId: 'x', start: 1000, duration: 4000, characterId: 'c' }],
});

describe('splitAudio', () => {
  it('cuts the clip in two with no gap and no repeat', () => {
    const r = splitAudio(make(), 'a', 3500, 'b')!;
    expect(r.audioClips.map(a => [a.id, a.start, a.duration, a.offset ?? 0])).toEqual([['a', 1000, 2500, 0], ['b', 3500, 1500, 2500]]);
  });

  it('keeps the linked dialogue with the first part', () => {
    expect(splitAudio(make(), 'a', 3500, 'b')!.dialogues[0].duration).toBe(2500);
  });

  it('chains offsets when a part is split again', () => {
    const once = splitAudio(make(), 'a', 3500, 'b')!;
    const twice = splitAudio(once, 'b', 4000, 'c')!;
    expect(twice.audioClips.map(a => a.offset ?? 0)).toEqual([0, 2500, 3000]);
  });

  it('refuses a cut at or near the edges or outside the clip', () => {
    expect(splitAudio(make(), 'a', 1050, 'z')).toBeNull();
    expect(splitAudio(make(), 'a', 4950, 'z')).toBeNull();
    expect(splitAudio(make(), 'a', 9000, 'z')).toBeNull();
  });

  it('lip-sync reads the matching part of the file', () => {
    const r = splitAudio(make(), 'a', 3500, 'b')!;
    const track = { hopMs: 100, open: Uint8Array.from({ length: 50 }, (_, i) => (i >= 25 ? 1 : 0)) };
    expect(audioLocalMs(r.audioClips[1], 3500)).toBe(2500);
    expect(mouthState('c', 3600, r.dialogues, r.audioClips, () => track)).toBe('open');
    expect(mouthState('c', 2000, r.dialogues, r.audioClips, () => track)).toBe('closed');
  });
});
