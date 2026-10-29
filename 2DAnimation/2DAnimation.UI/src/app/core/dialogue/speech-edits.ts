import type { AudioClip, DialogueClip, SpeechData } from '../models/dialogue.models';

/** Pure edit helpers for dialogue/audio clips. SceneStateService calls these; tools/test-lipsync.mjs tests them. */

export const MIN_DIALOGUE_MS = 200;

/** Moves a dialogue line. A linked audio clip moves with it, by the same amount. */
export function moveDialogue(s: SpeechData, id: string, start: number): SpeechData {
  const d = s.dialogues.find(x => x.id === id);
  if (!d) return s;
  const a = d.audioId ? s.audioClips.find(x => x.id === d.audioId) : undefined;
  const delta = Math.max(Math.round(start) - d.start, -d.start, a ? -a.start : -Infinity);
  return {
    dialogues: s.dialogues.map(x => (x.id === id ? { ...x, start: x.start + delta } : x)),
    audioClips: a ? s.audioClips.map(x => (x.id === a.id ? { ...x, start: x.start + delta } : x)) : s.audioClips,
  };
}

/** Moves an audio clip. The dialogue line linked to it moves with it. */
export function moveAudio(s: SpeechData, id: string, start: number): SpeechData {
  const a = s.audioClips.find(x => x.id === id);
  if (!a) return s;
  const d = s.dialogues.find(x => x.audioId === id);
  const delta = Math.max(Math.round(start) - a.start, -a.start, d ? -d.start : -Infinity);
  return {
    dialogues: d ? s.dialogues.map(x => (x.id === d.id ? { ...x, start: x.start + delta } : x)) : s.dialogues,
    audioClips: s.audioClips.map(x => (x.id === id ? { ...x, start: x.start + delta } : x)),
  };
}

/** Changes the length of an unlinked dialogue line (a linked one always follows its audio). */
export function resizeDialogue(s: SpeechData, id: string, duration: number): SpeechData {
  const d = s.dialogues.find(x => x.id === id);
  if (!d || d.audioId) return s;
  const dur = Math.max(MIN_DIALOGUE_MS, Math.round(duration));
  return { ...s, dialogues: s.dialogues.map(x => (x.id === id ? { ...x, duration: dur } : x)) };
}

export function patchDialogue(s: SpeechData, id: string, patch: Partial<Pick<DialogueClip, 'text' | 'characterId'>>): SpeechData {
  return { ...s, dialogues: s.dialogues.map(x => (x.id === id ? { ...x, ...patch } : x)) };
}

/** Puts `audio` under the dialogue line: same start and character, line length = audio length. Replaces older audio. */
export function attachAudio(s: SpeechData, dialogueId: string, audio: AudioClip): SpeechData {
  const d = s.dialogues.find(x => x.id === dialogueId);
  if (!d) return s;
  const placed: AudioClip = { ...audio, start: d.start, characterId: d.characterId };
  return {
    dialogues: s.dialogues.map(x => (x.id === dialogueId ? { ...x, audioId: placed.id, duration: placed.duration } : x)),
    audioClips: [...s.audioClips.filter(x => x.id !== d.audioId && x.id !== placed.id), placed],
  };
}

/** Copies a dialogue line right after the original (same text and character, no audio). */
export function duplicateDialogue(s: SpeechData, id: string, newId: string): SpeechData {
  const d = s.dialogues.find(x => x.id === id);
  if (!d) return s;
  return { ...s, dialogues: [...s.dialogues, { ...d, id: newId, start: d.start + d.duration, audioId: undefined }] };
}

/** Copies an audio clip right after the original (same file, same lip-sync character; not linked to any dialogue line). */
export function duplicateAudio(s: SpeechData, id: string, newId: string): SpeechData {
  const a = s.audioClips.find(x => x.id === id);
  if (!a) return s;
  return { ...s, audioClips: [...s.audioClips, { ...a, id: newId, start: a.start + a.duration }] };
}

export const MIN_AUDIO_PART_MS = 100;

/**
 * Cuts an audio clip in two at timeline time `t`. Both parts play exactly what the original played (no gap, no repeat):
 * the second part starts later in the same file (offset). Returns null when `t` is not inside the clip
 * or too close to an edge (each part must be at least MIN_AUDIO_PART_MS long).
 * A dialogue line linked to the clip stays with the FIRST part and shrinks to its length; the second part is plain audio.
 */
export function splitAudio(s: SpeechData, id: string, t: number, newId: string): SpeechData | null {
  const a = s.audioClips.find(x => x.id === id);
  if (!a) return null;
  const cut = Math.round(t) - a.start;
  if (cut < MIN_AUDIO_PART_MS || cut > a.duration - MIN_AUDIO_PART_MS) return null;
  const first: AudioClip = { ...a, duration: cut };
  const second: AudioClip = { ...a, id: newId, start: a.start + cut, duration: a.duration - cut, offset: (a.offset ?? 0) + cut };
  return {
    dialogues: s.dialogues.map(x => (x.audioId === id ? { ...x, duration: cut } : x)),
    audioClips: s.audioClips.flatMap(x => (x.id === id ? [first, second] : [x])),
  };
}

export function removeAudio(s: SpeechData, id: string): SpeechData {
  return {
    dialogues: s.dialogues.map(x => (x.audioId === id ? { ...x, audioId: undefined } : x)),
    audioClips: s.audioClips.filter(x => x.id !== id),
  };
}

export function removeDialogue(s: SpeechData, id: string): SpeechData {
  return { ...s, dialogues: s.dialogues.filter(x => x.id !== id) };
}

/** When a character is deleted: its lines go away, its audio stays on the track but stops driving a mouth. */
export function removeCharacterSpeech(s: SpeechData, characterId: string): SpeechData {
  return {
    dialogues: s.dialogues.filter(x => x.characterId !== characterId),
    audioClips: s.audioClips.map(x => (x.characterId === characterId ? { ...x, characterId: undefined } : x)),
  };
}

export function speechEnd(s: SpeechData): number {
  return Math.max(0, ...s.dialogues.map(x => x.start + x.duration), ...s.audioClips.map(x => x.start + x.duration));
}
