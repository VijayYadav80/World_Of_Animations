import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, ViewChild, effect, inject, signal,
} from '@angular/core';
import { Application, Assets, Circle, Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { evaluatePose, evaluatePosition } from '../core/animation/animation-engine';
import { activeDialogue, mouthState } from '../core/dialogue/lipsync';
import { DialogueClip } from '../core/models/dialogue.models';
import { AudioService } from '../core/services/audio.service';
import { AssetManifestService } from '../core/services/asset-manifest.service';
import { PlaybackService } from '../core/services/playback.service';
import { CharacterInstance, SceneStateService, STAGE_HEIGHT, STAGE_WIDTH } from '../core/services/scene-state.service';
import { RigCharacter } from './rig/rig-character';

interface CharacterView {
  holder: Container;      // positioned/scaled/rotated/flipped by scene state
  rig: RigCharacter;
  selection: Graphics;
  /** Round grip at the corner of the selection box: drag it to make the character bigger or smaller. */
  handle: Graphics;
  /** Speech bubble (lives in bubbleLayer so it is never flipped or scaled with the character). */
  bubble: Container;
  bubbleBg: Graphics;
  bubbleLabel: Text;
  bubbleText: string;
  bubbleTail: number;
}

/** Bone whose variants ('open' / 'closed') are driven by lip-sync. */
const MOUTH_BONE = 'mouth';
const BUBBLE_PAD = 18;
const BUBBLE_TAIL = 16;
const BUBBLE_FONT = "'Noto Sans Devanagari', 'Nirmala UI', 'Mangal', 'Segoe UI', system-ui, sans-serif";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const MIN_CHARACTER_SCALE = 0.1;
export const MAX_CHARACTER_SCALE = 4;
const HANDLE_RADIUS = 11;

/** 16:9 PixiJS stage. Renders the scene state; user drags write back into the scene state. */
@Component({
  selector: 'app-stage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #wrap class="stage-wrap">
      <div #host class="stage-host"></div>
      @if (error(); as e) { <div class="stage-msg stage-error" role="alert">{{ e }}</div> }
      @else if (loading()) { <div class="stage-msg">Loading stage…</div> }
    </div>
  `,
  styles: [`
    /* Fills the centre panel without influencing its size; the 16:9 box inside is sized in JS (letterbox fit). */
    :host { position: absolute; inset: 0; display: block; overflow: hidden; background: var(--stage-backdrop, #0b0c0f); border-radius: inherit; }
    /* faint dotted grid behind the stage, like a design canvas */
    :host::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(color-mix(in srgb, var(--text) 9%, transparent) 1px, transparent 1px); background-size: 22px 22px; pointer-events: none; }
    .stage-wrap { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: #0e0f12; border-radius: 12px; overflow: hidden; box-shadow: 0 0 0 1px rgba(255, 255, 255, .08), 0 24px 60px rgba(0, 0, 0, .5); }
    .stage-host { position: absolute; inset: 0; }
    .stage-msg { position: absolute; inset: 0; display: grid; place-items: center; color: #c9ccd3; font: 14px system-ui, sans-serif; text-align: center; padding: 16px; }
    .stage-error { color: #ff9b8f; }
  `],
})
export class StageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) private host!: ElementRef<HTMLDivElement>;
  @ViewChild('wrap', { static: true }) private wrap!: ElementRef<HTMLDivElement>;
  private readonly self = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;

  private readonly scene = inject(SceneStateService);
  private readonly assets = inject(AssetManifestService);
  private readonly zone = inject(NgZone);
  private readonly playback = inject(PlaybackService);
  private readonly audio = inject(AudioService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private app?: Application;
  private world = new Container();
  private backgroundLayer = new Container();
  private characterLayer = new Container();
  private bubbleLayer = new Container();
  private readonly views = new Map<string, CharacterView>();
  private readonly creating = new Set<string>();
  private currentBackgroundId: string | null = null;
  private dragging?: { id: string; dx: number; dy: number };
  /** Active drag of the size handle: scale = startScale * (pointer distance from the feet / startDist). */
  private resizing?: { id: string; startDist: number; startScale: number };
  private destroyed = false;
  private ready = signal(false);
  private groundY = 640;

  constructor() {
    // Re-sync whenever the scene state or the stage readiness changes.
    effect(() => {
      if (!this.ready()) return;
      const state = this.scene.state();
      const selectedId = this.scene.selectedId();
      void this.syncBackground(state.backgroundId);
      this.syncCharacters(state.characters, selectedId);
    });
  }

  async ngAfterViewInit(): Promise<void> {
    this.setupFit();
    try {
      const app = new Application();
      // Pixi's render loop must not trigger Angular change detection on every frame.
      await this.zone.runOutsideAngular(() => app.init({
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        background: '#1b1d22',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      }));
      if (this.destroyed) { app.destroy(true, { children: true }); return; }
      this.app = app;
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.display = 'block';
      app.canvas.style.touchAction = 'none';
      this.host.nativeElement.appendChild(app.canvas);

      app.stage.eventMode = 'static';
      app.stage.hitArea = new Rectangle(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      app.stage.on('pointerdown', (e: FederatedPointerEvent) => { if (e.target === app.stage) this.scene.select(null); });
      app.stage.on('pointermove', (e: FederatedPointerEvent) => this.onDragMove(e));
      app.stage.on('pointerup', () => this.endDrag());
      app.stage.on('pointerupoutside', () => this.endDrag());

      // Every frame: pose + position come from the deterministic engine at the current playhead time.
      app.ticker.add(() => this.tick());
      this.characterLayer.sortableChildren = true;
      this.bubbleLayer.eventMode = 'none';
      this.world.addChild(this.backgroundLayer, this.characterLayer, this.bubbleLayer);
      app.stage.addChild(this.world);

      // First run: put the default background + first character on the stage.
      if (!this.scene.state().backgroundId) {
        const manifest = await this.assets.getManifest();
        const bg = manifest.backgrounds[0];
        const ch = manifest.characters[0];
        if (bg && !this.scene.state().backgroundId) this.scene.setBackground(bg.id);
        if (ch && this.scene.state().characters.length === 0) {
          const { def } = bg ? await this.assets.getBackground(bg.id) : { def: undefined };
          // A saved project may have been opened while the assets were loading: do not add a second character then.
          if (this.scene.state().characters.length === 0) {
            this.scene.addCharacter(ch.id, STAGE_WIDTH / 2, def?.groundY ?? this.groundY, def?.defaultCharacterScale ?? 0.8);
          }
        }
      }
      this.ready.set(true);
      this.loading.set(false);
    } catch (e) {
      this.fail(e);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.views.forEach(v => v.rig.destroy());
    this.views.clear();
    this.app?.destroy(true, { children: true });
    this.app = undefined;
  }

  /**
   * Keeps the 16:9 stage fully visible inside the centre panel.
   * BUG FIX: this used to measure the *parent* (the whole editor grid), so the stage was sized for the full window
   * and its edges were cut off by the side panels / timeline. The host element itself is the centre grid cell, so measure that.
   */
  private setupFit(): void {
    const el = this.self.nativeElement as HTMLElement;
    const parent = el.parentElement;
    if (!parent) return;
    // :host is position:absolute; inset:0 -> it needs a positioned parent to be placed inside its grid cell.
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const pad = 8; // small breathing room around the stage
      const k = Math.min((w - pad * 2) / STAGE_WIDTH, (h - pad * 2) / STAGE_HEIGHT);
      if (k <= 0) return;
      this.wrap.nativeElement.style.width = `${Math.floor(STAGE_WIDTH * k)}px`;
      this.wrap.nativeElement.style.height = `${Math.floor(STAGE_HEIGHT * k)}px`;
    };
    fit();
    this.resizeObserver = new ResizeObserver(fit);
    this.resizeObserver.observe(el);
    this.resizeObserver.observe(parent);
  }

  private fail(e: unknown): void {
    console.error(e);
    this.loading.set(false);
    this.error.set(e instanceof Error ? e.message : String(e));
  }

  private async syncBackground(id: string | null): Promise<void> {
    if (!id || id === this.currentBackgroundId) return;
    this.currentBackgroundId = id;
    try {
      const { def, baseUrl } = await this.assets.getBackground(id);
      const tex = await Assets.load<Texture>({ src: baseUrl + def.image, data: { resolution: 2 } });
      if (this.destroyed || this.currentBackgroundId !== id) return;
      this.backgroundLayer.removeChildren().forEach(c => c.destroy());
      const sprite = new Sprite(tex);
      // "Cover" fit: the image always fills the whole 16:9 stage without stretching (extra edges are cropped, centred).
      // A 16:9 background (like the village street) fits exactly; photos of other shapes no longer look squashed.
      const k = Math.max(STAGE_WIDTH / tex.width, STAGE_HEIGHT / tex.height);
      sprite.scale.set(k);
      sprite.position.set((STAGE_WIDTH - tex.width * k) / 2, (STAGE_HEIGHT - tex.height * k) / 2);
      sprite.eventMode = 'none';      // background never reacts to pointer, so it can't be dragged by accident
      const mask = new Graphics().rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT).fill(0xffffff);
      mask.eventMode = 'none';
      sprite.mask = mask;
      this.backgroundLayer.addChild(sprite, mask);
      this.groundY = def.groundY;
    } catch (e) {
      this.currentBackgroundId = null;
      this.fail(e);
    }
  }

  private tick(): void {
    const selectedId = this.scene.selectedId();
    const t = this.playback.time();
    const { characters, dialogues, audioClips } = this.scene.state();
    for (const inst of characters) {
      const view = this.views.get(inst.instanceId);
      if (!view) continue;
      const pose = evaluatePose(view.rig.def, inst.timeline, t);
      // Lip-sync: while the character speaks, the mouth follows the audio (or the text) instead of the pose.
      const mouth = mouthState(inst.instanceId, t, dialogues, audioClips, id => this.audio.mouthTrack(id));
      if (mouth) pose.variants = { ...(pose.variants ?? {}), [MOUTH_BONE]: mouth };
      view.rig.applyPose(pose);
      const pos = evaluatePosition(inst.timeline, t);
      this.applyInstance(view, inst, inst.instanceId === selectedId, pos);
      this.updateBubble(view, inst, pos, activeDialogue(dialogues, inst.instanceId, t));
    }
  }

  /** Shows the speech bubble above the character's head while a dialogue line is active. */
  private updateBubble(view: CharacterView, inst: CharacterInstance, pos: { x: number; y: number } | undefined, line?: DialogueClip): void {
    const text = line?.text.trim();
    if (!text) { view.bubble.visible = false; return; }
    const p = pos ?? { x: inst.x, y: inst.y };
    if (view.bubbleText !== text) { view.bubbleLabel.text = text; view.bubbleText = text; view.bubbleTail = -1; }
    const w = view.bubbleLabel.width + BUBBLE_PAD * 2;
    const h = view.bubbleLabel.height + BUBBLE_PAD * 2;
    const left = clamp(p.x - w / 2, 10, Math.max(10, STAGE_WIDTH - w - 10));
    const tail = Math.round(clamp(p.x - left, 24, Math.max(24, w - 24)) / 2) * 2;
    if (tail !== view.bubbleTail) {
      view.bubbleTail = tail;
      view.bubbleBg.clear();
      view.bubbleBg.roundRect(0, 0, w, h, 18).fill(0xffffff).stroke({ width: 3, color: 0x20232b });
      view.bubbleBg.poly([tail - 11, h - 1.5, tail + 11, h - 1.5, tail, h + BUBBLE_TAIL]).fill(0xffffff);
      view.bubbleBg.moveTo(tail - 11, h).lineTo(tail, h + BUBBLE_TAIL).lineTo(tail + 11, h).stroke({ width: 3, color: 0x20232b });
    }
    view.bubbleLabel.position.set(BUBBLE_PAD, BUBBLE_PAD);
    const top = p.y + view.rig.def.bounds.y * inst.scale - 6 - h - BUBBLE_TAIL;
    view.bubble.position.set(left, Math.max(8, top));
    view.bubble.visible = true;
  }

  private syncCharacters(instances: CharacterInstance[], selectedId: string | null): void {
    // remove deleted
    for (const [id, view] of this.views) {
      if (!instances.some(i => i.instanceId === id)) { view.rig.destroy(); view.holder.destroy({ children: true }); view.bubble.destroy({ children: true }); this.views.delete(id); }
    }
    for (const inst of instances) {
      const view = this.views.get(inst.instanceId);
      if (view) this.applyInstance(view, inst, inst.instanceId === selectedId);
      else if (!this.creating.has(inst.instanceId)) void this.createView(inst);
    }
  }

  private async createView(inst: CharacterInstance): Promise<void> {
    this.creating.add(inst.instanceId);
    try {
      const { def, baseUrl } = await this.assets.getRig(inst.characterId);
      const rig = await RigCharacter.load(def, baseUrl);
      if (this.destroyed) { rig.destroy(); return; }

      const holder = new Container();
      const b = def.bounds;
      const selection = new Graphics()
        .rect(b.x, b.y, b.width, b.height)
        .stroke({ width: 2, color: 0x4da3ff, alpha: 0.9 });
      selection.eventMode = 'none';
      const handle = new Graphics()
        .circle(0, 0, HANDLE_RADIUS).fill(0xffffff).stroke({ width: 3, color: 0x4da3ff });
      handle.eventMode = 'static';
      handle.cursor = 'nwse-resize';
      handle.hitArea = new Circle(0, 0, HANDLE_RADIUS + 8);
      handle.visible = false;
      handle.on('pointerdown', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        const cur = this.scene.state().characters.find(c => c.instanceId === inst.instanceId);
        if (!cur) return;
        const p = e.getLocalPosition(this.world);
        const at = evaluatePosition(cur.timeline, this.playback.time()) ?? { x: cur.x, y: cur.y };
        this.scene.select(inst.instanceId);
        this.resizing = { id: inst.instanceId, startDist: Math.max(20, Math.hypot(p.x - at.x, p.y - at.y)), startScale: cur.scale };
      });
      holder.addChild(rig.root, selection, handle);
      holder.eventMode = 'static';
      holder.cursor = 'move';
      holder.hitArea = new Rectangle(b.x, b.y, b.width, b.height);
      holder.on('pointerdown', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        const cur = this.scene.state().characters.find(c => c.instanceId === inst.instanceId);
        if (!cur) return;
        const p = e.getLocalPosition(this.world);
        const at = evaluatePosition(cur.timeline, this.playback.time()) ?? { x: cur.x, y: cur.y };
        this.scene.select(inst.instanceId);
        this.dragging = { id: inst.instanceId, dx: at.x - p.x, dy: at.y - p.y };
      });
      this.characterLayer.addChild(holder);

      const bubble = new Container();
      const bubbleBg = new Graphics();
      const bubbleLabel = new Text({
        text: '',
        style: { fontFamily: BUBBLE_FONT, fontSize: 28, fill: 0x1a1c22, align: 'center', wordWrap: true, wordWrapWidth: 340, lineHeight: 40 },
      });
      bubble.addChild(bubbleBg, bubbleLabel);
      bubble.eventMode = 'none';
      bubble.visible = false;
      this.bubbleLayer.addChild(bubble);

      const view: CharacterView = { holder, rig, selection, handle, bubble, bubbleBg, bubbleLabel, bubbleText: '', bubbleTail: -1 };
      this.views.set(inst.instanceId, view);
      const latest = this.scene.state().characters.find(c => c.instanceId === inst.instanceId) ?? inst;
      this.applyInstance(view, latest, this.scene.selectedId() === inst.instanceId);
    } catch (e) {
      this.fail(e);
    } finally {
      this.creating.delete(inst.instanceId);
    }
  }

  private applyInstance(view: CharacterView, inst: CharacterInstance, selected: boolean, pos?: { x: number; y: number }): void {
    const h = view.holder;
    const p = pos ?? { x: inst.x, y: inst.y };
    h.position.set(p.x, p.y);
    h.scale.set(inst.flipX ? -inst.scale : inst.scale, inst.scale);
    h.rotation = ((inst.flipX ? -inst.rotation : inst.rotation) * Math.PI) / 180;
    h.zIndex = p.y; // lower on screen = in front
    view.selection.visible = selected;
    // The handle sits on the top-right corner *as seen on screen* (mirrored when the character is flipped)
    // and is counter-scaled so it keeps the same size however big or small the character is.
    const b = view.rig.def.bounds;
    view.handle.visible = selected;
    view.handle.position.set(inst.flipX ? b.x : b.x + b.width, b.y);
    view.handle.scale.set(1 / Math.max(inst.scale, 0.01));
  }

  private endDrag(): void {
    this.dragging = undefined;
    this.resizing = undefined;
  }

  private onDragMove(e: FederatedPointerEvent): void {
    if (this.resizing) {
      const r = this.resizing;
      const cur = this.scene.state().characters.find(c => c.instanceId === r.id);
      if (!cur) return;
      const p = e.getLocalPosition(this.world);
      const at = evaluatePosition(cur.timeline, this.playback.time()) ?? { x: cur.x, y: cur.y };
      const dist = Math.hypot(p.x - at.x, p.y - at.y);
      const scale = clamp(r.startScale * (dist / r.startDist), MIN_CHARACTER_SCALE, MAX_CHARACTER_SCALE);
      this.scene.updateCharacter(r.id, { scale: Math.round(scale * 100) / 100 });
      return;
    }
    if (!this.dragging) return;
    const p = e.getLocalPosition(this.world);
    const x = Math.min(STAGE_WIDTH, Math.max(0, p.x + this.dragging.dx));
    const y = Math.min(STAGE_HEIGHT, Math.max(0, p.y + this.dragging.dy));
    this.scene.moveCharacter(this.dragging.id, Math.round(x), Math.round(y), this.playback.time());
  }
}
