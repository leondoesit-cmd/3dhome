const colors={wall:'#55d9e5',infill:'#d99eff',skin:'#78db91',support:'#ffbf66',skirt:'#ff779f',brim:'#ff779f',raft:'#ff779f'};
export function toolpathSvg(slice,number=1) {
  if(!Number.isInteger(number)||number<1||number>slice.layers.length)throw new Error('Choose an existing deposition layer');
  const layer=slice.layers[number-1],lo=slice.bounds.min,hi=slice.bounds.max,margin=2;
  const paths=layer.paths.map(p=>'<path d="'+p.points.map((q,i)=>(i?'L':'M')+q[0]+' '+(-q[1])).join(' ')+'" fill="none" stroke="'+colors[p.kind]+'" stroke-width="'+p.widthMm+'"/>').join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[lo[0]-margin,-hi[1]-margin,hi[0]-lo[0]+margin*2,hi[1]-lo[1]+margin*2].join(' ')+'" role="img" aria-label="Actual FFF deposition layer '+number+'">'+paths+'</svg>';
}

// Explicit generic absolute-E study profile, with no printer-dependent homing,
// heat or start/end macros. This exports digital motion, not device execution.
export function toolpathsGcode(slice,{id='illustrative-generic-absolute-e',bedWidthMm,bedDepthMm}={}) {
  if(id!=='illustrative-generic-absolute-e'||![bedWidthMm,bedDepthMm].every(v=>Number.isFinite(v)&&v>0))throw new Error('Choose the supported illustrative profile and explicit bed dimensions');
  const lines=['; ModelForge bounded FFF digital study','; Profile: '+id,'; No printer-specific homing, heating, retraction or execution','G21','G90','M82','G92 E0'];
  let e=0;
  const fmt=v=>Number(v.toFixed(5)).toString(),area=Math.PI*(slice.settings.filamentDiameterMm/2)**2;
  const coordinate=p=>'X'+fmt(p[0]+bedWidthMm/2)+' Y'+fmt(p[1]+bedDepthMm/2)+' Z'+fmt(p[2]);
  for(const layer of slice.layers) {
    lines.push(';LAYER:'+layer.number);
    for(const path of layer.paths) {
      const radius=path.widthMm/2;
      if(!(radius>0)||!Number.isFinite(radius)||path.points.some(p=>p.some(v=>!Number.isFinite(v))||p[0]-radius<-bedWidthMm/2||p[0]+radius>bedWidthMm/2||p[1]-radius<-bedDepthMm/2||p[1]+radius>bedDepthMm/2||p[2]<0))throw new Error('Toolpath bead envelope exceeds the explicit profile bed or has invalid coordinates');
      const from=path.points[0];lines.push(';TYPE:'+path.kind,'G0 '+coordinate(from)+' F'+fmt(slice.settings.travelSpeed*60));
      for(let i=1;i<path.points.length;i++) {
        const p=path.points[i],distance=Math.hypot(...p.map((v,j)=>v-path.points[i-1][j]));
        e+=distance*path.widthMm*path.heightMm/area;
        lines.push('G1 '+coordinate(p)+' E'+fmt(e)+' F'+fmt(path.speedMmS*60));
      }
    }
  }
  return lines.join('\n')+'\n';
}
