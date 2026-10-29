/** Shapes of the JSON files under assets/. Keep in sync with docs/ASSETS.md. */

export interface AssetManifest {
  schemaVersion: number;
  characters: { id: string; displayName: string; rig: string }[];
  backgrounds: { id: string; displayName: string; meta: string }[];
  /**
   * Props (chairs, pots, wells ...). Optional, so an older manifest without props still loads.
   * Each entry points to a small JSON file (`meta`, like backgrounds) OR directly to an image (`image`).
   */
  props?: PropManifestEntry[];
}

export interface PropManifestEntry {
  id: string;
  displayName?: string;
  /** Path (inside assets/) of the prop's JSON definition. */
  meta?: string;
  /** Path (inside assets/) of the image, when the prop has no JSON file. */
  image?: string;
}

/** One prop: a single picture that is placed on the stage. */
export interface PropDefinition {
  schemaVersion?: number;
  id: string;
  displayName: string;
  /** Image file, relative to the folder of the JSON file (or a data URL for imported props). */
  image: string;
  /** Image size in px. Optional: measured from the picture when missing. */
  width?: number;
  height?: number;
  /** Which point of the picture sits on the prop's stage position, as a fraction of the picture (0..1).
   *  Default 0.5 / 1 = bottom centre, so a chair or a pot stands on the ground. */
  anchorX?: number;
  anchorY?: number;
  /** Scale used when the prop is added. Missing = fit to a sensible size automatically. */
  defaultScale?: number;
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
  /** Bone id -> position offset added to the bone's rig position (px). Used for hip height/shift. */
  offsets?: Record<string, { x: number; y: number }>;
  /** Bone id -> variant name, e.g. { mouth: 'open' }. */
  variants?: Record<string, string>;
}

export type Posture = 'stand' | 'sit';
export type KeyframeTrack<T> = [timeMs: number, value: T][];

/** A data-driven animation clip. Times are milliseconds. Tracks are sampled linearly (variants are stepped). */
export interface AnimationClip {
  id: string;
  displayName: string;
  duration: number;
  loop: boolean;
  /** Additive clips only animate the listed bones; everything else comes from the current posture (stand/sit). */
  additive: boolean;
  /** Posture required to start this clip ('inherit' = works in any posture). */
  startPosture: Posture | 'inherit';
  endPosture: Posture | 'inherit';
  /** 'incomplete' clips are shown in the UI as incomplete and cannot be added to the timeline. */
  status: 'complete' | 'incomplete';
  rotations: Record<string, KeyframeTrack<number>>;
  offsets: Record<string, { x?: KeyframeTrack<number>; y?: KeyframeTrack<number> }>;
  variants?: Record<string, KeyframeTrack<string>>;
  /** Ground speed in px/s at scale 1, for clips that travel (walk/run). Used to place position keyframes. */
  groundSpeed?: number;
  note?: string;
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
  animations: AnimationClip[];
  /** Full-body resting poses for each posture (used under additive clips and in gaps). */
  poses: Record<Posture, Pose>;
}
