import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=modelerSource();

test('opening a different model hides its predecessor evaluation before replacing the definition',async()=>{
  let ended=0;
  const card={hidden:false},previous={},E={open:true,lang:'en',evalCard:'mass'};
  let accepted=false,replacements=0;
  // Stop at the actual assignment: the rest of Open boots the GPU viewport.
  const replacing=Error('replacing document');
  Object.defineProperty(E,'def',{get:()=>previous,set(){
    assert.equal(card.hidden,true,'the old result is hidden before replacement');
    assert.equal(E.evalCard,null);replacements++;throw replacing;
  }});
  const root={style:{},classList:{remove(){}},querySelector:()=>card,querySelectorAll:()=>[]};
  const context={E,root,motionPlaybackCancel:null,endMeasure(){ended++;},
    hasResidentEdits:()=>true,confirmDiscardDocument:async()=>accepted,
    inspectorDirty:{},partHistoryMarker:{},modelerReturnFocus:null,document:{activeElement:null,body:{}},
    getLang:()=> 'en',setTimeout(){},FURN:{},S:{idc:1},nextDocumentNumericId:()=>1,ensureParametricDocument:doc=>doc,
    cancelExactModelRebuild(){},dismissModelerDecision(){},syncModelerChrome(){},releaseExactRun(){}};
  vm.createContext(context);
  vm.runInContext(sourceFunctionText(source,'closeEvalCard')+'\n'+sourceFunctionText(source,'openModeler'),context);
  await context.openModeler(null,{},null);
  assert.equal(card.hidden,false,'declining Open keeps the current result visible');assert.equal(replacements,0);
  accepted=true;
  await assert.rejects(context.openModeler(null,{},null),error=>error===replacing);
  assert.equal(replacements,1);assert.equal(ended,0);
  E.evalCard='measure';card.hidden=false;
  await assert.rejects(context.openModeler(null,{},null),error=>error===replacing);
  assert.equal(replacements,2);assert.equal(ended,1,'active measurement cannot keep writing into the new document');
});

test('blank, bundle and document-type replacements also invalidate old evaluation output',()=>{
  for(const signature of ['async function newModel(template) {','async function openImportedBundle(bundle) {','function setDocumentType(type) {','function restoreModelerDraft(draft) {']) {
    const start=source.indexOf(signature);
    assert.ok(start>=0);
    const beforeReplacement=source.slice(start,source.indexOf('E.def =',start));
    assert.match(beforeReplacement,/closeEvalCard\(\)/,signature);
  }
  const start=source.indexOf('async function showMassProperties() {');
  const massSource=source.slice(start,source.indexOf('function paintMass()',start));
  const guardStart=massSource.indexOf('if(E.evalCard!=="mass"');
  assert.ok(guardStart>=0,'the actual asynchronous completion guard exists');
  const guard=massSource.slice(guardStart);
  const current={},evaluation={document:current,node:1,editRevision:0};
  let currentNode=1,recalculations=0;
  const context={E:{def:current,evalCard:'mass',massEvaluation:evaluation},evaluation,body:{isConnected:true},painted:false,
    currentHistoryNode:()=>currentNode,syncMassPropertiesEvaluation:()=>{recalculations++;}};
  vm.createContext(context);
  const helperStart=source.indexOf('function massEvaluationChanged(evaluation) {');
  const helperEnd=source.indexOf('\nfunction syncMassPropertiesEvaluation()',helperStart);
  assert.ok(helperStart>=0 && helperEnd>helperStart);
  vm.runInContext(source.slice(helperStart,helperEnd),context);
  vm.runInContext('function acceptResult(){'+guard+'painted=true;}',context);
  vm.runInContext('acceptResult()',context);
  assert.equal(context.painted,true);
  context.painted=false; context.E.def={};
  vm.runInContext('acceptResult()',context);
  assert.equal(context.painted,false,'late mass results reject changed documents');
  assert.equal(recalculations,1,'a still-open mass card requests current geometry');
  context.E.def=current;currentNode=2;
  vm.runInContext('acceptResult()',context);
  assert.equal(context.painted,false,'same-document history edits also reject a late result');
  currentNode=1;
  context.E.massEvaluation={...evaluation};
  vm.runInContext('acceptResult()',context);
  assert.equal(context.painted,false,'a newer calculation owns its result');
  context.E.massEvaluation=evaluation;
  context.E.def=current;context.E.evalCard=null;
  vm.runInContext('acceptResult()',context);
  assert.equal(context.painted,false,'closed evaluation never repaints after a late result');
});
