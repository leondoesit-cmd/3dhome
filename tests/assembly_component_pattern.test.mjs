import test from 'node:test';
import assert from 'node:assert/strict';
import {setComponentPattern,replayComponentPatterns,removeComponentPattern} from '../js/core/assembly_component_pattern.js';
import {solveTopologyMates} from '../js/cad_mates.js';
import {flattenAssembly} from '../js/core/assembly_structure.js';
import {generateBOM} from '../js/cad_interference.js';
import {formSubassembly} from '../js/core/assembly_form_subassembly.js';

const assembly=()=>({components:[
  {id:'plate',name:'Plate',modelKey:'plate',grounded:true,transform:{x:0,y:0,z:0},def:{parts:[{id:'plate-solid',kind:'box',x0:0,x1:10,y0:0,y1:1,z0:0,z1:2}],features:[{id:'hole',type:'extrude',params:{operation:'subtract'}},{id:'holes',type:'pattern',params:{mode:'linear',scope:'feature',seedFeatureId:'hole',count:3,spacing:2,directionAxis:'x'}}]}},
  {id:'screw',name:'Screw',modelKey:'screw-part',configurationId:'long',grounded:false,transform:{x:1,y:1,z:1},def:{parts:[{id:'screw-solid',kind:'cyl',r:.2,h:1}],configurations:[{id:'long'},{id:'short'}]}},
],mates:[]});
const spec={id:'P',seedId:'screw',carrierId:'plate',featureId:'holes'};
const copies=a=>a.components.filter(c=>c.componentPattern);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} expected ${b}`);

test('source feature pattern creates genuine configured occurrences and BOM with stable grid IDs',()=>{
  const a=assembly(),original=JSON.stringify(a.components[0].def);
  assert.deepEqual(setComponentPattern(a,spec),[]);
  assert.equal(copies(a).length,2);
  assert.deepEqual(copies(a).map(c=>c.transform.x),[3,5]);
  assert.equal(copies(a)[0].def,a.components[1].def);
  assert.ok(copies(a).every(c=>c.configurationId==='long' && c.grounded));
  assert.equal(flattenAssembly(a).length,4);
  assert.equal(generateBOM(a).find(row=>row.name==='Screw').quantity,3);
  assert.equal(JSON.stringify(a.components[0].def),original);
  const old=copies(a)[0],id=old.id;
  a.components[0].def.features[1].params.count=4;
  replayComponentPatterns(a);
  assert.equal(copies(a).length,3);
  assert.equal(copies(a)[0],old,'stable live selection object is retained');
  assert.equal(copies(a)[0].id,id);
});

test('carrier rotation and source spacing drive offsets while seed pose/configuration drives copies',()=>{
  const a=assembly();setComponentPattern(a,spec);
  a.components[0].transform={x:20,y:30,z:0,rz:90};
  a.components[0].def.features[1].params.spacing=3;
  a.components[1].transform={x:21,y:31,z:4,rx:15};
  a.components[1].configurationId='short';a.components[1].def={parts:[{id:'new-solid',h:2}]};
  replayComponentPatterns(a);
  near(copies(a)[0].transform.x,21);near(copies(a)[0].transform.y,34);
  near(copies(a)[1].transform.y,37);
  assert.equal(copies(a)[0].transform.rx,15);
  assert.equal(copies(a)[0].configurationId,'short');
  assert.equal(copies(a)[0].def,a.components[1].def);
});

test('post-solve replay follows the moved seed and preserves assembly history/cold identity',()=>{
  const a=assembly();a.components[0].transform.x=10;
  a.mates=[{id:'seed-mate',type:'alignX',a:'plate',b:'screw'}];
  setComponentPattern(a,spec);
  const result=solveTopologyMates(a);
  assert.equal(result.ok,true);
  near(a.components[1].transform.x,10);near(copies(a)[0].transform.x,12);
  const snapshot=JSON.stringify(a),ids=copies(a).map(c=>c.id);
  a.components[0].def.features[1].params.count=5;solveTopologyMates(a);assert.equal(copies(a).length,4);
  const undone=JSON.parse(snapshot);solveTopologyMates(undone);
  assert.deepEqual(copies(undone).map(c=>c.id),ids);
  assert.equal(copies(undone)[0].def,undone.components[1].def,'cold duplicate definition is re-associated to current seed');
  removeComponentPattern(undone,'P');assert.equal(undone.components.length,2);
  assert.equal(undone.mates.length,1);
});

test('missing, suppressed or wrong source fails closed without retaining stale component geometry',()=>{
  for(const mutation of [a=>a.components[0].def.features[1].suppressed=true,a=>a.components[0].def.features=[],a=>a.components[0].def.features[1].params.mode='circular',a=>a.components.splice(1,1)]){
    const a=assembly();setComponentPattern(a,spec);mutation(a);
    const issues=replayComponentPatterns(a);
    assert.equal(issues[0].code,'component-pattern-invalid');assert.equal(copies(a).length,0);
  }
});

test('independent mate constraints on generated copies are explicitly rejected',()=>{
  const a=assembly();setComponentPattern(a,spec);
  a.topologyMates=[{id:'unsupported',type:'coincident',a:{componentId:copies(a)[0].id},b:{componentId:'plate'}}];
  const issues=replayComponentPatterns(a);
  assert.match(issues[0].message,/independent mates/);assert.equal(copies(a).length,0);
});

test('two-direction skipped grid follows source ordering and stable IDs after replay',()=>{
  const a=assembly();Object.assign(a.components[0].def.features[1].params,{axisX:true,axisY:true,countX:3,countY:2,spacingX:2,spacingY:4,skipInstances:'2'});
  setComponentPattern(a,spec);
  assert.equal(copies(a).length,4);
  const ids=copies(a).map(c=>c.id);replayComponentPatterns(a);assert.deepEqual(copies(a).map(c=>c.id),ids);
  const frozen=JSON.stringify(a);assert.throws(()=>setComponentPattern(a,{...spec,seedId:'plate'}));
  assert.equal(JSON.stringify(a),frozen,'refused create has no history/model mutation');
});

test('pattern dependencies cannot be detached by forming a subassembly, and bad poses fail closed',()=>{
  const a=assembly();setComponentPattern(a,spec);
  const before=JSON.stringify(a);
  const result=formSubassembly(a,['plate','screw'],{id:'sub',key:'subkey',name:'Sub'});
  assert.equal(result.ok,false);assert.equal(result.issues[0].code,'unsupported-subassembly-component-pattern');
  assert.equal(JSON.stringify(a),before);
  a.components[0].transform.rz=Infinity;
  assert.match(replayComponentPatterns(a)[0].message,/finite/);
  assert.equal(copies(a).length,0);
});
