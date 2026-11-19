import test from 'node:test';
import assert from 'node:assert/strict';
import {findChrome, openPage} from '../tools/browser_harness.mjs';

async function typeField(page, selector, text) {
  await page.eval(s=>{const field=document.querySelector(s);field.focus();field.select();},selector);
  await page.send('Input.insertText',{text});
  assert.equal(await page.eval(s=>document.querySelector(s).value,selector),text);
}

test('Quick model commands belong to the opened document', {skip: !(await findChrome()) && 'Chrome unavailable'}, async () => {
  const page = await openPage({width:1360, height:900});
  try {
    await page.eval(async () => {
      const store = await import('/js/core/model_library_store.js');
      const def = {key:'cm_quick_block', name:'Quick block', parts:[{id:'block',kind:'box',x0:0,x1:2,y0:0,y1:2,z0:0,z1:2}]};
      await store.putModelLibraryRecord(def);
      for (const name of ['First assembly','Second assembly']) {
        await store.putAssemblyLibraryRecord({key:name.replace(' ', '_'), name, mates:[],
          components:[1,2].map(id=>({id,modelKey:def.key,def,grounded:true,transform:{x:id*3}})),
          explodedViews:[{id:'pull',name:'Pull',steps:[1,2,3].map(id=>({id,components:[2],direction:{x:id,y:0,z:0}}))}]});
      }
    });
    await page.goto('/');
    await page.eval(async () => {
      [...document.querySelectorAll('button')].find(b=>/Continue with/i.test(b.textContent))?.click();
      const {openModeler} = await import('/js/modeler.js');
      openModeler();
      document.querySelector('[data-welcome-start="continue"]')?.click();
    });
    const click = selector => page.eval(s=>document.querySelector(s).click(),selector);
    const card = name => page.eval(n=>[...document.querySelectorAll('#mdLib .md-card')].find(c=>c.querySelector('.nm').textContent===n).click(),name);
    const opened = name => page.waitUntil(`() => document.querySelector('#mdName').value === ${JSON.stringify(name)}`,{what:name});
    const panel = () => page.eval(()=>({hidden:document.querySelector('#mdQuickSettings').hidden,
      text:document.querySelector('#mdQuickSettings').textContent}));
    const assembly = '#mdDocModes [data-doc="assembly"]';
    await click(assembly);
    await card('First assembly');
    await opened('First assembly');
    const distance = '#mdQuickSettings input[data-parameter="distance"]';
    await page.eval(()=>window.__modelerRunCommand('explodestep'));
    const initialDistance=await page.eval(s=>document.querySelector(s).value,distance);
    await typeField(page,distance,'23');
    await typeField(page,distance,initialDistance);
    await click('#mdDocModes [data-doc="part"]');
    assert.deepEqual(await panel(),{hidden:true,text:''});
    await click(assembly);
    await page.eval(()=>window.__modelerRunCommand('explodestep'));
    await typeField(page,distance,'23');
    assert.equal(await page.eval(()=>!!document.querySelector('.md-st-dirty')),false);
    await click('#mdDocModes [data-doc="part"]');
    await click('#mdDecision [data-decision="cancel"]');
    assert.equal(await page.eval(s=>document.querySelector(s).value,distance),'23');
    await card('Second assembly');
    await click('#mdDecision [data-decision="cancel"]');
    await opened('First assembly');
    assert.equal(await page.eval(s=>document.querySelector(s).value,distance),'23');
    await card('Second assembly');
    await click('#mdDecision [data-decision="accept"]');
    await opened('Second assembly');
    assert.deepEqual(await panel(),{hidden:true,text:''});
    await card('First assembly');
    await opened('First assembly');
    await click('[data-command="explode"]');
    assert.match((await panel()).text,/Exploded animation/);
    await page.eval(()=>{
      const form=document.querySelector('#mdQuickSettings');
      const duration=form.querySelector('input[data-parameter=duration]');
      duration.value='17';
      duration.dispatchEvent(new Event('change'));
      const buttons=[...form.querySelectorAll('button')];
      buttons.find(b=>b.textContent==='Reset').click();
      // Retain the queued tick so we can deliver it after another instance opens.
      const schedule=window.requestAnimationFrame;
      window.requestAnimationFrame=callback=>{
        window.lateExplodeTick=callback;
        return schedule.call(window,callback);
      };
      try { buttons.find(b=>b.textContent==='Play').click(); }
      finally { window.requestAnimationFrame=schedule; }
      window.staleExplodeClose=buttons.find(b=>b.textContent==='Close');
    });
    await click('#mdDocModes [data-doc="part"]');
    assert.deepEqual(await panel(),{hidden:true,text:''});
    await card('Quick block');
    await page.eval(()=>document.querySelector('#mdDecision [data-decision="accept"]')?.click());
    await opened('Quick block');
    assert.deepEqual(await panel(),{hidden:true,text:''});
    await click(assembly);
    await click('[data-command="explode"]');
    assert.equal(await page.eval(()=>document.querySelector('#mdQuickSettings input[data-parameter=duration]').value),'17');
    const scheduled = await page.eval(()=>{
      const schedule=window.requestAnimationFrame;
      let frames=0;
      window.requestAnimationFrame=()=>++frames;
      try { window.lateExplodeTick(performance.now()); }
      finally { window.requestAnimationFrame=schedule; }
      return frames;
    });
    assert.equal(scheduled,0,'a late frame from the first form must not restart playback');
    await page.eval(()=>window.staleExplodeClose.click());
    assert.match((await panel()).text,/Exploded animation/);
    await page.eval(()=>window.__modelerRunCommand('explodestep'));
    await typeField(page,distance,'23');
    await click(assembly);
    await card('Second assembly');
    await page.waitUntil(()=>!!document.querySelector('#mdDecision [data-decision="accept"]'));
    await click('#mdDecision [data-decision="cancel"]');
    assert.equal(await page.eval(selector=>document.querySelector(selector).value,distance),'23');
    await card('Second assembly');
    await click('#mdDecision [data-decision="accept"]');
    await opened('Second assembly');
    assert.deepEqual(await panel(),{hidden:true,text:''});
  } finally { await page.close(); }
});

