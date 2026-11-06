import test from 'node:test';
import assert from 'node:assert/strict';
import {modelerSource} from './helpers/modeler_source.mjs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {openPage,findChrome} from '../tools/browser_harness.mjs';

const chrome=await findChrome(),source=modelerSource();
test('long component names and Screw/directed-hinge controls fit narrow Mates inspectors',chrome?{timeout:120000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:2560,height:1296,mobile:false,touch:false});
 try{
  await page.eval(async rowSource=>{
   document.body.className='pro-skin';document.body.innerHTML='<div id="modeler" style="display:flex"><div class="md-body"><div class="md-mid"></div><aside class="md-panel md-right"><div class="md-tabs"><div class="md-pane on"><div id="mdOps"></div></div></div></aside></div></div>';
   if(!document.querySelector('link[href*="styles.css"]')){const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/css/styles.css';document.head.append(sheet);await new Promise(resolve=>sheet.onload=resolve);}
   const el=(tag,cls,html)=>{const node=document.createElement(tag);node.className=cls||'';if(html!=null)node.innerHTML=html;return node;},btn=(label,callback,cls)=>{const button=el('button',cls,label);button.addEventListener('click',callback);return button;};
   const row=new Function('el','btn','t',rowSource+';return mateRow;')(el,btn,key=>key),host=document.querySelector('#mdOps');
   const palette=el('div','md-ops');for(const name of ['Concentric axes','Directed rotation limit','Rack and pinion mate'])palette.appendChild(btn(name,()=>{}));host.appendChild(palette);
   const detail='Planchard 8.20 - SH02 Dial housing - fresh designer example 2026-10-09 ↔ Planchard 8.20 - SH03 Vertical adjustment screw - fresh designer example 2026-10-09';
   for(let i=0;i<21;i++)row(host,'Lock mate '+(i+1),detail,null,()=>{});
   for(const type of ['Screw mate','Directed rotation limit']){
    const item=row(host,type,detail,null,()=>{},null,null,{aligned:true,onToggle(){}});
    for(const title of type==='Screw mate'?['Pitch (mm)','Drive turns (blank = free)','Thread handedness']:['Minimum angle (°)','Maximum angle (°)','Drive angle (blank = free)']){
     const wrap=el('label','md-mate-value');wrap.appendChild(el('span','',title));const input=el(title==='Thread handedness'?'select':'input');input.value='-0.25';if(input.tagName==='SELECT')input.appendChild(el('option','','Right hand'));wrap.appendChild(input);item.appendChild(wrap);
    }
    item.appendChild(btn('Replace references with selection',()=>{},'md-mate-align'));
   }
  },sourceFunctionText(source,'mateRow'));
  for(const width of [232,280,400]){
   const result=await page.eval(async width=>{
    const panel=document.querySelector('.md-right');panel.style.width=width+'px';await new Promise(requestAnimationFrame);
    const pane=document.querySelector('.md-pane'),bounds=pane.getBoundingClientRect(),nodes=[...document.querySelectorAll('#mdOps button,#mdOps input,#mdOps select,.md-mate-row,.md-mate-value')];
    const rows=[...document.querySelectorAll('.md-mate-row')];
    const vertical=rows.map((row,index)=>{const r=row.getBoundingClientRect(),next=rows[index+1]?.getBoundingClientRect();return {overlap:next?r.bottom-next.top:0,childOutside:[...row.children].some(child=>{const c=child.getBoundingClientRect();return c.top<r.top-1||c.bottom>r.bottom+1;})};});
    return {overflow:pane.scrollWidth-pane.clientWidth,scrollable:pane.scrollHeight>pane.clientHeight,outside:nodes.filter(node=>{const r=node.getBoundingClientRect();return r.left<bounds.left-1||r.right>bounds.right+1;}).map(node=>node.outerHTML),vertical,titles:[...document.querySelectorAll('.md-mate-row > span:first-child')].map(node=>({wrap:getComputedStyle(node).whiteSpace,height:node.getBoundingClientRect().height})),deleteVisible:[...document.querySelectorAll('.md-mate-row > .md-part-x')].every(node=>Number(getComputedStyle(node).opacity)>0)};
   },width);
   assert.ok(result.overflow<=1,JSON.stringify({width,...result}));assert.deepEqual(result.outside,[],String(width));assert.ok(result.titles.every(title=>title.wrap==='normal'&&title.height>20),JSON.stringify({width,...result}));assert.ok(result.deleteVisible);
   assert.ok(result.scrollable);assert.ok(result.vertical.every(row=>row.overlap<=0&&!row.childOutside),JSON.stringify({width,vertical:result.vertical}));
  }
 }finally{await page.close();}
});
