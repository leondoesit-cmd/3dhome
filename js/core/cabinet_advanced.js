// Lossless delta carried between the semantic cabinet generator and advanced
// CAD authoring.  It is deliberately independent of the cabinet renderer so
// persistence/rebuild behavior can be tested without a browser or Three.js.

const clone=(value)=>value==null?value:typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value));
const transientPartKeys=new Set(["meshData","exactBuildToken","exactPending","exactError","profileError"]);

export const CABINET_MANUFACTURING_ROLES={
  panel:{label:"Structural panel",defaultMaterial:"board",rate:145},
  shelf:{label:"Shelf",defaultMaterial:"board",rate:135},
  front:{label:"Door / drawer front",defaultMaterial:"front",rate:210},
  back:{label:"Back panel",defaultMaterial:"back",rate:75},
  hardware:{label:"Hardware",defaultMaterial:"metal",rate:28},
  trim:{label:"Trim / plinth",defaultMaterial:"board",rate:95},
};

export function assignCabinetManufacturing(part,options={}) {
  const role=options.role || part.role || "panel", policy=CABINET_MANUFACTURING_ROLES[role] || CABINET_MANUFACTURING_ROLES.panel;
  part.role=role; part.materialRole=options.materialRole || part.materialRole || policy.defaultMaterial;
  if (Number.isFinite(Number(options.unitRate))) part.manufacturingUnitRate=Number(options.unitRate);
  return part;
}

function partArea(part) {
  if (part.kind==="box") {
    const dims=[Math.abs(part.x1-part.x0),Math.abs(part.y1-part.y0),Math.abs(part.z1-part.z0)].sort((a,b)=>b-a);
    return dims[0]*dims[1]/10000;
  }
  if (part.kind==="ext") {
    const pts=part.pts || [], us=pts.map((p)=>p.u),vs=pts.map((p)=>p.v);
    return us.length?(Math.max(...us)-Math.min(...us))*(Math.max(...vs)-Math.min(...vs))/10000:0;
  }
  return 0;
}

function partPanelSize(part){if(part.kind==="box"){const dims=[Math.abs(part.x1-part.x0),Math.abs(part.y1-part.y0),Math.abs(part.z1-part.z0)].sort((a,b)=>b-a);return{width:dims[0],height:dims[1]};}if(part.kind==="ext"){const pts=part.pts || [],us=pts.map((p)=>p.u),vs=pts.map((p)=>p.v);if(us.length)return{width:Math.max(...us)-Math.min(...us),height:Math.max(...vs)-Math.min(...vs)};}return{width:0,height:0};}

export function cabinetSheetNesting(rows,options={}){const sheetWidth=Number(options.width)||280,sheetHeight=Number(options.height)||207,gap=Number(options.gap)||.4,sheets=[];rows.filter((row)=>row.classified&&row.role!=="hardware"&&row.width>0&&row.height>0).forEach((row)=>{let placed=false,maximum=sheets.length;for(let sheetIndex=0;sheetIndex<=maximum&&!placed;sheetIndex++){if(sheetIndex===sheets.length)sheets.push({width:sheetWidth,height:sheetHeight,placements:[],cursorX:0,cursorY:0,rowHeight:0});const sheet=sheets[sheetIndex];for(const rotated of [false,true]){const width=(rotated?row.height:row.width)+gap,height=(rotated?row.width:row.height)+gap;if(sheet.cursorX+width>sheetWidth){sheet.cursorX=0;sheet.cursorY+=sheet.rowHeight;sheet.rowHeight=0;}if(sheet.cursorY+height<=sheetHeight){sheet.placements.push({partId:row.partId,x:sheet.cursorX,y:sheet.cursorY,width:width-gap,height:height-gap,rotated});sheet.cursorX+=width;sheet.rowHeight=Math.max(sheet.rowHeight,height);placed=true;break;}}}});return{sheets:sheets.map(({cursorX,cursorY,rowHeight,...sheet})=>sheet),unplaced:rows.filter((row)=>row.classified&&row.role!=="hardware"&&!sheets.some((sheet)=>sheet.placements.some((placement)=>placement.partId===row.partId))).map((row)=>row.partId)};}

