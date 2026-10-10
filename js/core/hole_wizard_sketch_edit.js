import {solveHoleWizardSketch,isHoleWizardSketch} from './hole_wizard_sketches.js';

// Dedicated bounded editor: dimensions and relation state, never generic 2D
// commands or unauthored replacement geometry.
export function editedHoleWizardSketch(document,sketchId,values) {
  const draft=structuredClone(document),sketch=draft.sketches.find(s=>s.id===sketchId);
  if(!isHoleWizardSketch(sketch))throw new Error('Select a supported Hole Wizard sketch');
  if(sketch.kind==='cylindrical-position-3d'){
    if(!Number.isFinite(values.topDistance) || !['positive-z','negative-z'].includes(values.branch))throw new Error('Enter a finite top distance and cylindrical side');
    sketch.topDistance=values.topDistance;sketch.branch=values.branch;
    for(const type of ['OnSurface','AlongZ','AlongY']){
      if(typeof values[type]!=='boolean')throw new Error('Choose each supported relation state');
      const relation=sketch.constraints.find(c=>c.type===type);if(!relation)throw new Error('Missing '+type+' relation');
      relation.enabled=values[type];relation.suppressed=!values[type];
    }
  }else{
    for(const name of ['diameter','cboreDiameter','cboreDepth']){
      if(!Number.isFinite(values[name]) || values[name]<=0)throw new Error('Enter a positive '+name);
      const dimension=sketch.dimensions.find(d=>d.name===name);if(!dimension)throw new Error('Missing '+name+' dimension');
      if(name!=='cboreDepth' && dimension.value!==values[name])sketch.params={...sketch.params,standard:'Custom',standardSize:'custom'};
      dimension.value=values[name];
    }
  }
  const result=solveHoleWizardSketch(sketch,draft);
  return {document:draft,sketch,result};
}

export function holeWizardSketchPolylines(sketch) {
  const point=id=>sketch.points.find(p=>p.id===id);
  if(sketch.kind==='cylindrical-position-3d')return sketch.entities.map(entity=>entity.type==='line'?[point(entity.a),point(entity.b)]:[point(entity.p)]).filter(line=>line.every(Boolean));
  const frame=sketch.frame;if(!frame)return [];
  const world=p=>({x:frame.origin.x+p.x*frame.xAxis.x+p.y*frame.yAxis.x,y:frame.origin.y+p.x*frame.xAxis.y+p.y*frame.yAxis.y,z:frame.origin.z+p.x*frame.xAxis.z+p.y*frame.yAxis.z});
  return sketch.entities.map(entity=>[point(entity.a),point(entity.b)]).filter(line=>line.every(Boolean)).map(line=>line.map(world));
}
