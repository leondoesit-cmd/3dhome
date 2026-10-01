import {normalizeHelixRegions,helixRegionState} from './cad_helix.js';
import {formatDocumentLength,documentLengthUnit} from './core/document_length_units.js';

export function createHelixRegionEditor(value,options) {
  const {el,evaluateNumber}=options,unit=documentLengthUnit(options.units?.length);
  const host=el('div','md-helix-regions'),table=el('table'),head=el('thead'),header=el('tr'),body=el('tbody'),note=el('small','md-expression-result');
  for(const text of ['Rev','Pitch ('+unit+')','Diameter ('+unit+')','Height ('+unit+')',''])header.appendChild(el('th','',text));
  head.appendChild(header);table.appendChild(head);table.appendChild(body);host.appendChild(table);host.appendChild(note);
  let draft=Array.isArray(value)&&value.length ? structuredClone(value) : [{revolution:0,pitch:options.pitch || .125,diameter:2*(options.radius || 1)},{revolution:options.turns || 1,pitch:options.pitch || .125,diameter:2*(options.radius || 1)}];
  let rows=[];
  const read=()=>normalizeHelixRegions(rows.map(row=>Object.fromEntries(['revolution','pitch','diameter'].map(key=>[key,evaluateNumber(row[key].value,{key,type:'number',...(key==='revolution'?{}:{unit:'length',inputUnit:unit})})]))));
  const validate=()=>{
    for(const row of rows)for(const key of ['revolution','pitch','diameter'])row[key].setCustomValidity('');
    try{
      const values=read();note.textContent='Height is derived by integrating pitch between regions.';
      rows.forEach((row,i)=>{row.height.textContent=formatDocumentLength(helixRegionState(values,values[i].revolution).height,unit,12);});
      return values;
    }catch(error){
      note.textContent=error.message;if(rows[0])rows[0].revolution.setCustomValidity(error.message);
      rows.forEach(row=>{row.height.textContent='—';});return null;
    }
  };
  const notify=()=>host.dispatchEvent(new Event('change',{bubbles:true}));
  function paint(){
    body.textContent='';rows=[];
    draft.forEach((value,index)=>{
      const tr=el('tr'),row={};
      for(const key of ['revolution','pitch','diameter']){
        const td=el('td'),input=el('input');input.type='text';input.inputMode='decimal';input.spellcheck=false;
        input.value=key==='revolution'?String(value[key]):formatDocumentLength(value[key],unit,12);
        input.setAttribute('aria-label','Region '+(index+1)+' '+key+(key==='revolution'?'':' ('+unit+')'));
        input.dataset.parameterType='number';input._validateFeatureValue=validate;
        row[key]=input;td.appendChild(input);tr.appendChild(td);
      }
      const heightCell=el('td');row.height=el('output');row.height.setAttribute('aria-label','Region '+(index+1)+' height ('+unit+')');heightCell.appendChild(row.height);tr.appendChild(heightCell);
      const removeCell=el('td'),remove=el('button','','×');remove.type='button';remove.setAttribute('aria-label','Remove region '+(index+1));remove.disabled=draft.length<=2;
      remove.addEventListener('click',()=>{const values=validate();if(!values)return;draft=values.filter((_,i)=>i!==index);paint();notify();});
      removeCell.appendChild(remove);tr.appendChild(removeCell);body.appendChild(tr);rows.push(row);
    });
    validate();
  }
  const add=el('button','','Add region');add.type='button';
  add.addEventListener('click',()=>{const values=validate();if(!values || values.length>=64)return;const last=values.at(-1);draft=[...values,{...last,revolution:last.revolution+1}];paint();notify();});
  host.appendChild(add);host.getRegionRows=()=>validate() || NaN;host._validateFeatureValue=validate;
  paint();return host;
}
