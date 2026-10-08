// Positions are paper millimetres. Keep each leader attached to its original
// component, while distributing automatic circles in the space around the view.
export const BALLOON_RADIUS = 3.6;
export function balloonRadius(label,fontSize=2.8) {
  return Math.max(BALLOON_RADIUS,String(label??'').length*fontSize*.55/2+1);
}

export function distanceToSegment(point, a, b) {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
}

// Liang–Barsky clipping catches a leader crossing a table, even when both
// endpoints sit outside it. Padding keeps the ink clear of the frame line.
export function segmentIntersectsBox(a, b, box, padding=0) {
  let low=0, high=1;
  const dx=b.x-a.x,dy=b.y-a.y;
  for (const [p,q] of [[-dx,a.x-box.x0+padding],[dx,box.x1+padding-a.x],[-dy,a.y-box.y0+padding],[dy,box.y1+padding-a.y]]) {
    if (Math.abs(p)<1e-10) { if(q<0)return false; continue; }
    const t=q/p;
    if(p<0)low=Math.max(low,t); else high=Math.min(high,t);
    if(low>high)return false;
  }
  return true;
}

export function layoutBalloonCenters(targets, model, paper, obstacles=[]) {
  const radius=Math.max(BALLOON_RADIUS,...targets.map(target=>balloonRadius(target.text))),clearance=2,placed=new Map();
  const centre={x:(model.x0+model.x1)/2,y:(model.y0+model.y1)/2};
  const ordered=targets.map((target,index)=>({...target,index})).sort((a,b)=>
    Math.atan2(a.point.y-centre.y,a.point.x-centre.x)-Math.atan2(b.point.y-centre.y,b.point.x-centre.x)||a.index-b.index);
  const candidates=[];
  for(let ring=0;ring<8;ring++) {
    const pad=14+ring*8;
    // A large exploded view may leave less than one ring of room on a side.
    // Clip candidate rails to the printable area rather than discarding that
    // entire side and falling back to the original, unchecked note offset.
    const box={x0:Math.max(paper.x0+radius,model.x0-pad),x1:Math.min(paper.x1-radius,model.x1+pad),
      y0:Math.max(paper.y0+radius,model.y0-pad),y1:Math.min(paper.y1-radius,model.y1+pad)};
    for(let step=0;step<=100;step++) {
      const t=step/100;
      candidates.push({x:box.x0+(box.x1-box.x0)*t,y:box.y0},{x:box.x0+(box.x1-box.x0)*t,y:box.y1},
        {x:box.x0,y:box.y0+(box.y1-box.y0)*t},{x:box.x1,y:box.y0+(box.y1-box.y0)*t});
    }
  }
  const available=candidates.filter(p=>p.x-radius>=paper.x0&&p.x+radius<=paper.x1&&p.y-radius>=paper.y0&&p.y+radius<=paper.y1
    && (p.x+radius<model.x0||p.x-radius>model.x1||p.y+radius<model.y0||p.y-radius>model.y1)
    && !obstacles.some(box=>p.x+radius+clearance>box.x0&&p.x-radius-clearance<box.x1&&p.y+radius+clearance>box.y0&&p.y-radius-clearance<box.y1));
  for(const target of ordered) {
    const previousPositions = [...placed.values()];
    let best=null,score=Infinity;
    for(const candidate of available) {
      const cost=Math.hypot(candidate.x-target.point.x,candidate.y-target.point.y);
      if(cost>=score)continue;
      if(obstacles.some(box=>segmentIntersectsBox(candidate,target.point,box,1)))continue;
      const blocked=previousPositions.some(previous=>
        Math.hypot(candidate.x-previous.x,candidate.y-previous.y)<2*radius+clearance
        ||distanceToSegment(previous,candidate,target.point)<radius+clearance
        ||distanceToSegment(candidate,previous,previous.target)<radius+clearance);
      if(!blocked){best=candidate;score=cost;}
    }
    if(best)placed.set(target.id,{...best,target:target.point});
  }
  return placed;
}
