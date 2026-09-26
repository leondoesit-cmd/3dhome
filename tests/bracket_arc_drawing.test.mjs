import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSmoothTopology} from '../js/core/topology.js';
import {buildSheetScene,createSheetDoc,sceneToSvg} from '../js/cad_sheet.js';
import {viewBasis} from '../js/core/hidden_line.js';
const arc={ownerFeatureId:'bracket',kind:'edge',persistentId:'bracket:arc',descriptor:{curve:'circle',origin:{x:0,y:0,z:2.5},axis:{x:0,y:0,z:1},radius:1.5,measure:1.5*Math.PI,endpoints:[{x:-1.5,y:0,z:2.5},{x:1.5,y:0,z:2.5}],arcMidpoint:{x:0,y:1.5,z:2.5}}};
test('mesh aliases do not erase a trimmed exact arc',()=>{
 const alias=structuredClone(arc);alias.persistentId='mesh:arc';delete alias.descriptor.arcMidpoint;
 const entries=mergeSmoothTopology([arc,alias]);
 const retained=entries.find(e=>e.persistentId===arc.persistentId);
 assert.deepEqual(retained.descriptor,arc.descriptor);
});
test('bracket drawing uses circular strokes for visible semicircle facets',()=>{
 const points=Array.from({length:13},(_,i)=>({u:1.5*Math.cos(i*Math.PI/12),v:1.5*Math.sin(i*Math.PI/12)}));
 const visible=points.slice(1).map((b,i)=>({a:points[i],b}));
 visible.push({a:{u:-1.5,v:0},b:{u:1.5,v:0}}); // A diameter is a straight edge.
 const doc=createSheetDoc({views:['front']});
 const scene=buildSheetScene(doc,{topology:[arc],projection:()=>({visible,hidden:[],circles:[],basis:viewBasis('front'),bounds:{u0:-1.5,u1:1.5,v0:0,v1:1.5}})});
 assert.equal(scene.items.filter(i=>i.type==='arc'&&i.style==='outline').length,12);
 assert.ok(scene.items.some(i=>i.type==='line'&&i.style==='outline'&&i.viewId));
 assert.ok(sceneToSvg(scene).includes('<path d="M'));
});
