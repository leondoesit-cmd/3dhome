// Inch dimensions transcribed from manufacturer tables; see
// docs/planchard/ansi-toolbox-sources.md. Inch-to-mm conversion is exact.
const inch = value => value * 25.4;
const sizes = [['1/4',.25,20],['5/16',.3125,18],['3/8',.375,16]];
export const ANSI_MACHINE_LENGTHS_MM = Object.freeze([.25,.375,.5,.625,.75,1,1.25,1.5,2,2.5,3].map(inch));
function rows(values, mapper) {
  return Object.freeze(Object.fromEntries(sizes.map(([size,d,tpi],index)=>[
    size,Object.freeze({size,imperial:true,diameterMm:inch(d),pitchMm:25.4/tpi,...mapper(values[index])})
  ])));
}
export const ANSI_TYPE_A_NARROW = rows([
  [.281,.625,.065],[.344,.688,.065],[.406,.812,.065]
],([id,od,h])=>({idMm:inch(id),odMm:inch(od),h:inch(h)}));
// Midpoints of the published maximum/minimum envelope, not a tolerance claim.
export const ANSI_HEX_MACHINE_NUT = rows([
  [.4305,.1855],[.5535,.2165],[.616,.248]
],([af,h])=>({af:inch(af),h:inch(h)}));
export const ANSI_PAN_CROSS = rows([
  [.4825,.1685,.2745,.161,.036,3],
  [.6045,.2105,.3435,.193,.169,4],
  [.728,.2525,.3825,.233,.210,4]
],([d,h,m,g,n,driver])=>({headDiaMm:inch(d),headHeightMm:inch(h),recessDiaMm:inch(m),recessDepthMm:inch(g),recessWidthMm:inch(n),driver}));
