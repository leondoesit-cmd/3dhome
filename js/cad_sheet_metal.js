export function bendAllowance(angleDeg, insideRadius, thickness, kFactor = 0.33) {
  return Math.abs(angleDeg) * Math.PI / 180 * (Math.max(0, insideRadius) + Math.max(0, thickness) * kFactor);
}

export function bendDeduction(angleDeg, insideRadius, thickness, kFactor = 0.33) {
  if (!Number.isFinite(angleDeg) || Math.abs(angleDeg)>=179.9) throw new Error("Hems require a dedicated bend rule; ordinary bend deduction is not valid at 180 degrees");
  const a = Math.abs(angleDeg) * Math.PI / 180;
  const setback = Math.tan(a / 2) * (insideRadius + thickness);
  return Math.max(0, 2 * setback - bendAllowance(angleDeg, insideRadius, thickness, kFactor));
}

export function createSheetMetalPart(options = {}) {
  return {
    thickness: Number(options.thickness ?? 1.5),
    insideRadius: Number(options.insideRadius ?? 1.5),
    kFactor: Math.max(0, Math.min(.5, Number(options.kFactor ?? .33))),
    base: options.base || { width:100, height:60 },
    material: String(options.material || ""),
    bendRule: options.bendRule ? structuredClone(options.bendRule) : {type:"k-factor"},
    cornerRelief: options.cornerRelief ? structuredClone(options.cornerRelief) : null,
    flanges: [],
  };
}

export function validateBendTable(table) {
  if(table?.type!=="table"||!String(table.name || "").trim()||!String(table.source || "").trim()||!["cm","mm","in"].includes(table.units)||!Array.isArray(table.rows)||!table.rows.length)throw new Error("Bend table requires a name, source, units and measured rows");
  const keys=new Set();
  for(const row of table.rows){
    const kind=row.kind || "bend";
    if(!["bend","hem"].includes(kind)||![row.angle,row.thickness,row.radius,row.deduction].every(Number.isFinite)||row.thickness<=0||row.radius<0||row.angle<=0||row.angle>180||(kind==="hem")!==(row.angle>=179.9))throw new Error("Invalid measured bend-table row");
    const setback=kind==="hem"?row.setback:Math.tan(row.angle*Math.PI/360)*(row.radius+row.thickness);
    if(!Number.isFinite(setback)||setback<0||2*setback-row.deduction<=0)throw new Error("Bend-table deduction must leave positive developed bend length");
    const key=[kind,row.angle,row.thickness,row.radius].join(":");
    if(keys.has(key))throw new Error("Duplicate measured bend-table row");keys.add(key);
  }
  return true;
}

// Tables store measured outside-dimension deductions, never guessed values.
// Matching is exact for angle/radius/thickness; no extrapolation across tooling.
export function sheetBendRule(sheet, flange) {
  const angle=Number(flange.angle), radius=Number(flange.radius ?? sheet.insideRadius);
  const thickness=Number(sheet.thickness), rule=sheet.bendRule || {type:"k-factor"};
  if(!Number.isFinite(angle)||Math.abs(angle)>180||!Number.isFinite(radius)||radius<0)throw new Error("Invalid bend angle or radius");
  const hem=Math.abs(angle)>=179.9;
  if(rule.type==="table"){
    validateBendTable(rule);
    if(rule.material && rule.material!==sheet.material)throw new Error("Bend table material does not match the sheet");
    const scale={cm:1,mm:.1,in:2.54}[rule.units];
    const matches=rule.rows.filter(row=>(row.kind || "bend")===(hem?"hem":"bend") && Math.abs(Number(row.angle)-Math.abs(angle))<1e-7 && Math.abs(Number(row.thickness)*scale-thickness)<1e-7 && Math.abs(Number(row.radius)*scale-radius)<1e-7);
    if(matches.length!==1)throw new Error("Bend table needs exactly one matching row for this angle, thickness and radius");
    const row=matches[0], deduction=Number(row.deduction)*scale;
    const setback=hem?Number(row.setback)*scale:Math.tan(Math.abs(angle)*Math.PI/360)*(radius+thickness);
    const allowance=2*setback-deduction;
    if(![deduction,setback,allowance].every(Number.isFinite)||setback<0||allowance<=0)throw new Error("Measured bend rule has invalid deduction or setback");
    return {angle,radius,deduction,setback,allowance,rule:rule.name,source:rule.source,kind:hem?"hem":"bend"};
  }
  if(rule.type!=="k-factor")throw new Error("Unknown sheet-metal bend rule");
  const deduction=bendDeduction(angle,radius,thickness,sheet.kFactor);
  return {angle,radius,deduction,setback:Math.tan(Math.abs(angle)*Math.PI/360)*(radius+thickness),allowance:bendAllowance(angle,radius,thickness,sheet.kFactor),rule:"k-factor",kind:"bend"};
}

