// Run: node --experimental-strip-types tools/test-lipsync.mjs   (from repo root)
import * as L from '../2DAnimation/2DAnimation.UI/src/app/core/dialogue/lipsync.ts';
import * as S from '../2DAnimation/2DAnimation.UI/src/app/core/dialogue/speech-edits.ts';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

// ---- synthetic "speech": 4 syllables/s bursts of a 180 Hz tone, 0.5 s silence at start and end
const SR = 16000, SECS = 4;
const x = new Float32Array(SR * SECS);
for (let i = 0; i < x.length; i++) {
  const t = i / SR;
  if (t < 0.5 || t >= SECS - 0.5) continue;
  const burst = Math.max(0, Math.sin(2 * Math.PI * 4 * (t - 0.5)));   // 4 Hz syllable envelope
  x[i] = burst * burst * Math.sin(2 * Math.PI * 180 * t) * 0.6;
}
const env = L.computeEnvelope(x, SR);
ok(env.length === SECS * 50, `envelope has one value per 20 ms (${env.length})`);
const tr = L.buildMouthTrack(env);
const runs = (arr, from, to) => { let n = 0, prev = 0; for (let i = from; i < to; i++) { if (arr[i] && !prev) n++; prev = arr[i]; } return n; };
const speechRuns = runs(tr.open, 25, 175);
ok(speechRuns >= 10 && speechRuns <= 14, `mouth flaps about once per syllable: ${speechRuns} open runs for 12 syllables`);
ok(tr.open.slice(0, 22).every(v => v === 0) && tr.open.slice(180).every(v => v === 0), 'mouth stays closed in silence');
const frac = tr.open.slice(25, 175).reduce((a, b) => a + b, 0) / 150;
ok(frac > 0.3 && frac < 0.8, `open fraction while speaking is natural (${(frac * 100).toFixed(0)}%)`);
ok(L.buildMouthTrack(new Float32Array(100)).open.every(v => v === 0), 'pure silence = always closed');
ok(L.buildMouthTrack(new Float32Array(0)).open.length === 0, 'empty audio does not crash');
ok(L.trackOpenAt(tr, -5) === false && L.trackOpenAt(tr, 99999) === false, 'lookup outside the audio is closed');
ok(L.trackOpenAt(tr, 700) === !!tr.open[35], 'lookup maps time to the right frame');

// ---- text fallback
ok(L.countSyllables('नमस्ते, मैं राजू हूँ।') === 7, `Hindi syllables: ${L.countSyllables('नमस्ते, मैं राजू हूँ।')} (expected 7)`);
ok(L.countSyllables('hello') === 2, 'Latin: hello = 2');
ok(L.countSyllables('') === 0 && L.countSyllables('।।।  ,,') === 0, 'no voiced units in empty / punctuation-only text');
const T = 'नमस्ते, मैं राजू हूँ।', D = 2500;
let openCount = 0, N = 500; for (let i = 0; i < N; i++) if (L.textMouthAt(T, (i / N) * D, D)) openCount++;
ok(openCount / N > 0.25 && openCount / N < 0.65, `text mouth opens about half the time (${((openCount / N) * 100).toFixed(0)}%)`);
ok(L.textMouthAt(T, -1, D) === false && L.textMouthAt(T, D, D) === false, 'text mouth closed outside the line');
ok(L.textMouthAt(T, 1234, D) === L.textMouthAt(T, 1234, D), 'text mouth is deterministic');
ok(L.estimateSpeechMs('') === 800 && L.estimateSpeechMs(T) > L.estimateSpeechMs('नमस्ते'), 'estimated speech time grows with text');

