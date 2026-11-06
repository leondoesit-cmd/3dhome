import test from 'node:test';
import assert from 'node:assert/strict';
import {findChrome, openPage} from '../tools/browser_harness.mjs';

const key = 'asm_drawing_poses';
async function openDrawing(page) {
  await page.goto('/');
  await page.eval(async () => {
    [...document.querySelectorAll('button')].find(b => /Continue with/i.test(b.textContent))?.click();
    const {openModeler} = await import('/js/modeler.js');
    openModeler('cm_pose_block');
    document.querySelector('[data-welcome-start="continue"]')?.click();
  });
  await page.eval(() => {
    document.querySelector('#mdDocModes [data-doc="assembly"]').click();
    [...document.querySelectorAll('#mdLib .md-card')].find(card => card.querySelector('.nm')?.textContent === 'Drawing poses').click();
  });
  await page.waitUntil(() => document.querySelector('#mdName').value === 'Drawing poses', {what:'assembly open'});
  await page.eval(() => document.querySelector('#mdModes [data-mode="drawing"]').click());
  await page.waitUntil(() => window.cadDrawingSheet?.scene().views.length === 4, {what:'drawing views'});
}

function selectState(page, index, state) {
  return page.eval((index, state) => {
    document.querySelectorAll('#mdSheetPanel .md-sheet-view-name')[index].click();
    const input = document.querySelector('#mdSheetAssemblyState');
    if (![...input.options].some(option => option.value === state)) throw new Error('Missing choice ' + state);
    input.value = state;
    input.dispatchEvent(new Event('change', {bubbles:true}));
  }, index, state);
}

function inspect(page) {
  return page.eval(() => {
    const scene = window.cadDrawingSheet.scene();
    return scene.views.map(({id, view, projection}) => ({
      dir:view.dir, state:view.assemblyState, bounds:projection.bounds,
      paths:scene.items.filter(item => item.viewId === id && item.explodeLeader).map(item => item.componentId),
    }));
  });
}

