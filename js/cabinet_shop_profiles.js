// Declarative profiles only. Imported data can never inject G-code or execute JS.
export const CABINET_CONTROLLER_PROFILES = Object.freeze([
  { id:'grbl-1.1', name:'Grbl 1.1', implemented:true, dialect:'linear', extension:'nc', source:'https://github.com/gnea/grbl' },
  { id:'linuxcnc', name:'LinuxCNC', implemented:true, dialect:'g81', extension:'ngc', source:'https://linuxcnc.org/docs/html/gcode/g-code.html' },
  { id:'iso-linear', name:'ISO-style linear moves (compatibility review)', implemented:true, dialect:'linear', extension:'nc', source:'https://linuxcnc.org/docs/html/gcode/g-code.html' },
  { id:'homag-woodwop', name:'HOMAG woodWOP 4 MPR (vertical drilling)', implemented:true, dialect:'mpr', extension:'mpr', source:'https://www.homag.com/fileadmin/product/cnc/brochures/woodwop/CNC-Software-woodWOP-EN.pdf' },
  { id:'biesse-bsolid', name:'Biesse CIX 5 (vertical drilling import)', implemented:true, dialect:'cix', extension:'cix', source:'https://biesse.com/ww/en/software/b_solid/' },
  { id:'scm-prisma-xxl', name:'SCM Prisma 110 XXL (vertical drilling)', implemented:true, dialect:'xxl', extension:'xxl', source:'https://cam.autodesk.com/posts/post.php?name=scm' },
  { id:'scm-maestro', name:'SCM Maestro — exchange review only', implemented:false, source:'https://www.scmgroup.com/en_GB/scmwood/products/maestro-digital-systems/software.c102273/cnc-machining-centers-for-panel-and-solid-wood.102275' },
  { id:'custom-vendor', name:'Other controller — exchange review only', implemented:false, source:null },
].map(Object.freeze));

// These references document PART of a family. A reference selection is never
// evidence that a particular SKU, mounting plate or application is qualified.
export const CABINET_HARDWARE_REFERENCES = Object.freeze([
  { id:'generic', name:'Generic System 32', status:'generic-unverified', notes:'Existing application patterns; no supplier qualification.', source:null },
  { id:'blum-clip-top-blumotion', name:'Blum CLIP top BLUMOTION', status:'reference-only', notes:'Assembly reference specifies a 13 mm boring depth. SKU, cup fixing pattern and mounting plate must be specified.', source:'https://www.blum.com/us/en/products/hingesystems/clip-top-blumotion/assembly/' },
  { id:'hettich-sensys', name:'Hettich Sensys', status:'reference-only', notes:'The family includes distinct TH and TB drilling patterns; select the exact article and its mounting drawing.', source:'https://web.hettich.com/fileadmin/Company_website/HUS/Media/HUS_Sensys_Brochure.pdf' },
  { id:'salice', name:'Salice', status:'reference-only', notes:'Use the exact hinge, runner or lift-system catalogue and assembly drawing.', source:'https://www.salice.com/us/en/download/catalogues' },
  { id:'grass-tiomos', name:'GRASS Tiomos', status:'reference-only', notes:'Different Tiomos applications use different mounting methods; a family name does not define a drilling recipe.', source:'https://mediacenter.grass.eu/Katalog/EN/563/' },
  { id:'hafele', name:'Häfele', status:'reference-only', notes:'Use the exact article number and technical mounting drawing for the selected hardware.', source:'https://www.hafele.com/INTERSHOP/static/WFS/Haefele-COM-Site/-/Haefele-COM/en_US/opentext/assets/com/Hafele_Serbia_catalog.pdf' },
  { id:'custom', name:'Other hardware / shop template', status:'shop-authored', notes:'Use the exact part number and source drawing; imported drilling templates remain unqualified until checked at the shop.', source:null },
].map(Object.freeze));

