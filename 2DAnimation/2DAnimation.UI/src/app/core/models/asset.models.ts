/** Shapes of the JSON files under assets/. Keep in sync with docs/ASSETS.md. */

export interface AssetManifest {
  schemaVersion: number;
  characters: { id: string; displayName: string; rig: string }[];
  backgrounds: { id: string; displayName: string; meta: string }[];
}

export interface BackgroundDefinition {
  schemaVersion: number;
  id: string;
  displayName: string;
  assetVersion: string;
  image: string;
  width: number;
  height: number;
  /** Stage Y (px, top-left origin) where a character's feet should stand. */
  groundY: number;
  defaultCharacterScale: number;
}

export interface BonePart {
  /** Single image. Use `variants` instead for swappable parts (eyes, mouth). */
  src?: string;
  variants?: Record<string, string>;
  defaultVariant?: string;
  /** Pivot inside the part image, in image pixels. This point sits on the bone origin. */
  pivotX: number;
  pivotY: number;
}

export interface BoneDefinition {
  id: string;
  parent: string | null;
  /** Bone origin relative to the parent bone origin (px, y down). */
  x: number;
  y: number;
  /** Draw order among siblings (and the bone's own image, which is z = 0). */
  z?: number;
  part?: BonePart;
}

export interface Pose {
  /** Bone id -> rotation in degrees (positive = clockwise on screen). */
  rotations: Record<string, number>;
  /** Bone id -> variant name, e.g. { mouth: 'open' }. */
  variants?: Record<string, string>;
}

export interface RigDefinition {
  schemaVersion: number;
  id: string;
  displayName: string;
  assetVersion: string;
  partsBasePath: string;
  facing: 'left' | 'right';
  /** Local box around the character origin (feet) used for clicking/selection. */
  bounds: { x: number; y: number; width: number; height: number };
  rootBone: string;
  bones: BoneDefinition[];
  defaultPose: Pose;
  expressions: Record<string, Record<string, string>>;
  /** Filled in Phase 3. */
  animations: unknown[];
}