test('a collapsed two-component assembly saves three assembled views and a separately exploded iso', {
  skip: !(await findChrome()) && 'Chrome unavailable',
}, async () => {
  const page = await openPage({width:1360,height:900});
  try {
    await page.eval(async key => {
      const store = await import('/js/core/model_library_store.js');
      const def = {key:'cm_pose_block',name:'Block',parts:[{id:'block',kind:'box',x0:0,x1:3,y0:0,y1:2,z0:0,z1:2}]};
      const {tessellatePart} = await import('/js/core/part_tessellate.js');
      def.parts[0].meshData = {positions:tessellatePart(def.parts[0]).positions};
      await store.putModelLibraryRecord(def);
      await store.putAssemblyLibraryRecord({key,name:'Drawing poses',mates:[],
        components:[1,2].map(id => ({id,modelKey:def.key,def,grounded:true,visible:true,transform:{x:id===2 ? 8.43 : 3}})),
        explodedViews:[{id:'pull',name:'Pull apart',steps:[{id:'move',components:[2],direction:{x:12,y:4,z:0}}]}]});
    }, key);
    await openDrawing(page);
    const before = await inspect(page);
    assert.ok(Math.abs(before[0].bounds.u1-11.43)<1e-5);
    for (let i = 0; i < 3; i++) await selectState(page,i,'assembled');
    await selectState(page,0,'pull');
    const manualId = await page.eval(() => {
      const sheet=window.cadDrawingSheet, front=sheet.scene().views[0];
      const edge=front.projection.visible.find(s=>s.a.u===front.projection.bounds.u1 && s.b.u===s.a.u && s.a.v!==s.b.v);
      if (!edge) throw new Error('Missing outside edge of the moved block');
      const pick = mm => {
        const x=sheet.state.ox+mm.x*sheet.state.zoom, y=sheet.state.oy+mm.y*sheet.state.zoom;
        sheet.pointerMove({},x,y);sheet.pointerDown({button:0},x,y);sheet.pointerUp({button:0},x,y);
      };
      sheet.setTool('dim');
      pick(front.toSheet(edge.a));pick(front.toSheet(edge.b));pick({x:front.box.x+front.box.w+8,y:front.y});
      const id=sheet.selection()?.id, dimension=sheet.scene().dims.get(id);
      if (!dimension?.dim.sourceBinding || dimension.dangling) throw new Error('Manual assembly dimension did not bind');
      return id;
    });
    await selectState(page,0,'assembled');
    assert.equal(await page.eval(id=>window.cadDrawingSheet.scene().dims.get(id).dangling,manualId),true);
    await selectState(page,3,'pull');
    const mixed = await inspect(page);
    const annotations = await page.eval(() => {
      const sheet = window.cadDrawingSheet, iso = sheet.scene().views[3];
      sheet.select({kind:'view',id:iso.id});
      sheet.autoDimension();
      if (sheet.autoComponentBalloons() !== 2) throw new Error('Expected one balloon for each occurrence');
      const scene = sheet.scene();
      return {
        width:[...scene.dims.values()].find(d=>d.dim.viewId===iso.id && d.dim.type==='horizontal').dim,
        lid:[...scene.notes.values()].find(n=>n.note.componentBalloon?.path[0]==='2').note,
      };
    });
    assert.ok(Math.abs(annotations.width.refs[1].u-annotations.width.refs[0].u -
      (mixed[3].bounds.u1-mixed[3].bounds.u0)) < 1e-7);
    assert.deepEqual(mixed.map(v=>v.dir), ['front','top','right','iso']);
    assert.deepEqual(mixed.slice(0,3).map(v=>v.bounds), before.slice(0,3).map(v=>v.bounds));
    assert.deepEqual(mixed.map(v=>v.paths), [[],[],[],[2]]);
    assert.ok(mixed[3].bounds.u1-mixed[3].bounds.u0 > before[3].bounds.u1-before[3].bounds.u0);
    await selectState(page,3,'');
    assert.deepEqual((await inspect(page))[3],before[3]);
    const collapsed = await page.eval(ids => {
      const scene=window.cadDrawingSheet.scene();
      return {width:scene.dims.get(ids[0]).dim.refs, lid:scene.notes.get(ids[1]).note.leader};
    }, [annotations.width.id,annotations.lid.id]);
    assert.ok(Math.abs(collapsed.width[1].u-collapsed.width[0].u -
      (before[3].bounds.u1-before[3].bounds.u0)) < 1e-7);
    assert.notEqual(collapsed.lid.u,annotations.lid.leader.u);
    await selectState(page,3,'pull');
    await page.eval(() => document.querySelector('#mdSave').click());
    await page.waitUntil(async () => {
      const {loadAssemblyLibrary} = await import('/js/core/model_library_store.js');
      const assembly = (await loadAssemblyLibrary()).find(a => a.key === "asm_drawing_poses");
      return assembly?.drawing?.views[3].assemblyState === 'pull' && assembly.components.every(c=>!c.explodedOffset);
    }, {what:'saved drawing and collapsed source'});
    await openDrawing(page);
    assert.deepEqual(await inspect(page),mixed);
    const cold = await page.eval(async (key,manualId,balloonId) => {
      const {buildDrawingScene} = await import('/js/cad_drawings.js');
      const {loadAssemblyLibrary} = await import('/js/core/model_library_store.js');
      const assembly=(await loadAssemblyLibrary()).find(a=>a.key===key);
      const exported=buildDrawingScene(assembly,{overallDimensions:false,holeCallouts:false});
      const live=window.cadDrawingSheet.scene();
      return {
        dangling:[live,exported].map(scene=>scene.dims.get(manualId).dangling),
        anchors:[live,exported].map(scene=>scene.notes.get(balloonId).note.leader),
        missing:exported.diagnostics.filter(d=>d.code==='missing-component-balloon'),
      };
    },key,manualId,annotations.lid.id);
    assert.deepEqual(cold.dangling,[true,true]);
    assert.deepEqual(cold.anchors[1],cold.anchors[0]);
    assert.deepEqual(cold.missing,[]);
    await selectState(page,0,'pull');
    const restored = await page.eval(async (key,id) => {
      const {buildDrawingScene}=await import('/js/cad_drawings.js');
      const {loadAssemblyLibrary}=await import('/js/core/model_library_store.js');
      const saved=structuredClone((await loadAssemblyLibrary()).find(a=>a.key===key));
      saved.drawing.views[0].assemblyState='pull';
      const exported=buildDrawingScene(saved,{overallDimensions:false,holeCallouts:false});
      return [window.cadDrawingSheet.scene(),exported].map(scene=>scene.dims.get(id).dangling);
    },key,manualId);
    assert.deepEqual(restored,[false,false],'Float32 live picks survive standalone reprojection at decimal coordinates');
    await selectState(page,0,'assembled');
    await page.eval(() => {
      document.querySelector('#mdModes [data-mode="3d"]').click();
      document.querySelector('[data-command="explode"]').click();
      document.querySelector('#mdModes [data-mode="drawing"]').click();
    });
    assert.deepEqual(await inspect(page),mixed,'explicit views ignore the live assembly toggle');
    await selectState(page,0,'');
    const live = (await inspect(page))[0];
    assert.ok(live.bounds.u1-live.bounds.u0 > before[0].bounds.u1-before[0].bounds.u0,
      'Follow assembly uses the exploded viewport pose');
  } finally { await page.close(); }
});
