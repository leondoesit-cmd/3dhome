import test from 'node:test';
import assert from 'node:assert/strict';
import {linearDimensionPreview,drawingSnapSegments} from '../js/modeler_drawing.js';
import {measureDim,resolveDim} from '../js/cad_sheet.js';

const place={toSheet:point=>({x:point.u*10,y:-point.v*10})};
test('placing orthogonal labels past an endpoint keeps a nonzero bound measurement through rebuild',()=>{
  const basis={right:{x:1,y:0,z:0},up:{x:0,y:1,z:0}};
  const refs=[{pid:'wall',kind:'edge',at:'a',u:2,v:0},{pid:'wall',kind:'edge',at:'b',u:2,v:1.5}];
  for(const cursor of [{x:20,y:150},{x:-100,y:-5}]){
    const dim=linearDimensionPreview({refs,viewId:'front'},place,cursor);
    assert.equal(dim.type,'vertical');
    assert.equal(measureDim(dim),1.5);
    const index=new Map([['wall',{kind:'edge',descriptor:{endpoints:[{x:2,y:0,z:0},{x:2,y:1.75,z:0}]}}]]);
    assert.equal(measureDim(resolveDim(dim,index,basis).dim),1.75);
    assert.equal(dim.refs[1].v,1.5,'stored reference remains associative');
  }
  const horizontal=linearDimensionPreview({refs:[{u:0,v:2},{u:.38,v:2}]},place,{x:100,y:-20});
  assert.equal(horizontal.type,'horizontal');
  assert.equal(measureDim(horizontal),.38);
});
test('coincident projected picks cannot create a zero-size dimension; oblique and Shift picks retain placement choice',()=>{
  assert.equal(linearDimensionPreview({refs:[{u:2,v:1},{u:2,v:1}]},place,{x:20,y:50}),null);
  const refs=[{u:0,v:0},{u:3,v:4}];
  assert.equal(linearDimensionPreview({refs},place,{x:100,y:-20}).type,'vertical');
  assert.equal(linearDimensionPreview({refs},place,{x:15,y:100}).type,'horizontal');
  assert.equal(measureDim(linearDimensionPreview({refs,aligned:true},place,{x:15,y:100})),5);
});
test('displayed hidden wall endpoints can be dimensioned; suppressed or shaded hidden edges cannot',()=>{
  const visible={a:{u:0,v:0},b:{u:4,v:0}},hidden={a:{u:.25,v:.5},b:{u:.25,v:1.75}};
  const view={dir:'front',hidden:null};
  const wall={view,projection:{visible:[visible],hidden:[hidden]}};
  assert.deepEqual(drawingSnapSegments(wall,{showHidden:true}),[visible,hidden]);
  const dim=linearDimensionPreview({refs:[hidden.a,hidden.b],viewId:'front'},place,{x:-30,y:20});
  assert.equal(measureDim(dim),1.25,'true hidden cavity height, not outside height');
  assert.deepEqual(drawingSnapSegments(wall,{showHidden:false}),[visible]);
  view.hidden=true;
  assert.deepEqual(drawingSnapSegments(wall,{showHidden:false}),[visible,hidden]);
  view.displayStyle='shadedEdges';
  assert.deepEqual(drawingSnapSegments(wall,{showHidden:true}),[visible]);
});