export function cabinetAdvancedManufacturing(edits) {
  const changed=[...Object.values(edits?.partOverrides || {}),...(edits?.addedParts || [])];
  const rows=changed.map((part)=>{
    const policy=CABINET_MANUFACTURING_ROLES[part.role],classified=!!(policy && part.materialRole);
    const quantity=1,area=partArea(part),rate=Number(part.manufacturingUnitRate)||policy?.rate||0;
    const size=partPanelSize(part);return {partId:part.id,name:part.name || part.id,role:part.role,materialRole:part.materialRole,quantity,area,width:size.width,height:size.height,rate,cost:classified?Math.round((part.role==="hardware"?rate:area*rate)*100)/100:null,classified};
  });
  return {rows,total:Math.round(rows.reduce((sum,row)=>sum+(row.cost || 0),0)*100)/100,complete:rows.every((row)=>row.classified),nesting:cabinetSheetNesting(rows)};
}

function cleanPart(part) {
  const result=clone(part);
  transientPartKeys.forEach((key)=>delete result[key]);
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return "["+value.map(stable).join(",")+"]";
  if (!value || typeof value!=="object") return JSON.stringify(value);
  return "{"+Object.keys(value).sort().map((key)=>JSON.stringify(key)+":"+stable(value[key])).join(",")+"}";
}

export function mergeCabinetAdvanced(base,edits,kind) {
  if (!edits) return clone(base);
  const removed=new Set(edits["removed"+kind+"Ids"] || []),overrides=edits[kind.toLowerCase()+"Overrides"] || {};
  const merged=base.filter((item)=>!removed.has(item.id)).map((item)=>overrides[item.id]?clone(overrides[item.id]):clone(item));
  const added=kind==="Sketch"?(edits.addedSketches || edits.addedSketchs):(edits.addedParts || []);
  added.forEach((item)=>{if(!merged.some((candidate)=>candidate.id===item.id)) merged.push(clone(item));});
  return merged;
}

export function captureCabinetAdvancedDelta(definition,baseParts,baseSketches) {
  const currentParts=(definition.parts || []).map(cleanPart),currentSketches=clone(definition.sketches || []);
  const basePartMap=new Map(baseParts.map((part)=>[part.id,cleanPart(part)])),currentPartMap=new Map(currentParts.map((part)=>[part.id,part]));
  const baseSketchMap=new Map(baseSketches.map((sketch)=>[sketch.id,sketch])),currentSketchMap=new Map(currentSketches.map((sketch)=>[sketch.id,sketch]));
  const partOverrides={},sketchOverrides={};
  basePartMap.forEach((part,id)=>{const current=currentPartMap.get(id);if(current && stable(current)!==stable(part)) partOverrides[id]=current;});
  baseSketchMap.forEach((sketch,id)=>{const current=currentSketchMap.get(id);if(current && stable(current)!==stable(sketch)) sketchOverrides[id]=current;});
  const edits={
    version:1,
    partOverrides,
    addedParts:currentParts.filter((part)=>!basePartMap.has(part.id)),
    removedPartIds:Array.from(basePartMap.keys()).filter((id)=>!currentPartMap.has(id)),
    sketchOverrides,
    addedSketches:currentSketches.filter((sketch)=>!baseSketchMap.has(sketch.id)),
    removedSketchIds:Array.from(baseSketchMap.keys()).filter((id)=>!currentSketchMap.has(id)),
  };
  edits.manufacturing=cabinetAdvancedManufacturing(edits);
  edits.requiresManufacturingReview=!!(edits.removedPartIds.length || !edits.manufacturing.complete);
  return edits;
}