export function addEdgeFlange(sheet, edge, length, angle = 90) {
  const flange={id:"flange_"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),edge,length:Number(length),angle:Number(angle)};
  const values=sheetBendRule(sheet,flange);
  flange.bendAllowance=values.allowance;flange.bendDeduction=values.deduction;
  // Validate a candidate before mutating the document or its undo history.
  flatPattern({...sheet,flanges:[...(sheet.flanges || []),flange]});
  sheet.flanges.push(flange);return flange;
}

// Boundary of an orthogonal union; used for trimmed two-bend corner reliefs.
function rectangleOutline(rectangles) {
  const xs=[...new Set(rectangles.flatMap(r=>[r[0],r[2]]))].sort((a,b)=>a-b);
  const ys=[...new Set(rectangles.flatMap(r=>[r[1],r[3]]))].sort((a,b)=>a-b);
  const occupied=(i,j)=>i>=0&&j>=0&&i<xs.length-1&&j<ys.length-1&&rectangles.some(r=>xs[i]>=r[0]&&xs[i+1]<=r[2]&&ys[j]>=r[1]&&ys[j+1]<=r[3]);
  const edges=new Map(),key=p=>p.join(",");
  const add=(a,b)=>edges.set(key(a),b);
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++)if(occupied(i,j)){
    if(!occupied(i,j-1))add([xs[i],ys[j]],[xs[i+1],ys[j]]);
    if(!occupied(i+1,j))add([xs[i+1],ys[j]],[xs[i+1],ys[j+1]]);
    if(!occupied(i,j+1))add([xs[i+1],ys[j+1]],[xs[i],ys[j+1]]);
    if(!occupied(i-1,j))add([xs[i],ys[j+1]],[xs[i],ys[j]]);
  }
  const first=edges.keys().next().value,points=[];let cursor=first;
  while(edges.has(cursor)){const next=edges.get(cursor);points.push(cursor.split(",").map(Number));edges.delete(cursor);cursor=key(next);}
  if(cursor!==first||edges.size)throw new Error("Flat blank is disconnected or contains an unsupported interior cut");
  return points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);}).map(([x,y])=>({x,y}));
}

