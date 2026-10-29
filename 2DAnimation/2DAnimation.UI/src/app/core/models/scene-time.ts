/**
 * Single time unit used by the timeline, animation engine and saved scenes:
 * integer MILLISECONDS from scene start.
 */
export type Ms = number;

/** Formats milliseconds as mm:ss.mmm */
export function formatTime(ms: Ms): string {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

function pad(value: number, width: number): string {
  return value.toString().padStart(width, '0');
}
