// Explicit shop review defines where rough surplus lies; totals alone cannot.
export function cabinetStockSignature(part) {
  return JSON.stringify({datum:part.datum,topologyBinding:part.topologyBinding,finished:part.finished,substrate:part.substrate,rough:part.rough,edges:part.edges});
}
export function cabinetStockMapping(part, configuration, add) {
  if (!configuration) return null;
  const stock=part.rough || part.substrate;
  if (!part.substrate || !part.edges || !stock || configuration.datum!==part.datum || configuration.topologyBinding!==part.topologyBinding || configuration.stockSignature!==cabinetStockSignature(part)) {
    add('stock-datum-stale','Stock datum review must match the current board axes, topology, edge deductions and stock dimensions.');return null;
  }
  if (!['reviewedBy','sourceDrawing'].every(key=>typeof configuration[key]==='string'&&configuration[key].trim())) {add('stock-datum-source','Stock datum requires a reviewer and source drawing.');return null;}
  const lengthExtra=stock.length-part.substrate.length,widthExtra=stock.width-part.substrate.width;
  if (!Number.isFinite(configuration.lengthStartExtraMm)||!Number.isFinite(configuration.widthStartExtraMm)||configuration.lengthStartExtraMm<0||configuration.widthStartExtraMm<0||configuration.lengthStartExtraMm>lengthExtra+1e-9||configuration.widthStartExtraMm>widthExtra+1e-9) {
    add('stock-datum-offset','Minimum-edge rough surplus must be nonnegative and no greater than the total rough surplus on that axis.');return null;
  }
  return {stock:{...stock},offsetLength:configuration.lengthStartExtraMm-part.edges.lengthStart.thicknessMm,
    offsetWidth:configuration.widthStartExtraMm-part.edges.widthStart.thicknessMm,reviewedBy:configuration.reviewedBy,
    sourceDrawing:configuration.sourceDrawing,stockSignature:configuration.stockSignature};
}
export function applyCabinetStockMapping(panel, part) {
  const mapping=part.stockMapping;
  const axes=Object.fromEntries((part.datum||'').split(';').map(entry=>entry.split(':')));
  if (!mapping || !panel.recipeSource || panel.faceAxis!==axes.thickness || ![axes.length,axes.width].includes(panel.xAxis) || ![axes.length,axes.width].includes(panel.yAxis) || panel.xAxis===panel.yAxis) return false;
  const xLong=panel.xAxis===axes.length,yLong=panel.yAxis===axes.length;
  if (Math.abs(panel.l-(xLong?part.finished.length:part.finished.width))>0.001 || Math.abs(panel.w-(yLong?part.finished.length:part.finished.width))>0.001 || Math.abs(panel.thickness-part.finished.thickness)>0.001) return false;
  const dx=xLong?mapping.offsetLength:mapping.offsetWidth,dy=yLong?mapping.offsetLength:mapping.offsetWidth;
  panel.finishedDimensions={l:panel.l,w:panel.w,thickness:panel.thickness};
  panel.l=xLong?mapping.stock.length:mapping.stock.width;panel.w=yLong?mapping.stock.length:mapping.stock.width;
  panel.holes=panel.holes.map(hole=>({...hole,x:hole.x+dx,y:hole.y+dy}));
  panel.stockMapping={...mapping,offsetX:dx,offsetY:dy};
  panel.datum='Minimum cut-stock bounds along xAxis/yAxis; reviewed translation from finished board; A/B share fixed datum';
  panel.datumCode='reviewed-stock-minimum';
  return true;
}
