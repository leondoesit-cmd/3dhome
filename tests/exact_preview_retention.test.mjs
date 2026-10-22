import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=modelerSource();
function fixture(){
  const document={parts:[{id:1,exactPending:true}]},oldBody={userData:{cadPartRoot:1},geometry:{version:'complete'}};
  oldBody.traverse=fn=>fn(oldBody);
  const live={children:[{geometry:{version:'ghost'}}]};
  const E={docType:'part',def:document,exactRestoring:true,pv:{committedDocument:document,grp:{children:[oldBody]},liveGrp:live}};
  let rebuilds=0,labels=0;
  const scope={E,root:null,window:undefined,decoGroups:[],clearGroup:group=>{group.children.length=0;},
    syncRetainedExactPreviewStatus:()=>labels++,invalidateDrawing:()=>{},renderedParts:()=>[],committedRenderedParts:()=>E.def.parts,
    buildPart:(group,part)=>group.add({userData:{cadPartRoot:part.id},geometry:part.meshData || {version:'current fallback'}}),
    addDocumentOverlays:()=>{},addAssemblyContextGhosts:()=>{},fillLivePreviewGroup:()=>{},applySectionClipping:()=>{},syncSectionHelper:()=>{},
    THREE:{Group:class{constructor(){this.children=[];this.userData={};}}},
    pendingCutController:null,currentHistoryNode:()=>1,exactBuildTimers:new Map(),exactRebuildQueue:{reset(){}},cancelCadWorkerWork:()=>{},syncStatus:()=>{},
    cancelledExactPreview:null};
  E.pv.rebuild=callback=>{rebuilds++;const grp={children:[],add(child){this.children.push(child);}};callback(grp);E.pv.grp=grp;};
  const names=['retainingExactPreview','retainExactPreview','setCommittedPartVisible','syncReplacedBodyVisibility','updatePreview','resolveTopologyPick','hitInstant3d','cancelExactModelRebuild'];
  const api=new Function(...Object.keys(scope),names.map(name=>sourceFunctionText(source,name)).join('\n')+';return {'+names.join(',')+'};')(...Object.values(scope));
  return {E,oldBody,live,api,get rebuilds(){return rebuilds;},get labels(){return labels;}};
}

test('pending canonical rebuild retains complete GPU geometry without restoring invalid model meshes',()=>{
  const f=fixture();
  f.E._hiddenPreviewReplaceId=1;f.oldBody.visible=false;
  f.api.updatePreview();f.api.updatePreview();
  assert.equal(f.rebuilds,0);
  assert.equal(f.E.pv.grp.children[0],f.oldBody);
  assert.equal(f.live.children.length,0,'remove the command ghost while retaining committed geometry');
  assert.equal(f.oldBody.visible,true,'restore the complete body hidden by a dismissed finish ghost');
  assert.equal(f.E.def.parts[0].meshData,undefined,'retained GPU buffers never become document data');
  assert.ok(f.labels>0,'the retained state is explicitly identified');
  assert.deepEqual(f.api.resolveTopologyPick({},{}).hits,[]);
  assert.equal(f.api.hitInstant3d({},{}),null);
  const complete={version:'new complete native result'};
  f.E.def.parts[0].meshData=complete;f.E.exactRestoring=false;f.api.updatePreview();
  assert.equal(f.rebuilds,1,'a completed rebuild replaces the retained scene');
  assert.equal(f.E.pv.grp.children.includes(f.oldBody),false);
  assert.equal(f.E.pv.grp.children[0].geometry,complete,'new complete geometry is published together after the pending phase');
});

test('document replacement cannot keep GPU geometry from the prior part',()=>{
  const f=fixture();f.E.def={parts:[]};f.api.updatePreview();
  assert.equal(f.rebuilds,1);
  assert.equal(f.E.pv.grp.children.includes(f.oldBody),false);
  assert.equal(f.E.pv.committedDocument,f.E.def);
});

test('cancel replaces retained geometry with current flagged projections and releases pending state',()=>{
  const f=fixture();f.api.cancelExactModelRebuild();
  assert.equal(f.E.exactRestoring,false);
  assert.equal(f.E.def.parts[0].exactError,'Exact CAD computation cancelled');
  assert.equal(f.E.def.parts[0].exactPending,false);
  assert.equal(f.rebuilds,1);
  assert.equal(f.E.pv.grp.children.includes(f.oldBody),false);
});

test('assembly, room preview and blank scenes use their existing publication path',()=>{
  const f=fixture();f.E.docType='assembly';assert.equal(f.api.retainingExactPreview(),false);
  f.E.docType='part';f.E.pv.inRoom=true;assert.equal(f.api.retainingExactPreview(),false);
  f.E.pv.inRoom=false;f.E.pv.grp.children=[];assert.equal(f.api.retainingExactPreview(),false);
});
