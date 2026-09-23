import { cabinetStockSignature, cabinetStockMapping } from './cabinet_stock_datum.js';
import { layoutCab, cabRun, BOARD_ROLES, stockRole, sheetFor, bandLen } from './cabinet.js';
import { bandById } from './stock.js';
import { semanticCabinetParts } from './core/cabinet_parts.js';

// Unique source IDs are the job datum. Invalid jobs retain previewable parts,
// but their fallback identities are explicitly unsuitable for production.
export function cabinetItemIdentity(item, index, items = []) {
  const value = item?.id;
  const valid = (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value));
  const id = valid ? String(value) : 'missing-' + index;
  const duplicate = valid && items.filter(other => other?.cab && String(other.id) === id).length > 1;
  return { id, prefix: 'item:' + encodeURIComponent(id) + (duplicate || !valid ? ':invalid-' + index : '') + ':',
    issue: !valid ? 'missing-item-id' : duplicate ? 'duplicate-item-id' : null };
}
export function cabinetPartIdentity(itemId, partId) {
  return 'item:' + encodeURIComponent(String(itemId)) + ':' + partId;
}
export function cabinetPanelDimensions(p) {
  if (p.k === 'poly') return { t: Math.abs(p.y1 - p.y0), gl: p.bw, gw: p.bd };
  if (p.k !== 'box' || p.tilt || p.cut || p.manufacturingIncomplete) return null;
  const dx = Math.abs(p.x1 - p.x0), dy = Math.abs(p.y1 - p.y0), dz = Math.abs(p.z1 - p.z0);
  const t = Math.min(dx, dy, dz);
  return t === dz ? { t, gl: dy, gw: dx, alongAxis:'y', acrossAxis:'x', thicknessAxis:'z' } : t === dy ? { t, gl: dx, gw: dz, alongAxis:'x', acrossAxis:'z', thicknessAxis:'y' } : { t, gl: dy, gw: dz, alongAxis:'y', acrossAxis:'z', thicknessAxis:'x' };
}
const mm = value => Number((value * 10).toFixed(9));

// Occurrence-based semantic IDs are safe to reuse only while structural order
// is unchanged. Bind authored edges to topology, excluding physical dimensions.
export function cabinetProductionTopologyBinding(layout) {
  const sp=layout.sp;
  return JSON.stringify({version:1,family:sp.fam,carcass:sp.carcass,corner:sp.corner,front:sp.front,
    back:!!sp.back,top:!!sp.top,plinth:!!sp.plinth,
    columns:(sp.cols||[]).map(column=>({hid:column.hid||null,
      door:{type:column.door?.t,leaves:column.door?.leaves,hinge:column.door?.hinge,style:column.door?.style},
      sections:(column.secs||[]).map(section=>({hid:section.hid||null,type:section.t,count:section.n}))})),
    parts:layout.parts.map(part=>({kind:part.k,role:part.role,material:part.mat,unit:part.unit,authoredPartId:part.authoredPartId}))});
}

function allowances(override, finished, datum, topologyBinding, add) {
  if (!override) return { edges: null, substrate: null, rough: null };
  if (!topologyBinding || override.topologyBinding !== topologyBinding) { add('edge-topology-mismatch','Edge allowances must be reconfirmed after cabinet topology changes; the authored board identity is no longer bound to this structure.'); return {edges:null,substrate:null,rough:null}; }
  if (!datum || override.datum !== datum) { add('edge-datum-mismatch','Edge allowances must bind to the current panel axis datum; confirm them after an orientation change.'); return {edges:null,substrate:null,rough:null}; }
  const names = ['lengthStart','lengthEnd','widthStart','widthEnd'];
  if (!finished || !names.every(name => {
    const edge = override.edges?.[name];
    return edge && Number.isFinite(edge.thicknessMm) && edge.thicknessMm >= 0 && (edge.thicknessMm === 0 || bandById(edge.stockId) && Math.abs(bandById(edge.stockId).t * 10 - edge.thicknessMm) < 1e-6);
  })) { add('invalid-edge-allowance', 'Explicit banding requires four valid edge thicknesses matching stocked band SKUs.'); return { edges: null, substrate: null, rough: null }; }
  const edges = Object.fromEntries(names.map(name => [name,{thicknessMm:override.edges[name].thicknessMm, stockId:override.edges[name].stockId || null}]));
  const substrate = { length: finished.length - edges.lengthStart.thicknessMm - edges.lengthEnd.thicknessMm,
    width: finished.width - edges.widthStart.thicknessMm - edges.widthEnd.thicknessMm, thickness: finished.thickness };
  if (substrate.length <= 0 || substrate.width <= 0) { add('invalid-substrate', 'Banding deductions consume the board.'); return {edges,substrate:null,rough:null}; }
  let rough = null;
  if (override.roughAllowance) {
    const a = override.roughAllowance;
    if (![a.lengthMm,a.widthMm].every(v => Number.isFinite(v) && v >= 0)) add('invalid-rough-allowance','Rough allowances must be finite nonnegative millimetres.');
    else rough = {length:substrate.length+a.lengthMm,width:substrate.width+a.widthMm,thickness:substrate.thickness};
  }
  return {edges,substrate,rough};
}

