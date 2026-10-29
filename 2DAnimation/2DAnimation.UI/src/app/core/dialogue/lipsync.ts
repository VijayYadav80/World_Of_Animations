import type { AudioClip, DialogueClip, MouthTrack } from '../models/dialogue.models';

/** Pure and deterministic: the mouth is a function of (time, clips, audio analysis). Scrubbing is exact. */

export const DEFAULT_HOP_MS = 20;

/** RMS loudness per `hopMs` window. */
export function computeEnvelope(samples: Float32Array, sampleRate: number, hopMs = DEFAULT_HOP_MS): Float32Array {
  const hop = Math.max(1, Math.round((sampleRate * hopMs) / 1000));
  const n = Math.ceil(samples.length / hop);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * hop, e = Math.min(samples.length, s + hop);
    let sum = 0;
    for (let j = s; j < e; j++) sum += samples[j] * samples[j];
    out[i] = e > s ? Math.sqrt(sum / (e - s)) : 0;
  }
  return out;
}

/**
 * Turns loudness into open/closed frames. A frame is "open" when it is loud enough AND not much quieter than
 * its surroundings, so the mouth flaps once per syllable instead of staying open through the whole sentence.
 */
export function buildMouthTrack(env: Float32Array, hopMs = DEFAULT_HOP_MS): MouthTrack {
  const n = env.length;
  const open = new Uint8Array(n);
  if (n === 0) return { hopMs, open };
  const sorted = Array.from(env).sort((a, b) => a - b);
  const p90 = sorted[Math.min(n - 1, Math.floor(n * 0.9))];
  const ref = Math.max(p90, 0.35 * sorted[n - 1]);
  if (ref < 1e-4) return { hopMs, open };

  const level = (i: number) => env[i] / ref;
  const W = 5;
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { sum += level(j); cnt++; }
    const l = level(i);
    open[i] = l >= 0.22 && l >= 0.85 * (sum / cnt) ? 1 : 0;
  }
  // Clean-up: drop 1-frame blips, bridge 1-frame holes.
  for (let i = 1; i < n - 1; i++) if (open[i] === 1 && open[i - 1] === 0 && open[i + 1] === 0) open[i] = 0;
  for (let i = 1; i < n - 1; i++) if (open[i] === 0 && open[i - 1] === 1 && open[i + 1] === 1) open[i] = 1;
  return { hopMs, open };
}

export function trackOpenAt(track: MouthTrack, localMs: number): boolean {
  if (localMs < 0) return false;
  const idx = Math.floor(localMs / track.hopMs);
  return idx < track.open.length && track.open[idx] === 1;
}

// ---------------------------------------------------------------- text-based fallback (no audio)

interface SpeechUnit { weight: number; voiced: boolean }
const unitCache = new Map<string, SpeechUnit[]>();

const isDevLetter = (c: number) => (c >= 0x0904 && c <= 0x0939) || (c >= 0x0958 && c <= 0x0961);
const isDevMark = (c: number) =>
  (c >= 0x0900 && c <= 0x0903) || c === 0x093a || c === 0x093b || c === 0x093c || (c >= 0x093e && c <= 0x094c) ||
  (c >= 0x094e && c <= 0x094f) || (c >= 0x0951 && c <= 0x0957) || c === 0x0962 || c === 0x0963;
