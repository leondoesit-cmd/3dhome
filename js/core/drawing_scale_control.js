import {STANDARD_SCALES,scaleLabel,scaleValue} from '../cad_sheet.js';

// Placement scales are numeric; saved user scales may also be ratios. The
// inspector must represent both without rewriting the drawing document.
export function drawingViewScaleControl(scale,inheritLabel='As sheet',{automatic=false,effectiveScale=null}={}) {
  const options=[{value:'auto',label:'Automatic'+(effectiveScale?' ('+scaleLabel(effectiveScale)+')':'')},{value:'sheet',label:inheritLabel},...STANDARD_SCALES.map(s=>({value:scaleLabel(s),label:scaleLabel(s)}))];
  const standard=scale && STANDARD_SCALES.find(s=>Math.abs(scaleValue(s)-scaleValue(scale))<=1e-12);
  const value=!scale?(automatic?'auto':'sheet'):standard?scaleLabel(standard):Array.isArray(scale)?scale.join(':'):
    typeof scale==='object'?scale.n+':'+scale.d:String(scale)+':1';
  if(value!=='sheet'&&value!=='auto'&&!options.some(option=>option.value===value))options.push({value,label:scaleLabel(scale)});
  return {value,options};
}
