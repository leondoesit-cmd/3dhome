import test from 'node:test';
import assert from 'node:assert/strict';
import {captureExactTopology,verifiedExactTopology} from '../js/core/exact_topology_cache.js';

test('verified topology survives appended features but expires when its inputs change',()=>{
 const document={parameters:{},sketches:[{id:'s',points:[{id:'p',x:0,y:0}],entities:[],constraints:[]}]};
 const features=[{id:'a',type:'extrude',params:{sketchId:'s',depth:10},inputs:[]}];
 const run={results:new Map([['a',{shape:{},topology:[{persistentId:'a:generated',kind:'edge'}]}]])};
 document.exactTopologyCache=captureExactTopology(document,features,run);
 assert.equal(verifiedExactTopology(document,features).size,1);
 features.push({id:'b',type:'fillet',params:{radius:1},inputs:['a']});
 assert.equal(verifiedExactTopology(document,features).size,1);
 document.sketches.push({id:'unused',points:[]});
 assert.equal(verifiedExactTopology(document,features).size,1);
 document.sketches[0].points[0].x=2;
 assert.equal(verifiedExactTopology(document,features).size,0);
 document.sketches[0].points[0].x=0;
 features[0].params.depth=20;
 assert.equal(verifiedExactTopology(document,features).size,0);
 features[0].params.depth=10;
 document.sketches[0].constraints.push({id:'driving',type:'distance',value:2});
 assert.equal(verifiedExactTopology(document,features).size,0);
});

test('renaming a driving dimension keeps exact loft topology available to live rebuild',()=>{
 const document={parameters:{},sketches:[{id:'section',points:[{id:'centre',x:0,y:0}],entities:[],constraints:[{id:'diameter',type:'diameter',name:'OldName',value:1.27}]}]};
 const features=[{id:'loft',type:'loft',params:{},inputs:[],references:{sketches:['section']}}];
 const run={results:new Map([['loft',{shape:{},topology:[{persistentId:'loft:top-face',kind:'face'}]}]])};
 document.exactTopologyCache=captureExactTopology(document,features,run);
 document.sketches[0].constraints[0].name='BaseWidth';
 assert.equal(verifiedExactTopology(document,features).get('loft')?.[0].persistentId,'loft:top-face');
 document.sketches[0].constraints[0].value=1.5;
 assert.equal(verifiedExactTopology(document,features).size,0);
});
