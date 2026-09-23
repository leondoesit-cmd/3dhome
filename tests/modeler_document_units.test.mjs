import test from 'node:test';
import assert from 'node:assert/strict';
import {documentLengthUnit,formatDocumentLength,lengthFromDocument,lengthToDocument} from '../js/core/document_length_units.js';
import {evaluateFeatureNumber} from '../js/modeler_feature_form.js';
import {measureDistance} from '../js/cad_evaluate.js';
import {distanceDimensionLayout,drawSketchDimensions,hitSketchDimension} from '../js/sketch_dimensions.js';

test('BUSHING inch display round-trips without changing centimetre geometry',()=>{
  const radii=[.23876,.35941,.508];
  assert.deepEqual(radii.map(value=>formatDocumentLength(value,'in')),["0.094","0.1415","0.2"]);
  for(const radius of radii) assert.ok(Math.abs(lengthFromDocument(lengthToDocument(radius,'in'),'in')-radius)<1e-12);
  assert.equal(formatDocumentLength(1.016,'in'),'0.4');
  assert.equal(formatDocumentLength(2.739218e-14,'in'),'0');
  assert.equal(documentLengthUnit('invalid'),'cm');
});

test('feature fields accept bare document inches and explicit unit literals',()=>{
  const field={key:'depth',unit:'length',inputUnit:'in',min:.000001};
  assert.equal(evaluateFeatureNumber('.1',field),.254);
  assert.equal(evaluateFeatureNumber('2*.1',field),.508);
  assert.equal(evaluateFeatureNumber('2.54mm',field),.254);
  assert.ok(Math.abs(evaluateFeatureNumber('4.5in - 104.14mm',field)-1.016)<1e-12);
});

test('measurement retains fractional-millimetre precision for unit conversion',()=>{
  const result=measureDistance({x:0,y:0,z:0},{x:.03175,y:0,z:0});
  assert.equal(result.distance,.03175);
  assert.equal(formatDocumentLength(result.distance,'in'),'0.0125');
});

test('sketch canvas labels and hit targets follow the part unit',()=>{
  const sketch={points:[{id:'a',x:0,y:0},{id:'b',x:.127,y:0}],entities:[{id:'line',type:'line',a:'a',b:'b'}],constraints:[{id:'dim',type:'distance',entity:'line',value:.127}]};
  const labels=[];
  const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},fillText(label){labels.push(label);},measureText(label){return {width:label.length*8}}};
  const toPx=(x,y)=>({x:x*1000,y:y*1000});
  drawSketchDimensions(ctx,sketch,1,toPx,[],{unit:'in'});
  assert.deepEqual(labels,['0.05 in']);
  const label=distanceDimensionLayout(sketch,sketch.constraints[0],toPx).label;
  assert.equal(hitSketchDimension(sketch,label.x+5,label.y-5,toPx,9,'in')?.id,'dim');
});
