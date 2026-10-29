# Phase 4 — Timeline, Dialogue, Audio, Lip-sync

Copy the folders from this zip over the repo (same relative paths). **No new npm packages and no extra wiring**:
`app-timeline-panel` is already in the editor shell, so the old disabled timeline is simply replaced.
Files changed from Phase 3: `playback.service.ts`, `scene-state.service.ts`, `stage.component.ts`, `toolbar.component.*`, `timeline-panel.component.*`.

## Try it
1. Click **+ Dialogue** (a Hindi sample line is added at the playhead for the selected character) and press play. Raju's bubble appears and his mouth moves with the text.
2. Edit the text in the strip above the tracks. **Fit text** sets the length from the text.
3. **Import audio** puts a voice file at the playhead; the selected character's mouth follows it.
   Or select a dialogue line and click **Attach audio**: the line takes the audio's start and length, and the bubble + mouth follow the recording.
4. Drag blocks to move them, drag the right edge of a dialogue block to change its length, click or drag the ruler to scrub.
   Delete key removes the selected block. **Preview** (toolbar) plays the scene from the start.

## What is implemented
- Timeline: transport (start / play-pause / end), speed 0.5x-2x, zoom, ruler with scrubbing, draggable playhead, auto-scroll while playing.
  One Actions row and one Dialogue row per character, plus an Audio row with waveform.
- Dialogue: Hindi speech bubble drawn in PixiJS above the character's head (stays inside the stage, never flipped).
- Audio: WAV / MP3 / OGG / M4A decoded in the browser, played in sync with the playhead (play, pause, seek, speed).
- Lip-sync: mouth open/closed from the audio loudness (one flap per syllable). Without audio it follows the text
  (Devanagari syllables, conjuncts and pauses are handled). Pure functions of time, so scrubbing is exact.
- Linked dialogue + audio move together; deleting a character removes its dialogue lines.

## Verified offline
- `node --experimental-strip-types tools/test-lipsync.mjs` — 33 checks pass (syllable-rate flapping on a synthetic voice, silence stays closed,
  Hindi syllable counting, text/audio priority, linked move/attach/remove rules).
- Changed Angular files pass `tsc --strict` against minimal type stubs of Angular and PixiJS.
- NOT verified: the real Angular build, the PixiJS bubble drawing and the browser audio (no npm / browser in my sandbox). Paste any error and I will fix it.

## Known limits
- Audio files live in memory only: after a page reload the audio blocks need re-importing (project saving is Phase 5).
- Action blocks are read-only in the timeline (the action panel still edits them), because moving them would break posture rules.
- Overlapping audio blocks are drawn on top of each other (one Audio row).
- The blue selection box is still visible during Preview; the exported video (Phase 6) will hide it.
- Lip-sync has two mouth shapes (open/closed), not phonemes. Accuracy depends on clean voice audio.