// ---- mouthState priority
const dlg = [{ id: 'd1', characterId: 'raju', text: T, start: 1000, duration: 2500 }];
const noLookup = () => undefined;
ok(L.mouthState('raju', 500, dlg, [], noLookup) === null, 'not speaking -> null (pose mouth untouched)');
ok(L.mouthState('other', 1500, dlg, [], noLookup) === null, 'other character is not affected');
ok(['open', 'closed'].includes(L.mouthState('raju', 1500, dlg, [], noLookup)), 'dialogue without audio uses text lip-sync');
const allOpen = { hopMs: 20, open: new Uint8Array(500).fill(1) }, allClosed = { hopMs: 20, open: new Uint8Array(500) };
const au = [{ id: 'a1', name: 'v.wav', assetId: 'A', start: 1000, duration: 2500, characterId: 'raju' }];
ok(L.mouthState('raju', 1500, dlg, au, id => (id === 'A' ? allOpen : undefined)) === 'open', 'audio assigned to character drives the mouth (open)');
ok(L.mouthState('raju', 1500, dlg, au, id => (id === 'A' ? allClosed : undefined)) === 'closed', 'audio assigned to character drives the mouth (closed)');
const linked = [{ ...dlg[0], audioId: 'a1' }], au2 = [{ ...au[0], characterId: undefined }];
ok(L.mouthState('raju', 1500, linked, au2, id => (id === 'A' ? allOpen : undefined)) === 'open', 'audio linked to a dialogue line drives the mouth');
ok(L.mouthState('raju', 1500, linked, au2, noLookup) !== null, 'missing audio analysis falls back to text');
ok(L.activeDialogue(dlg, 'raju', 999) === undefined && L.activeDialogue(dlg, 'raju', 1000)?.id === 'd1' && L.activeDialogue(dlg, 'raju', 3500) === undefined, 'activeDialogue uses [start, start+duration)');

// ---- speech edits
const base = { dialogues: [{ id: 'd1', characterId: 'raju', text: 'hi', start: 1000, duration: 1500 }], audioClips: [] };
const aud = { id: 'a1', name: 'v.wav', assetId: 'A', start: 0, duration: 2000 };
let s = S.attachAudio(base, 'd1', aud);
ok(s.audioClips[0].start === 1000 && s.audioClips[0].characterId === 'raju' && s.dialogues[0].duration === 2000 && s.dialogues[0].audioId === 'a1', 'attachAudio aligns start, character and length');
s = S.moveDialogue(s, 'd1', 3000);
ok(s.dialogues[0].start === 3000 && s.audioClips[0].start === 3000, 'moving the line moves its audio');
s = S.moveAudio(s, 'a1', 500);
ok(s.dialogues[0].start === 500 && s.audioClips[0].start === 500, 'moving the audio moves its line');
s = S.moveAudio(s, 'a1', -900);
ok(s.dialogues[0].start === 0 && s.audioClips[0].start === 0, 'cannot move before 0 (pair stays together)');
ok(S.resizeDialogue(s, 'd1', 5000).dialogues[0].duration === 2000, 'a linked line cannot be resized');
ok(S.resizeDialogue(base, 'd1', 50).dialogues[0].duration === S.MIN_DIALOGUE_MS, 'minimum line length');
const s2 = S.attachAudio(s, 'd1', { ...aud, id: 'a2', duration: 800 });
ok(s2.audioClips.length === 1 && s2.audioClips[0].id === 'a2' && s2.dialogues[0].duration === 800, 'attaching again replaces the old audio');
const s3 = S.removeAudio(s2, 'a2');
ok(s3.audioClips.length === 0 && s3.dialogues[0].audioId === undefined, 'removing audio unlinks the line');
ok(S.removeDialogue(s2, 'd1').audioClips.length === 1, 'removing a line keeps its audio on the track');
const s4 = S.removeCharacterSpeech(s2, 'raju');
ok(s4.dialogues.length === 0 && s4.audioClips[0].characterId === undefined, 'deleting a character removes its lines, keeps audio');
ok(S.speechEnd(s2) === 800 && S.speechEnd({ dialogues: [], audioClips: [] }) === 0, 'speechEnd');

console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
