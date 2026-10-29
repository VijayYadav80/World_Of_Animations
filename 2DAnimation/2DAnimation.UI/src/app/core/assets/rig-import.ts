import type { RigDefinition } from '../models/asset.models';

/** Pure helpers for importing a character (no Angular), so they can be tested with plain node. */

/** Returns a short description of what is wrong with a rig, or null when it looks usable. */
export function rigProblem(rig: Partial<RigDefinition> | null | undefined): string | null {
  if (!rig || typeof rig !== 'object') return 'the file is empty';
  if (!Array.isArray(rig.bones) || rig.bones.length === 0) return 'it has no "bones"';
  if (typeof rig.rootBone !== 'string' || !rig.bones.some(b => b.id === rig.rootBone)) return '"rootBone" must name one of the bones';
  if (!rig.bounds) return 'it has no "bounds"';
  if (!rig.defaultPose || !rig.defaultPose.rotations) return 'it has no "defaultPose"';
  if (!rig.poses || !rig.poses.stand || !rig.poses.sit) return 'it needs "poses.stand" and "poses.sit"';
  if (!Array.isArray(rig.animations)) return 'it has no "animations" list';
  if (!rig.expressions) return 'it has no "expressions"';
  return null;
}

/** Finds the file for a part reference such as "torso.svg" (relative to partsBasePath) among the picked files. */
export function findPartFile(files: File[], partsBasePath: string, ref: string): File | undefined {
  const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
  const full = norm(partsBasePath + ref);
  const rel = (f: File) => norm((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);

  const exact = files.find(f => rel(f) === full || rel(f).endsWith('/' + full));
  if (exact) return exact;
  const base = norm(ref).split('/').pop()!;
  const byName = files.filter(f => norm(f.name) === base);
  return byName.length === 1 ? byName[0] : undefined;
}
