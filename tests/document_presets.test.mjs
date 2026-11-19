import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {documentDefaults,validateDocumentDefaults,applyDocumentDefaults,captureDocumentPreset,loadDocumentPresets,saveDocumentPreset,documentFromPreset,DOCUMENT_PRESET_STORAGE_KEY} from '../js/core/document_presets.js';
import {ensureParametricDocument} from '../js/core/parametric_document.js';
import {hasSaveableModelContent} from '../js/core/model_save_policy.js';
import {createSheetDoc,ensureSheetDoc,dimensionText} from '../js/cad_sheet.js';
import {ensureAssemblyDrawingDoc} from '../js/core/assembly_drawing_settings.js';
import {sourceFunctionText, withSetters} from './helpers/source_function.mjs';
const source=modelerSource();
const defaults=unit=>({lengthUnit:unit,massUnit:unit==='in'?'lb':'g',angleUnit:'deg',draftingStandard:unit==='in'?'ANSI':'ISO',projection:unit==='in'?'third':'first',lengthPrecision:unit==='in'?3:2,anglePrecision:0,dualDimensions:false});
const blank=()=>ensureParametricDocument({key:'cm_new',parts:[],sketches:[],features:[],history:[]});
const preset=(kind='part-template',unit='mm')=>captureDocumentPreset(applyDocumentDefaults(blank(),defaults(unit)),{id:kind+unit,name:kind+unit,kind});
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};};

