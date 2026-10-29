// Run: node --experimental-strip-types tools/test-engine.mjs   (from repo root)
import fs from 'node:fs';
import * as E from '../2DAnimation/2DAnimation.UI/src/app/core/animation/animation-engine.ts';
const rig = JSON.parse(fs.readFileSync('2DAnimation/2DAnimation.UI/public/assets/characters/raju/rig.json', 'utf8'));
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const tl = E.emptyTimeline(); let t = 0;
const add = (clipId, dur) => { const c = rig.animations.find(a => a.id === clipId); const r = E.canAppend(rig, tl, clipId);
  ok(r.ok, `append ${clipId} allowed`); tl.clips.push({ id: clipId + t, clipId, start: t, duration: dur ?? c.duration, speed: 1 }); t += dur ?? c.duration; };
add('walk', 3000); add('idle', 800); add('sit'); add('talk', 2000); add('get-up'); add('walk', 2000);
ok(!E.canAppend(rig, { clips: [{ id: 'a', clipId: 'sit', start: 0, duration: 800, speed: 1 }], positionKeys: [] }, 'walk').ok, 'walk rejected while sitting');
const a = JSON.stringify(E.evaluatePose(rig, tl, 4321)), b = (E.evaluatePose(rig, tl, 100), E.evaluatePose(rig, tl, 9000), JSON.stringify(E.evaluatePose(rig, tl, 4321)));
ok(a === b, 'deterministic: scrub away and back gives the identical pose');
const sitEnd = E.evaluatePose(rig, tl, 3000 + 800 + 800 - 1);
ok(Math.abs(sitEnd.rotations.upperLegF - -90) < 3, `seated thigh ~ -90 (got ${sitEnd.rotations.upperLegF.toFixed(1)})`);
const talkMid = E.evaluatePose(rig, tl, 5000);
ok(Math.abs(talkMid.rotations.upperLegF - -90) < 1 && Math.abs(talkMid.offsets.hip.y - rig.poses.sit.offsets.hip.y) < 1, 'talk keeps seated posture (additive)');
ok(['open', 'closed'].includes(talkMid.variants.mouth), 'talk drives the mouth variant');
const w0 = E.evaluatePose(rig, tl, 400), w1 = E.evaluatePose(rig, tl, 900);
ok(Math.abs(w0.rotations.upperLegF - w1.rotations.upperLegF) > 5, 'walk legs move over time');
const gu = E.evaluatePose(rig, tl, 3000 + 800 + 800 + 2000 + 900 - 1);
ok(Math.abs(gu.rotations.upperLegF - rig.defaultPose.rotations.upperLegF) < 4, 'get-up ends standing');
// ground contact: lowest foot point == 0 for grounded clips
const FC = [[-14, 14], [42, 14]]; const Rr = (a, x, y) => { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); return [x * c - y * s, x * s + y * c]; };
const lowest = p => { let m = -1e9; for (const [sd, hx] of [['F', 8], ['B', -8]]) { const u = p.rotations['upperLeg' + sd], l = p.rotations['lowerLeg' + sd], f = p.rotations['foot' + sd];
  const k = Rr(u, 0, 80), an = Rr(u + l, 0, 84); const ay = k[1] + an[1]; for (const [cx, cy] of FC) m = Math.max(m, ay + Rr(u + l + f, cx, cy)[1]); } return -178 + (p.offsets?.hip?.y ?? 0) + m; };
for (const id of ['walk', 'run', 'sit', 'get-up', 'idle']) { let worst = 0; const c = rig.animations.find(x => x.id === id);
  for (let i = 0; i <= 40; i++) { const p = E.evaluateClip(rig, { clips: [], positionKeys: [] }, { id: 'x', clipId: id, start: 0, duration: c.duration, speed: 1 }, c.duration * i / 40); worst = Math.max(worst, Math.abs(lowest(p))); }
  ok(worst < (id === 'run' ? 13 : 1.5), `${id}: feet stay on ground (max error ${worst.toFixed(2)}px${id === 'run' ? ', includes 12px flight' : ''})`); }
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
