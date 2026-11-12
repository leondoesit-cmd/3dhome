import {blueprintTextFeatures} from './core/blueprint_text.js';

export async function readBlueprintText(canvas,walls,{signal,onProgress,onTextLines}={}){
  let worker=null,aborted=false;
  const cancelled=()=>{const error=new Error('Image analysis cancelled.');error.name='AbortError';return error;};
  let rejectAbort;
  const abort=new Promise((_,reject)=>{rejectAbort=reject;});
  const cancel=()=>{aborted=true;Promise.resolve(worker?.terminate()).catch(()=>{});rejectAbort(cancelled());};
  if(signal?.aborted)throw cancelled();
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    onProgress?.('ocr');
    const {default:Tesseract}=await import('../vendor/tesseract/tesseract.esm.min.js');
    const {createWorker}=Tesseract;
    const create=createWorker('eng',1,{
      workerPath:new URL('../vendor/tesseract/worker.min.js',import.meta.url).href,
      corePath:new URL('../vendor/tesseract/core/',import.meta.url).href,
      langPath:new URL('../vendor/tesseract/lang/',import.meta.url).href,gzip:false,
    }).then(value=>{if(aborted){value.terminate();throw cancelled();}worker=value;return value;});
    await Promise.race([create,abort]);
    await Promise.race([worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'}),abort]);
    const lines=[];
    // Small listing images often contain 6–10 px type. Enlarge before OCR,
    // then return all boxes to the original image coordinate system.
    const factor=Math.min(3,Math.max(1,1600/Math.max(canvas.width,canvas.height)));
    const textCanvas=document.createElement('canvas');textCanvas.width=Math.round(canvas.width*factor);textCanvas.height=Math.round(canvas.height*factor);
    textCanvas.getContext('2d').drawImage(canvas,0,0,textCanvas.width,textCanvas.height);
    for(const pass of [{rotated:false,language:'eng'},{rotated:true,language:'eng'},{rotated:false,language:'heb'}]){
      const {rotated,language}=pass;
      if(aborted)throw cancelled();
      if(language==='heb'){
        await Promise.race([worker.reinitialize('heb'),abort]);
        await Promise.race([worker.setParameters({tessedit_pageseg_mode:'11'}),abort]);
      }
      let input=textCanvas;
      if(rotated){input=document.createElement('canvas');input.width=textCanvas.height;input.height=textCanvas.width;
        const ctx=input.getContext('2d');ctx.translate(textCanvas.height,0);ctx.rotate(Math.PI/2);ctx.drawImage(textCanvas,0,0);}
      const result=await Promise.race([worker.recognize(input,{}, {blocks:true,text:true}),abort]);
      for(const block of result.data.blocks || [])for(const paragraph of block.paragraphs || [])for(const line of paragraph.lines || []){
        const words=(line.words||[]).filter(word=>/[A-Za-z0-9\u0590-\u05ff]/.test(word.text));
        if(!words.length)continue;
        const b={x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),
          x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))};
        const box=rotated?{x0:b.y0,y0:textCanvas.height-b.x1,x1:b.y1,y1:textCanvas.height-b.x0}:b;
        for(const key of ['x0','x1','y0','y1'])box[key]/=factor;
        lines.push({text:words.map(w=>w.text).join(' '),confidence:words.reduce((sum,w)=>sum+w.confidence,0)/words.length,rotated,bbox:box});
      }
    }
    onTextLines?.(lines);
    return blueprintTextFeatures(lines,canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height),walls);
  }finally{signal?.removeEventListener('abort',cancel);await Promise.resolve(worker?.terminate()).catch(()=>{});}
}
