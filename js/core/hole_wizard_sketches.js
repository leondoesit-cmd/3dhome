import { cloneDomain, domainId } from './schema.js';
import { cylindricalHolePlacement } from './cylindrical_hole_placement.js';
import { normalizeHoleWizard } from '../cad_hole_wizard.js';
import { frameCross } from './frame.js';

const POSITION='cylindrical-position-3d', PROFILE='hole-counterbore-profile';
const RELATIONS=['CoincidentAxisCenter','OnPlane','AlongZ','OnSurface','DistanceToPlane','AlongY'];
const PROFILE_RELATIONS=['AxialOrigin','OrthogonalSteps','ProfileDimensions','ThroughAllExtent'];
export function isHoleWizardSketch(sketch) { return [POSITION,PROFILE].includes(sketch?.kind); }
function requireSketch(sketch,kind) {
  if(sketch?.kind!==kind || sketch.sketchSchemaVersion!==1 || sketch.units!=='cm')throw new Error('Unsupported Hole Wizard sketch kind, version or units');
  if(sketch.suppressed)throw new Error('Hole Wizard sketch is suppressed');
}
function enabled(relation) { return relation.enabled!==false && !relation.suppressed; }
function rank(matrix) {
  const rows=matrix.map(row=>row.slice());let at=0;
  for(let col=0;col<9 && at<rows.length;col++){
    let pivot=at;for(let row=at+1;row<rows.length;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    if(Math.abs(rows[pivot][col])<1e-7)continue;
    [rows[at],rows[pivot]]=[rows[pivot],rows[at]];
    const divisor=rows[at][col];rows[at]=rows[at].map(v=>v/divisor);
    for(let row=0;row<rows.length;row++)if(row!==at){const scale=rows[row][col];rows[row]=rows[row].map((v,i)=>v-scale*rows[at][i]);}at++;
  }
  return at;
}
function linearSolve(matrix,vector) {
  const rows=matrix.map((row,i)=>[...row,vector[i]]);
  for(let col=0;col<9;col++){
    let pivot=col;for(let row=col+1;row<9;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    if(Math.abs(rows[pivot][col])<1e-15)throw new Error('Singular 3D position solve');
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const scale=rows[col][col];rows[col]=rows[col].map(v=>v/scale);
    for(let row=0;row<9;row++)if(row!==col){const factor=rows[row][col];rows[row]=rows[row].map((v,i)=>v-factor*rows[col][i]);}
  }
  return rows.map(row=>row[9]);
}
function positionSeed(sketch,document) {
  const face=sketch.source?.faceReference;
  if(face && (face.descriptor?.surface!=='cylinder' || (face.ownerFeatureId && face.ownerFeatureId!==sketch.source.featureId)))throw new Error('3D position requires its original cylindrical source face');
  return cylindricalHolePlacement({cylindricalSource:sketch.source,cylinderTopDistance:Number(sketch.topDistance),
    cylinderPlacementMethod:'constraints',cylinderConstraintBranch:sketch.branch},document).positionGraph;
}
function solvePosition(sketch,document) {
  requireSketch(sketch,POSITION);
  const seed=positionSeed(sketch,document), points=['A','B','P'].map(name=>sketch.points?.find(point=>point.role===name));
  if(points.some(point=>!point || ![point.x,point.y,point.z].every(Number.isFinite)))throw new Error('3D position requires finite saved A, B and P points');
  if(sketch.points.length!==3 || new Set(points.map(p=>p.id)).size!==3 || sketch.entities?.length!==2
    || !sketch.entities.some(e=>e.type==='line' && e.construction && e.a===points[0].id && e.b===points[1].id)
    || !sketch.entities.some(e=>e.type==='point' && !e.construction && e.p===points[2].id))throw new Error('Invalid 3D position construction and point entities');
  if(sketch.constraints?.length!==6 || RELATIONS.some(type=>sketch.constraints.filter(c=>c.type===type).length!==1))throw new Error('Unsupported or missing 3D position relation');
  const expected={CoincidentAxisCenter:['A'],OnPlane:['B'],AlongZ:['A','B'],OnSurface:['P'],DistanceToPlane:['P'],AlongY:['B','P']};
  for(const relation of sketch.constraints){
    if(JSON.stringify(relation.points)!==JSON.stringify(expected[relation.type].map(role=>points[['A','B','P'].indexOf(role)].id)))throw new Error('Invalid 3D relation point references');
  }
  const a=seed.points.A, radius=Math.abs(seed.points.B.z-a.z), active=sketch.constraints.filter(enabled);
  function residual(values) {
    return active.flatMap(relation=>{
      switch(relation.type){
        case 'CoincidentAxisCenter':return [values[0]-a.x,values[1]-a.y,values[2]-a.z];
        case 'OnPlane':return [values[4]-a.y];
        case 'AlongZ':return [values[3]-values[0],values[4]-values[1]];
        case 'OnSurface':return [((values[6]-a.x)**2+(values[8]-a.z)**2-radius**2)/(2*radius)];
        case 'DistanceToPlane':return [a.y-values[7]-Number(sketch.topDistance)];
        case 'AlongY':return [values[6]-values[3],values[8]-values[5]];
        default:throw new Error('Unsupported 3D relation');
      }
    });
  }
  function jacobian(values) {
    const rows=residual(values).map(()=>[]);
    for(let col=0;col<9;col++){
      const step=Math.max(1,Math.abs(values[col]))*1e-6, p=values.slice(),n=values.slice();p[col]+=step;n[col]-=step;
      const rp=residual(p),rn=residual(n);for(let row=0;row<rows.length;row++)rows[row][col]=(rp[row]-rn[row])/(2*step);
    }
    return rows;
  }
  let values=points.flatMap(point=>[point.x,point.y,point.z]);
  // A side change is an authored discrete branch, never a numerical accident.
  const sign=sketch.branch==='positive-z'?1:-1;
  if((values[8]-a.z)*sign<=0){values[5]=a.z+sign*radius;values[8]=a.z+sign*radius;}
  for(let iteration=0;iteration<60;iteration++){
    const r=residual(values);if(Math.max(0,...r.map(Math.abs))<1e-10)break;
    const j=jacobian(values),normal=Array.from({length:9},(_,u)=>Array.from({length:9},(_,v)=>j.reduce((sum,row)=>sum+row[u]*row[v],0)+(u===v?1e-9:0)));
    const rhs=Array.from({length:9},(_,u)=>-j.reduce((sum,row,i)=>sum+row[u]*r[i],0)),delta=linearSolve(normal,rhs);
    const oldNorm=r.reduce((sum,v)=>sum+v*v,0);let scale=1;
    for(let trial=0;trial<20;trial++){
      const next=values.map((v,i)=>v+scale*delta[i]),nextNorm=residual(next).reduce((sum,v)=>sum+v*v,0);
      if(nextNorm<=oldNorm){values=next;break;}scale/=2;
    }
  }
  const maxResidual=Math.max(0,...residual(values).map(Math.abs)),degreesOfFreedom=9-rank(jacobian(values));
  const status=maxResidual>1e-7?'inconsistent':degreesOfFreedom?'under-defined':'fully-defined';
  points.forEach((point,i)=>Object.assign(point,{x:values[3*i],y:values[3*i+1],z:values[3*i+2]}));
  sketch.constraints.find(c=>c.type==='DistanceToPlane').value=Number(sketch.topDistance);
  sketch.status=status;sketch.diagnostics={degreesOfFreedom,maxResidual};
  return {ok:status==='fully-defined',status,degreesOfFreedom,maxResidual,points:cloneDomain(points)};
}
function profileDimension(sketch,name) {
  const matches=(sketch.dimensions || []).filter(d=>d.name===name);
  if(matches.length!==1 || !Number.isFinite(matches[0].value) || matches[0].value<=0)throw new Error('Invalid counterbore profile dimension '+name);
  return matches[0];
}
function solveProfile(sketch,document) {
  requireSketch(sketch,PROFILE);
  const position=document.sketches?.find(item=>item.id===sketch.positionSketchId);
  const positionRun=solvePosition(position,document);
  if(!positionRun.ok)throw new Error('Counterbore profile requires fully defined 3D position');
  if(sketch.constraints?.length!==4 || PROFILE_RELATIONS.some(type=>sketch.constraints.filter(c=>c.type===type).length!==1))throw new Error('Unsupported or missing counterbore profile relation');
  if(sketch.params?.holeType!=='counterbore' || sketch.params.endCondition!=='through-all')throw new Error('Separate sketches support through-all counterbores only');
  const dims=['diameter','cboreDiameter','cboreDepth'].map(name=>profileDimension(sketch,name));
  const [bore,head,depth]=dims.map(d=>d.value);
  const cylinder=document.sketches.find(s=>s.id===document.features.find(f=>f.id===position.source.featureId)?.params.sketchId);
  const radius=cylinder?.entities.find(e=>e.id===position.source.circleId)?.r;
  const extent=2*radius+1e-5;
  if(head<=bore || depth>=2*radius)throw new Error('Counterbore profile must have a wider head and a recess shallower than the cylinder');
  const dof=dims.filter(d=>d.suppressed || d.driving===false).length+sketch.constraints.filter(c=>!enabled(c)).length;
  if(dof){sketch.status='under-defined';sketch.diagnostics={degreesOfFreedom:dof,maxResidual:0};return {ok:false,status:sketch.status,degreesOfFreedom:dof,maxResidual:0};}
  const coordinates=[[0,0],[0,head/2],[depth,head/2],[depth,bore/2],[extent,bore/2],[extent,0]];
  if(sketch.points?.length!==6 || sketch.entities?.length!==6 || sketch.entities.some((e,i)=>e.type!=='line' || e.a!==sketch.points[i].id || e.b!==sketch.points[(i+1)%6].id))throw new Error('Invalid saved counterbore profile contour');
  sketch.points.forEach((point,i)=>Object.assign(point,{x:coordinates[i][0],y:coordinates[i][1]}));
  const p=position.points.find(point=>point.role==='P'),outward={x:0,y:0,z:position.branch==='positive-z'?1:-1};
  const inward={x:0,y:0,z:-outward.z},radial={x:1,y:0,z:0};
  sketch.frame={origin:{x:p.x,y:p.y,z:p.z},xAxis:inward,yAxis:radial,normal:frameCross(inward,radial)};
  sketch.derivedExtent=extent;sketch.status='fully-defined';sketch.diagnostics={degreesOfFreedom:0,maxResidual:0};
  return {ok:true,status:sketch.status,degreesOfFreedom:0,maxResidual:0};
}
export function solveHoleWizardSketch(sketch,document) {
  try{return sketch?.kind===POSITION?solvePosition(sketch,document):solveProfile(sketch,document);}
  catch(error){return {ok:false,status:'inconsistent',degreesOfFreedom:null,maxResidual:null,error:String(error.message || error)};}
}
export function createHoleWizardSketchPair(params,document,options={}) {
  const positionId=options.positionId || domainId('sketch3d'),profileId=options.profileId || domainId('holeprofile');
  const normalized=normalizeHoleWizard(params);
  if(normalized.holeType!=='counterbore' || normalized.endCondition!=='through-all')throw new Error('Separate sketches support through-all counterbores only');
  const source=cloneDomain(params.cylindricalSource),branch=params.cylinderConstraintBranch || 'positive-z';
  const graph=cylindricalHolePlacement({...params,cylinderPlacementMethod:'constraints'},document).positionGraph;
  const roleId=role=>positionId+':'+role;
  const support=source?.faceReference?{...cloneDomain(source.faceReference),type:'topology-reference',ownerFeatureId:source.featureId}:undefined;
  const position={id:positionId,name:'3D hole position',kind:POSITION,sketchSchemaVersion:1,units:'cm',frameSpace:'world-3d',referenceId:support?.persistentId || 'plane:top',support,
    source,topDistance:Number(params.cylinderTopDistance),branch,
    points:Object.entries(graph.points).map(([role,point])=>({id:roleId(role),role,...point})),
    entities:[{id:positionId+':construction',type:'line',a:roleId('A'),b:roleId('B'),construction:true},{id:positionId+':point',type:'point',p:roleId('P')}],
    constraints:graph.relations.map(r=>({...r,id:positionId+':'+r.id,points:r.points.map(roleId)})),dimensions:[]};
  const profile={id:profileId,name:'Counterbore profile',kind:PROFILE,sketchSchemaVersion:1,units:'cm',frameSpace:'local',plane:'front',referenceId:'plane:front',
    positionSketchId:positionId,source:cloneDomain(source),params:{...cloneDomain(params),holeType:'counterbore',endCondition:'through-all'},
    points:Array.from({length:6},(_,i)=>({id:profileId+':p'+i,x:0,y:0})),entities:[],
    constraints:PROFILE_RELATIONS.map(type=>({id:profileId+':'+type,type,enabled:true})),
    dimensions:['diameter','cboreDiameter','cboreDepth'].map(name=>({id:profileId+':'+name,name,value:normalized[name],driving:true}))};
  profile.entities=profile.points.map((point,i)=>({id:profileId+':line'+i,type:'line',a:point.id,b:profile.points[(i+1)%6].id}));
  const temporary={...document,sketches:[...(document.sketches || []),position,profile]};
  const run=solveHoleWizardSketch(profile,temporary);if(!run.ok)throw new Error(run.error || 'Hole Wizard sketches are not fully defined');
  return {position,profile,params:{...cloneDomain(params),positionSketchId:positionId,holeProfileSketchId:profileId,sketchId:profileId}};
}
export function resolveHoleWizardInputs(featureOrParams,document) {
  const params=featureOrParams?.type==='hole'?featureOrParams.params:featureOrParams;
  if(!params?.positionSketchId && !params?.holeProfileSketchId)return {params:cloneDomain(params || {}),placement:params?.cylindricalSource?cylindricalHolePlacement(params,document):null};
  if(!params.positionSketchId || !params.holeProfileSketchId)throw new Error('Hole Wizard requires both saved position and profile sketches');
  const position=document?.sketches?.find(s=>s.id===params.positionSketchId),profile=document?.sketches?.find(s=>s.id===params.holeProfileSketchId);
  requireSketch(position,POSITION);requireSketch(profile,PROFILE);
  if(profile.positionSketchId!==position.id || profile.source?.featureId!==position.source?.featureId || profile.source?.circleId!==position.source?.circleId)throw new Error('Hole Wizard sketches have mismatched source dependencies');
  const run=solveHoleWizardSketch(profile,document);if(!run.ok)throw new Error(run.error || 'Hole Wizard sketches are '+run.status);
  const resolved={...cloneDomain(params),...cloneDomain(profile.params),sketchId:profile.id,positionSketchId:position.id,holeProfileSketchId:profile.id,
    cylindricalSource:cloneDomain(position.source),cylinderPlacementMethod:'constraints',cylinderConstraintBranch:position.branch,cylinderTopDistance:position.topDistance,
    cylinderOnSurface:true,cylinderAlongZ:true,cylinderAlongY:true};
  for(const name of ['diameter','cboreDiameter','cboreDepth']){
    let value=profileDimension(profile,name).value;
    if(name==='cboreDepth' && resolved.headClearanceEnabled){value-=normalizeHoleWizard(resolved).headClearance;if(!(value>0))throw new Error('Counterbore profile depth must exceed head clearance');resolved.nominalCboreDepthMm=value*10;}
    resolved[name]=value;resolved[name+'Mm']=value*10;
  }
  return {params:resolved,placement:cylindricalHolePlacement(resolved,document)};
}
