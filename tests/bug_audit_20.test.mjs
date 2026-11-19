import test from 'node:test';
import assert from 'node:assert/strict';
import {copySketchForClipboard,pasteSketchGeometry} from '../js/core/sketch_clipboard.js';
import {evaluateExpression,expandUnitLiterals} from '../js/sketch_equations.js';
import {sampleHelix,normalizeHelixSpec,helixFrameAt,circularHelixSweepProfile} from '../js/cad_helix.js';
import {computeMassProperties} from '../js/cad_interference.js';
import {parseColor} from '../js/core/color_science.js';
import {parseSketchDimensionEntry} from '../js/core/sketch_dimension_entry.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const box={kind:'box',x0:0,x1:2,y0:0,y1:2,z0:0,z1:2};
const helix={radius:1,pitch:1,turns:2};
function pastedPattern(type) {
  const source={points:[{id:'p',x:0,y:0},{id:'q',x:2,y:0}],
    entities:[{id:'e',type:'ellipse',c:'p',rx:2,ry:1},{id:'f',type:'ellipse',c:'q',rx:2,ry:1}],
    constraints:[{id:'c',type,center:'p',pairs:[['p','q']],spins:[['e','f']],shapes:[['e','f']],patternTranslation:type==='distance'}]};
  let id=100;
  return pasteSketchGeometry(copySketchForClipboard(source),()=>id++);
}
test('01 pasted circular patterns retain point and ellipse rotation relations',()=>{
  const p=pastedPattern('rotation'),c=p.constraints[0];
  assert.deepEqual(c.pairs,[[p.points[0].id,p.points[1].id]]);
  assert.deepEqual(c.spins,[[p.entities[0].id,p.entities[1].id]]);
});
test('02 pasted linear patterns retain translation and ellipse shape relations',()=>{
  const p=pastedPattern('distance'),c=p.constraints[0];
  assert.deepEqual(c.pairs,[[p.points[0].id,p.points[1].id]]);
  assert.deepEqual(c.shapes,[[p.entities[0].id,p.entities[1].id]]);
});
test('03 scientific notation works inside arithmetic equations',()=>{
  near(evaluateExpression('1e-3 * 2 + 2E+1'),20.002);
  const entry=parseSketchDimensionEntry('1e-3 * 2',{type:'distance'},'in');
  near(entry.value,.002*2.54);
  assert.equal(entry.expr,null,'numeric calculations retain document-unit input semantics');
});
test('04 scientific notation with explicit length units preserves magnitude',()=>{
  near(evaluateExpression(expandUnitLiterals('1e-3mm + 2E+1mm','length')) ,2.0001);
  near(evaluateExpression(expandUnitLiterals('.5MM + 1e-1CM','length')),.15);
});
test('05 unit-like suffixes inside variable names remain variable names',()=>{
  near(evaluateExpression(expandUnitLiterals('Width10mm + 2mm','length'),name=>name==='Width10mm'?3:undefined),3.2);
});
test('06 exponentiation binds before unary minus and accepts signed powers',()=>{
  assert.equal(evaluateExpression('-2^2'),-4);
  assert.equal(evaluateExpression('(-2)^2'),4);
  assert.equal(evaluateExpression('2^-2'),.25);
});
test('07 excessive expression nesting reports a controlled parser error',()=>{
  for(const expression of ['('.repeat(1000)+'1'+')'.repeat(1000),'-'.repeat(1000)+'1',Array(1000).fill('1').join('^')])
    assert.throws(()=>evaluateExpression(expression),/nests too deeply/);
});
test('08 nonfinite numeric expressions are refused like nonfinite strings',()=>{
  for(const n of [Infinity,-Infinity,NaN])assert.throws(()=>evaluateExpression(n),/not a number/);
});
test('09 helix sampling honors the resolution stored on the curve',()=>{
  assert.equal(sampleHelix({...helix,segmentsPerTurn:8}).points.length,17);
  assert.equal(sampleHelix({...helix,segmentsPerTurn:8},{segmentsPerTurn:16}).points.length,33);
});
test('10 a zero helix axis cannot silently collapse the curve',()=>{
  assert.throws(()=>normalizeHelixSpec({...helix,axis:{x:0,y:0,z:0}}),/axis/i);
  assert.deepEqual(normalizeHelixSpec({...helix,axis:'x'}).axis,{x:1,y:0,z:0});
});
test('11 helix frames clamp to the same endpoints as helix points',()=>{
  for(const t of [-2,2]){
    const f=helixFrameAt(helix,t),end=helixFrameAt(helix,t<0?0:1);
    near(Math.hypot(f.tangent.x,f.tangent.y,f.tangent.z),1);
    assert.deepEqual(f,end);
  }
});
test('12 circular sweep profiles reject infinite diameter before generating geometry',()=>{
  assert.throws(()=>circularHelixSweepProfile(helix,Infinity),/finite/);
});
test('13 mass properties measure typed-array mesh positions',()=>{
  const a=[0,0,0],b=[2,0,0],c=[0,2,0],d=[0,0,2];
  const positions=new Float32Array([a,c,b,a,b,d,a,d,c,b,c,d].flat());
  const mass=computeMassProperties({parts:[{kind:'mesh',meshData:{positions}}]});
  assert.equal(mass.volumeCm3,1.33);
  assert.deepEqual(mass.centerOfMass,{x:.5,y:.5,z:.5});
  assert.equal(mass.unmeasured,0);
});
test('14 temporary preview bodies do not add mass to the document',()=>{
  const mass=computeMassProperties({parts:[box,{...box,previewOnly:true}]});
  assert.equal(mass.volumeCm3,8);
});
test('15 pattern rotations move the mass centroid about their actual pivot',()=>{
  const mass=computeMassProperties({parts:[{...box,patternRotations:[{axis:'z',angle:Math.PI/2,pivot:{x:3,y:0,z:0}}]}]});
  assert.equal(mass.volumeCm3,8);
  assert.deepEqual(mass.centerOfMass,{x:2,y:-2,z:1});
});
test('16 an unmeasurable body does not poison mass values for valid bodies',()=>{
  const mass=computeMassProperties({parts:[box,{...box,x1:NaN}]});
  assert.equal(mass.volumeCm3,8);
  assert.equal(mass.unmeasured,1);
  assert.deepEqual(mass.centerOfMass,{x:1,y:1,z:1});
});
test('17 invalid infinite density falls back to the default finite density',()=>{
  const mass=computeMassProperties({parts:[box]},{density:Infinity});
  assert.equal(mass.density,7.85);
  assert.ok(Number.isFinite(mass.massKg));
});
test('18 malformed hex colors return null instead of NaN or partial channels',()=>{
  for(const text of ['#ggg','#1z22aa','#112233x0'])assert.equal(parseColor(text),null);
});
test('19 signed CSS RGB channels and alpha are accepted and clamped',()=>{
  assert.deepEqual(parseColor('rgb(-10 +20 300 / -0.5)'),{r:0,g:20,b:255,a:0});
});
test('20 out-of-range HSL percentages clamp before conversion to RGB',()=>{
  assert.deepEqual(parseColor('hsl(0, 200%, 50%)'),{r:255,g:0,b:0,a:1});
  assert.deepEqual(parseColor('hsl(120, 100%, 150%)'),{r:255,g:255,b:255,a:1});
});
