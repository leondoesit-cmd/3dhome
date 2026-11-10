// OCR locations stay in image pixels. Printed lengths need measured endpoints;
// recognizing a number alone is not a scale calibration.
export function printedLength(text){
  const value=String(text||'').replace(/,/g,'.').replace(/[’′]/g,"'").replace(/[”″]/g,'"').trim();
  let m=value.match(/(\d+(?:\.\d+)?)\s*(mm|cm|m|ס["״]?מ|מטר)(?=$|\s|[;,])/i);
  if(m)return {cm:+m[1]*(/^mm$/i.test(m[2])?.1:/^(m|מטר)$/i.test(m[2])?100:1),assumed:false};
  m=value.match(/(\d+)\s*'\s*(?:[- ]\s*)?(\d+(?:\.\d+)?)?\s*"?/);
  if(m)return {cm:+m[1]*30.48+(+m[2]||0)*2.54,assumed:false};
  if(/^\d{3,4}$/.test(value))return {cm:+value,assumed:true};
  return null;
}

function spanFor(line,image){
  const {width,height,data}=image,b=line.bbox,vertical=b.y1-b.y0>(b.x1-b.x0)*1.4;
  const across=vertical?width:height,along=vertical?height:width;
  const c0=vertical?b.x0:b.y0,c1=vertical?b.x1:b.y1,a0=vertical?b.y0:b.x0,a1=vertical?b.y1:b.x1;
  const ink=(p,c)=>{const x=vertical?c:p,y=vertical?p:c,i=(y*width+x)*4;return Math.max(data[i],data[i+1],data[i+2])<180;};
  let best=null;
  for(let c=Math.max(0,Math.floor(c0)-8);c<Math.min(across,Math.ceil(c1)+9);c++){
    const runs=[];let start=-1,last=-1;
    for(let p=0;p<=along+2;p++){
      const on=p<along && !(p>=a0-4&&p<=a1+4)&&ink(p,c);
      if(on){if(start<0)start=p;last=p;}
      else if(start>=0&&p-last>2){if(last-start>Math.max(12,(c1-c0)*1.2))runs.push([start,last]);start=-1;}
    }
    const left=runs.filter(r=>r[1]<a0&&a0-r[1]<Math.max(60,(c1-c0)*4)).at(-1);
    const right=runs.find(r=>r[0]>a1&&r[0]-a1<Math.max(60,(c1-c0)*4));
    if(!left||!right)continue;
    const thin=a=>{
      let lo=c,hi=c;
      while(lo>0&&c-lo<5&&ink(a,lo-1))lo--;
      while(hi+1<across&&hi-c<5&&ink(a,hi+1))hi++;
      return hi-lo+1<=4;
    };
    if(!thin(Math.floor((left[0]+left[1])/2))||!thin(Math.floor((right[0]+right[1])/2)))continue;
    const tick=a=>{
      let lo=c,hi=c;
      while(lo>0&&ink(a,lo-1))lo--;
      while(hi+1<across&&ink(a,hi+1))hi++;
      const length=hi-lo+1;
      return length>=6&&length<=Math.max(70,(c1-c0)*4)&&lo<c-2&&hi>c+2;
    };
    if(!tick(left[0])||!tick(right[1]))continue;
    const score=(left[1]-left[0]+right[1]-right[0])-Math.abs(c-(c0+c1)/2)*2;
    if(!best||score>best.score)best={a:left[0],b:right[1],c,score};
  }
  if(!best||best.b-best.a<60)return null;
  return vertical?{x1:best.c,y1:best.a,x2:best.c,y2:best.b}:{x1:best.a,y1:best.c,x2:best.b,y2:best.c};
}

function roomSizePair(text,b,walls){
  const match=text.match(/^\s*(\d{3,4})\s*[/×x]\s*(\d{3,4})\s*(?:cm|ס["״]?מ)?\s*$/i);
  if(!match)return [];
  const x=(b.x0+b.x1)/2,y=(b.y0+b.y1)/2;
  const vertical=walls.filter(w=>Math.abs(w[0]-w[2])<1&&y>Math.min(w[1],w[3])&&y<Math.max(w[1],w[3]));
  const horizontal=walls.filter(w=>Math.abs(w[1]-w[3])<1&&x>Math.min(w[0],w[2])&&x<Math.max(w[0],w[2]));
  const left=vertical.filter(w=>w[0]<x).sort((a,b)=>b[0]-a[0])[0],right=vertical.filter(w=>w[0]>x).sort((a,b)=>a[0]-b[0])[0];
  const top=horizontal.filter(w=>w[1]<y).sort((a,b)=>b[1]-a[1])[0],bottom=horizontal.filter(w=>w[1]>y).sort((a,b)=>a[1]-b[1])[0];
  if(!left||!right||!top||!bottom)return [];
  const x0=left[0]+left[4]/2,x1=right[0]-right[4]/2,y0=top[1]+top[4]/2,y1=bottom[1]-bottom[4]/2;
  if(x1-x0<25||y1-y0<25)return [];
  const choices=[[+match[1],+match[2]],[+match[2],+match[1]]].map(values=>({values,error:Math.abs(Math.log((values[0]/(x1-x0))/(values[1]/(y1-y0))))})).sort((a,b)=>a.error-b.error);
  // A pair supplies scale only when the enclosing measured room agrees in
  // both axes. Reject distorted drawings and numbers beside the wrong room.
  if(choices[0].error>Math.log(1.15))return [];
  const [w,d]=choices[0].values;
  return [{text,valueCm:w,x1:x0,y1:y,x2:x1,y2:y},{text,valueCm:d,x1:x,y1:y0,x2:x,y2:y1}]
    .map(dim=>({...dim,unitAssumed:!/(cm|ס["״]?מ)/i.test(text),source:'ocr-room-size'}));
}

// Printed numbers whose dimension line cannot be followed (faint hairlines in
// a photo, lines that continue through chained values) are paired with the
// measured walls on either side of them along their reading direction; most
// values inside a room are its wall-to-wall size. Every pairing votes for a
// cm-per-pixel scale, and only numbers agreeing with the scale backed by the
// most independent numbers become dimensions. A misread value or a number
// beside the wrong walls loses the vote instead of skewing the scale.
const PAIR_TOLERANCE=.04;
export function wallPairDimensions(numbers,walls){
  const verticalWalls=walls.filter(w=>Math.abs(w[0]-w[2])<1),horizontalWalls=walls.filter(w=>Math.abs(w[1]-w[3])<1);
  const options=numbers.map(n=>{
    const b=n.bbox,x=(b.x0+b.x1)/2,y=(b.y0+b.y1)/2,vertical=b.y1-b.y0>(b.x1-b.x0)*1.4;
    // Text reads along its dimension: horizontal text measures between vertical walls.
    const across=vertical?horizontalWalls:verticalWalls,pos=w=>vertical?w[1]:w[0];
    const covers=w=>vertical?x>=Math.min(w[0],w[2])-2&&x<=Math.max(w[0],w[2])+2:y>=Math.min(w[1],w[3])-2&&y<=Math.max(w[1],w[3])+2;
    const lo=vertical?b.y0:b.x0,hi=vertical?b.y1:b.x1;
    const before=across.filter(w=>covers(w)&&pos(w)<lo).sort((p,q)=>pos(q)-pos(p))[0];
    const after=across.filter(w=>covers(w)&&pos(w)>hi).sort((p,q)=>pos(p)-pos(q))[0];
    if(!before||!after)return [];
    // Interior (face to face) and centre-line readings are both conventions.
    return [true,false].map(faces=>{
      const a=pos(before)+(faces?before[4]/2:0),e=pos(after)-(faces?after[4]/2:0);
      return {ratio:n.valueCm/(e-a),a,e,vertical,x,y,faces};
    }).filter(o=>o.e-o.a>=20);
  });
  const agrees=(o,ratio)=>Math.abs(o.ratio/ratio-1)<=PAIR_TOLERANCE;
  let best=null;
  for(const list of options)for(const o of list){
    const support=options.filter(l=>l.some(q=>agrees(q,o.ratio))).length;
    const spread=options.reduce((sum,l)=>sum+Math.min(PAIR_TOLERANCE,...l.map(q=>Math.abs(q.ratio/o.ratio-1))),0);
    if(!best||support>best.support||support===best.support&&spread<best.spread)best={ratio:o.ratio,support,spread};
  }
  if(!best||best.support<3)return [];
  return numbers.flatMap((n,i)=>{
    const o=options[i].filter(q=>agrees(q,best.ratio)).sort((p,q)=>Math.abs(p.ratio/best.ratio-1)-Math.abs(q.ratio/best.ratio-1))[0];
    if(!o)return [];
    const ends=o.vertical?{x1:o.x,y1:o.a,x2:o.x,y2:o.e}:{x1:o.a,y1:o.y,x2:o.e,y2:o.y};
    return [{text:n.text,valueCm:n.valueCm,...ends,unitAssumed:n.assumed,source:'ocr-wall-pair'}];
  });
}

export function blueprintTextFeatures(lines,image,walls=[]){
  const rooms=[],dimensions=[],warnings=[],textBoxes=[],unspanned=[];
  const bounds=walls.length?{x0:Math.min(...walls.flatMap(w=>[w[0],w[2]])),x1:Math.max(...walls.flatMap(w=>[w[0],w[2]])),
    y0:Math.min(...walls.flatMap(w=>[w[1],w[3]])),y1:Math.max(...walls.flatMap(w=>[w[1],w[3]]))}:{x0:0,y0:0,x1:image.width,y1:image.height};
  for(const line of [...lines].sort((a,b)=>b.confidence-a.confidence)){
    const text=String(line.text||'').replace(/\s+/g,' ').trim(),b=line.bbox;
    if(!b||line.confidence<45||!text||text.length>100)continue;
    if(line.confidence>=70&&text.length>=2)textBoxes.push(b);
    const pair=line.confidence>=85?roomSizePair(text,b,walls):[];
    if(pair.length){dimensions.push(...pair);continue;}
    const length=printedLength(text);
    if(length&&length.cm>=20&&length.cm<=10000){
      const span=spanFor(line,image);
      if(span){dimensions.push({text,valueCm:length.cm,...span,unitAssumed:length.assumed,source:'ocr'});continue;}
      if(length.cm>=60&&line.confidence>=70)unspanned.push({text,valueCm:length.cm,bbox:b,assumed:length.assumed});
    }
    const x=(b.x0+b.x1)/2,y=(b.y0+b.y1)/2;
    if(line.rotated||x<bounds.x0||x>bounds.x1||y<bounds.y0||y>bounds.y1)continue;
    if(line.confidence<70||text.replace(/[^A-Za-z\u0590-\u05ff]/g,'').length<3&&!/^wc$/i.test(text))continue;
    if(!/[A-Za-z\u0590-\u05ff]{2}/.test(text)||/space for|scale|description/i.test(text))continue;
    if(/\d/.test(text)&&!/room|bed|living|kitchen|bath|office|חדר|שינה|סלון|מטבח|רחצה/i.test(text))continue;
    if(/^(bed|chair|table|sofa|sink|stove|shelves|closet|down|up|cm|mm|m)$/i.test(text))continue;
    if(rooms.some(r=>Math.abs(r.x-x)<Math.max(12,(b.x1-b.x0)*.3)&&Math.abs(r.y-y)<Math.max(8,(b.y1-b.y0)*.4)))continue;
    rooms.push({label:text,x,y,confidence:line.confidence,source:'ocr'});
  }
  dimensions.push(...wallPairDimensions(unspanned,walls));
  if(dimensions.some(d=>d.unitAssumed))warnings.push('Some printed lengths have no unit suffix; centimeters were assumed. Verify the scale.');
  const uniqueDimensions=dimensions.filter((d,i)=>dimensions.findIndex(q=>q.valueCm===d.valueCm
    &&Math.hypot(q.x1-d.x1,q.y1-d.y1)+Math.hypot(q.x2-d.x2,q.y2-d.y2)<6)===i);
  return {rooms,dimensions:uniqueDimensions,warnings,textBoxes};
}
