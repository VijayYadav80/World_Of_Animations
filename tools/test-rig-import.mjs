// Run from the repo root:  node --experimental-strip-types tools/test-rig-import.mjs
import { readFileSync } from 'node:fs';
import { findPartFile, rigProblem } from '../2DAnimation/2DAnimation.UI/src/app/core/assets/rig-import.ts';

const root = '2DAnimation/2DAnimation.UI/public/assets/';
let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name); };

// 1. every shipped character must be importable
const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
for (const c of manifest.characters) {
  const rig = JSON.parse(readFileSync(root + c.rig, 'utf8'));
  check(`shipped rig "${c.id}" passes validation (${rigProblem(rig) ?? 'ok'})`, rigProblem(rig) === null);
}

// 2. broken rigs are rejected with a reason
check('empty object rejected', rigProblem({}) !== null);
check('null rejected', rigProblem(null) !== null);
check('missing poses rejected', /poses/.test(rigProblem({ bones: [{ id: 'a' }], rootBone: 'a', bounds: {}, defaultPose: { rotations: {} }, animations: [], expressions: {} }) ?? ''));

// 3. part files are found by relative path or by unique name
const f = (name, rel) => Object.assign({ name }, rel ? { webkitRelativePath: rel } : {});
const files = [f('rig.json', 'meena/rig.json'), f('torso.svg', 'meena/parts/torso.svg'), f('head.svg', 'meena/parts/head.svg')];
check('found by relative path', findPartFile(files, 'parts/', 'torso.svg') === files[1]);
check('found by name only', findPartFile([f('head.svg')], 'parts/', 'head.svg')?.name === 'head.svg');
check('ambiguous name not guessed', findPartFile([f('a.svg', 'x/a.svg'), f('a.svg', 'y/a.svg')], 'parts/', 'a.svg') === undefined);
check('missing file reported', findPartFile(files, 'parts/', 'foot.svg') === undefined);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
