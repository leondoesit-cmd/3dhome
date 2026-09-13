// Machine-neutral cabinet manufacturing review. No machine code is emitted:
// geometry validation is distinct from hardware and machine qualification.
import { S } from './state.js';
import { layoutCab, cabRun, drillPlan, checkCab, S32 } from './cabinet.js';
import { semanticCabinetParts } from './core/cabinet_parts.js';

export const CABINET_HARDWARE_TEMPLATES = Object.freeze({
  pin: Object.freeze({ id: 'generic-shelf-pin-v1', diameter: S32.pin, depth: S32.pinDepth, setback: S32.setback }),
  plate: Object.freeze({ id: 'generic-hinge-plate-v1', diameter: S32.pin, depth: S32.pinDepth, spread: S32.plateSpread }),
  cup: Object.freeze({ id: 'generic-hinge-cup-v1', diameter: S32.cup, depth: S32.cupDepth, setback: S32.cupSetback }),
  runner: Object.freeze({ id: 'generic-runner-v1', diameter: S32.pin, depth: S32.pinDepth, pitch: S32.pitch }),
  handle: Object.freeze({ id: 'generic-handle-v1', diameter: S32.pin, through: true, centres: 96 }),
});

const clone = value => JSON.parse(JSON.stringify(value));
const mm = value => Math.round(value * 10000) / 1000;

// Coordinates refer to ONE fixed board datum for both faces. A machine
// adapter must transform a B-face setup; silently mirroring Y is incorrect.
export function validateDrillingPanel(panel) {
  const issues = [];
  const add = (code, message, operationId) => issues.push({ code, message, panelId: panel.id, operationId });
  if (![panel.l, panel.w, panel.thickness].every(v => Number.isFinite(v) && v > 0)) {
    add('panel-dimensions', 'Panel dimensions and thickness must be finite and positive.');
    return issues;
  }
  const accepted = [];
  for (const h of panel.holes || []) {
    if(!h || typeof h!=='object'){add('hole-shape','Every drilling operation must be an object.');continue;}
    if(typeof h.through!=='boolean')add('hole-through','Specify an explicit boolean through flag.',h.id);
    if (![h.x, h.y, h.d, h.depth].every(Number.isFinite) || h.d <= 0 || h.depth < 0) {
      add('hole-dimensions', 'Hole dimensions must be finite and non-negative, with a positive diameter.', h.id); continue;
    }
    if (!['A', 'B'].includes(h.face)) add('hole-face', 'Every operation requires a drilling face.', h.id);
    if (h.x - h.d / 2 < -0.01 || h.y - h.d / 2 < -0.01 || h.x + h.d / 2 > panel.l + 0.01 || h.y + h.d / 2 > panel.w + 0.01)
      add('hole-edge', 'The hole footprint extends beyond the finished panel.', h.id);
    if (!h.through && (h.depth <= 0 || h.depth >= panel.thickness))
      add('blind-depth', 'Blind drilling must stop inside the actual board thickness.', h.id);
    if (h.through && h.depth !== 0) add('through-depth', 'Through holes use an explicit through flag and zero nominal depth; machine breakthrough is unspecified.', h.id);
    for (const other of accepted) {
      if (Math.hypot(h.x - other.x, h.y - other.y) >= (h.d + other.d) / 2 - 0.01) continue;
      if (h.face === other.face || h.through || other.through || h.depth + other.depth >= panel.thickness)
        add('hole-intersection', 'Drilling volumes intersect; review duplicate operations or opposite-face breakthrough.', h.id);
    }
    accepted.push(h);
  }
  for (const h of panel.rejectedHoles || []) add('rejected-hole', h.reason || 'A requested hole could not be placed.', h.id);
  return issues;
}

