import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {meshDataBounds} from '../js/core/kernel_body.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {historyEntryRolled} from '../js/core/parametric_document.js';
import {leavesInputStanding} from '../js/core/rebuild.js';
const source=modelerSource();
const record=()=>JSON.parse(readFileSync(new URL('./fixtures/q5_reactivated_body_branch.json',import.meta.url),'utf8'));
const names=['cutTargetFeatureId','publishExactBodies'];
const api=new Function('historyEntryRolled','leavesInputStanding','meshDataBounds',names.map(name=>sourceFunctionText(source,name)).join('\n')+';return {'+names.join(',')+'};')(historyEntryRolled,leavesInputStanding,meshDataBounds);

test('actual reactivated Q5 graph publishes the final native branch rather than prior Cut13',async()=>{
 const doc=record();assert.equal(api.cutTargetFeatureId(doc.parts[0],doc),doc.expectedHead);
 const results=new Map(doc.features.map(feature=>[feature.id,{shape:true,volume:feature.id===doc.expectedHead?doc.nativeFinalVolumeCm3:doc.oldVisibleVolumeCm3}]));
 const run={ok:true,results,issues:[]};
 await api.publishExactBodies(doc.parts,run,doc,async body=>({volumeCm3:body.volume}));
 assert.equal(doc.parts[0].meshData.volumeCm3,doc.nativeFinalVolumeCm3);
 assert.equal(doc.parts[0].exactError,null);assert.equal(doc.parts[0].exactPending,false);
});
test('new merged feature target uses current active lineage, including reactivated forks and explicit rollback',()=>{
 const doc=record(),boss=doc.features.find(f=>f.name==='Extrude / Boss 2'),oldCut=doc.features.find(f=>f.name==='Extrude Cut 13');
 const bossAt=doc.history.findIndex(entry=>entry.targetId===boss.id);
 doc.rollbackIndex=bossAt;assert.equal(api.cutTargetFeatureId(doc.parts[0],doc),oldCut.id,'rollback before later branch exposes Cut13');
 doc.rollbackIndex=null;boss.suppressed=true;doc.features.at(-1).suppressed=true;
 assert.equal(api.cutTargetFeatureId(doc.parts[0],doc),oldCut.id);
 boss.suppressed=false;doc.features.at(-1).suppressed=false;assert.equal(api.cutTargetFeatureId(doc.parts[0],doc),doc.expectedHead);
 assert.equal(api.cutTargetFeatureId(doc.parts[0],doc,id=>id!==boss.id && id!==doc.expectedHead),oldCut.id,'failed later branch retains last built earlier branch with failure status');
});
