// Explicit drafting conventions; choosing a pattern does not assign model material.
export const SECTION_HATCH_PATTERNS = Object.freeze([
 {value:'uniform',label:'Uniform (no material claim)'},
 {value:'steel',label:'Steel · paired lines'},
 {value:'cast-iron',label:'Cast iron · uniform lines'},
 {value:'copper-brass',label:'Copper / brass · solid and broken'},
 {value:'plastic',label:'Plastic · crossed lines'},
 {value:'6061-alloy',label:'6061 alloy · crossed and broken'},
 {value:'rubber',label:'Rubber · grouped lines'},
]);
export function normalizeSectionHatch(value) {
 return SECTION_HATCH_PATTERNS.some(pattern=>pattern.value===value)?value:'uniform';
}

// Label a chosen drawing convention without changing the structural section tag.
export function sectionHatchCaption(view) {
 const key=normalizeSectionHatch(view?.hatchPattern);
 if(key==='uniform' || !(view?.section || view?.alignedSection || view?.brokenOut))return '';
 const pattern=SECTION_HATCH_PATTERNS.find(item=>item.value===key);
 return pattern.label.split(' · ')[0].toUpperCase()+' PATTERN';
}

// All families use paper millimetres and the same even-odd boundary clipper.
// Broken strokes are geometry, rather than renderer-specific dash state.
export function sectionHatchSegments(loops,pattern,hatchLoops) {
 const key=normalizeSectionHatch(pattern);
 const family=(angle,spacing,offset=0,broken=false)=>({angle,spacing,offset,broken});
 const families=key==='steel'?[family(45,4.4),family(45,4.4,.8)]
  :key==='copper-brass'?[family(45,4.4),family(45,4.4,2.2,true)]
  :key==='plastic'?[family(45,2.2),family(-45,2.2)]
  :key==='6061-alloy'?[family(45,4.4),family(45,4.4,2.2,true),family(-45,4.4),family(-45,4.4,2.2,true)]
  :key==='rubber'?[family(45,8),family(45,8,1),family(45,8,2)]
  :[family(45,2.2)];
 const result=[];
 for(const family of families)for(const segment of hatchLoops(loops,family)) {
  if(!family.broken){result.push(segment);continue;}
  const angle=family.angle*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
  const a=segment.x1*dx+segment.y1*dy,b=segment.x2*dx+segment.y2*dy;
  const period=3.2,stroke=2;
  for(let start=Math.floor(a/period)*period;start<b;start+=period) {
   const lo=Math.max(a,start),hi=Math.min(b,start+stroke);
   if(hi-lo<1e-8)continue;
   result.push({x1:segment.x1+(lo-a)*dx,y1:segment.y1+(lo-a)*dy,x2:segment.x1+(hi-a)*dx,y2:segment.y1+(hi-a)*dy});
  }
 }
 return result;
}
