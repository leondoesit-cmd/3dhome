import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=modelerSource();
const vector=()=>({value:null,set(...coordinates){this.value=coordinates;}});
function scene(ids){
  const children=ids.map(id=>({userData:{cadComponent:id},position:vector(),rotation:vector(),geometry:{identity:id}}));
  const grp={children,remove(child){this.children.splice(this.children.indexOf(child),1);}};
  return {grp,children};
}
function poseRefresh(E,notify,leaders=()=>{}){
  const THREE={Box3:class{setFromObject(group){this.size=group.children.length;return this;}isEmpty(){return !this.size;}getBoundingSphere(){return {size:this.size};}},Sphere:class{}};
  return new Function('E','normalizeTransform','invalidateDrawing','addExplodeLeaders','THREE',sourceFunctionText(source,'refreshAssemblyPosePreview')+';return refreshAssemblyPosePreview;')(
    E,component=>component.transform,notify,leaders,THREE);
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

test('pose refresh updates explosion leaders without rebuilding native meshes',()=>{
  const {grp}=scene(['a']);let disposals=0,drawings=0;
  const overlay={userData:{cadInterference:0},geometry:{dispose(){disposals++;}},material:{dispose(){disposals++;}},traverse(fn){fn(this);}};
  grp.children.push(overlay);
  const E={assembly:{components:[{id:'a',transform:{x:1,y:2,z:3,rx:0,ry:0,rz:0}}]},pv:{grp,inRoom:false}};
  const mesh=grp.children[0].geometry;
  let leaders=0;
  const refresh=poseRefresh(E,()=>drawings++,parent=>{
    leaders++;
    parent.children.push({userData:{cadExplodeLine:'leader'},geometry:{dispose(){disposals++;}},material:{dispose(){disposals++;}},traverse(fn){fn(this);}});
  });
  assert.equal(refresh(),true);
  assert.equal(grp.children.includes(overlay),false);
  assert.equal(disposals,2);
  assert.equal(drawings,1);
  E.assembly.components[0].explodedOffset={x:10,y:0,z:0};
  assert.equal(refresh(),true);
  assert.equal(leaders,1);
  assert.deepEqual(grp.children[0].position.value,[11,2,3]);
  assert.equal(grp.children[0].geometry,mesh);
  assert.equal(refresh(),true);
  assert.equal(leaders,2);
  assert.equal(disposals,4);
  E.assembly.components[0].explodedOffset={x:0,y:0,z:0};
  assert.equal(refresh(),true);
  assert.equal(leaders,2);
  assert.equal(disposals,6);
  assert.equal(grp.children.length,1);
  assert.deepEqual(grp.children[0].position.value,[1,2,3]);
  E.assembly.components.push({id:'new',transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}});
  assert.equal(refresh(),false);
});

test('closing a presentation-only assembly form preserves the current viewport buffers',()=>{
  let rebuilt=0,selected=0,cleared=0;
  const E={docType:'assembly',quickAction:'explodestep',authoring:{repairMarker:'stale'}};
  const host={hidden:false};
  const root={querySelector(selector){assert.equal(selector,'#mdQuickSettings');return host;}};
  const close=new Function('E','root','motionPlaybackCancel','clearFeaturePreview','clearLiveDownstream','refreshAssemblyPosePreview','refreshViewportSelection','updatePreview','syncCommandManager',
    sourceFunctionText(source,'closeFeaturePanel')+';return closeFeaturePanel;')(
    E,root,null,()=>cleared++,()=>{},()=>true,()=>selected++,()=>rebuilt++,()=>{});
  close({assemblyPoseOnly:true});
  assert.equal(host.hidden,true);
  assert.equal(E.authoring.repairMarker,null);
  assert.equal(cleared,1);
  assert.equal(selected,1);
  assert.equal(rebuilt,0);
  close();
  assert.equal(rebuilt,1);
});
