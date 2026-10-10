export const DRAWING_IMAGE_MAX_BYTES=2*1024*1024;

export function drawingImageAsset(dataUrl) {
  if(typeof dataUrl!=='string'||dataUrl.length>DRAWING_IMAGE_MAX_BYTES*4/3+100)throw new Error('Drawing image must be a local PNG/JPEG of at most 2 MiB');
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if(!match)throw new Error('Only embedded PNG/JPEG drawing images are supported');
  let bytes;try {bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));}catch {throw new Error('Invalid image encoding');}
  if(bytes.length>DRAWING_IMAGE_MAX_BYTES)throw new Error('Drawing image exceeds 2 MiB');
  let width,height;
  if(match[1]==='png') {
    if(bytes.length<33||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error('Invalid PNG image');
    const d=new DataView(bytes.buffer);width=d.getUint32(16);height=d.getUint32(20);
  } else {
    if(bytes[0]!==255||bytes[1]!==216)throw new Error('Invalid JPEG image');
    let i=2;
    while(i+3<bytes.length) {
      if(bytes[i++]!==255)break;while(bytes[i]===255)i++;
      const marker=bytes[i++];if(marker===217||marker===218)break;
      if(marker===1||marker>=208&&marker<=215)continue;
      const length=bytes[i]*256+bytes[i+1];if(length<2||i+length>bytes.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8){height=bytes[i+3]*256+bytes[i+4];width=bytes[i+5]*256+bytes[i+6];break;}
      i+=length;
    }
  }
  if(!width||!height||width>4096||height>4096||width*height>16*1024*1024)throw new Error('Drawing image must have valid dimensions at most 4096 × 4096 pixels');
  return {width,height,bytes:bytes.length,mime:'image/'+match[1]};
}

export function drawingImageItem(image,paper) {
  drawingImageAsset(image?.dataUrl);
  if(![image.x,image.y,image.w,image.h].every(Number.isFinite)||image.w<=0||image.h<=0||image.x<0||image.y<0||image.x+image.w>paper.w||image.y+image.h>paper.h)throw new Error('Image position and size must stay within the paper in mm');
  return {type:'image',imageId:image.id,dataUrl:image.dataUrl,x:image.x,y:image.y,w:image.w,h:image.h};
}

// Decode locally before authoring, so malformed raster payloads never become
// a successfully inserted but invisible saved logo.
export async function decodeDrawingImage(file) {
  if(!file)return null;
  if(!['image/png','image/jpeg'].includes(file.type)||file.size>DRAWING_IMAGE_MAX_BYTES)throw new Error('Choose a local PNG/JPEG of at most 2 MiB');
  const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Image file could not be read'));reader.readAsDataURL(file);});
  const asset=drawingImageAsset(dataUrl);
  await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth===asset.width&&image.naturalHeight===asset.height?resolve():reject(new Error('Image dimensions do not match'));image.onerror=()=>reject(new Error('Image could not be decoded'));image.src=dataUrl;});
  return {dataUrl,name:file.name,widthPx:asset.width,heightPx:asset.height};
}