test('Helix creation and an existing feature edit follow their Part document', {skip: !(await findChrome()) && 'Chrome unavailable'}, async () => {
  const page=await openPage({width:1360,height:900});
  try {
    await page.eval(async()=>{
      const {createPartDocument,createFeatureDefinition}=await import('/js/core/parametric_document.js');
      const doc=createPartDocument({name:'Scoped features',metadata:{authoringSystem:'parametric-v1'}});
      createFeatureDefinition(doc,'box',{id:'stock',name:'Stock',params:{w:4,h:4,d:4}});
      doc.parts=[{id:'body',featureId:'stock',kind:'box',x0:0,x1:4,y0:0,y1:4,z0:0,z1:4}];
      const {openModeler}=await import('/js/modeler.js');
      openModeler(null,doc);
      document.querySelector('[data-welcome-start="continue"]')?.click();
    });
    const click=s=>page.eval(selector=>document.querySelector(selector).click(),s);
    const assembly='#mdDocModes [data-doc="assembly"]', part='#mdDocModes [data-doc="part"]';
    const helix='[data-command="helixfeature"]', pitch='#mdQuickSettings input[data-parameter="pitch"]';
    const keep='#mdDecision [data-decision="cancel"]', discard='#mdDecision [data-decision="accept"]';
    const hidden=()=>page.eval(()=>document.querySelector('#mdQuickSettings').hidden);
    await click(helix);
    await typeField(page,pitch,'11');
    await click(assembly);
    await click(keep);
    assert.equal(await page.eval(s=>document.querySelector(s).value,pitch),'11');
    await page.eval(()=>{window.oldFeatureApply=document.querySelector('#mdQuickSettings .md-quick-apply');});
    await click(assembly);
    await click(discard);
    assert.equal(await hidden(),true);
    await click(part);
    await click(helix);
    await page.eval(()=>window.oldFeatureApply.click());
    assert.equal(await hidden(),false);
    await click(assembly); // untouched replacement, no decision
    assert.equal(await hidden(),true);
    await click(part);

    const editStock=()=>page.eval(()=>document.querySelector('#mdParts .md-tree-feature[data-history-target="stock"]')
      .dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));
    const name='#mdQuickSettings input[data-parameter="$name"]';
    await editStock();
    const original=await page.eval(s=>document.querySelector(s).value,name);
    await typeField(page,name,'Temporary name');
    await click(assembly);
    await click(keep);
    assert.equal(await page.eval(s=>document.querySelector(s).value,name),'Temporary name');
    await page.eval(s=>{window.oldFeatureName=document.querySelector(s);},name);
    await click(assembly);
    await click(discard);
    assert.equal(await hidden(),true);
    await click(part);
    await editStock();
    assert.equal(await page.eval(s=>document.querySelector(s).value,name),original);
    await page.eval(()=>{window.oldFeatureName.value='Late input';window.oldFeatureName.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.ok((await page.eval(()=>document.querySelector('#mdParts [data-history-target="stock"]').textContent)).includes(original));
    await typeField(page,name,'Kept name');
    await click('#mdQuickSettings .md-quick-apply');
    await click(assembly);
    await click(part);
    await editStock();
    assert.equal(await page.eval(s=>document.querySelector(s).value,name),'Kept name');
  } finally { await page.close(); }
});
