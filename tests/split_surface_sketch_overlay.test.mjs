import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {framePoint} from '../js/core/frame.js';
import {surfaceSketchWorldPolyline} from '../js/core/surface_uv.js';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');

test('Split view draws cylindrical UV sketches on their surface and updates changed seam placement',()=>{
 const descriptor={surface:'cylinder',radius:5,axis:{x:0,y:1,z:0},origin:{x:10,y:20,z:30}};
 const sketch={id:'surface',plane:'front',frameSpace:'surface-uv',surface:{descriptor},seamOffset:0};
 const uv=[{u:0,v:2},{u:Math.PI*5,v:2}];let curves=[],cleared=0;
 const host={add(group){group.parent=this;},remove(group){group.parent=null;}};
 class Group{constructor(){this.userData={};}}
 const E={split:true,docType:'part',def:{sketches:[sketch]},pv:{liveGrp:{parent:host},render(){}}};
 const standard=new Function('fin',sourceFunctionText(source,'standardPlaneFrame')+';return standardPlaneFrame;')(Number.isFinite);
 const worldFrame=new Function('E','standardPlaneFrame',sourceFunctionText(source,'sketchWorldFrame')+';return sketchWorldFrame;')(E,standard);
 const bindings={E,ensureSketchDoc:d=>d.sketches,ensureSketch:d=>d.sketches[0],sketchUvPolylines:()=>[uv],sketchWorldFrame:worldFrame,THREE:{Group},framePoint,surfaceSketchWorldPolyline,addOverlayPolyline:(_group,points)=>curves.push(points),clearGroup:()=>cleared++,renderedParts:()=>[{}],fitSplitPreview:()=>{throw Error('Not an empty model');}};
 const run=new Function(...Object.keys(bindings),sourceFunctionText(source,'syncSplitSketch3D')+';return syncSplitSketch3D;')(...Object.values(bindings));
 run();assert.deepEqual(curves[0],surfaceSketchWorldPolyline(sketch,uv));assert.ok(curves[0].length>30);
 curves=[];run();assert.equal(curves.length,0,'an unchanged surface sketch reuses the overlay');
 sketch.seamOffset=Math.PI*2.5;run();assert.equal(cleared,1);assert.deepEqual(curves[0],surfaceSketchWorldPolyline(sketch,uv));
 curves=[];sketch.surface.descriptor.radius=6;run();assert.equal(cleared,2);assert.deepEqual(curves[0],surfaceSketchWorldPolyline(sketch,uv));
});
