import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();

/* Opens the designer on a cabinet that is SELECTED in the plan, which is how
   it is opened for real — and what made the planner's own keys dangerous. */
async function openDesigner(page){
 return page.eval(async()=>{
  const {S}=await import('/js/state.js'),cab=await import('/js/cabinet.js'),ui=await import('/js/ui_cabinet.js'),{E}=await import('/js/ui_cabinet_ctx.js'),{select}=await import('/js/ui_props.js');
  const item={id:'keys',type:'cabsys',x:300,y:300,w:200,h:240,d:60,rot:0,cab:cab.makeSpec('w_classic',200,240,60)};
  S.items=[item];select({kind:'item',ref:item});ui.openCabinet(item);
  if(document.activeElement&&document.activeElement.blur) document.activeElement.blur();
  window.__t={S,E,item,ui,cab};
  return !!E.open;
 });
}

test('planner shortcuts do not act on the plan behind the cabinet designer',{skip:!chrome},async()=>{
 const page=await openPage({width:1440,height:900,lang:'en'});
 try{
  assert.equal(await openDesigner(page),true);
  const r=await page.eval(async()=>{
   const {S,E,item}=window.__t,key=(k,o={})=>document.body.dispatchEvent(new KeyboardEvent('keydown',Object.assign({key:k,bubbles:true},o)));
   const secs=()=>item.cab.cols[0].secs.length,start=secs();
   E.sel={col:0,sec:0};key('Delete');
   const afterDelete={items:S.items.length,secs:secs()};
   key('z',{ctrlKey:true});
   const afterUndo={items:S.items.length,secs:secs()};
   key('d',{ctrlKey:true});key('r');
   key('?');
   const sheets=[...document.querySelectorAll('body > *')].filter(e=>e.id!=='cabdes'&&/shortcut/i.test(String(e.className))&&getComputedStyle(e).display!=='none').length;
   const mine=!document.querySelector('#cbKeysDlg').hidden;
   key('Escape');
   return {start,afterDelete,afterUndo,items:S.items.length,rot:item.rot,sheets,mine,closed:document.querySelector('#cbKeysDlg').hidden,open:E.open};
  });
  assert.deepEqual(r.afterDelete,{items:1,secs:r.start-1},'Delete removes the compartment, not the cabinet');
  assert.deepEqual(r.afterUndo,{items:1,secs:r.start},'Ctrl+Z undoes the designer step only');
  assert.equal(r.items,1,'Ctrl+D duplicates nothing in the plan');
  assert.equal(r.rot,0,'R does not rotate the cabinet behind');
  assert.equal(r.sheets,0,"the planner's shortcut sheet stays shut");
  assert.equal(r.mine,true,"the designer's own sheet opens on ?");
  assert.equal(r.closed,true,'Escape closes the sheet');
  assert.equal(r.open,true,'…and only the sheet');
 }finally{await page.close();}
});

test('double-click opens an in-place size field that takes units and sticks',{skip:!chrome},async()=>{
 const page=await openPage({width:1440,height:900,lang:'en'});
 try{
  await openDesigner(page);
  const r=await page.eval(async()=>{
   const {E,item,cab}=window.__t,cv=document.querySelector('#cbCanvas'),rect=cv.getBoundingClientRect();
   const ci=1,L=E.view.L,si=item.cab.cols[ci].secs.findIndex(s=>s.t==='shelves'),cell=L.cols[ci].secs[si];
   const at={clientX:rect.left+E.view.ox+((L.cols[ci].x0+L.cols[ci].x1)/2)*E.view.k,clientY:rect.top+E.view.oy-((cell.y0+cell.y1)/2)*E.view.k};
   cv.dispatchEvent(new MouseEvent('dblclick',Object.assign({bubbles:true},at)));
   const input=document.querySelector('.cb-size-edit input'),shown=input.value;
   const enter=k=>input.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}));
   input.value='nonsense';enter('Enter');
   const keptOpen=!!document.querySelector('.cb-size-edit')&&input.classList.contains('cb-bad');
   input.value='50cm';enter('Enter');
   const h=cab.layoutCab(item).cols[ci].secs[si];
   cv.dispatchEvent(new MouseEvent('dblclick',Object.assign({bubbles:true},at)));
   document.querySelector('.cb-size-edit input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   return {shown,keptOpen,built:h.y1-h.y0,closed:!document.querySelector('.cb-size-edit'),open:E.open};
  });
  assert.match(r.shown,/^\d+$/,'the field shows the size in the project unit (mm)');
  assert.equal(r.keptOpen,true,'a figure that is not a size keeps the field open and marked');
  assert.ok(Math.abs(r.built-50)<0.2,'50cm is built as 50 cm: '+r.built);
  assert.equal(r.closed,true,'Escape puts the field away');
  assert.equal(r.open,true,'…without closing the designer');
 }finally{await page.close();}
});

test('the elevation is dimensioned in the furniture unit, like the size fields',{skip:!chrome},async()=>{
 const page=await openPage({width:1440,height:900,lang:'en'});
 try{
  await openDesigner(page);
  const texts=await page.eval(async()=>{
   const view=await import('/js/ui_cabinet_view.js'),out=[],orig=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(t,...rest){out.push(String(t));return orig.call(this,t,...rest);};
   try{view.draw();}finally{CanvasRenderingContext2D.prototype.fillText=orig;}
   return out;
  });
  assert.ok(texts.includes('2000 mm'),'overall width: '+texts.join(' | '));
  assert.ok(texts.includes('2400 mm'),'overall height');
  assert.ok(!texts.includes('200')&&!texts.includes('240'),'no bare centimetre figures left');
 }finally{await page.close();}
});
