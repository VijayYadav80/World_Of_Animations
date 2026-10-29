// Offline sanity check: assembles the rig (same hierarchy / pivots / z-order as the PixiJS loader) and renders a PNG.
const fs=require('fs'),path=require('path');
const sharp=require('/home/claude/.npm-global/lib/node_modules/sharp');
const base='assets/characters/raju/';
const rig=JSON.parse(fs.readFileSync(base+'rig.json','utf8'));
const pose=process.argv[2]?JSON.parse(process.argv[2]):rig.defaultPose.rotations;
const variants=rig.defaultPose.variants;
const byParent={};rig.bones.forEach(b=>(byParent[b.parent||'']=byParent[b.parent||'']||[]).push(b));
function partSvg(b){
  if(!b.part)return '';
  const f=b.part.src||b.part.variants[variants[b.id]||b.part.defaultVariant];
  const s=fs.readFileSync(base+rig.partsBasePath+f,'utf8');
  const m=s.match(/width="(\d+)" height="(\d+)"/);
  return `<svg x="${-b.part.pivotX}" y="${-b.part.pivotY}" width="${m[1]}" height="${m[2]}" viewBox="0 0 ${m[1]} ${m[2]}" overflow="visible">${s.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>`;
}
function render(b){
  const kids=(byParent[b.id]||[]).slice().sort((a,c)=>(a.z||0)-(c.z||0));
  const neg=kids.filter(k=>(k.z||0)<0),pos=kids.filter(k=>(k.z||0)>=0);
  return `<g transform="translate(${b.x} ${b.y}) rotate(${pose[b.id]||0})">${neg.map(render).join('')}${partSvg(b)}${pos.map(render).join('')}</g>`;
}
const root=rig.bones.find(b=>b.id===rig.rootBone);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="520" viewBox="-250 -450 500 520"><rect x="-250" y="-450" width="500" height="520" fill="#CDE8F5"/><rect x="-250" y="0" width="500" height="70" fill="#C8A26E"/>${render(root)}<circle r="4" fill="red"/></svg>`;
sharp(Buffer.from(svg)).png().toFile(process.argv[3]||'/tmp/raju.png').then(()=>console.log('rendered'));