export function cabinetPartFeatureHistory(part) {
  const id=part.featureId || "feature:"+part.id;
  const metadata={cabinetUnit:part.cabinetUnit,materialRole:part.materialRole,advanced:!String(part.id).startsWith("cabpart:")};
  let base;
  if(part.kind==="box") base={id,type:"box",name:part.name,role:part.role,params:{x:Math.min(part.x0,part.x1),y:Math.min(part.y0,part.y1),z:Math.min(part.z0,part.z1),w:Math.abs(part.x1-part.x0),h:Math.abs(part.y1-part.y0),d:Math.abs(part.z1-part.z0),role:part.role},inputs:[],metadata};
  else if(part.kind==="cyl") base={id,type:"cylinder",name:part.name,role:part.role,params:{x:part.x,y:part.y,z:part.z,r:part.r,h:part.h,role:part.role},inputs:[],metadata};
  else if(part.kind==="sph") base={id,type:"sphere",name:part.name,role:part.role,params:{x:part.x,y:part.y,z:part.z,r:part.r,role:part.role},inputs:[],metadata};
  else if(part.kind==="ext") base={id,type:"extrude",name:part.name,role:part.role,params:{axis:part.axis,...(part.frame?{frame:clone(part.frame)}:{}),from:part.from,to:part.to,points:clone(part.pts),...(part.profileEntityIds?{profileEntityIds:clone(part.profileEntityIds),sketchId:part.sketchId}:{}),...(part.support?{support:clone(part.support),baseOffset:Number(part.supportBaseOffset)||0,depth:Number(part.supportDepth)||Math.abs(part.to-part.from)}:{}),role:part.role},inputs:part.support?[part.support.ownerFeatureId]:[],metadata};
  else base={id,type:"direct",name:part.name,role:part.role,params:clone(part),inputs:[],metadata};
  const features=[base];let output=base;
  if(part.kind==="ext") {
    (part.holes || []).forEach((loop,index)=>{
      const cutter={id:id+":hole:"+index,type:"extrude",name:"Hole "+(index+1),params:{axis:part.axis,...(part.frame?{frame:clone(part.frame)}:{}),from:part.from,to:part.to,points:clone(loop)},inputs:[],metadata};
      output={id:id+":cut:"+index,type:"subtract",name:"Cut "+(index+1),params:{},inputs:[output.id,cutter.id],metadata};features.push(cutter,output);
    });
    (part.cuts3d || []).forEach((cut,index)=>{
      let from=cut.from,to=cut.to;
      if(!Number.isFinite(from)||!Number.isFinite(to)){const fallbackLo=part.axis===cut.axis?Math.min(part.from,part.to):-100,fallbackHi=part.axis===cut.axis?Math.max(part.from,part.to):100,pad=Math.max(2,(fallbackHi-fallbackLo)*.08);from=fallbackLo-pad;to=fallbackHi+pad;}
      const cutter={id:id+":cross-hole:"+index,type:"extrude",name:"Cross cut "+(index+1),params:{axis:cut.axis,...(cut.frame?{frame:clone(cut.frame)}:{}),from,to,points:clone(cut.loop)},inputs:[],metadata};
      output={id:id+":cross-cut:"+index,type:"subtract",name:"Cross cut "+(index+1),params:{},inputs:[output.id,cutter.id],metadata};features.push(cutter,output);
    });
  }
  const operations=(part.exactOperations || []).length?part.exactOperations:part.exactFillet>0?[{id:id+":fillet",type:"fillet",amount:part.exactFillet,targets:part.exactFilletTargets || []}]:[];
  operations.filter((operation)=>!operation.suppressed).forEach((operation,index)=>{
    const params={targets:clone(operation.targets || [])};
    if(operation.type==="fillet") params.radius=operation.amount;else if(operation.type==="chamfer") params.distance=operation.amount;else if(operation.type==="shell") params.thickness=operation.amount;else return;
    output={id:operation.id || id+":"+operation.type+":"+(index+1),type:operation.type,name:operation.type[0].toUpperCase()+operation.type.slice(1),params,inputs:[output.id],metadata};features.push(output);
  });
  return {features,outputId:output.id};
}
