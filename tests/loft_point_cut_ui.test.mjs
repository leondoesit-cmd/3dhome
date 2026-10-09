import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {analyzeSketchProfiles} from '../js/sketch_profiles.js';
import {resolveProfilePoints} from '../js/sketch_solver.js';
import {loftSectionSourceRecord,loftSourceRecord,resolveSketchSources} from '../js/core/swept_sources.js';
import {featureDefaults} from '../js/core/feature_catalog.js';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const actual=JSON.parse(fs.readFileSync(new URL('../artifacts/planchard/DRAFTING-1.9-preloft-browser-2026-10-09.mforge',import.meta.url),'utf8')).mainModel;
function harness(){
 const def=structuredClone(actual),E={def,sel:null},state={undo:0,refresh:0,queued:0},parts=def.parts;
 const bindings={E,selectedSketchIds:()=>['sk_2ovmn','sk_3s5o2'],selectedHelixRecord:()=>null,featureDefaults,featureTypeLabel:x=>x,t:x=>x,flash:x=>state.message=x,analyzeSketchProfiles,loftSectionSourceRecord,loftSourceRecord,resolveSweptSources:resolveSketchSources,resolveProfilePoints,cloneData:structuredClone,selectedSolid:()=>E.sel,activeParts:()=>parts,partSupportsExactMesh:()=>true,cutTargetFeatureId:()=>def.features.at(-1).id,pushUndo:()=>state.undo++,H:{discard:()=>state.undo--},createFeatureDefinition:(d,type,data)=>{const f={id:'new-loft',type,...data};d.features.push(f);return f;},mergeTargetBody:()=>null,kernelRecipeBounds:()=>({}),addKernelBodyPart:()=>{state.newBody=true;return {};},invalidatePartMeshAfterEdit:()=>{},queueExactMesh:()=>state.queued++,refreshAll:()=>state.refresh++};
 const run=Function(...Object.keys(bindings),'return '+sourceFunctionText(source,'createMultiSketchFeature'))(...Object.values(bindings));return {def,E,state,parts,run};
}
test('actual browser quad and canonical point entity create one explicit-target associative Loft Cut',()=>{
 const h=harness(),before=structuredClone(h.def.sketches);assert.equal(h.run('loft',{operation:'subtract',ruled:true}),true);
 const f=h.def.features.at(-1),cut=h.parts[0].cuts3d.at(-1);assert.equal(f.params.sketchSources.sections[1].pointId,6089);assert.deepEqual(f.inputs,[actual.features.at(-1).id]);assert.equal(cut.kind,'loft');assert.equal(cut.sectionSegments[1],null);assert.equal(h.state.undo,1);assert.equal(h.state.queued,1);assert.deepEqual(h.def.sketches,before);assert.deepEqual(f.params.sections[1],[{x:5,y:1,z:4}]);
});
test('Loft Cut refuses surface and ambiguous multi-body targets without history or mutation',()=>{
 for(const mode of ['surface','ambiguous','badpoint']){const h=harness();if(mode==='ambiguous')h.parts.push(structuredClone(h.parts[0]));if(mode==='badpoint')h.def.sketches[2].points.push({id:'other',x:0,y:0});const before=JSON.stringify(h.def);assert.equal(h.run('loft',{operation:'subtract',solid:mode!=='surface'}),false);assert.equal(h.state.undo,0);assert.equal(JSON.stringify(h.def),before);}
});
test('existing closed-section new-body Loft still creates a body with one Undo',()=>{const h=harness();h.def.sketches[2]=structuredClone(h.def.sketches[1]);h.def.sketches[2].id='sk_3s5o2';h.def.sketches[2].offset=1;assert.equal(h.run('loft',{operation:'new-body'}),true);assert.equal(h.state.newBody,true);assert.equal(h.state.undo,1);assert.equal(!!h.parts[0].cuts3d?.some(c=>c.kind==='loft'),false);});
