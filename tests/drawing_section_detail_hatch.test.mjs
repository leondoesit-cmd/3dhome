import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeToMeshData,validateBrepForExport} from '../js/cad_kernel.js';
import {createProjector,buildSheetScene,sceneToSvg} from '../js/cad_sheet.js';

test('native five-bore bracket Section and linked Detail hatch closed material without filling bores',async()=>{
  // Minimal authoring records from the real mobile export, without cached mesh.
  const def=JSON.parse(fs.readFileSync(new URL('./fixtures/section-detail-tapered-bracket.json',import.meta.url)));
  const compiled=compileKernelFeatureTree(def);
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    const solid=run.results.get(def.features.at(-1).id);
    assert.equal((await validateBrepForExport(solid)).valid,true);
    const mesh=await shapeToMeshData(solid);
    for(const at of [-1.0431886133654373,-1]) {
      const doc=structuredClone(def.drawing),section=doc.views.find(v=>v.section),detail=doc.views.find(v=>v.detail);
      section.section.at=at;section.hatchPattern='steel';
      const projection=createProjector(doc,[mesh]),scene=buildSheetScene(doc,{projection});
      assert.deepEqual(scene.diagnostics,[]);
      assert.equal(projection(detail).sectionHatchPattern,'steel','child inherits parent material pattern');
      assert.ok(projection(detail).cropSourceCuts.length>projection(detail).cuts.length);
      for(const view of [section,detail]) {
        const placed=scene.views.find(v=>v.id===view.id),hatches=scene.items.filter(i=>i.viewId===view.id&&i.style==='hatch');
        assert.ok(hatches.length>10,view.label+' has actual material hatch');
        for(const stroke of hatches)for(let j=0;j<=20;j++) {
          const p=placed.toModel({x:stroke.x1+(stroke.x2-stroke.x1)*j/20,y:stroke.y1+(stroke.y2-stroke.y1)*j/20});
          assert.ok(Math.hypot(p.u,p.v-2.9)>=.498,'central bore stays empty');
          const dz=-at-1,mountHalf=Math.sqrt(.4**2-dz**2);
          for(const x of [-3,3])assert.ok(!(p.v>.001&&p.v<.999&&Math.abs(p.u-x)<mountHalf-.002),'mount bore stays empty');
          for(const v of [-.424,.954]) {
            const x=1.25-.33035042472810605*v,y=3+.9438583563660174*v;
            const along=(p.u-x)*.9438583563660174+(p.v-y)*.33035042472810605;
            const side=-(p.u-x)*.33035042472810605+(p.v-y)*.9438583563660174;
            assert.ok(!(along<-.002&&along>-.998&&Math.abs(side)<Math.sqrt(.175**2-dz**2)-.003),'inclined blind bore stays empty');
          }
          if(view.detail)assert.ok(Math.hypot(p.u-view.detail.u,p.v-view.detail.v)<=view.detail.radius+1e-7,'Detail hatching stays inside bubble');
        }
      }
      assert.ok(!sceneToSvg(scene).includes('hatching omitted'));
      const cold=JSON.parse(JSON.stringify(doc));
      assert.equal(sceneToSvg(buildSheetScene(cold,{projection:createProjector(cold,[mesh])})),sceneToSvg(scene));
    }
  } finally {releaseRegeneration(run);}
});
