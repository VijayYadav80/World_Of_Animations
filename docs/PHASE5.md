# Phase 5 — Save / Open projects (+ character size, background fit fix)

Copy the files over the repo (same relative paths). **No new npm / NuGet packages, no database migration** (the existing `Projects.SceneJson` column is used).

## Extra step
Add this line to `.gitignore` (audio files are stored here and should not be committed):
`/2DAnimation/2DAnimation.API/storage/`

## What changed
- **Character size**: Properties panel now has a Size slider, −/+ buttons, Small/Medium/Large/Reset presets.
  On the stage, the selected character has a white round handle (top-right corner): drag it to resize.
  Range 10% – 400%.
- **Background fit fix**: the stage was measuring the whole editor grid instead of its own cell, so it was too big and got cut off.
  It now measures its own cell. The background also uses "cover" fit (no stretching for non-16:9 images).
- **Save / Open (Phase 5)**: toolbar has New / Open / Save (Ctrl+S), project name box, save status, Auto-save.
  Scene JSON -> database. Imported audio files -> `API/storage/projects/{projectId}/audio/{assetId}`.
  The last project is re-opened automatically on startup.

## API (new)
`GET /api/projects/{id}`, `PUT /api/projects/{id}`, `DELETE /api/projects/{id}`,
`PUT /api/projects/{id}/audio/{assetId}` (raw bytes), `GET /api/projects/{id}/audio/{assetId}`.
Storage folder can be moved with `"Storage": { "Root": "D:\\woa-data" }` in appsettings.

## Verified
- `ng build` (Angular 19 + PixiJS 8) compiles with no errors.
- NOT verified: C# API (no .NET SDK / NuGet in my sandbox) and the browser behaviour (resize handle, fit, save/open round trip).

## Known limits
- Auto-save only runs for projects that were saved once. Unused audio files stay on disk until the project is deleted.
- Walk/Run distance is calculated when the action is added; resizing afterwards does not change already-added keyframes.
