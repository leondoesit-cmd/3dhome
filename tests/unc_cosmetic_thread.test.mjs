import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeThreadSpec,validateThreadFeature,cosmeticThread,threadCallout} from '../js/cad_thread.js';
import {applyHistoryToPreviewParts} from '../js/core/parametric_document.js';
const input={threadPreset:'unc-quarter-20',mode:'cosmetic',side:'external',length:2.54};
test('ebook 1/4-20 UNC 2A cosmetic thread retains inch specification through serialization',()=>{
 const spec=normalizeThreadSpec(input);
 assert.equal(spec.diameterMm,6.35);assert.equal(spec.pitchMm,1.27);
 assert.equal(spec.turns,20);assert.equal(spec.toleranceClass,'2A');
 assert.equal(spec.family,'unified-thread');
 const restored=normalizeThreadSpec(JSON.parse(JSON.stringify(spec)));
 assert.equal(validateThreadFeature(restored).ok,true);
 assert.equal(threadCallout(restored),'1/4-20 UNC 2A ↓1 in');
 const thread=cosmeticThread(restored);
 assert.equal(thread.threadGeometry.profile,'Unified-60-cosmetic');
 assert.ok(thread.overlay.length>20);
});
test('Unified cosmetic preset rejects metric classes and unsupported modeled geometry',()=>{
 assert.equal(validateThreadFeature({...input,toleranceClass:'6g'}).ok,false);
 assert.equal(validateThreadFeature({...input,mode:'modeled'}).ok,false);
 assert.equal(validateThreadFeature({...input,side:'internal',toleranceClass:'2A'}).ok,false);
 assert.equal(validateThreadFeature({...input,side:'internal',toleranceClass:'2B'}).ok,true);
});

test('editing a restored thread length updates turns, overlay and callout',()=>{
 const saved=JSON.parse(JSON.stringify(normalizeThreadSpec(input)));
 const edited=normalizeThreadSpec({...saved,length:1.27});
 assert.equal(edited.lengthMm,12.7);
 assert.equal(edited.turns,10);
 assert.equal(threadCallout(edited),'1/4-20 UNC 2A ↓0.5 in');
 const annotation=cosmeticThread(edited);
 assert.equal(normalizeThreadSpec({diameterMm:8,pitchMm:1.25,lengthMm:12.5}).length,1.25);
 assert.equal(annotation.spec.lengthMm,12.7);
 assert.ok(Math.abs(Math.max(...annotation.overlay.map(point=>point.y))-1.27)<1e-9);
});

test('history preview refreshes cosmetic overlay and respects suppression and rollback',()=>{
 const original=normalizeThreadSpec(input);
 const doc={parts:[{id:'shaft',featureId:'base',cosmeticThread:cosmeticThread(original)}],
 features:[{id:'base',type:'extrude'},{id:'thread',type:'thread',inputs:['base'],params:{...original,length:1.27}}],
 history:[{targetId:'base'},{targetId:'thread'}]};
 applyHistoryToPreviewParts(doc);
 assert.equal(doc.parts[0].cosmeticThread.callout,'1/4-20 UNC 2A ↓0.5 in');
 assert.ok(Math.abs(Math.max(...doc.parts[0].cosmeticThread.overlay.map(point=>point.y))-1.27)<1e-9);
 doc.history[1].suppressed=true;applyHistoryToPreviewParts(doc);
 assert.equal(doc.parts[0].cosmeticThread,undefined);
 doc.history[1].suppressed=false;doc.rollbackIndex=1;applyHistoryToPreviewParts(doc);
 assert.equal(doc.parts[0].cosmeticThread,undefined);
 doc.rollbackIndex=null;applyHistoryToPreviewParts(doc);
 assert.equal(doc.parts[0].cosmeticThread.spec.turns,10);
});
