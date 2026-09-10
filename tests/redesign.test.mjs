import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBaselines, normalizeRedesign, redesignPolicy, generatedChangePermission, captureProtectedStructure, validateProtectedStructure, compareBaseline, mergeBaselineArchives } from '../js/redesign.js';
import { redesignCommand } from '../js/commands/redesign.js';
import { executeCommand } from '../js/commands/executor.js';
function fixture() {
  const scene = { nodes: [{x:0,z:0},{x:300,z:0},{x:300,z:300}], walls: [{id:1,a:0,b:1},{id:2,a:1,b:2}], openings: [{id:3,wall:1,s:100,width:80}], items: [] };
  const baselines = normalizeBaselines([{id:'b',floorId:'f',name:'Existing',scene}]);
  return {...structuredClone(scene), workspace:{id:'p',documentKey:'d',activeFloor:'f',baselines,redesign:{f:{baselineId:'b',allowedWallIds:[]}}}};
}
test('baseline archive deeply isolates snapshots and ignores invalid imports', () => {
  const s=fixture(); assert.throws(()=>s.workspace.baselines[0].scene.nodes[0].x=10,TypeError);
  s.nodes[0].x=42; assert.equal(s.workspace.baselines[0].scene.nodes[0].x,0);
  assert.equal(normalizeBaselines([{id:'bad',floorId:'f',scene:42}]).length,0);
  assert.deepEqual(normalizeRedesign({f:{baselineId:'missing'}},s.workspace.baselines),{});
  const altered=normalizeBaselines([{...s.workspace.baselines[0],name:'Changed'}]);
  assert.equal(mergeBaselineArchives(s.workspace.baselines,altered)[0].name,'Existing');
});
test('scope gates generated structure per floor and permits furniture', () => {
  const s=fixture();
  for(const id of ['wall.draw','room.create','room.stamp','document.generate_apartment','document.import_blueprint']) assert.equal(generatedChangePermission(s,id).ok,false,id);
  assert.equal(generatedChangePermission(s,'document.generate_apartment',{replace:false}).ok,false);
  assert.equal(generatedChangePermission(s,'item.move').ok,true);
  s.workspace.redesign.f.allowedWallIds=['1'];
  assert.equal(generatedChangePermission(s,'opening.place',{wallId:1}).ok,true);
  assert.equal(generatedChangePermission(s,'opening.place',{wallId:2}).ok,false);
  s.workspace.redesign.f.allowedWallIds=['1','2'];
  assert.equal(generatedChangePermission(s,'document.generate_apartment').ok,true);
  s.workspace.activeFloor='other'; assert.equal(redesignPolicy(s),null);
});
test('protected geometry catches shared endpoint edits and hosted opening changes', () => {
  const s=fixture(), before=captureProtectedStructure(s);
  s.items.push({id:8,x:20,z:20}); assert.equal(validateProtectedStructure(before,s).ok,true);
  s.nodes[1].x++; assert.equal(validateProtectedStructure(before,s).ok,false); s.nodes[1].x--;
  s.openings[0].width++; assert.equal(validateProtectedStructure(before,s).ok,false);
});
test('comparison uses wall coordinates and leaves both inputs unchanged', () => {
  const s=fixture(); s.nodes[0].x=10; s.items.push({id:4}); s.openings=[];
  const before=JSON.stringify(s),r=compareBaseline(s.workspace.baselines[0],s);
  assert.deepEqual(r.walls.changed,['1']); assert.deepEqual(r.items.added,['4']); assert.deepEqual(r.openings.removed,['3']);
  assert.equal(JSON.stringify(s),before);
});
test('redesign commands capture once, update permissions, reject viewers', () => {
  const s=fixture(); const env={state:s, services:{sceneObject:()=>({nodes:s.nodes,walls:s.walls,openings:s.openings,items:s.items})}};
  const r=executeCommand(redesignCommand,{action:'start',id:'new',name:'Survey'},env,{history:false});
  assert.equal(r.ok,true,JSON.stringify(r)); assert.equal(s.workspace.baselines.length,2);
  assert.equal(executeCommand(redesignCommand,{action:'scope',wallIds:[1],allow:true},env,{history:false}).ok,true);
  assert.deepEqual(redesignPolicy(s).allowedWallIds,['1']);
  s.workspace.role='viewer'; assert.equal(redesignCommand.prepare({action:'start'},env).reason,'READ_ONLY');
});
