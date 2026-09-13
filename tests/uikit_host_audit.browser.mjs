import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, findChrome } from '../tools/browser_harness.mjs';
const opts = await findChrome() ? {} : {skip:'Chrome unavailable'};
let page;
test.after(async()=>{if(page)await page.close();});
async function setup(){
  page ||= await openPage({width:1440,height:1000});await page.goto('/');
  await page.eval(async()=>{
    const {setLang}=await import('/js/i18n.js');await setLang('en');
    const host=await import('/js/uikit_host/index.js');host.teardownUIKit();
    const start=document.getElementById('start-screen');if(start)start.hidden=true;
    window.ui=host.initUIKit({force:true});await ui.edit(true);ui.refreshNow();
  });return page;
}

test('language switching keeps the active selection and translates inspector controls',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(async()=>{
    ui.editor.command('select',{id:'panel:tree'});const before=ui.editor.focus();
    const {setLang}=await import('/js/i18n.js');await setLang('he');
    return {selection:ui.editor.selection(),focus:ui.editor.focus()===before,editing:ui.editing,title:document.querySelector('.uikit-ins-title').textContent};
  }),{selection:['panel:tree'],focus:true,editing:true,title:'התאמת ממשק'});
});

test('user-created menus have catalog menu kind and title and permit nested additions',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    ui.editor.command('insertMenu',{parent:'panel:tb-end'});const id=ui.editor.selection()[0];
    const entry=ui.registry.get(id);ui.editor.command('insertSeparator');
    const divider=ui.doc.nodes[id]?.children.some(child=>ui.doc.nodes[child].type==='separator');
    return {kind:entry?.kind,title:entry?.title,divider,checked:document.querySelector('[data-act=uikitCustomize]').getAttribute('aria-checked')};
  }),{kind:'menu',title:'Menu',divider:true,checked:'true'});
});
