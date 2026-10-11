import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import {withRetiredGpuChildren} from '../js/core/gpu_child_retirement.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const primitiveSource=fs.readFileSync(new URL('../js/primitives.js',import.meta.url),'utf8');
const clearGroup=new Function(sourceFunctionText(primitiveSource,'clearGroup')+';return clearGroup;')();
const fn=(name,context)=>new Function(...Object.keys(context),sourceFunctionText(source,name)+';return '+name)(...Object.values(context));
function mesh(id){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());m.userData.id=id;return m;}
test('retirement detaches old objects before replacement but keeps shader references through render',()=>{
 const group=new THREE.Group(),old=mesh('old'),unrelated=mesh('keep');group.add(old,unrelated);let disposed=0;old.material.addEventListener('dispose',()=>disposed++);
 assert.equal(withRetiredGpuChildren(group,c=>c===old,()=>new THREE.Group(),clearGroup,()=>{assert.deepEqual(group.children,[unrelated]);assert.equal(disposed,0);const next=mesh('new');group.add(next);assert.equal(old.parent.parent,null);return 'rendered';}),'rendered');
 assert.equal(disposed,1);assert.deepEqual(group.children.map(c=>c.userData.id),['keep','new']);assert.equal(old.parent,null);
});
test('retirement releases geometry/materials when replacement or render throws',()=>{
 const group=new THREE.Group(),old=mesh('old');group.add(old);let geometry=0,material=0;old.geometry.addEventListener('dispose',()=>geometry++);old.material.addEventListener('dispose',()=>material++);
 assert.throws(()=>withRetiredGpuChildren(group,()=>true,()=>new THREE.Group(),clearGroup,()=>{throw new Error('renderer failed');}),/renderer failed/);assert.equal(geometry,1);assert.equal(material,1);assert.equal(group.children.length,0);
});
test('actual edited/live layer handlers keep old shader owners until replacement render and preserve source',()=>{
 const grp=new THREE.Group(),live=new THREE.Group(),committed=mesh('dirty'),other=mesh('unrelated'),ghost=mesh('old-ghost');grp.add(committed,other,live);live.add(ghost);let disposed=0;[committed,ghost].forEach(m=>m.material.addEventListener('dispose',()=>disposed++));
 const definition={features:[{id:'f',params:{depth:9}}],parts:[{id:'body',to:9}]},before=JSON.stringify(definition),E={docType:'part',def:definition,authoring:{featureEdit:{featureId:'f'}},_liveDirtyPartIds:{body:true},pv:{grp,liveGrp:live,render(){assert.equal(disposed,0);assert.ok(!grp.children.includes(committed));assert.ok(!live.children.includes(ghost));assert.ok(grp.children.includes(other));assert.equal(live.children[0].userData.id,'new-ghost');}}};
 const patchLive=fn('patchLivePreviewLayer',{E,THREE,withRetiredGpuChildren,clearGroup,dropPreviewDecorationGroups(){},fillLivePreviewGroup:g=>g.add(mesh('new-ghost')),applySectionClipping(){},syncReplacedBodyVisibility(){}});
 const patch=fn('patchEditedFeatureLayer',{E,THREE,withRetiredGpuChildren,clearGroup,collectDirtyPartIds:()=>({body:true}),gpuChildMatchesPartIds:c=>c===committed,gpuChildMatchesFeature:()=>false,dropDecoMatching(){},partBelongsToFeature:()=>false,rebuildCommittedPartsById:()=>grp.add(mesh('new-body')),patchLivePreviewLayer:patchLive});
 assert.equal(patch(),true);assert.equal(disposed,2);assert.equal(E._liveDirtyPartIds,null);assert.equal(JSON.stringify(definition),before);assert.equal(grp.children.filter(c=>c===live).length,1);assert.equal(grp.children.some(c=>c===other),true);
});
