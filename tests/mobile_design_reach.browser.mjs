import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage, findChrome} from '../tools/browser_harness.mjs';
const chrome = await findChrome();
for (const [width,height,lang] of [[390,844,'en'],[390,844,'he'],[673,841,'en']]) {
  test(`design menus remain reachable at ${width}px ${lang}`, {skip:!chrome}, async () => {
    const page = await openPage({width,height,lang,mobile:true,touch:true});
    try {
      await page.waitForBoot();
      await page.eval(async () => {
        const {openCabinet} = await import('/js/ui_cabinet.js');
        const {S} = await import('/js/state.js');
        const item = {id:'reach-test',type:'cabsys',x:0,y:0,z:0,w:120,h:200,d:60,rot:0};
        S.items.push(item); openCabinet(item);
        document.querySelector('[data-cbnav="more"]').click();
        document.querySelector('[data-level="technical"]').click();
      });
      await page.waitUntil(()=>document.querySelector('#cabdes').classList.contains('cb-show-right'));
      const technical = await page.eval(()=>{
        const pane=document.querySelector('#cbTechnical');
        const r=pane.getBoundingClientRect();
        const nav=document.querySelector('.cb-m-nav').getBoundingClientRect();
        return {visible:r.height>0&&r.top<nav.top,moreOpen:document.querySelector('.cb-m-sheet').classList.contains('on'),
          previewVisible:!!document.querySelector('.cb-prev-wrap')?.getBoundingClientRect().height};
      });
      assert.equal(technical.visible,true);
      assert.equal(technical.moreOpen,false,'technical fields must replace the More sheet');
      assert.equal(technical.previewVisible,false,'compact inspector should not reserve an empty preview');
      await page.eval(()=>document.querySelector('#cabdes [data-act="nest"]').click());
      await page.waitUntil(()=>!!document.querySelector('#nestplan')?.getBoundingClientRect().height);
      const close = await page.eval(()=>{
        const el=document.querySelector('#nzClose'),r=el.getBoundingClientRect();
        return {inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
          reachable:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),height:r.height};
      });
      assert.equal(close.inside,true); assert.equal(close.reachable,true); assert.ok(close.height>=44);
      await page.eval(() => {
        document.querySelector('#nzClose').click();
        document.querySelector('#cbClose').click();
        document.querySelector('#openModelerTop').click();
      });
      await page.waitUntil(()=>!!document.querySelector('#mdWelcomeClose'));
      await page.eval(()=>{
        document.querySelector('#mdWelcomeClose').click();
        const treeButton = document.querySelector('#md-nav [data-mdnav="tree"]');
        if (treeButton.getAttribute("aria-expanded") !== "true") treeButton.click();
      });
      const tree = await page.eval(()=>{
        const panel=document.querySelector('#mdLeftPanel');
        const r=panel.getBoundingClientRect();
        return {visible:r.height>0,emptyPager:!!panel.querySelector('.mobile-page-deck')};
      });
      assert.equal(tree.visible,true); assert.equal(tree.emptyPager,false);
      await page.eval(()=>document.querySelector('#mdCommandSearchBtn').click());
      const search = await page.eval(()=>{
        const el=document.querySelector('#mdCommandSearchClose'),r=el.getBoundingClientRect();
        return {inside:r.left>=0&&r.right<=innerWidth,hit:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};
      });
      assert.equal(search.inside,true); assert.equal(search.hit,true);
      await page.eval(()=>document.querySelector('#mdCommandSearchClose').click());
      assert.equal(await page.eval(()=>document.querySelector('#mdCommandSearch').hidden),true);
    } finally { await page.close(); }
  });
}
