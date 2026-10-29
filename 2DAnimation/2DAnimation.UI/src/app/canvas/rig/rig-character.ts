import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { BoneDefinition, Pose, RigDefinition } from '../../core/models/asset.models';

interface BoneNode {
  def: BoneDefinition;
  container: Container;
  sprite?: Sprite;
  textures: Map<string, Texture>;
}

const DEG = Math.PI / 180;

/**
 * Generic skeletal character built from any rig.json. Nothing here knows about Raju.
 * Each bone is a Container (origin = joint). Its image is a Sprite whose pivot sits on that joint,
 * so rotating a bone swings the limb and all child bones around the joint.
 * Local origin of `root` = the character's feet (ground contact point).
 */
export class RigCharacter {
  readonly root = new Container();
  private readonly bones = new Map<string, BoneNode>();

  private constructor(readonly def: RigDefinition) {}

  static async load(def: RigDefinition, baseUrl: string): Promise<RigCharacter> {
    const rig = new RigCharacter(def);
    const partsUrl = baseUrl + def.partsBasePath;

    // 1. Load every texture first so a missing file fails loudly before anything is shown.
    const loads: Promise<void>[] = [];
    for (const b of def.bones) {
      const node: BoneNode = { def: b, container: new Container(), textures: new Map() };
      rig.bones.set(b.id, node);
      if (!b.part) continue;
      const files = b.part.variants ?? (b.part.src ? { default: b.part.src } : {});
      for (const [name, file] of Object.entries(files)) {
        loads.push(
          Assets.load<Texture>({ src: partsUrl + file, data: { resolution: 2 } })
            .then(tex => { node.textures.set(name, tex); })
            .catch(err => { throw new Error(`Rig "${def.id}": cannot load part "${file}" for bone "${b.id}" (${err})`); })
        );
      }
    }
    await Promise.all(loads);

    // 2. Build the hierarchy.
    for (const node of rig.bones.values()) {
      const { def: b, container } = node;
      container.sortableChildren = true;
      container.position.set(b.x, b.y);
      container.zIndex = b.z ?? 0;
      if (b.part) {
        const first = b.part.defaultVariant ?? Object.keys(b.part.variants ?? { default: 1 })[0];
        const sprite = new Sprite(node.textures.get(first));
        sprite.pivot.set(b.part.pivotX, b.part.pivotY);
        sprite.zIndex = 0; // own image sits between negative-z and positive-z child bones
        container.addChild(sprite);
        node.sprite = sprite;
      }
    }
    for (const node of rig.bones.values()) {
      const parent = node.def.parent ? rig.bones.get(node.def.parent) : undefined;
      if (node.def.parent && !parent) throw new Error(`Rig "${def.id}": bone "${node.def.id}" has unknown parent "${node.def.parent}"`);
      (parent ? parent.container : rig.root).addChild(node.container);
    }
    rig.root.sortableChildren = true;
    rig.applyPose(def.defaultPose);
    return rig;
  }

  /** Sets joint rotations (degrees) and optional part variants. Bones not in the pose keep rotation 0. */
  applyPose(pose: Pose): void {
    for (const node of this.bones.values()) {
      node.container.rotation = (pose.rotations[node.def.id] ?? 0) * DEG;
    }
    for (const [boneId, variant] of Object.entries(pose.variants ?? {})) this.setVariant(boneId, variant);
  }

  setVariant(boneId: string, variant: string): void {
    const node = this.bones.get(boneId);
    const tex = node?.textures.get(variant);
    if (node?.sprite && tex) node.sprite.texture = tex;
  }

  setExpression(name: string): void {
    const ex = this.def.expressions[name];
    if (!ex) return;
    for (const [boneId, variant] of Object.entries(ex)) this.setVariant(boneId, variant);
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.bones.clear();
  }
}