export function flatPattern(sheet) {
  const w=Number(sheet.base?.width), h=Number(sheet.base?.height);
  if(![w,h].every(value=>Number.isFinite(value)&&value>0))throw new Error("Flat pattern requires positive base dimensions");
  if(!Number.isFinite(sheet.thickness)||sheet.thickness<=0||!Number.isFinite(sheet.insideRadius)||sheet.insideRadius<0||!Number.isFinite(sheet.kFactor)||sheet.kFactor<0||sheet.kFactor>.5)throw new Error("Flat pattern requires valid thickness, bend radius and K factor");
  if(sheet.bendRule?.type==="table")validateBendTable(sheet.bendRule);
  const edges=new Set(), extent={left:0,right:0,top:0,bottom:0}, bends=[];
  for(const f of sheet.flanges || []){
    if(!["left","right","top","bottom"].includes(f.edge) || edges.has(f.edge))throw new Error("Flat pattern requires one full-width flange per edge");
    edges.add(f.edge);
    if(!Number.isFinite(Number(f.length)))throw new Error("Flange requires a finite length");
    const values=sheetBendRule(sheet,f);
    if(!(Number(f.length)>values.setback))throw new Error("Flange length must extend beyond the bend setback");
    extent[f.edge]=Number(f.length)-values.deduction;
    bends.push({id:f.id,edge:f.edge,...values});
  }
  const adjacent=(edges.has("left")||edges.has("right"))&&(edges.has("top")||edges.has("bottom"));
  const relief=sheet.cornerRelief;
  if(adjacent && (relief?.type!=="rectangular" || !Number.isFinite(relief.width) || relief.width<sheet.thickness))throw new Error("Adjacent flanges require a rectangular corner-relief rule with width at least the sheet thickness");
  const xSetbacks=bends.filter(b=>b.edge==="left"||b.edge==="right").reduce((sum,b)=>sum+b.setback,0);
  const ySetbacks=bends.filter(b=>b.edge==="top"||b.edge==="bottom").reduce((sum,b)=>sum+b.setback,0);
  if(xSetbacks>=w||ySetbacks>=h)throw new Error("Bend zones consume the base face");
  let outline=[{x:-extent.left,y:-extent.bottom},{x:w+extent.right,y:-extent.bottom},{x:w+extent.right,y:h+extent.top},{x:-extent.left,y:h+extent.top}];
  const reliefs=[];
  if(adjacent){
    const inset=edge=>edges.has(edge)?bends.find(b=>b.edge===edge).setback+relief.width/2:0;
    const x0=inset("left"),x1=w-inset("right"),y0=inset("bottom"),y1=h-inset("top");
    if(x0>=x1||y0>=y1)throw new Error("Corner relief consumes the base face");
    const rectangles=[[x0,y0,x1,y1]];
    if(edges.has("left"))rectangles.push([-extent.left,y0,x0,y1]);
    if(edges.has("right"))rectangles.push([x1,y0,w+extent.right,y1]);
    if(edges.has("bottom"))rectangles.push([x0,-extent.bottom,x1,y0]);
    if(edges.has("top"))rectangles.push([x0,y1,x1,h+extent.top]);
    if(rectangles.some(r=>r[0]>=r[2]||r[1]>=r[3]))throw new Error("Relief or bend deduction consumes a flange");
    outline=rectangleOutline(rectangles);
    for(const horizontal of ["left","right"])for(const vertical of ["bottom","top"])if(edges.has(horizontal)&&edges.has(vertical))reliefs.push({type:"rectangular",edges:[horizontal,vertical],width:relief.width,trim:"to-bend-tangent"});
  }
  for(const bend of bends){
    const location=bend.setback-bend.allowance/2;
    const halfGap=adjacent?relief.width/2:0;
    const inset=edge=>edges.has(edge)?bends.find(b=>b.edge===edge).setback+halfGap:0;
    bend.line=bend.edge==="left"||bend.edge==="right"
      ? [{x:bend.edge==="left"?location:w-location,y:adjacent?inset("bottom"):0},{x:bend.edge==="left"?location:w-location,y:adjacent?h-inset("top"):h}]
      : [{x:adjacent?inset("left"):0,y:bend.edge==="bottom"?location:h-location},{x:adjacent?w-inset("right"):w,y:bend.edge==="bottom"?location:h-location}];
  }
  return {outline,bends,reliefs,thickness:sheet.thickness,units:"cm",dimensionConvention:"outside-virtual-sharp",unfoldRule:structuredClone(sheet.bendRule?.type==="table"?sheet.bendRule:{type:"k-factor",kFactor:sheet.kFactor,insideRadius:sheet.insideRadius})};
}

export function flatPatternSvg(sheet) {
  const pattern=flatPattern(sheet), points=pattern.outline.map(p=>({x:p.x*10,y:p.y*10}));
  const minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y));
  const width=Math.max(...points.map(p=>p.x))-minX,height=Math.max(...points.map(p=>p.y))-minY;
  const path=points.map((p,i)=>(i?"L":"M")+p.x+","+p.y).join(" ")+" Z";
  const bends=pattern.bends.map(b=>`<line x1="${b.line[0].x*10}" y1="${b.line[0].y*10}" x2="${b.line[1].x*10}" y2="${b.line[1].y*10}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${minX} ${minY} ${width} ${height}"><g fill="none" stroke-width="0.1"><path id="cut" stroke="black" d="${path}"/><g id="bends" stroke="blue" stroke-dasharray="2 1">${bends}</g></g></svg>`;
}
