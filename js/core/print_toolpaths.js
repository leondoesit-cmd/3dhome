import {analyzePrintLayers} from './print_layer_analysis.js';
import {printGrid,rasterContours,maskDistance,erodeMask,dilateMask,maskLoops,rasterLines,depositionClearsContours,clipSupportPaths} from './print_raster.js';

export const FFF_DEFAULTS=Object.freeze({layerHeightMm:.2,gridMm:.2,lineWidthMm:.4,filamentDiameterMm:1.75,wallCount:2,skinLayers:3,infillPercent:15,support:'off',supportAngle:45,supportGapMm:.2,supportXYGapMm:.4,supportPercent:15,adhesion:'none',adhesionWidthMm:3.5,raftLayers:2,wallSpeed:40,infillSpeed:40,travelSpeed:100});
export function validateFffSettings(input={}) {
  const s={...FFF_DEFAULTS,...input};
  for(const key of Object.keys(FFF_DEFAULTS).filter(k=>typeof FFF_DEFAULTS[k]==='number'))if(!Number.isFinite(s[key]))throw new Error('Finite slice setting required: '+key);
  if(s.layerHeightMm<.05||s.layerHeightMm>1||s.gridMm<.02||s.gridMm>.5||s.lineWidthMm<.1||s.lineWidthMm>2||s.gridMm>s.lineWidthMm/2||s.layerHeightMm>s.lineWidthMm)throw new Error('Use layer 0.05–1 mm, line width 0.1–2 mm and grid no larger than half the line width');
  if(!Number.isInteger(s.wallCount)||s.wallCount<1||s.wallCount>8||!Number.isInteger(s.skinLayers)||s.skinLayers<0||s.skinLayers>20||!Number.isInteger(s.raftLayers)||s.raftLayers<1||s.raftLayers>5)throw new Error('Invalid wall, skin or raft count');
  if(s.infillPercent<0||s.infillPercent>100||s.supportPercent<=0||s.supportPercent>100||s.supportAngle<10||s.supportAngle>80||s.supportGapMm<0||s.supportGapMm>5||s.supportXYGapMm<0||s.supportXYGapMm>5||s.adhesionWidthMm<0||s.adhesionWidthMm>10)throw new Error('Invalid infill, support or adhesion setting');
  if(s.filamentDiameterMm<1||s.filamentDiameterMm>4||[s.wallSpeed,s.infillSpeed,s.travelSpeed].some(v=>v<=0||v>500))throw new Error('Invalid filament diameter or speed');
  if(!['off','buildplate','everywhere'].includes(s.support)||!['none','skirt','brim','raft'].includes(s.adhesion))throw new Error('Unsupported support or adhesion type');
  return s;
}

export async function slicePrintMeshes(meshes,input={},options={}) {
  const settings=validateFffSettings(input);
  const analysis=await analyzePrintLayers(meshes,{layerHeightMm:settings.layerHeightMm,maxLayers:500,yieldControl:options.yieldControl,assertCurrent:options.assertCurrent});
  return toolpathsFromLayers(analysis,settings,options);
}

