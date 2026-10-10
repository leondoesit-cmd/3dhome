import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const close=source.slice(source.indexOf('function closeEvalCard() {'),source.indexOf('function evalRow('));

test('opening a different model hides its predecessor evaluation before replacing the definition',()=>{
  let ended=0;
  const card={hidden:false}, E={evalCard:'mass'};
  const context={E,motionPlaybackCancel:null,root:{querySelector:()=>card},endMeasure(){ended++;},cancelExactModelRebuild(){},dismissModelerDecision(){}};
  vm.createContext(context); vm.runInContext(close,context);
  const start=source.indexOf('export function openModeler(editKey, def, srcItem) {');
  const stop=source.indexOf('// Whether this call REPLACES',start);
  const prefix=source.slice(start,stop).replace('export function','function')+'\n}';
  vm.runInContext(prefix,context);
  vm.runInContext('openModeler()',context);
  assert.equal(card.hidden,true);
  assert.equal(E.evalCard,null);
  assert.equal(ended,0);
  E.evalCard='measure';card.hidden=false;
  vm.runInContext('openModeler()',context);
  assert.equal(ended,1,'active measurement cannot keep writing into the new document');
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
