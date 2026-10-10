import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetDoc,ensureSheetDoc,buildSheetScene,sceneToSvg} from '../js/cad_sheet.js';
import {captureDrawingPreset,drawingFromTemplate,applyDrawingFormat} from '../js/core/drawing_presets.js';
import {hasSaveableModelContent,drawingOnlyContentSummary} from '../js/core/model_save_policy.js';
import {createPartDocument,ensureParametricDocument} from '../js/core/parametric_document.js';
import {rebuildParametricDocument} from '../js/core/parametric_rebuild.js';
import {clearMemoryModelLibrary,putModelLibraryRecord,loadModelLibrary,libraryBundle,parseLibraryBundle} from '../js/core/model_library_store.js';

function preset(kind='drawing-template') {
  return captureDrawingPreset(createSheetDoc({size:'Letter',orientation:'landscape',units:'in',
    draftingStandard:'ANSI',scale:[1,2],precision:2,secondaryUnits:'mm',title:{company:'D&M ENGINEERING',tolerance:'±.005 in'}}),
    {id:'native-preset',name:kind==='drawing-template'?'A-IN-ANSI':'MY-A-FORMAT',kind});
}
function blank(){return createPartDocument({id:'blank-preset',key:'cm_blank_preset',name:'Blank native template',parts:[],metadata:{authoringSystem:'parametric-v1'}});}

test('valid blank native template and applied format are saveable without inventing CAD or notes',()=>{
  const d=blank();assert.equal(hasSaveableModelContent(d),false);
  d.drawing=createSheetDoc({views:[]});assert.equal(hasSaveableModelContent(d),false,'ordinary blank sheet is still empty');
  d.drawing=drawingFromTemplate(preset());const before=JSON.stringify(d);
  assert.equal(hasSaveableModelContent(d),true);assert.deepEqual(drawingOnlyContentSummary(d),{annotations:0,notes:0});
  assert.equal(JSON.stringify(d),before,'guard does not mutate authoring');
  assert.equal(rebuildParametricDocument(d).ok,true);
  for(const k of ['parts','features','sketches'])assert.equal(d[k].length,0);
  for(const k of ['views','dims','notes','primitives','images'])assert.equal(d.drawing[k].length,0);
  const standalone=blank();standalone.drawing=applyDrawingFormat(createSheetDoc({size:'Letter',units:'in',draftingStandard:'ANSI',views:[]}),preset('sheet-format'));
  assert.equal(hasSaveableModelContent(standalone),true,'explicit applied native format also authors a blank sheet');
});

test('missing or malformed provenance/paper/defaults do not make an empty model saveable',()=>{
  const valid=blank();valid.drawing=drawingFromTemplate(preset());
  const mutations=[d=>delete d.drawing.sheetFormat,d=>{d.drawing.sheetFormat={};},d=>{d.drawing.sheetFormat.version=2;},
    d=>{d.drawing.sheetFormat.id=' ';},d=>{d.drawing.sheetFormat.name='';},d=>{d.drawing.templateSource={id:'forged'};},
    d=>{d.drawing.version=0;},d=>{d.drawing.size='toString';},d=>{d.drawing.units='constructor';},
    d=>{d.drawing.orientation='square';},d=>{d.drawing.projection='invented';},d=>{d.drawing.draftingStandard='invented';},
    d=>{d.drawing.title=null;},d=>{d.drawing.views=null;},d=>{d.drawing.scale=[1,0];},d=>{d.drawing.scale='banana';},
    d=>{d.drawing.precision=2.5;},d=>{d.drawing.secondaryPrecision=-1;},d=>{d.drawing.secondaryUnits='invented';}];
  for(const mutate of mutations){const d=structuredClone(valid);mutate(d);assert.equal(hasSaveableModelContent(d),false,String(mutate));assert.equal(drawingOnlyContentSummary(d),null);}
});

test('blank preset sheet persists through native normalization, library export/reopen and cold SVG',async()=>{
  clearMemoryModelLibrary();try{
    const d=blank();d.drawing=drawingFromTemplate(preset());ensureSheetDoc(d);const drawing=structuredClone(d.drawing);
    const svg=sceneToSvg(buildSheetScene(d.drawing));
    const saved=await putModelLibraryRecord(d,{expected:null});assert.equal(saved.ok,true);
    const [raw]=parseLibraryBundle(JSON.stringify(libraryBundle(await loadModelLibrary(),[]))).models;
    const cold=ensureParametricDocument(raw);ensureSheetDoc(cold);
    assert.deepEqual(cold.drawing,d.drawing);assert.equal(hasSaveableModelContent(cold),true);
    assert.equal(sceneToSvg(buildSheetScene(cold.drawing)),svg);
    assert.deepEqual(cold.drawing.templateSource,drawing.templateSource);assert.deepEqual(cold.drawing.sheetFormat,drawing.sheetFormat);
    assert.equal(cold.parts.length,0);assert.equal(cold.features.length,0);assert.equal(cold.drawing.views.length,0);assert.equal(cold.drawing.notes.length,0);
    assert.equal(rebuildParametricDocument(cold).ok,true);
  }finally{clearMemoryModelLibrary();}
});
