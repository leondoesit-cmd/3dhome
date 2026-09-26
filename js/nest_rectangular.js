// MaxRects best-short-side-fit for rectangular blanks, in cm. Not CAM/toolpaths.
// Free rectangles overlap intentionally; recoverable offcuts are separately disjoint.
const EPS=1e-7;
const intersects=(a,b)=>a.x<b.x+b.w-EPS&&b.x<a.x+a.w-EPS&&a.y<b.y+b.h-EPS&&b.y<a.y+a.h-EPS;
const contains=(a,b)=>a.x<=b.x+EPS&&a.y<=b.y+EPS&&a.x+a.w>=b.x+b.w-EPS&&a.y+a.h>=b.y+b.h-EPS;
export function rectangularFindPlace(sh,p,opt){
  if(![p.gl,p.gw].every(v=>Number.isFinite(v)&&v>0))return null;
  const forms=[[p.gw,p.gl,0]];if(!(opt.grainLock&&p.grain))forms.push([p.gl,p.gw,1]);
  let best=null;
  sh.free.forEach((f,fi)=>forms.forEach(([w,h,rot])=>{const dw=f.w-w-opt.kerf,dh=f.h-h-opt.kerf;if(dw<-EPS||dh<-EPS)return;const score=Math.min(dw,dh),long=Math.max(dw,dh);if(!best||score<best.score-EPS||Math.abs(score-best.score)<EPS&&long<best.long)best={fi,w,h,rot,score,long};}));
  return best;
}
export function rectangularPlace(sh,p,best,opt){
  const f=sh.free[best.fi],used={x:f.x,y:f.y,w:best.w+opt.kerf,h:best.h+opt.kerf};
  sh.place.push({p,x:f.x,y:f.y,w:best.w,h:best.h,rot:best.rot});
  const free=[];
  for(const r of sh.free){if(!intersects(r,used)){free.push(r);continue;}
    if(used.x>r.x+EPS)free.push({x:r.x,y:r.y,w:used.x-r.x,h:r.h});
    if(used.x+used.w<r.x+r.w-EPS)free.push({x:used.x+used.w,y:r.y,w:r.x+r.w-used.x-used.w,h:r.h});
    if(used.y>r.y+EPS)free.push({x:r.x,y:r.y,w:r.w,h:used.y-r.y});
    if(used.y+used.h<r.y+r.h-EPS)free.push({x:r.x,y:used.y+used.h,w:r.w,h:r.y+r.h-used.y-used.h});
  }
  sh.free=free.filter((r,i)=>!free.some((other,j)=>i!==j&&contains(other,r)&&(!contains(r,other)||j<i)));
  return true;
}
export function rectangularOffcuts(sh,opt){
  const trim=sh.stock?0:opt.trim;let free=[{x:trim,y:trim,w:sh.sheet.w-2*trim,h:sh.sheet.l-2*trim}];
  // Disjoint rectangular subtraction, distinct from overlapping MaxRects search spaces.
  for(const p of sh.place){const used={x:p.x-opt.kerf,y:p.y-opt.kerf,w:p.w+2*opt.kerf,h:p.h+2*opt.kerf},next=[];
    for(const r of free){if(!intersects(r,used)){next.push(r);continue;}const x0=Math.max(r.x,used.x),x1=Math.min(r.x+r.w,used.x+used.w),y0=Math.max(r.y,used.y),y1=Math.min(r.y+r.h,used.y+used.h);
      if(x0>r.x+EPS)next.push({x:r.x,y:r.y,w:x0-r.x,h:r.h});if(x1<r.x+r.w-EPS)next.push({x:x1,y:r.y,w:r.x+r.w-x1,h:r.h});
      if(y0>r.y+EPS)next.push({x:x0,y:r.y,w:x1-x0,h:y0-r.y});if(y1<r.y+r.h-EPS)next.push({x:x0,y:y1,w:x1-x0,h:r.y+r.h-y1});
    }free=next;
  }return free;
}
export function validateRectangularNesting(sheets,opt){
  const issues=[];
  for(const sh of sheets){const trim=sh.stock?0:opt.trim;
    sh.place.forEach((a,i)=>{const id=a.p?.id;
      if(![a.x,a.y,a.w,a.h].every(Number.isFinite)||a.w<=0||a.h<=0||a.x<trim-EPS||a.y<trim-EPS||a.x+a.w>sh.sheet.w-trim+EPS||a.y+a.h>sh.sheet.l-trim+EPS)issues.push({code:'panel-bounds',id});
      if(opt.grainLock&&a.p?.grain&&a.rot)issues.push({code:'grain-rotation',id});
      const expected=a.rot?[a.p?.gl,a.p?.gw]:[a.p?.gw,a.p?.gl];if(Math.abs(a.w-expected[0])>EPS||Math.abs(a.h-expected[1])>EPS)issues.push({code:'panel-size',id});
      for(const b of sh.place.slice(i+1))if(!(a.x+a.w+opt.kerf<=b.x+EPS||b.x+b.w+opt.kerf<=a.x+EPS||a.y+a.h+opt.kerf<=b.y+EPS||b.y+b.h+opt.kerf<=a.y+EPS))issues.push({code:'panel-spacing',id,otherId:b.p?.id});
    });
  }return issues;
}
