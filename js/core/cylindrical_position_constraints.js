// Bounded 3D constraint graph for a point on a straight Y-axis cylinder.
// All XYZ points and residuals drive placement; this is not a general 3D sketch.
function rank(matrix) {
  const rows=matrix.map(row=>row.slice());let at=0;
  for(let column=0;column<9&&at<rows.length;column++){
    let pivot=at;for(let i=at+1;i<rows.length;i++)if(Math.abs(rows[i][column])>Math.abs(rows[pivot][column]))pivot=i;
    if(Math.abs(rows[pivot][column])<1e-7)continue;
    [rows[at],rows[pivot]]=[rows[pivot],rows[at]];const value=rows[at][column];rows[at]=rows[at].map(v=>v/value);
    for(let i=0;i<rows.length;i++)if(i!==at){const factor=rows[i][column];rows[i]=rows[i].map((v,j)=>v-factor*rows[at][j]);}at++;
  }
  return at;
}
export function solveCylindricalPositionConstraints({centre,radius,top,bottom,topDistance,branch='positive-z',onSurface=true,alongZ=true,alongY=true,source}) {
  if(!centre||![centre.x,centre.z,radius,top,bottom,topDistance].every(Number.isFinite)||radius<=0||top<=bottom||topDistance<=0||topDistance>=top-bottom)throw new Error('3D cylindrical point must lie strictly between the end faces');
  if(!['positive-z','negative-z'].includes(branch))throw new Error('Choose a valid cylindrical side');
  if([onSurface,alongZ,alongY].some(value=>typeof value!=='boolean'))throw new Error('3D position relations must be enabled or disabled explicitly');
  const sign=branch==='positive-z'?1:-1;
  const values=[centre.x,top,centre.z,centre.x,top,centre.z+sign*radius,centre.x,top-topDistance,centre.z+sign*radius];
  const relations=[
    {id:'axis-centre',type:'CoincidentAxisCenter',points:['A'],enabled:true,residual:v=>[v[0]-centre.x,v[1]-top,v[2]-centre.z]},
    {id:'top-plane',type:'OnPlane',points:['B'],enabled:true,residual:v=>[v[4]-top]},
    {id:'construction-z',type:'AlongZ',points:['A','B'],enabled:alongZ,residual:v=>[v[3]-v[0],v[4]-v[1]]},
    {id:'surface',type:'OnSurface',points:['P'],enabled:onSurface,residual:v=>[((v[6]-centre.x)**2+(v[8]-centre.z)**2-radius**2)/(2*radius)]},
    {id:'top-distance',type:'DistanceToPlane',points:['P'],enabled:true,value:topDistance,residual:v=>[top-v[7]-topDistance]},
    {id:'position-y',type:'AlongY',points:['B','P'],enabled:alongY,residual:v=>[v[6]-v[3],v[8]-v[5]]}
  ];
  const active=relations.filter(relation=>relation.enabled),residual=v=>active.flatMap(relation=>relation.residual(v)),r=residual(values),jacobian=r.map(()=>[]);
  for(let column=0;column<9;column++){
    const step=Math.max(1,Math.abs(values[column]))*1e-6,a=values.slice(),b=values.slice();a[column]+=step;b[column]-=step;
    const positive=residual(a),negative=residual(b);for(let i=0;i<r.length;i++)jacobian[i][column]=(positive[i]-negative[i])/(2*step);
  }
  const degreesOfFreedom=9-rank(jacobian),maxResidual=Math.max(0,...r.map(Math.abs));
  return {schema:'modelforge-cylindrical-3d-point-constraints',version:1,units:'cm',source,branch,
    points:Object.fromEntries(['A','B','P'].map((name,i)=>[name,{x:values[3*i],y:values[3*i+1],z:values[3*i+2]}])),
    construction:{type:'line3d',start:'A',end:'B',construction:true},
    relations:relations.map(({residual,...relation})=>({...relation,residuals:residual(values)})),degreesOfFreedom,maxResidual,
    status:degreesOfFreedom?'under-defined':maxResidual>1e-8?'inconsistent':'fully-defined',
    qualification:'Bounded cylindrical point and axis-construction constraints; not a general 3D sketch or generated hole-profile sketch.'};
}
