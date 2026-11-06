import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {runInNewContext} from 'node:vm';

const modeler = modelerSource();
const interaction = await readFile(new URL("../js/interaction.js", import.meta.url), "utf8");
const commands = await readFile(new URL("../js/modeler_commands.js", import.meta.url), "utf8");

test("planner shortcuts do not mutate the plan behind the modeler", () => {
  assert.match(interaction, /function modelerKeyboardOwnsInput\(\) \{[\s\S]{0,160}?getElementById\("modeler"\)[\s\S]{0,160}?style\.display !== "none"/);
  const guarded = interaction.match(/if \(modelerKeyboardOwnsInput\(\)\) return;/g) || [];
  assert.equal(guarded.length, 2, "both planner keyboard handlers defer to the modal modeler");
});

test("undo recomputes sketch solver state before repainting DOF", () => {
  const history = modeler.slice(modeler.indexOf("const H = createHistory"), modeler.indexOf("function scanDoc"));
  assert.match(history, /if \(E\.docType === "part" && E\.def\) resolveSketch\(false\);\s*refreshAll\(\)/);
});

test("intersection points have a larger pick band than sketch curves", () => {
  const hit = modeler.slice(modeler.indexOf("function hitSketch("), modeler.indexOf("function angleInArc", modeler.indexOf("function hitSketch(")));
  assert.match(hit, /pointTol = \(pointerType === "touch" \? 18 : 10\) \/ E\.scl/);
  assert.match(hit, /var best = null, bd = pointTol/);
  assert.match(hit, /bd = tol/);
});

test("geometry-list selection is addressable and keeps the inspector stable", () => {
  const list = modeler.slice(modeler.indexOf("function appendSketchGeometryList"), modeler.indexOf("function fillSketchPane"));
  assert.match(list, /dataset\.sketchObjectId/);
  assert.match(list, /dataset\.sketchObjectKind/);
  assert.match(list, /event\.shiftKey\|\|E\.mobileAddSelection/);
  assert.match(list, /refreshSelection\(\)/);
  assert.match(list, /nextPane\.scrollTop=scrollTop/);
});

test("Force Rebuild invalidates derived bodies and re-resolves sketch dependencies", () => {
  const rebuild = modeler.slice(modeler.indexOf("async function forceRebuildDocument"), modeler.indexOf("async function regenerateExactModelNow"));
  assert.match(rebuild, /syncSketchDrivenParts\(\)/);
  assert.match(rebuild, /exactBuildToken=\(part\.exactBuildToken \|\| 0\)\+1/);
  assert.match(rebuild, /delete part\.meshData/);
  assert.match(rebuild, /releaseExactRun\(\)/);
  assert.match(rebuild, /regenerateExactModel\(true,\{restoreMode:'mesh'\}\)/);
  assert.match(modeler, /id === "regen"\) regenerateExactModel\("force"\)/);
  assert.match(modeler, /chord === "b"\)[^\n]+regenerateExactModel\("force"\)/);
  assert.match(commands, /id:"regen"[\s\S]{0,320}?available:function\(\)\{ return partDoc\(\) && !E\.kernelBusy; \}/);
});

test('Force Rebuild clears stale derived output before requesting current exact display',async()=>{
  const body=modeler.slice(modeler.indexOf('async function forceRebuildDocument'),modeler.indexOf('async function regenerateExactModelNow'));
  for(const canonical of [true,false]){
    const parts=[{id:'linked',sketchDriven:true,meshData:{stale:true},exactBuildToken:2},
      {id:'native',kernel:true,meshData:{stale:true},bounds:{stale:true}},
      {id:'frozen',meshData:{source:true}}];
    const E={docType:'part',def:{parts},coreRun:{stale:true}},timer={},timers=new Map([[parts[1],timer]]),events=[];
    const exact={ok:true},context={E,coreRunFresh:true,cancelledExactPreview:{stale:true},exactBuildTimers:timers,
      activeParts:doc=>doc.parts,isCanonicalAuthoring:()=>canonical,isKernelBody:part=>!!part.kernel,
      t:key=>key,flash:message=>events.push(['flash',message]),clearTimeout:value=>events.push(['clearTimer',value]),
      syncSketchDrivenParts:()=>events.push(['resolveSources']),clearTopologyCache:part=>events.push(['clearTopology',part.id]),
      refreshChangedParts:parts=>events.push(['refreshParts',parts.map(part=>part.id)]),releaseExactRun:()=>events.push(['release']),refreshAll:()=>events.push(['refresh']),
      regenerateExactModel:async(rebuild,options)=>{
        assert.equal(E.coreRun,null);assert.equal(context.coreRunFresh,false);
        assert.equal(parts[0].meshData,undefined);assert.equal(parts[1].meshData,undefined);assert.equal(parts[1].bounds,undefined);
        assert.equal(timers.size,0);assert.equal(context.cancelledExactPreview,null);
        events.push(['regenerate',rebuild,options.restoreMode]);return exact;
      }};
    runInNewContext(body+'\nthis.force=forceRebuildDocument;',context);
    assert.equal(await context.force(),exact);
    assert.equal(parts[0].exactBuildToken,3);
    assert.deepEqual(events.filter(event=>event[0]==='regenerate'),[['regenerate',true,'mesh']]);
    assert.equal(events[0][0],'resolveSources');
    assert.ok(events.findIndex(event=>event[0]==='release')<events.findIndex(event=>event[0]==='regenerate'));
    if(canonical)assert.equal(parts[2].meshData,undefined);
    else assert.deepEqual(parts[2].meshData,{source:true},'a frozen imported mesh is authoring source, not a derived cache');
  }
});

test("a driving circle dimension severs its converted-edge snapshot before rebuild", () => {
  const pane = modeler.slice(modeler.indexOf("function fillSketchPane"), modeler.indexOf("function buildEquationList"));
  assert.match(pane, /else detachDrivenSketchDimension\(sketch,con\)/, "the constraint-list value editor commits the policy");
  assert.match(pane, /else detachDrivenSketchDimension\(sketch,con\);\s*refreshAll/, "changing reference to driving commits the policy");
  assert.match(pane, /if\(!con\.suppressed\)detachDrivenSketchDimension\(sketch,con\)/, "unsuppressing a driving dimension commits the policy");
  const editor = modeler.slice(modeler.indexOf("function applyDimensionEditor"), modeler.indexOf("function deleteDimensionEditor"));
  assert.match(editor, /detachDrivenSketchDimension\(state\.sketch,constraint\)/, "the floating dimension editor commits the policy");
  const setter = modeler.slice(modeler.indexOf("function setEntityDimension"), modeler.indexOf("function makeWallSegment"));
  assert.match(setter, /detachDrivenSketchDimension\(sketch,c\)/, "the property inspector commits the policy");
});

test("Smart Dimension consumes an exact geometry-list selection without a canvas re-pick", () => {
  const setTool = modeler.slice(modeler.indexOf("function setTool("), modeler.indexOf("function setView("));
  assert.match(setTool, /id === "dim" && openSelectedSmartDimension\(\)/);
  const selected = modeler.slice(modeler.indexOf("function openSelectedSmartDimension"), modeler.indexOf("// What the smart-dimension tool measures"));
  assert.match(selected, /dimensionTargetFromSelection\(sketch,E\.ssel\)/);
  assert.match(selected, /if\(started\)finishDimensionDrag\(\)/, "the regular dimension editor opens immediately");
});