const isDevDigit = (c: number) => c >= 0x0966 && c <= 0x096f;
const PUNCT = /[\u0964\u0965.,!?;:\u2014\u2013\-\u2026"'()]/;

/** Splits text into rough syllables (voiced) and pauses. Works for Devanagari (conjuncts merge) and Latin. */
export function speechUnits(text: string): SpeechUnit[] {
  const cached = unitCache.get(text);
  if (cached) return cached;
  const units: SpeechUnit[] = [];
  const pause = (w: number) => {
    const last = units[units.length - 1];
    if (last && !last.voiced) last.weight = Math.max(last.weight, w);
    else units.push({ weight: w, voiced: false });
  };
  let afterVirama = false, prevLatinVowel = false;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c === 0x094d) { afterVirama = true; continue; }
    if (isDevMark(c)) continue;
    if (isDevLetter(c)) {
      if (!afterVirama) units.push({ weight: 1, voiced: true });
      afterVirama = false; prevLatinVowel = false; continue;
    }
    afterVirama = false;
    if (isDevDigit(c) || /[0-9]/.test(ch)) { units.push({ weight: 1, voiced: true }); prevLatinVowel = false; continue; }
    if (/\s/.test(ch)) { pause(0.5); prevLatinVowel = false; continue; }
    if (PUNCT.test(ch)) { pause(1.2); prevLatinVowel = false; continue; }
    if (/[aeiouAEIOU]/.test(ch)) { if (!prevLatinVowel) units.push({ weight: 1, voiced: true }); prevLatinVowel = true; continue; }
    prevLatinVowel = false;
    if (/\p{L}/u.test(ch) && !/[a-zA-Z]/.test(ch)) units.push({ weight: 1, voiced: true }); // other scripts: one unit per letter
  }
  if (unitCache.size > 200) unitCache.clear();
  unitCache.set(text, units);
  return units;
}

export function countSyllables(text: string): number {
  return speechUnits(text).filter(u => u.voiced).length;
}

/** Natural-ish speaking time for text: about 190 ms per syllable plus pauses. */
export function estimateSpeechMs(text: string): number {
  const units = speechUnits(text);
  const ms = units.reduce((s, u) => s + (u.voiced ? 190 : u.weight * 220), 0) + 300;
  return Math.max(800, Math.round(ms / 50) * 50);
}

/** Mouth open/closed for text spoken evenly over `durationMs`. */
export function textMouthAt(text: string, localMs: number, durationMs: number): boolean {
  if (durationMs <= 0 || localMs < 0 || localMs >= durationMs) return false;
  const units = speechUnits(text);
  const total = units.reduce((s, u) => s + u.weight, 0);
  if (total === 0 || !units.some(u => u.voiced)) return false;
  const pos = (localMs / durationMs) * total;
  let acc = 0;
  for (const u of units) {
    if (pos < acc + u.weight) return u.voiced && (pos - acc) / u.weight < 0.62;
    acc += u.weight;
  }
  return false;
}

// ---------------------------------------------------------------- scene queries

/** The dialogue line a character is speaking at time t (latest start wins when lines overlap). */
export function activeDialogue(dialogues: DialogueClip[], characterId: string, t: number): DialogueClip | undefined {
  let found: DialogueClip | undefined;
  for (const d of dialogues) {
    if (d.characterId === characterId && d.start <= t && t < d.start + d.duration && (!found || d.start >= found.start)) found = d;
  }
  return found;
}

/** Position inside the audio FILE for timeline time `t` (a split clip does not start at the beginning of its file). */
export function audioLocalMs(a: AudioClip, t: number): number {
  return t - a.start + (a.offset ?? 0);
}

export type MouthLookup = (assetId: string) => MouthTrack | undefined;

/**
 * Mouth state for a character at time t, or null when the character is not speaking
 * (the pose's own mouth, e.g. from the Talk action, is left alone).
 * Priority: audio assigned to the character > audio linked to its dialogue > the dialogue text itself.
 */
export function mouthState(
  characterId: string, t: number, dialogues: DialogueClip[], audioClips: AudioClip[], lookup: MouthLookup,
): 'open' | 'closed' | null {
  for (const a of audioClips) {
    if (a.characterId !== characterId || t < a.start || t >= a.start + a.duration) continue;
    const track = lookup(a.assetId);
    if (track) return trackOpenAt(track, audioLocalMs(a, t)) ? 'open' : 'closed';
  }
  const d = activeDialogue(dialogues, characterId, t);
  if (!d) return null;
  const linked = d.audioId ? audioClips.find(a => a.id === d.audioId) : undefined;
  const track = linked ? lookup(linked.assetId) : undefined;
  if (linked && track) return trackOpenAt(track, audioLocalMs(linked, t)) ? 'open' : 'closed';
  return textMouthAt(d.text, t - d.start, d.duration) ? 'open' : 'closed';
}