test('four source templates exclude all source geometry and identity, deep copy settings and preserve canonical units',()=>{
  for(const kind of ['part-template','assembly-template'])for(const unit of ['in','mm']){
    const original=applyDocumentDefaults({key:'source',id:'source-id',parts:[{id:'body',x:2}],features:[{id:'boss'}],history:[{targetId:'boss'}],components:[{id:'occ'}],mates:[{id:'mate'}],drawing:{title:'SOURCE'},customProperties:{Description:'SOURCE'}},defaults(unit));
    const before=JSON.stringify(original),record=captureDocumentPreset(original,{id:kind+unit,name:kind+unit,kind});
    assert.deepEqual(Object.keys(record).sort(),['defaults','id','kind','name','version']);assert.equal(JSON.stringify(original),before);
    const next=documentFromPreset(kind==='part-template'?blank():{key:'asm_new',components:[],mates:[]},record,kind);
    assert.notEqual(next.key,original.key);assert.equal(next.id==='source-id',false);assert.deepEqual(next.documentProperties,defaults(unit));
    assert.equal(next.customProperties,undefined);assert.equal(next.drawing,undefined);assert.equal(next.context.units.precision,unit==='in'?3:2);
    next.documentProperties.lengthPrecision=8;assert.equal(record.defaults.lengthPrecision,unit==='in'?3:2);
  }
});
test('local template reload, replacement and corruption handling are independent and fail closed',()=>{
  const s=storage(),record=preset();saveDocumentPreset(s,record);const reload=loadDocumentPresets(s);reload[0].defaults.lengthUnit='in';assert.equal(loadDocumentPresets(s)[0].defaults.lengthUnit,'mm');
  saveDocumentPreset(s,{...record,defaults:defaults('in')});assert.equal(loadDocumentPresets(s).length,1);assert.equal(loadDocumentPresets(s)[0].defaults.lengthUnit,'in');
  assert.throws(()=>saveDocumentPreset(s,{...record,features:[{}]}));s.setItem(DOCUMENT_PRESET_STORAGE_KEY,JSON.stringify({version:1,records:[record,record]}));assert.throws(()=>loadDocumentPresets(s),/Duplicate/);
});
test('invalid defaults and nonblank/mismatched template construction cannot import authored geometry',()=>{
  for(const bad of [{lengthPrecision:-1},{anglePrecision:1.5},{massUnit:'oz'},{draftingStandard:'ASME'},{parts:[]}])assert.throws(()=>validateDocumentDefaults({...defaults('mm'),...bad}));
  assert.throws(()=>documentFromPreset({...blank(),features:[{id:'boss'}]},preset(),'part-template'),/fresh blank/);
  assert.throws(()=>documentFromPreset(blank(),preset(),'assembly-template'),/matching/);
  const model=applyDocumentDefaults({parts:[{x:2}],context:{units:{length:'cm'}}},defaults('in'));assert.equal(model.parts[0].x,2);
});
test('fresh template-based blank can be saved and reopened without dummy CAD, while unconfigured blank remains unsaveable',()=>{
  assert.equal(hasSaveableModelContent(blank()),false);const next=documentFromPreset(blank(),preset(),'part-template');assert.equal(hasSaveableModelContent(next),true);
  const reopened=ensureParametricDocument(JSON.parse(JSON.stringify(next)));assert.equal(hasSaveableModelContent(reopened),true);assert.deepEqual(reopened.documentProperties,next.documentProperties);assert.equal(reopened.features.length,0);
  assert.equal(hasSaveableModelContent({...blank(),documentTemplate:{id:'fake'}}),false);
  for(const bad of [{id:42},{name:{}},{name:' '},{kind:'drawing-template'},{features:[{}]}])assert.equal(hasSaveableModelContent({...blank(),documentProperties:next.documentProperties,documentTemplate:{...next.documentTemplate,...bad}}),false);
});
test('actual newModel uses fresh factory for each kind, respects discard and preserves source document',async()=>{
  for(const type of ['part','assembly']){
    const original={key:'source',parts:[{id:'body'}],components:[{id:'occ'}],mates:[{id:'mate'}]},before=JSON.stringify(original);let allow=false;
    const c={E:{docType:type,def:original,assembly:original},confirmDiscardDocument:async()=>allow,closeEvalCard(){},reconcileModelerDraft(){},documentFromPreset,newDef:blank,newAssembly:()=>({key:'asm_new',name:'New',components:[],mates:[]}),H:{clear:()=>({seed(){}})},markDocumentClean(){},syncHead(){},refreshLib(){},refreshAll(){},setTab(){},invalidateInterference(){}};
    vm.createContext(c);vm.runInContext(withSetters(sourceFunctionText(source,'newModel')),c);const p=preset(type==='part'?'part-template':'assembly-template','in');await c.newModel(p);assert.equal(c.E[type==='part'?'def':'assembly'],original);
    allow=true;await c.newModel(p);const next=c.E[type==='part'?'def':'assembly'];assert.notEqual(next,original);assert.equal(JSON.stringify(original),before);assert.equal(next.context.units.length,'in');assert.equal((next.parts||next.components).length,0);
  }
});
test('actual settings/capture/new chooser is undoable, cancels stale dialogs and persists matching kind',async()=>{
  let node=1,undo=0,resolve,selected;const s=storage(),c={E:{docType:'assembly',assembly:{key:'asm',components:[{id:'occ'}],mates:[]}},documentDefaults,validateDocumentDefaults,applyDocumentDefaults,captureDocumentPreset,loadDocumentPresets,saveDocumentPreset,localStorage:s,crypto:{randomUUID:()=> 'p'},currentHistoryNode:()=>node,
    sheetForm:async()=>({...defaults('in')}),pushUndo(){undo++;node++;c.E.assembly=structuredClone(c.E.assembly);},syncHead(){},refreshAll(){},flash(){},newModel:async p=>{selected=p;}};
  vm.createContext(c);vm.runInContext(withSetters(sourceFunctionText(source,'documentPresetAction')),c);await c.documentPresetAction('properties');assert.equal(undo,1);assert.equal(c.E.assembly.context.units.length,'in');assert.equal(c.E.assembly.components[0].id,'occ');
  c.sheetForm=async()=>({name:'ASM-IN-ANSI'});await c.documentPresetAction('capture');assert.equal(loadDocumentPresets(s)[0].kind,'assembly-template');
  c.sheetForm=async()=>({preset:'p'});await c.documentPresetAction('new');assert.equal(selected.name,'ASM-IN-ANSI');
  c.sheetForm=()=>new Promise(r=>resolve=r);const pending=c.documentPresetAction('properties');node++;resolve(defaults('mm'));await pending;assert.equal(undo,1);assert.equal(c.E.assembly.context.units.length,'in');
});
test('actual new drawing consumes standard/projection/precision defaults once, angular text responds without altering old drawings',()=>{
  for(const type of ['part','assembly']){
    const owner=applyDocumentDefaults(type==='part'?blank():{key:'asm',components:[],mates:[]},defaults('in'));
    const c={E:{docType:type,def:owner,assembly:owner},documentDefaults,ensureSheetDoc,ensureAssemblyDrawingDoc};vm.createContext(c);vm.runInContext(withSetters(sourceFunctionText(source,'drawingDocument')),c);
    const drawing=c.drawingDocument();assert.equal(drawing.units,'in');assert.equal(drawing.precision,3);assert.equal(drawing.anglePrecision,0);assert.equal(drawing.projection,'third');assert.equal(dimensionText({type:'angle',measure:26.49},drawing),'26°');
    assert.equal(dimensionText({type:'linear',measure:2.54},drawing),'1.000');owner.documentProperties=defaults('mm');assert.equal(c.drawingDocument().units,'in');
  }
  assert.equal(dimensionText({type:'angle',measure:26.49},createSheetDoc()),'26.5°');
});
