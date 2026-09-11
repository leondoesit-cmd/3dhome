// All dimensions are centimetres, angles degrees. Diagnostics and the walking
// controller deliberately read the same normalized project profile.
export const DEFAULT_NAVIGATION_PROFILE = Object.freeze({version:1, radius:18, height:165, eyeHeight:165,
  stepHeight:0, slopeLimit:45, cameraDistance:230, cameraRadius:10, speed:240});
const ranges = {radius:[8,100],height:[40,300],eyeHeight:[20,300],stepHeight:[0,80],slopeLimit:[0,80],cameraDistance:[30,600],cameraRadius:[2,40],speed:[30,600]};
export function normalizeNavigationProfile(raw={}) {
  const result={...DEFAULT_NAVIGATION_PROFILE};
  for(const [key,[lo,hi]] of Object.entries(ranges)) {
    const n=Number(raw?.[key]);
    if(raw?.[key]!=null && Number.isFinite(n)) result[key]=Math.min(hi,Math.max(lo,n));
  }
  result.eyeHeight=Math.min(result.eyeHeight,result.height);
  return result;
}
export function navigationProfile(state) { return normalizeNavigationProfile(state?.workspace?.navigationProfile); }
export function passageClearance(width,height,profile) {
  const p=normalizeNavigationProfile(profile);
  return {width:width-2*p.radius,height:height-p.height,passable:width>2*p.radius&&height>=p.height};
}
export function cameraRetraction(current,allowed,desired,dt) {
  const target=Math.max(0,Math.min(allowed,desired));
  return target<current ? target : current+(target-current)*(1-Math.exp(-8*Math.max(0,dt)));
}
