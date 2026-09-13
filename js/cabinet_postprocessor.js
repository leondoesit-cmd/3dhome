import { cabinetVendorProgram } from './cabinet_vendor_posts.js';
import { cabinetManufacturingReport, validateDrillingPanel } from './cabinet_manufacturing.js';
import { CABINET_CONTROLLER_PROFILES, validateCabinetShopProfile } from './cabinet_shop_profiles.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const number=value=>value.toFixed(3).replace(/\.?0+$/,'') || '0';
const comment=value=>String(value).replace(/[^a-zA-Z0-9 .:_-]/g,'_').slice(0,180);

export function cabinetSetupPoint(panel, hole, profile) {
  let x=hole.x,y=hole.y,w=panel.l,h=panel.w;
  if (hole.face==='B') {
    if(profile.flip==='mirror-x')x=w-x;else y=h-y;
  }
  if(profile.rotation===90){[x,y]=[h-y,x];[w,h]=[h,w];}
  else if(profile.rotation===180){x=w-x;y=h-y;}
  else if(profile.rotation===270){[x,y]=[y,w-x];[w,h]=[h,w];}
  return {x:x+profile.origin.x,y:y+profile.origin.y,width:w,height:h};
}

// Only declarative offset templates are accepted. Offsets are relative to each
// existing operation in the physical board's fixed datum, BEFORE face flipping.
export function applyCabinetHardwareTemplates(panel, templates) {
  const result=clone(panel);
  result.holes=result.holes.flatMap(h=>{
    const template=templates.find(t=>t.kind===h.kind);
    if(!template)return [h];
    return template.holes.map((offset,i)=>({...h,id:h.id+':template:'+i,
      x:h.x+offset.dx,y:h.y+offset.dy,d:offset.diameter,depth:offset.depth,through:offset.through,
      templateId:template.id,hardwarePartNumber:template.partNumber,sourceDrawing:template.source}));
  });
  return result;
}