export function newCabinetShopProfile(controller='grbl-1.1') {
  return {
    schema:'modelforge-cabinet-shop-profile', version:1, name:'Untitled shop setup', controller,
    hardwareReference:'generic', hardwarePartNumber:'', hardwareDrawing:'',
    // No feed, spindle, travel or workholding values are inferred from a brand.
    travel:{x:null,y:null,z:null}, safeZ:null, breakthrough:null,
    origin:{x:0,y:0}, flip:'mirror-y', rotation:0,
    clamps:[], tools:[], hardwareTemplates:[], completeRecipes:[],
    native:{woodwopMachine:null,biesseOrigin:null,scmReverseZ:null},
  };
}

export function validateCabinetShopProfile(p) {
  const issues=[];
  const add=(code,message)=>issues.push({code,message});
  if (!p || p.schema!=='modelforge-cabinet-shop-profile' || p.version!==1) {
    add('profile-schema','Use a version 1 cabinet shop profile.');return issues;
  }
  const controller=CABINET_CONTROLLER_PROFILES.find(c=>c.id===p.controller);
  if (!controller?.implemented) add('controller-unsupported','This target has no native postprocessor. Use the review CSV/DXF/JSON exchange files.');
  if (controller?.dialect==='mpr' && !['HOMAG','CF-HOMAG','FK-HOMAG','WEEKE'].includes(p.native?.woodwopMachine)) add('native-machine','Select the woodWOP machine type in native.woodwopMachine.');
  if (controller?.dialect==='cix' && !/^[1-9][0-9]{0,2}$/.test(String(p.native?.biesseOrigin??''))) add('native-origin','Specify the Biesse work origin number in native.biesseOrigin.');
  if (controller?.dialect==='xxl' && typeof p.native?.scmReverseZ!=='boolean') add('native-z','Specify the Prisma Z-axis sign convention in native.scmReverseZ.');
  if (typeof p.name!=='string' || !p.name.trim() || p.name.length>120) add('profile-name','Provide a shop setup name of at most 120 characters.');
  for (const axis of ['x','y','z']) if (!Number.isFinite(p.travel?.[axis]) || p.travel[axis]<0.001 || p.travel[axis]>100000) add('travel-'+axis,'Set a positive '+axis.toUpperCase()+' work envelope in millimetres.');
  if (!Number.isFinite(p.safeZ) || p.safeZ<0.001 || p.safeZ>=p.travel?.z) add('safe-z','Set clearance above the stock, within the Z work envelope.');
  if (!Number.isFinite(p.breakthrough) || p.breakthrough<0 || p.breakthrough>10) add('breakthrough','Set the through-drilling allowance between 0 and 10 mm.');
  if (!['mirror-x','mirror-y'].includes(p.flip)) add('flip','Select an explicit X or Y board-flip convention.');
  if (![0,90,180,270].includes(p.rotation)) add('rotation','Board rotation must be 0, 90, 180 or 270 degrees.');
  if (!['x','y'].every(axis=>Number.isFinite(p.origin?.[axis]) && p.origin[axis]>=0)) add('origin','Work origins must be finite, non-negative millimetre coordinates.');
  if (!Array.isArray(p.tools) || !p.tools.length || p.tools.length>100) add('tools','Provide between 1 and 100 configured drilling tools.');
  const ids=new Set(),diameters=new Set();
  for (const tool of Array.isArray(p.tools)?p.tools:[]) {
    if (!tool || typeof tool!=="object") { add("tool-shape","Tool entries must be objects.");continue; }
    if (!Number.isInteger(tool.number)||tool.number<1||tool.number>999||ids.has(tool.number)) add('tool-number','Tool numbers must be unique integers from 1 to 999.');
    ids.add(tool.number);
    if(controller?.dialect==='cix' && (typeof tool.nativeName!=='string'||! /^[a-zA-Z0-9 .:_-]{1,64}$/.test(tool.nativeName))) add('native-tool','Each CIX tool needs its exact nativeName from the vendor tool database (1–64 plain characters).');
    for (const field of ['diameter','feed','rpm','maxDepth','holderDiameter']) if (!Number.isFinite(tool[field])||tool[field]<0.001 || tool[field]>1000000) add('tool-'+field,'Every tool needs a positive '+field+'.');
    if (!Number.isFinite(tool.spinupSeconds)||tool.spinupSeconds<0||tool.spinupSeconds>120) add("spinup","Specify spindle spin-up dwell from 0 to 120 seconds.");
    if(controller?.dialect==='mpr' && tool.feed<0.1)add('native-feed','woodWOP feed must be at least 0.1 mm/min to survive output precision.');
    if (tool.holderDiameter<tool.diameter) add('holder','Holder envelope cannot be narrower than the tool diameter.');
    if (diameters.has(tool.diameter)) add('tool-diameter','Assign one unambiguous drilling tool to each diameter.');
    diameters.add(tool.diameter);
  }
  if (!Array.isArray(p.clamps) || p.clamps.length>100) add('clamps','Clamps must be an array of at most 100 machine-coordinate boxes.');
  for (const c of Array.isArray(p.clamps)?p.clamps:[]) {
    if (!c || typeof c!=="object") { add("clamp-shape","Clamp entries must be objects.");continue; }
    if (!['x','y','w','h','height'].every(k=>Number.isFinite(c[k])) || c.x<0||c.y<0||c.w<=0||c.h<=0||c.height<0 || c.x+c.w>p.travel?.x || c.y+c.h>p.travel?.y) add('clamp-bounds','Clamp bounds must fit the machine work envelope.');
    if (c.height>=p.safeZ) add('clamp-clearance','Clearance must exceed every clamp height before XY travel.');
  }
  if (!Array.isArray(p.hardwareTemplates) || p.hardwareTemplates.length>100) add('hardware-templates','Hardware templates must be an array of at most 100 entries.');
  const templateIds=new Set();
  for (const t of Array.isArray(p.hardwareTemplates)?p.hardwareTemplates:[]) {
    if (!t || typeof t!=="object") { add("template-shape","Template entries must be objects.");continue; }
    if (typeof t.id!=='string'||!t.id||templateIds.has(t.id)) add('template-id','Hardware template IDs must be unique non-empty strings.');
    templateIds.add(t.id);
    if (!['pin','plate','cup','runner','handle'].includes(t.kind)) add('template-kind','Templates must identify the operation kind they replace.');
    if (typeof t.partNumber!=='string'||!t.partNumber.trim()||typeof t.source!=='string'||!t.source.trim()) add('template-source','Each shop template needs its hardware part number and drawing reference.');
    if (!Array.isArray(t.holes)||!t.holes.length||t.holes.length>20) add('template-holes','Each template needs 1–20 drilling offsets.');
    for (const h of Array.isArray(t.holes)?t.holes:[]) if (!h || !['dx','dy','diameter','depth'].every(k=>Number.isFinite(h[k]))||h.diameter<0.001||h.diameter>100000||Math.abs(h.dx)>100000||Math.abs(h.dy)>100000||h.depth<0||typeof h.through!=='boolean'||(h.through?h.depth!==0:h.depth<0.001)) add('template-hole','Template offsets and drilling dimensions must be explicit finite millimetre values.');
  }
  if (new Set((Array.isArray(p.hardwareTemplates)?p.hardwareTemplates:[]).map(t=>t?.kind)).size!==(Array.isArray(p.hardwareTemplates)?p.hardwareTemplates:[]).length) add('template-ambiguous','Only one replacement template per operation kind is allowed.');
  if(p.completeRecipes!==undefined && (!Array.isArray(p.completeRecipes)||p.completeRecipes.length>100))add('recipes','Complete recipes must be an array of at most 100 cabinet recipes.');
  for(const r of Array.isArray(p.completeRecipes)?p.completeRecipes:[]){
    if(!r||typeof r.itemId!=='string'||!Number.isInteger(r.itemIndex)||r.itemIndex<1||typeof r.sourceSignature!=='string'||typeof r.partNumber!=='string'||typeof r.sourceDrawing!=='string'||!Array.isArray(r.panels))add('recipe-shape','Complete recipe headers must match an exported recipe draft.');
  }
  return issues;
}

export function parseCabinetShopProfile(text) {
  if (typeof text!=='string'||text.length>250000) throw new Error('Shop profile exceeds 250 KB.');
  const profile=JSON.parse(text), issues=validateCabinetShopProfile(profile);
  return {profile,issues};
}
