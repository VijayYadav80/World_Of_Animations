# Adding scenes, characters, dialogue and audio

## Scenes (backgrounds)
**Scenes** tab -> **+ Add scene image**. Pick a PNG, JPG, WebP or SVG (landscape, 16:9 fits best, max 15 MB).
The image fills the whole stage (cropped in the centre if the shape differs). Your scenes show a **Mine** badge and a bin button.
They are stored in this browser (IndexedDB) on this computer. Nothing is uploaded.

Permanent scenes that ship with the app live in `2DAnimation.UI/public/assets/backgrounds/<id>/` and are listed in `assets/manifest.json`.

## Characters
**Cast** tab -> **+ Import folder** (the character folder that contains `rig.json` and `parts/`) or **+ Import files**
(select `rig.json` and all part images together). Every character shows a live preview rendered from its rig.

A character needs a valid `rig.json` (same format as the shipped ones, see `models/asset.models.ts`): `bones`, `rootBone`,
`bounds`, `defaultPose`, `poses.stand` and `poses.sit`, `animations`, `expressions`. If something is wrong the panel says what.
Every part image the rig refers to must be present, otherwise the import lists the missing files.
Imported characters are stored in this browser, like scenes. To make one permanent, copy its folder to `public/assets/characters/<id>/` and add it to `manifest.json`.

## Dialogue
**Lines** tab: choose who speaks, type the Hindi text, **+ Add line**. It is placed at the playhead and shown as a speech bubble.
Edit text, start and length in the strip above the timeline. Drag the block to move it, drag its right edge to resize it.

## Audio
**Audio** tab: **+ Import audio** (WAV, MP3, OGG, M4A) puts a voice recording at the playhead; the chosen character's mouth follows the sound.
Select a dialogue line first and use **Attach audio to the selected line** to tie the recording to that line.

## Timeline
Drag the small handle on the top edge of the timeline to make it taller or shorter.

## Limits
- Imported scenes and characters live in one browser. A project saved on the server that uses them opens correctly only in that same browser.
- Audio is kept in memory; after a reload it must be re-imported unless the project was saved (the server stores the audio bytes).
- One scene (one background) per project. Several scenes/shots in one video is not built yet.
