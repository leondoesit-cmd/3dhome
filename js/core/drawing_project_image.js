import {decodeDrawingImage,DRAWING_IMAGE_MAX_BYTES} from './drawing_image.js';

export function drawingProjectImageUrl(value,baseUrl) {
  let base,url;
  try {base=new URL(baseUrl);url=new URL(String(value).trim(),base);}catch {throw new Error('Enter a valid app-served PNG/JPEG URL');}
  let path;try {path=decodeURIComponent(url.pathname);}catch {throw new Error('Invalid project image path');}
  if(!String(value).trim() || !['http:','https:'].includes(base.protocol)
    || !['http:','https:'].includes(url.protocol) || url.origin!==base.origin
    || url.username || url.password || url.search || url.hash
    || /^\/api(?:\/|$)/i.test(path) || !/\.(png|jpe?g)$/i.test(path))
    throw new Error('Choose a same-origin static PNG/JPEG asset URL; external, API and file URLs are unsupported');
  return url;
}

/** Browser HTTP import of an already app-served static asset. Persist pixels,
 * never a live URL. Redirects, proxy routes and local file access are excluded. */
export async function importDrawingProjectImage(value,{baseUrl=globalThis.location?.href,fetchImage=globalThis.fetch,decodeImage=decodeDrawingImage}={}) {
  const url=drawingProjectImageUrl(value,baseUrl);
  const response=await fetchImage(url.href,{method:'GET',mode:'same-origin',credentials:'omit',redirect:'error'});
  if(!response.ok || response.redirected || response.url && response.url!==url.href)throw new Error('Project image could not be fetched without redirect');
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!['image/png','image/jpeg'].includes(mime))throw new Error('Project asset must be served as PNG/JPEG');
  const length=response.headers.get('content-length');
  if(length!==null && (!/^\d+$/.test(length) || Number(length)>DRAWING_IMAGE_MAX_BYTES))throw new Error('Project image exceeds 2 MiB or has an invalid size');
  const reader=response.body?.getReader();
  if(!reader)throw new Error('Project image response has no readable pixel body');
  const chunks=[];let size=0;
  try {
    while(true){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;
      if(size>DRAWING_IMAGE_MAX_BYTES){await reader.cancel();throw new Error('Project image exceeds 2 MiB');}chunks.push(chunk);}
  } finally {reader.releaseLock();}
  if(!size)throw new Error('Project image has no pixels');
  const asset=await decodeImage(new Blob(chunks,{type:mime}));
  return {...asset,name:decodeURIComponent(url.pathname.split('/').at(-1))};
}