export function cabinetCNCBundle(items, profile) {
  const bundle={schema:'modelforge-cabinet-cnc-bundle',version:1,units:'mm',status:'blocked',machineReady:false,
    qualification:'simulation-only',files:[],setups:[],issues:[],warnings:[],profile:clone(profile||{})};
  bundle.issues=validateCabinetShopProfile(profile);
  if(bundle.issues.length)return bundle;
  const report=cabinetManufacturingReport(items,profile.completeRecipes||[]);
  bundle.report=report;
  for(const r of profile.completeRecipes||[])if(!report.items.some(i=>i.id===r.itemId && i.index===r.itemIndex))bundle.issues.push({code:'recipe-target',message:'A complete recipe targets a cabinet that is absent from the job.'});
  bundle.warnings=report.issues.filter(i=>['machine-profile-missing','hardware-unverified'].includes(i.code));
  // Existing geometric problems cannot be dismissed merely by choosing a tool.
  bundle.issues.push(...report.issues.filter(i=>!['machine-profile-missing','hardware-unverified'].includes(i.code)));
  if(!report.operationCount)bundle.issues.push({code:'empty-program',message:'The job has no drilling operations.'});
  const controller=CABINET_CONTROLLER_PROFILES.find(c=>c.id===profile.controller);
  const programs=[];
  let fileIndex=0;
  for(const item of report.items)for(const original of item.panels){
    const panel=applyCabinetHardwareTemplates(original,profile.hardwareTemplates);
    bundle.issues.push(...validateDrillingPanel(panel));
    for(const face of ['A','B']){
      const holes=panel.holes.filter(h=>h.face===face);
      if(!holes.length)continue;
      const groups=new Map();
      for(const hole of holes){
        const tool=profile.tools.find(t=>Math.abs(t.diameter-hole.d)<0.001);
        if(!tool){bundle.issues.push({code:'missing-tool',panelId:panel.id,message:'No configured drill matches diameter '+hole.d+' mm.'});continue;}
        const point=cabinetSetupPoint(panel,hole,profile);
        const depth=hole.through?panel.thickness+profile.breakthrough:hole.depth;
        if(point.width+profile.origin.x>profile.travel.x||point.height+profile.origin.y>profile.travel.y)
          bundle.issues.push({code:'panel-envelope',panelId:panel.id,message:'The rotated panel does not fit the configured work envelope.'});
        if(depth>tool.maxDepth||depth+profile.safeZ>profile.travel.z)
          bundle.issues.push({code:'tool-reach',panelId:panel.id,message:'Drilling depth exceeds tool reach or available Z travel.'});
        for(const clamp of profile.clamps){
          const nearestX=Math.max(clamp.x,Math.min(point.x,clamp.x+clamp.w));
          const nearestY=Math.max(clamp.y,Math.min(point.y,clamp.y+clamp.h));
          if(Math.hypot(point.x-nearestX,point.y-nearestY)<=tool.holderDiameter/2)
            bundle.issues.push({code:'clamp-intersection',panelId:panel.id,message:'The drill/holder envelope intersects a clamp during plunge.'});
        }
        if(!groups.has(tool.number))groups.set(tool.number,{tool,operations:[]});
        groups.get(tool.number).operations.push({id:hole.id,x:point.x,y:point.y,depth,diameter:hole.d,through:hole.through});
      }
      for(const {tool,operations} of groups.values()){
        const filename='panel-'+String(++fileIndex).padStart(4,'0')+'-face-'+face+'-tool-'+tool.number+'.'+controller.extension;
        const setup={filename,itemId:item.id,panelId:panel.id,face,toolNumber:tool.number,toolDiameter:tool.diameter,
          origin:clone(profile.origin),rotation:profile.rotation,flip:face==='B'?profile.flip:'none',stockTopZ:0,
          panelDatum:{description:panel.datum,faceAxis:panel.faceAxis,xAxis:panel.xAxis||null,yAxis:panel.yAxis||null},
          panelDimensions:{l:panel.l,w:panel.w,thickness:panel.thickness},operations};
        bundle.setups.push(setup);
        if(['mpr','cix','xxl'].includes(controller.dialect)){
          setup.programCoordinates='board-local; position the board at manifest origin';
          setup.controllerManagedMotion=true;
          programs.push({name:filename,content:cabinetVendorProgram(controller.dialect,setup,tool,profile)});
          continue;
        }
        const lines=['(SIMULATION ONLY - MACHINE AND HARDWARE NOT QUALIFIED)',
          '(Load tool '+tool.number+'; touch off stock top Z0 in G54 for this setup)',
          '('+comment(panel.id)+' FACE '+face+' '+comment(setup.flip)+')',
          'G90 G21 G17 G94 G54','G40 G49','G92.1','M5','G0 Z'+number(profile.safeZ),
          'M3 S'+number(tool.rpm),'G4 P'+number(tool.spinupSeconds)];
        for(const op of operations){
          lines.push('G0 Z'+number(profile.safeZ));
          lines.push('G0 X'+number(op.x)+' Y'+number(op.y));
          if(controller.dialect==='g81'){
            lines.push('G98 G81 Z-'+number(op.depth)+' R'+number(profile.safeZ)+' F'+number(tool.feed));lines.push('G80');
          }else{
            lines.push('G1 Z-'+number(op.depth)+' F'+number(tool.feed));lines.push('G0 Z'+number(profile.safeZ));
          }
        }
        lines.push('G0 Z'+number(profile.safeZ),'M5','M2');
        programs.push({name:filename,content:lines.join('\n')+'\n'});
      }
    }
  }
  if(bundle.issues.length){bundle.setups=[];return bundle;}
  if(['mpr','cix','xxl'].includes(controller.dialect))bundle.warnings.push({code:'native-controller-settings',message:'Native import files use board-local coordinates. Position the board at the manifest origin. Vendor software controls retracts, tool selection, spindle setup and parking; the preview does not simulate those motions. Verify those settings and import compatibility in the matching vendor software.'});
  bundle.files=programs;bundle.status='simulation-ready';
  bundle.warnings.push({code:'shop-qualification',message:'Programs require controller simulation, measured setup verification, hardware fit checks and a controlled test cut. No physical machine is qualified by this export.'});
  return bundle;
}
