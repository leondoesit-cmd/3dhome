import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const vector=()=>({value:null,set(...coordinates){this.value=coordinates;}});
function scene(ids){
  const children=ids.map(id=>({userData:{cadComponent:id},position:vector(),rotation:vector(),geometry:{identity:id}}));
  const grp={children,remove(child){this.children.splice(this.children.indexOf(child),1);}};
  return {grp,children};
}
function poseRefresh(E,notify){
  const THREE={Box3:class{setFromObject(group){this.size=group.children.length;return this;}isEmpty(){return !this.size;}getBoundingSphere(){return {size:this.size};}},Sphere:class{}};
  return new Function('E','normalizeTransform','invalidateDrawing','THREE',sourceFunctionText(source,'refreshAssemblyPosePreview')+';return refreshAssemblyPosePreview;')(
    E,component=>component.transform,notify,THREE);
}

test('55-component mate pose refresh retains native meshes and updates transforms',()=>{
  const ids=Array.from({length:55},(_,i)=>'component-'+i),{grp,children}=scene(ids);
  let drawings=0;
  const E={assembly:{components:ids.map((id,i)=>({id,visible:true,transform:{x:i,y:i/2,z:-i,rx:0,ry:0,rz:i}}))},pv:{grp,inRoom:false,liveGrp:null}};
  const meshReferences=children.map(child=>child.geometry);
  assert.equal(poseRefresh(E,()=>drawings++)(),true);
  assert.equal(drawings,1);
  assert.deepEqual(children[54].position.value,[54,27,-54]);
  assert.ok(Math.abs(children[54].rotation.value[2]-54*Math.PI/180)<1e-12);
  assert.deepEqual(children.map(child=>child.geometry),meshReferences);
  assert.equal(grp.children.length,55);
  assert.deepEqual(E.pv.pickBounds,{size:55});
});

test('pose refresh removes obsolete interference overlays and falls back on changed scene identity',()=>{
  const {grp}=scene(['a']);let disposals=0,drawings=0;
  const overlay={userData:{cadInterference:0},geometry:{dispose(){disposals++;}},material:{dispose(){disposals++;}},traverse(fn){fn(this);}};
  grp.children.push(overlay);
  const E={assembly:{components:[{id:'a',transform:{x:1,y:2,z:3,rx:0,ry:0,rz:0}}]},pv:{grp,inRoom:false}};
  const refresh=poseRefresh(E,()=>drawings++);
  assert.equal(refresh(),true);
  assert.equal(grp.children.includes(overlay),false);
  assert.equal(disposals,2);
  assert.equal(drawings,1);
  grp.children.push({userData:{cadExplodeLine:'leader'}});
  assert.equal(refresh(),false);
  assert.equal(drawings,1);
  grp.children.pop();
  E.assembly.components.push({id:'new',transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}});
  assert.equal(refresh(),false);
});