function frontPanels(pattern, layout, parts, prefix, add) {
  const front = pattern.front;
  const components = layout.parts.map((p, i) => ({ p, i })).filter(({p}) => p.unit === pattern.unit && p.k === 'box' && ['door', 'drawerFront', 'doorPanel', 'glazing'].includes(p.role));
  if (!['flat', 'shaker', 'glazed'].includes(front.style)) {
    add('front-relief', 'Relieved or slatted fronts need a depth-aware machining template.', pattern.id);
    return [];
  }
  const panels = components.map(({p, i}) => ({
    id: prefix + parts[i].id, role: p.role, partId: parts[i].id, assemblyId: prefix + pattern.id,
    l: mm(p.y1 - p.y0), w: mm(p.x1 - p.x0), thickness: mm(p.z1 - p.z0),
    datum: 'bottom-left in the closed leaf frame', datumCode: 'bottom-left',
    faceAxis: 'local-z', material: p.mat, holes: [], rejectedHoles: [],
    sourceBoundsCm: { x0:p.x0,x1:p.x1,y0:p.y0,y1:p.y1,z0:p.z0,z1:p.z1 },
  }));
  for (const h of pattern.holes) {
    const x = pattern.hingeLeft ? front.x0 * 10 + h.y : front.x1 * 10 - h.y;
    const y = front.y0 * 10 + h.x;
    const matches = components.map(({p}, i) => ({ p, i })).filter(({p}) =>
      x - h.d / 2 >= p.x0 * 10 - 0.01 && x + h.d / 2 <= p.x1 * 10 + 0.01 &&
      y - h.d / 2 >= p.y0 * 10 - 0.01 && y + h.d / 2 <= p.y1 * 10 + 0.01);
    if (matches.length !== 1) {
      add('front-hole-unmapped', 'A front hole crosses a component edge or cannot be assigned to one physical board.', h.id); continue;
    }
    const {p, i} = matches[0];
    if (p.role === 'glazing' || ['glass', 'mirror'].includes(p.mat)) add('glazing-machining', 'Glass and mirror drilling require a separate material-specific process.', panels[i].id);
    panels[i].holes.push({ ...h, id: prefix + h.id, x: mm((y - p.y0 * 10) / 10), y: mm((x - p.x0 * 10) / 10) });
  }
  for (const h of pattern.rejectedHoles) add('rejected-hole', h.reason, prefix + h.id);
  return panels;
}

// Complete recipes use model-axis datums for every rectangular wood board.
// They replace generic drilling as a whole, never selectively hide findings.
function recipeInventory(layout, parts) {
  return layout.parts.flatMap((p,i)=>{
    if (!['carcass','front','back','top','doorPanel'].includes(p.mat)) return [];
    if(p.k!=='box' || p.tilt || p.cut) return [{partId:parts[i]?.id,unsupported:true}];
    const axes=['x','y','z'].map(axis=>({axis,size:mm(p[axis+'1']-p[axis+'0'])})).sort((a,b)=>b.size-a.size);
    return [{partId:parts[i]?.id,role:p.role,l:axes[0].size,w:axes[1].size,thickness:axes[2].size,
      faceAxis:axes[2].axis,xAxis:axes[0].axis,yAxis:axes[1].axis,
      datum:'Minimum model bounds along xAxis/yAxis; A positive faceAxis, B negative faceAxis',
      holes:[],noDrillReason:''}];
  });
}

function recipePanels(recipe, draft, prefix, add) {
  if(recipe.sourceSignature!==draft.sourceSignature){add('recipe-stale','The complete drilling recipe no longer matches the cabinet. Export a fresh draft.');return null;}
  if(!recipe.partNumber?.trim() || !recipe.sourceDrawing?.trim()){add('recipe-source','A complete recipe needs exact hardware part numbers and a drawing reference.');return null;}
  if(draft.panels.some(p=>p.unsupported)){add('recipe-geometry','Complete recipes currently require rectangular, untilted wood panels.');return null;}
  const panels=recipe.panels;
  if(!Array.isArray(panels)||panels.length!==draft.panels.length||new Set(panels.map(p=>p?.partId)).size!==panels.length){add('recipe-coverage','The recipe must specify every wood panel exactly once.');return null;}
  const result=[];
  for(const original of draft.panels){
    const p=panels.find(p=>p?.partId===original.partId);
    if(!p||!Array.isArray(p.holes)||p.holes.length>2000||(!p.holes.length && (typeof p.noDrillReason!=='string'||!p.noDrillReason.trim()))){add('recipe-panel','Every panel needs explicit holes or a reason that no drilling is required.',original.partId);return null;}
    if(!['l','w','thickness','faceAxis','xAxis','yAxis'].every(k=>p[k]===original[k])){add('recipe-datum','Recipe dimensions and axes must match the exported draft.',original.partId);return null;}
    const holes=p.holes.map((h,i)=>({...h,id:prefix+original.partId+':recipe:'+i,kind:'shop-recipe',
      templateId:'complete-shop-recipe',hardwarePartNumber:recipe.partNumber,sourceDrawing:recipe.sourceDrawing}));
    result.push({...original,id:prefix+original.partId,holes,rejectedHoles:[],noDrillReason:p.noDrillReason,
      recipeSource:recipe.sourceDrawing,recipePartNumber:recipe.partNumber});
  }
  return result;
}

export function cabinetDrillingRecipeDraft(items) {
  return cabinetManufacturingReport(items).items.map(entry=>entry.recipeDraft).filter(Boolean);
}

