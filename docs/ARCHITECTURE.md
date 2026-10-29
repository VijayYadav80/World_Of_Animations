# Architecture

## Folder layout

```
2DAnimation/
  2DAnimation.API/   ASP.NET Core Web API
    Controllers/  DTOs/  Entities/  Data/  Services/  Configuration/  Migrations/
  2DAnimation.UI/    Angular app
    src/app/
      core/      API services, shared models (stage size, time unit)
      editor/    shell, toolbar, left sidebar, properties, timeline
      canvas/    stage (PixiJS from Phase 2)
      (later)    character-library, background-library, dialogue, audio, export, projects
  2DAnimation.DB/    Visual Studio database project (see "Database")
assets/              (Phase 2) characters/, backgrounds/, props/, audio/, exports/
docs/
```

## Conventions fixed in Phase 1

- **Time unit:** integer milliseconds from scene start (`core/models/scene-time.ts`).
  The timeline, animation engine, saved scene JSON and export all use it.
- **Coordinate system:** logical 1280 x 720 stage, origin top-left, +y down
  (`core/models/stage.ts`). Scenes store these units, never screen pixels.
- **Scene storage:** one JSON document per project in `Projects.SceneJson`.
  Large files (images, audio, exports) stay on disk, referenced by relative path.
- **UI/API link:** the UI always calls `/api/...`; the dev server proxies to `http://localhost:5223`.
- **Errors:** every unhandled API exception becomes a ProblemDetails response (`GlobalExceptionHandler`).

## Database

EF Core migrations are the source of truth for the schema.
The existing `2DAnimation.DB` (SSDT) project is not used by the API and is left untouched.
Keeping both would mean maintaining the schema in two places, so decide later whether to remove it.

## Platform notes

- .NET 8 reaches end of support in November 2026. This is fine for a local personal tool;
  moving to the current LTS later is a small change (TargetFramework + EF Core package versions).
- `jest-editor-support` was removed from `package.json`: it was an unused, unpinned dependency.
