import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stylesFiles} from './helpers/styles_source.mjs';
import {openPage,findChrome} from '../tools/browser_harness.mjs';

const chrome=await findChrome();
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const toolbar=source.slice(source.indexOf("'<div class=\"md-drawing-tools\""),source.indexOf("'<aside class=\"md-sheet-panel\""));
const buttons=[...toolbar.matchAll(/<button\b([^>]*)>/g)].map(match=>({
  id:/\bid="([^"]+)"/.exec(match[1])?.[1]||'',
  tool:/\bdata-drawing-tool="([^"]+)"/.exec(match[1])?.[1]||'',
}));

test('all drawing rail commands scroll into a clickable canvas area above status chrome',chrome?{timeout:120000}:{skip:'Chrome unavailable'},async()=>{
  const page=await openPage({width:1280,height:820,mobile:false,touch:false});
  try{
    await page.eval(async (buttons,sheets)=>{
      document.body.innerHTML='<div id="modeler" class="md-isdrawing" style="display:block;position:relative;width:700px;height:500px"><div id="mdDrawingTools" class="md-drawing-tools"></div><div id="status" style="position:absolute;bottom:0;height:44px;width:100%;z-index:9">Status chrome</div></div>';
      if(!document.querySelector('link[href*="styles_01_"]')){
        await Promise.all(sheets.map(href=>{const css=document.createElement('link');css.rel='stylesheet';css.href='/'+href;document.head.append(css);return new Promise(resolve=>css.onload=resolve);}));
      }
      const rail=document.querySelector('#mdDrawingTools');
      for(const spec of buttons){const button=document.createElement('button');button.type='button';button.id=spec.id;button.textContent=spec.tool||spec.id;button.addEventListener('click',()=>button.dataset.clicked='yes');rail.appendChild(button);}
    },buttons,stylesFiles());
    for(const height of [280,500,900]){
      const result=await page.eval(async height=>{
        const host=document.querySelector('#modeler'),rail=document.querySelector('#mdDrawingTools');host.style.height=height+'px';
        await new Promise(requestAnimationFrame);
        const results=[];
        for(const button of rail.children){
          button.scrollIntoView({block:'nearest'});
          const r=button.getBoundingClientRect(),bounds=rail.getBoundingClientRect(),status=document.querySelector('#status').getBoundingClientRect();
          const hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
          const reachable=hit===button||button.contains(hit);if(reachable)hit.click();
          results.push({id:button.id,height:r.height,inside:r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1,aboveStatus:r.bottom<=status.top+1,reachable,clicked:button.dataset.clicked==='yes'});
        }
        return {results,scrollable:rail.scrollHeight>rail.clientHeight};
      },height);
      assert.ok(result.scrollable,JSON.stringify({height,...result}));
      assert.ok(result.results.every(row=>row.height>=32&&row.inside&&row.aboveStatus&&row.reachable&&row.clicked),JSON.stringify({height,...result}));
      assert.ok(result.results.some(row=>row.id==='mdSheetModelItems'));
    }
  }finally{await page.close();}
});