export function cabinetManufacturingReport(items = [], recipes = []) {
  const report = {
    schema: 'modelforge-cabinet-manufacturing', version: 1, units: 'mm',
    status: 'review-required', machineReady: false, machineProfile: null,
    coordinateConvention: 'Panel-specific datum and xAxis/yAxis fields take precedence for complete shop recipes. For generic patterns X runs from the board bottom along its height; Y runs from the named side edge. A and B share this datum. Face A is the positive faceAxis direction; B is negative. No setup mirroring has been applied.',
    templates: [], items: [], issues: [],
  };
  report.issues.push({ code: 'machine-profile-missing', message: 'No qualified machine/controller, tooling, workholding or postprocessor is selected.' });
  report.issues.push({ code: 'hardware-unverified', message: 'Generic layout templates are not manufacturer-verified hardware instructions.' });
  if (!items.length) report.issues.push({ code: 'empty-job', message: 'No cabinets are included.' });
  const used = new Set();
  items.forEach((source, index) => {
    if (!source?.cab) return;
    const item = clone(source), id = String(source.id ?? index + 1), prefix = 'item:' + index + ':' + id + ':';
    const entry = { id, index: index + 1, panels: [], issues: [] };
    const add = (code, message, panelId) => entry.issues.push({ code, message, itemId: id, panelId });
    report.items.push(entry);
    if (S.parametric?.definitions?.[source.definitionId]?.metadata?.manufacturingReviewRequired)
      add('advanced-edits', 'Advanced edits require a manufacturing review; semantic drilling may not match the edited solid.');
    try {
      const layout = layoutCab(item, cabRun(source, items)), parts = semanticCabinetParts(layout);
      entry.recipeDraft={itemId:id,itemIndex:index+1,sourceSignature:JSON.stringify({cab:item.cab,w:item.w,h:item.h,d:item.d,parts:layout.parts},(key,value)=>key==='hid'?undefined:value),
        partNumber:'',sourceDrawing:'',panels:recipeInventory(layout,parts)};
      const matching=recipes.filter(r=>r?.itemId===id && r.itemIndex===index+1);
      if(matching.length>1)add('recipe-duplicate','Only one complete recipe may target a cabinet.');
      const custom=matching.length===1?recipePanels(matching[0],entry.recipeDraft,prefix,add):null;
      for (const issue of checkCab(item).filter(i => i.level === 'err')) add('construction', issue.msg);
      if (!custom && layout.parts.some(p=>p.role==='fixedShelf'))add('joinery-template','Fixed structural shelves require a complete connector recipe. Specify face drilling and document any separately machined shelf-edge operations.');
      if (item.cab.corner === 'diag') add('corner-hardware', 'Corner mounting geometry requires a verified angled-hinge template.');
      for (const column of item.cab.cols) {
        if (!custom && ['lift', 'folding', 'sliding'].includes(column.door?.t)) add('mechanism-template', 'Lift, folding and sliding mechanisms require hardware-specific mounting patterns.');
        if (!custom && column.secs.some(s => ['drawers', 'basket', 'hamper', 'trouser'].includes(s.t))) add('mechanism-template', 'Pull-out mechanisms require hardware-specific mounting patterns.');
      }
      if(custom && !['flat','shaker','glazed'].includes(item.cab.front||'flat'))add('front-relief','Relieved fronts need a depth-aware machining process.');
      if(custom)entry.panels=custom;
      const patterns = custom ? [] : drillPlan(item, layout);
      for (const pattern of patterns) {
        if (pattern.front) entry.panels.push(...frontPanels(pattern, layout, parts, prefix, add));
        else {
          const part = parts[pattern.partIndex];
          if (!part) { add('missing-part', 'Drilling could not be linked to a physical model part.', pattern.id); continue; }
          entry.panels.push({ ...pattern, id: prefix + part.id, partId: part.id, material: part.materialRole,
            holes: pattern.holes.map(h => ({ ...h, id: prefix + h.id })) });
        }
      }
      if (!custom && layout.parts.some(p => p.role === 'drawerFront')) add('drawer-front-template', 'Drawer front fixing holes are not included in the generic patterns.');
      for (const panel of entry.panels) {
        panel.faces = { A: 'positive-' + panel.faceAxis, B: 'negative-' + panel.faceAxis };
        for (const h of panel.holes) {
          const template = CABINET_HARDWARE_TEMPLATES[h.kind];
          h.templateId = custom ? 'complete-shop-recipe' : template?.id || 'unknown';
          if (template) used.add(h.kind);
        }
        entry.issues.push(...validateDrillingPanel(panel).map(issue => ({ ...issue, itemId: id })));
      }
    } catch (error) {
      add('generation-failed', 'Manufacturing review could not be generated: ' + error.message);
    }
    entry.geometryValid = !entry.issues.length;
  });
  report.templates = [...used].sort().map(kind => ({ ...CABINET_HARDWARE_TEMPLATES[kind], kind, qualification: 'generic-unverified', manufacturer: null, sourceDocument: null }));
  report.issues.push(...report.items.flatMap(item => item.issues));
  report.panelCount = report.items.reduce((n, item) => n + item.panels.length, 0);
  report.operationCount = report.items.reduce((n, item) => n + item.panels.reduce((sum, p) => sum + p.holes.length, 0), 0);
  return report;
}

export function cabinetManufacturingJSON(items) {
  return JSON.stringify(cabinetManufacturingReport(items), null, 2);
}
