// Run: node --experimental-strip-types tools/render-clips.mjs out.png   (needs `sharp`)
import fs from 'node:fs'; import { createRequire } from 'node:module';
import * as E from '../2DAnimation/2DAnimation.UI/src/app/core/animation/animation-engine.ts';
const sharp = createRequire(import.meta.url)(process.env.SHARP_PATH || 'sharp');
const base = '2DAnimation/2DAnimation.UI/public/assets/characters/raju/';
const rig = JSON.parse(fs.readFileSync(base + 'rig.json', 'utf8'));
const by = {}; rig.bones.forEach(b => (by[b.parent || ''] ??= []).push(b));
const part = (b, v) => { if (!b.part) return ''; const f = b.part.src || b.part.variants[v[b.id] || b.part.defaultVariant];
  const s = fs.readFileSync(base + rig.partsBasePath + f, 'utf8'); const m = s.match(/width="(\d+)" height="(\d+)"/);
  return `<svg x="${-b.part.pivotX}" y="${-b.part.pivotY}" width="${m[1]}" height="${m[2]}" overflow="visible">${s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>`; };
const draw = (b, pose) => { const kids = (by[b.id] || []).slice().sort((x, y) => (x.z || 0) - (y.z || 0)); const o = pose.offsets?.[b.id] || { x: 0, y: 0 };
  return `<g transform="translate(${b.x + o.x} ${b.y + o.y}) rotate(${pose.rotations[b.id] || 0})">${kids.filter(k => (k.z || 0) < 0).map(k => draw(k, pose)).join('')}${part(b, pose.variants || {})}${kids.filter(k => (k.z || 0) >= 0).map(k => draw(k, pose)).join('')}</g>`; };
const root = rig.bones.find(b => b.id === rig.rootBone);
const rows = [['walk', [0, .125, .25, .375, .5, .75]], ['run', [0, .15, .3, .5, .65, .8]], ['sit', [0, .25, .5, .75, 1]], ['get-up', [0, .25, .5, .75, 1]],
              ['jump', [0, .2, .32, .55, .78, .9]], ['wave', [.3, .45, .6]], ['point', [.5]], ['talk', [.1, .2, .3]]];
const CW = 190, CH = 260, cols = 6; let cells = '';
rows.forEach(([id, ps], r) => { const c = rig.animations.find(a => a.id === id);
  ps.forEach((p, i) => { const pose = E.evaluateClip(rig, E.emptyTimeline(), { id: 'x', clipId: id, start: 0, duration: c.duration, speed: 1 }, c.duration * p);
    cells += `<g transform="translate(${i * CW + CW / 2} ${r * CH + CH - 28}) scale(0.5)">${draw(root, pose)}</g>`; });
  cells += `<text x="6" y="${r * CH + 18}" font-family="sans-serif" font-size="16" fill="#222">${id}</text>`;
  cells += `<line x1="0" x2="${cols * CW}" y1="${r * CH + CH - 28}" y2="${r * CH + CH - 28}" stroke="#a88" stroke-width="1"/>`; });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * CW}" height="${rows.length * CH}"><rect width="100%" height="100%" fill="#EAF4FA"/>${cells}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(process.argv[2] || 'clips.png'); console.log('saved');
