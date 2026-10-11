const copy=value=>JSON.parse(JSON.stringify(value));
const finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
export function validateNamedCameraPose(pose){
  if(!pose||![pose.az,pose.el,pose.dist].every(Number.isFinite)||pose.dist<=0||Math.abs(pose.el)>Math.PI/2||!finite(pose.worldTarget)||!['perspective','orthographic'].includes(pose.projection))throw new Error('A named view needs a finite current camera pose');
  if(pose.zoom!=null&&(!Number.isFinite(pose.zoom)||pose.zoom<=0))throw new Error('A named view needs a positive camera zoom');
  if(pose.frame){const f=pose.frame,axes=[f.xAxis,f.yAxis,f.normal];
    if(!finite(f.origin)||axes.some(a=>!finite(a)||Math.abs(dot(a,a)-1)>1e-6)||Math.abs(dot(axes[0],axes[1]))>1e-6||Math.abs(dot(axes[0],axes[2]))>1e-6||Math.abs(dot(axes[1],axes[2]))>1e-6)throw new Error('A named drafting view needs orthonormal frame axes');
  }
  return copy(pose);
}
export function captureNamedCameraPose(view,centerY=0){
  if(!view||!finite(view.target)||!Number.isFinite(centerY))throw new Error('Open a current 3D viewport first');
  const t=view.target,f=view.fixedFrame;
  return validateNamedCameraPose({az:view.az,el:view.el,dist:view.dist,zoom:view.cam?.zoom??1,worldTarget:f?{x:f.origin.x+t.x,y:f.origin.y+t.y,z:f.origin.z+t.z}:{x:t.x,y:t.y+centerY,z:t.z},projection:view.getProjection(),...(f?{frame:copy(f)}:{})});
}
export function restoreNamedCameraPose(view,pose,centerY=0){
  const p=validateNamedCameraPose(pose);if(!view||!Number.isFinite(centerY))throw new Error('Open a current 3D viewport first');
  view.clearFixedFrame(false);view.az=p.az;view.el=p.el;view.dist=p.dist;
  view.target.set(p.worldTarget.x,p.worldTarget.y-centerY,p.worldTarget.z);view.setProjection(p.projection);
  if(p.frame)view.lookAtFrame(p.frame);
  if(view.cam){view.cam.zoom=p.zoom??1;view.cam.updateProjectionMatrix();}
  view.render();return true;
}
export function namedCameraViews(document){
  const records=document?.metadata?.namedCameraViews||[];
  if(!Array.isArray(records))throw new Error('The named view collection is invalid');
  return records.map(v=>{if(!v||typeof v.id!=='string'||!v.id||typeof v.name!=='string'||!v.name.trim()||v.name.length>80)throw new Error('A stored named view is invalid');return {id:v.id,name:v.name,pose:validateNamedCameraPose(v.pose)};});
}
export function addNamedCameraView(document,{id,name,pose}){
  name=String(name||'').trim();if(!name||name.length>80)throw new Error('Enter a view name of at most 80 characters');
  if(!document||typeof id!=='string'||!id)throw new Error('A named view needs a current document and identifier');
  const current=namedCameraViews(document);
  if(current.some(v=>v.id===String(id)||v.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('Choose a unique view name');
  const record={id:String(id),name,pose:validateNamedCameraPose(pose)};
  document.metadata||={};document.metadata.namedCameraViews=current.concat(record);return copy(record);
}
export function removeNamedCameraView(document,id){
  const current=namedCameraViews(document);if(!current.some(v=>v.id===String(id)))return false;
  document.metadata||={};document.metadata.namedCameraViews=current.filter(v=>v.id!==String(id));return true;
}
