# Phase 2 — Raju, village background, PixiJS stage

## What is included
- `public/assets/` — `manifest.json`, Raju (`rig.json` + 15 original SVG parts), `village-street-01` (SVG + metadata).
- `core/models/asset.models.ts` — typed shapes of rig / background / manifest JSON.
- `core/services/asset-manifest.service.ts` — loads and caches assets by id (nothing hardcoded to Raju).
- `core/services/scene-state.service.ts` — one scene state (signals). Stage 1280x720, origin top-left, time unit = ms.
- `canvas/rig/rig-character.ts` — generic rig loader: bone hierarchy, pivots, z-order, `applyPose`, mouth/eye variants.
- `canvas/stage.component.ts` — PixiJS 8 stage: background, character, click-select, drag-move, clamping.
- `editor/properties-panel/` — Reactive-Forms panel for X, Y, scale, rotation, flip.

## Setup
1. Copy the folders from this zip into the repo (same relative paths).
2. `cd 2DAnimation/2DAnimation.UI && npm install pixi.js@^8`
3. Check `angular.json`: the `assets` array must serve `public/` (Angular 18+ default: `{ "glob": "**/*", "input": "public" }`).
   If your project uses `src/assets` instead, move the `assets` folder to `src/assets` — URLs stay `/assets/...`.
4. In the editor component: add `StageComponent` and `PropertiesPanelComponent` to `imports`, replace the stage placeholder
   with `<app-stage />` and the right panel placeholder with `<app-properties-panel />`.
5. `npm start`, open the editor.

## Expected result
Village street background, Raju standing at ground level in the centre. Click Raju: blue selection box + panel fills in.
Drag him: X/Y update live. Change Scale / Rotation / Flip in the panel: he updates. Clicking the background deselects.

## Verified vs not verified
- Verified here: all JSON valid; all 15 part SVGs + background render; rig assembled offline with the same
  hierarchy/pivots/z-order shows connected joints (`tools/preview_rig.cjs`).
- NOT verified: Angular build, PixiJS runtime and drag behaviour (no npm / browser in my sandbox). If `ng build` or the browser
  console shows an error, paste it and I will fix it.
- Known thing to watch: SVG textures are loaded with `data: { resolution: 2 }`. If Raju looks twice as big/small, tell me.

## Adding a character / background later
Add files under `public/assets/...` and one entry in `manifest.json`. No component changes. Rigs may use any skeleton.
Tools: `tools/gen_parts.py`, `tools/gen_bg.py` regenerate the art (run from `public/`), `tools/preview_rig.cjs` previews a rig.

## Not in this phase
Animation clips, transitions, timeline (Phase 3-4). `animations` in rig.json is empty on purpose; Raju has a default pose only.
