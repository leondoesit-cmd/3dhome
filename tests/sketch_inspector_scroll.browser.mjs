import test from 'node:test';
import assert from 'node:assert/strict';
import {stylesFiles} from './helpers/styles_source.mjs';
import {openPage,findChrome} from '../tools/browser_harness.mjs';

const chrome=await findChrome();
test('last sketch driving field can scroll fully above the inspector clipping edge',chrome?{timeout:120000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:2560,height:1296,mobile:false,touch:false});
 try{
  await page.eval(async sheets=>{
   document.body.className='pro-skin';document.body.innerHTML='<div id="modeler" style="display:flex"><div class="md-body"><div class="md-mid"></div><aside class="md-panel md-right"><div class="md-prev-wrap" style="height:160px"></div><div class="md-tabstrip" style="height:40px"></div><div class="md-tabs"><div class="md-pane on"><div id="mdSketch"></div></div></div></aside></div></div>';
   if(!document.querySelector('link[href*="styles_01_"]')){await Promise.all(sheets.map(href=>{const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/'+href;document.head.append(sheet);return new Promise(resolve=>sheet.onload=resolve);}));}
   const host=document.querySelector('#mdSketch');
   for(let i=0;i<20;i++){const button=document.createElement('button');button.textContent='Sketch constraint and geometry action '+i;host.append(button);}
   const list=document.createElement('div');list.className='md-cons-list';host.append(list);
   for(let i=0;i<24;i++){const row=document.createElement('div');row.className='md-cons-row';row.innerHTML='<span class="n">Circle radius driving constraint '+i+'</span><span class="md-var-val">5 mm</span><input class="md-dim-name" value="Radius'+i+'"><input class="md-dim-value" value="5"><button class="md-mini">×</button>';list.append(row);}
  },stylesFiles());
  for(const width of [232,280,400]){
   const result=await page.eval(async width=>{
    document.querySelector('.md-right').style.width=width+'px';const pane=document.querySelector('.md-pane');pane.scrollTop=1e6;await new Promise(requestAnimationFrame);
    const field=document.querySelector('.md-cons-list .md-cons-row:last-child .md-dim-value');field.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);
    const p=pane.getBoundingClientRect(),f=field.getBoundingClientRect(),last=document.querySelector('.md-cons-row:last-child').getBoundingClientRect();
    return {paneBottom:p.bottom,fieldBottom:f.bottom,fieldTop:f.top,lastBottom:last.bottom,scrollTop:pane.scrollTop,maximum:pane.scrollHeight-pane.clientHeight,hit:document.elementFromPoint(f.left+f.width/2,f.top+f.height/2)===field};
   },width);
   // Fractional device scaling can differ by ~0.00003 CSS px at a shared edge.
   // Keep the field's full 1px clearance and hit test; allow only numeric roundoff for the row boundary.
   assert.ok(result.fieldTop>=0&&result.fieldBottom<=result.paneBottom-1,JSON.stringify({width,...result}));assert.ok(result.hit,JSON.stringify({width,...result}));assert.ok(result.lastBottom<=result.paneBottom+1e-4,JSON.stringify({width,...result}));
  }
 }finally{await page.close();}
});
