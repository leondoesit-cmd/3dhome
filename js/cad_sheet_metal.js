export function bendAllowance(angleDeg, insideRadius, thickness, kFactor = 0.33) {
  return Math.abs(angleDeg) * Math.PI / 180 * (Math.max(0, insideRadius) + Math.max(0, thickness) * kFactor);
}

export function bendDeduction(angleDeg, insideRadius, thickness, kFactor = 0.33) {
  const a = Math.abs(angleDeg) * Math.PI / 180;
  const setback = Math.tan(a / 2) * (insideRadius + thickness);
  return Math.max(0, 2 * setback - bendAllowance(angleDeg, insideRadius, thickness, kFactor));
}

export function createSheetMetalPart(options = {}) {
  return {
    thickness: Math.max(.01, Number(options.thickness || 1.5)),
    insideRadius: Math.max(0, Number(options.insideRadius || 1.5)),
    kFactor: Math.max(0, Math.min(.5, Number(options.kFactor ?? .33))),
    base: options.base || { width:100, height:60 },
    flanges: [],
  };
}

export function addEdgeFlange(sheet, edge, length, angle = 90) {
  const flange = { id:"flange_"+Date.now().toString(36)+Math.random().toString(36).slice(2,5), edge, length:Math.max(.1,Number(length)), angle:Number(angle) };
  flange.bendAllowance = bendAllowance(flange.angle, sheet.insideRadius, sheet.thickness, sheet.kFactor);
  flange.bendDeduction = bendDeduction(flange.angle, sheet.insideRadius, sheet.thickness, sheet.kFactor);
  sheet.flanges.push(flange); return flange;
}

export function flatPattern(sheet) {
  const w = sheet.base.width, h = sheet.base.height;
  const outline = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
  const bends = sheet.flanges.map((f) => ({
    id:f.id, edge:f.edge, angle:f.angle,
    allowance:bendAllowance(f.angle,sheet.insideRadius,sheet.thickness,sheet.kFactor),
    deduction:bendDeduction(f.angle,sheet.insideRadius,sheet.thickness,sheet.kFactor),
  }));
  return { outline, bends, thickness:sheet.thickness, units:"cm" };
}