export async function toolpathsFromLayers(analysis,input={},options={}) {
  const s=validateFffSettings(input),padding=s.adhesion==='none'?s.lineWidthMm:s.adhesionWidthMm+2*s.lineWidthMm;
  const g=printGrid(analysis.bounds,s.gridMm,padding,options.maxCells||300000),n=analysis.layers.length;
  if(n*g.size>(options.maxLayerCells||40000000))throw new Error('Slice exceeds layer/cell budget; increase grid spacing or layer height');
  const check=async()=>{options.assertCurrent?.();await options.yieldControl?.();options.assertCurrent?.();};
  const masks=[],objectMasks=[];
  for(const layer of analysis.layers) {
    await check();const objects=layer.objects.map(o=>({...o,mask:rasterContours(o.contours,g)})),union=new Uint8Array(g.size);
    for(const o of objects)for(let i=0;i<g.size;i++)if(o.mask[i]) {
      if(union[i])throw new Error('Overlapping print objects must be resolved before slicing');union[i]=1;
    }
    objectMasks.push(objects);masks.push(union);
  }
  const supports=Array.from({length:n},()=>new Uint8Array(g.size));
  if(s.support!=='off') {
    const gapLayers=Math.ceil(s.supportGapMm/s.layerHeightMm),seeds=Array.from({length:n},()=>new Uint8Array(g.size));
    for(let layer=1;layer<n;layer++) {
      await check();const below=dilateMask(masks[layer-1],g,s.layerHeightMm*Math.tan(s.supportAngle*Math.PI/180)),target=layer-gapLayers-1;
      if(target<0)continue;
      for(let i=0;i<g.size;i++)if(masks[layer][i]&&!below[i])seeds[target][i]=1;
    }
    let active=new Uint8Array(g.size);
    for(let layer=n-1;layer>=0;layer--) {
      await check();const excluded=dilateMask(masks[layer],g,s.supportXYGapMm);
      for(let i=0;i<g.size;i++)active[i]=(active[i]||seeds[layer][i])&&!excluded[i]?1:0;
      supports[layer]=active.slice();
    }
    if(s.support==='buildplate')for(let layer=1;layer<n;layer++)for(let i=0;i<g.size;i++)supports[layer][i]=supports[layer][i]&&supports[layer-1][i]?1:0;
  }
  const layers=[],diagnostics=[],raise=s.adhesion==='raft'?s.raftLayers*s.layerHeightMm+s.supportGapMm:0;
  let segments=0;
  const add=(layer,points,kind,objectId,closed=false,width=s.lineWidthMm,contours=null)=>{
    if(points.length<2)return;
    if(closed)points=points.concat([points[0]]);
    if(contours&&!depositionClearsContours(points,contours,width/2))throw new Error('Deposition intersects a sub-grid boundary; reduce grid spacing to resolve this feature');
    segments+=points.length-1;if(segments>(options.maxSegments||500000))throw new Error('Slice exceeds path segment budget');
    layer.paths.push({kind,objectId,widthMm:width,heightMm:layer.heightMm,speedMmS:kind==='infill'||kind==='support'?s.infillSpeed:s.wallSpeed,points:points.map(p=>[p[0],p[1],layer.zMm])});
  };
  if(s.adhesion==='raft') {
    const footprint=Uint8Array.from(masks[0],(v,i)=>v||supports[0][i]?1:0),raft=dilateMask(footprint,g,s.adhesionWidthMm);
    for(let i=0;i<s.raftLayers;i++) {
      const layer={number:layers.length+1,zMm:(i+1)*s.layerHeightMm,heightMm:s.layerHeightMm,sourceLayer:null,paths:[]};
      for(const line of rasterLines(raft,g,s.lineWidthMm,i%2===1))add(layer,line,'raft','adhesion');layers.push(layer);
    }
  }
  for(let index=0;index<n;index++) {
    await check();const source=analysis.layers[index],layer={number:layers.length+1,zMm:source.topZMm+raise,heightMm:source.topZMm-source.bottomZMm,sourceLayer:source.number,paths:[]};
    for(const object of objectMasks[index]) {
      const d=maskDistance(object.mask,g),id=object.occurrenceId;
      let count=0;
      for(let wall=0;wall<s.wallCount;wall++)for(const loop of maskLoops(erodeMask(object.mask,g,(wall+.5)*s.lineWidthMm,d),g)){add(layer,loop,'wall',id,true,s.lineWidthMm,object.contours);count++;}
      if(object.mask.some(Boolean)&&!count)diagnostics.push({code:'unresolved-thin-region',sourceLayer:source.number,objectId:id});
      const interior=erodeMask(object.mask,g,(s.wallCount+.5)*s.lineWidthMm,d),skin=new Uint8Array(g.size),infill=new Uint8Array(g.size);
      for(let step=1;step<=s.skinLayers;step++)for(let i=0;i<g.size;i++)if(interior[i]&&(!masks[index-step]?.[i]||!masks[index+step]?.[i]))skin[i]=1;
      for(let i=0;i<g.size;i++)infill[i]=interior[i]&&!skin[i]?1:0;
      for(const line of rasterLines(skin,g,s.lineWidthMm,index%2===1))add(layer,line,'skin',id,false,s.lineWidthMm,object.contours);
      if(s.infillPercent)for(const line of rasterLines(infill,g,s.lineWidthMm*100/s.infillPercent,index%2===1))add(layer,line,'infill',id,false,s.lineWidthMm,object.contours);
    }
    if(s.support!=='off')for(const line of rasterLines(supports[index],g,s.lineWidthMm*100/s.supportPercent,index%2===1)) {
      const clipped=clipSupportPaths(line,analysis.layers[index].objects,s.lineWidthMm/2);
      if(clipped.removedLengthMm>1e-8)diagnostics.push({layer:layer.number,kind:'support-clipped',removedLengthMm:clipped.removedLengthMm,retainedPieces:clipped.paths.length,reason:'Exact material contour and bead clearance'});
      for(const safe of clipped.paths)add(layer,safe,'support','support');
    }
    if(index===0&&['skirt','brim'].includes(s.adhesion)) {
      if(s.adhesion==='skirt')for(const loop of maskLoops(dilateMask(masks[0],g,s.adhesionWidthMm),g))add(layer,loop,'skirt','adhesion',true);
      else for(let offset=0;offset<=s.adhesionWidthMm;offset+=s.lineWidthMm)for(const loop of maskLoops(offset?dilateMask(masks[0],g,offset):masks[0],g))add(layer,loop,'brim','adhesion',true);
    }
    layers.push(layer);
  }
  let volume=0,length=0,time=0,supportVolume=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const layer of layers)for(const path of layer.paths) {
    for(const p of path.points)for(let i=0;i<3;i++) {
      min[i]=Math.min(min[i],p[i]-(i<2?path.widthMm/2:path.heightMm));
      max[i]=Math.max(max[i],p[i]+(i<2?path.widthMm/2:0));
    }
    for(let i=1;i<path.points.length;i++) {
      const distance=Math.hypot(...path.points[i].map((v,j)=>v-path.points[i-1][j])),v=distance*path.widthMm*path.heightMm;
      volume+=v;length+=distance;time+=distance/path.speedMmS;if(path.kind==='support')supportVolume+=v;
    }
  }
  const bed=options.printSetup;
  if(!segments)throw new Error('No resolvable deposition paths; reduce grid spacing or inspect thin regions');
  if(bed&&[bed.bedWidthMm,bed.bedDepthMm,bed.bedHeightMm].some(v=>!Number.isFinite(v)||v<=0))throw new Error('Print bed dimensions must be finite and positive');
  if(bed&&(min[0]<-bed.bedWidthMm/2||max[0]>bed.bedWidthMm/2||min[1]<-bed.bedDepthMm/2||max[1]>bed.bedDepthMm/2||max[2]>bed.bedHeightMm))throw new Error('Generated paths or adhesion exceed the saved print bed');
  return {schema:'modelforge-fff-toolpaths',version:1,units:'mm',sourceMeshFingerprint:analysis.sourceMeshFingerprint,settings:s,grid:g,sourceBounds:analysis.bounds,bounds:{min,max},layers,layerCount:layers.length,diagnostics,
    estimates:{depositionLengthMm:length,depositionVolumeMm3:volume,supportVolumeMm3:supportVolume,filamentLengthMm:volume/(Math.PI*(s.filamentDiameterMm/2)**2),depositionTimeSeconds:time},
    qualification:'Bounded raster FFF paths; conservative offsets include two-grid-cell margin. Rectilinear infill, vertical-column supports, no adaptive width or retraction. Volume uses rectangular bead approximation; time excludes acceleration and travel. Digital study only; physical printing and device compatibility unverified.'};
}