// Layout envelopes are finished design dimensions, not verified saw sizes.
// Aggregate bandLen rules do not establish a per-edge thickness deduction,
// machining stock or finish allowance: preserve those unknowns explicitly.
export function cabinetProductionParts(items = []) {
  const report = { schema: 'modelforge-cabinet-production-parts', version: 1, units: 'mm',
    status: 'review-required', machineReady: false, parts: [], issues: [] };
  const add = (code, message, itemId, partId) => report.issues.push({ code, message, itemId, partId });
  items.forEach((item, index) => {
    if (!item?.cab) return;
    const identity = cabinetItemIdentity(item, index, items);
    if (identity.issue) add(identity.issue, 'Production requires a unique persistent cabinet ID.', identity.id);
    try {
      const closedItem=JSON.parse(JSON.stringify(item));
      closedItem.cab.open=0;if(closedItem.runtimeState)closedItem.runtimeState.cabinetOpen=0;
      const layout = layoutCab(closedItem, cabRun(item, items));
      // semanticCabinetParts filters unsupported primitives; map each separately
      // to preserve its source identity and never shift subsequent part indexes.
      const semantic = semanticCabinetParts(layout);
      const topologyBinding = cabinetProductionTopologyBinding(layout);
      const bySource = new Map();
      semantic.forEach(part => { const key = JSON.stringify(part.source); if (!bySource.has(key)) bySource.set(key,[]); bySource.get(key).push(part); });
      layout.parts.forEach((source, partIndex) => {
        if (!BOARD_ROLES.includes(source.role)) return;
        const semanticPart = bySource.get(JSON.stringify(source))?.shift();
        const partId = source.authoredPartId || semanticPart?.id || 'unsupported:' + partIndex;
        const id = identity.prefix + partId;
        const d = cabinetPanelDimensions(source);
        const valid = d && [d.t,d.gl,d.gw].every(v => Number.isFinite(v) && v > 0);
        const srole = stockRole(source.mat);
        const sheet = valid ? sheetFor(layout.sp, srole, d.t) : null;
        // resolveSheet deliberately tolerates approximate thickness for visual
        // quotes. A cut blank cannot inherit that tolerance: nominal 3/4 in
        // stock is not an 18 mm board, nor is a 1/4 in back an 8 mm sheet.
        const stockMatches = !!sheet && (['top','glass','mirror'].includes(srole) || Math.abs(sheet.t - d.t) <= 0.01);
        const finished = valid ? { length: mm(Math.max(d.gl,d.gw)), width: mm(Math.min(d.gl,d.gw)), thickness: mm(d.t), alongGrain: mm(d.gl), acrossGrain: mm(d.gw) } : null;
        const geometry = !valid ? 'unsupported' : source.k === 'poly' ? 'polygon' : 'rectangle';
        const datum = geometry === 'rectangle' ? 'length:' + (d.gl >= d.gw ? d.alongAxis : d.acrossAxis) + ';width:' + (d.gl >= d.gw ? d.acrossAxis : d.alongAxis) + ';thickness:' + d.thicknessAxis : null;
        const override = item.cab.productionOverrides?.[partId];
        if (override && geometry !== 'rectangle') add('unsupported-edge-allowance','Per-edge deductions require a rectangular board.',identity.id,id);
        const sizes = allowances(geometry === 'rectangle' ? override : null, finished, datum, topologyBinding, (code,message) => add(code,message,identity.id,id));
        const byStock = {};
        if (sizes.edges) for (const [name,edge] of Object.entries(sizes.edges)) { if (edge.thicknessMm > 0) byStock[edge.stockId] = (byStock[edge.stockId] || 0) + (name.startsWith('length') ? finished.width : finished.length); }
        const productionPart = { id, itemId: identity.id, partId, itemIndex: index, role: source.role, material: source.mat,
          stockRole: srole, sheetId: stockMatches ? sheet.id : null,
          stockCandidateId: !stockMatches ? sheet?.id || null : null,
          grain: stockMatches ? !!sheet.grain : null,
          geometry, datum, topologyBinding, finished, ...sizes,
          banding: sizes.edges ? {stockId:null,byStock,lengthMm:Object.values(byStock).reduce((sum,value)=>sum+value,0),basis:'explicit-edges'} : { stockId: layout.sp.band, lengthMm: Number((bandLen(source) * 1000).toFixed(9)), basis: 'aggregate-layout-estimate' } };
        productionPart.stockSignature = cabinetStockSignature(productionPart);
        productionPart.stockMapping = cabinetStockMapping(productionPart,override?.machiningDatum,(code,message)=>add(code,message,identity.id,id));
        report.parts.push(productionPart);
        if (!valid) add('unsupported-geometry', 'This board has no supported rectangular design envelope.', identity.id, id);
        if (geometry === 'polygon') add('polygon-machining-required', 'Nesting represents the bounding blank; its contour requires separate machining.', identity.id, id);
        if (!sheet) add('missing-stock', 'No sheet SKU matches this board.', identity.id, id);
        else if (!stockMatches) add('stock-thickness-mismatch',
          `Board is ${mm(d.t)} mm thick, but the proposed ${sheet.id} sheet is ${mm(sheet.t)} mm. Select exact nominal stock or revise the design; this part is excluded from the cut plan.`, identity.id, id);
      });
      for (const partId of Object.keys(item.cab.productionOverrides || {})) {
        if (!report.parts.some(part => part.itemId === identity.id && part.partId === partId)) add('stale-part-override','A part allowance refers to a board no longer present in this design.',identity.id,identity.prefix+partId);
      }
    } catch (error) { add('layout-failed', String(error.message || error), identity.id); }
  });
  if (report.parts.some(part => !part.substrate || !part.rough)) add('allowances-unknown', 'Substrate deductions, per-edge banding assignments and rough machining allowances are not defined; dimensions are finished design envelopes.');
  report.parts.sort((a,b) => a.id.localeCompare(b.id));
  report.issues.sort((a,b) => String(a.itemId || '').localeCompare(String(b.itemId || '')) || String(a.partId || '').localeCompare(String(b.partId || '')) || a.code.localeCompare(b.code));
  return report;
}
