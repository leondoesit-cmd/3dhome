import {framePoint} from './frame.js';
export function helixFromSketch(document,params){
 let origin=params.origin || {x:0,y:0,z:0},axis=params.axis || {x:0,y:1,z:0},radius=Number(params.radius);
 if(params.sketchId){
  const sketch=(document.sketches || []).find(s=>s.id===params.sketchId),circle=sketch?.entities?.find(e=>e.id===params.circleId&&e.type==='circle'),center=sketch?.points?.find(p=>p.id===circle?.c);
  if(!center)throw new Error('Helix driving circle is unavailable');radius=circle.r;
  if(sketch.frameSpace==='local'&&sketch.frame){origin=framePoint(sketch.frame,center.x,center.y,0);axis=sketch.frame.normal;}
  else if(sketch.plane==='right'){origin={x:sketch.offset||0,y:center.y,z:center.x};axis={x:1,y:0,z:0};}
  else if(sketch.plane==='front'){origin={x:center.x,y:center.y,z:sketch.offset||0};axis={x:0,y:0,z:1};}
  else{origin={x:center.x,y:sketch.offset||0,z:center.y};axis={x:0,y:1,z:0};}
 }
 if(params.reverse)axis={x:-axis.x,y:-axis.y,z:-axis.z};
 const height=params.definition==='pitch-turns'?Number(params.pitch)*Number(params.turns):Number(params.height);
 const delta=params.taperMode==='angle'?height*Math.tan(Number(params.taperAngle)*Math.PI/180)*(params.taperOutward?1:-1):Number(params.taper || 0);
 if(!(radius>0)||!(height>0)||!(radius+delta>0))throw new Error('Helix radius and height must stay positive');
 return {...params,origin,axis,radius,radiusEnd:radius+delta,height,pitch:params.definition==='height-turns'?height/Number(params.turns):Number(params.pitch),startAngle:Number(params.startAngle || 0)*Math.PI/180};
}
