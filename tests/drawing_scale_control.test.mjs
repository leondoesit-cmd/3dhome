import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {drawingViewScaleControl} from '../js/core/drawing_scale_control.js';
import {createSheetDoc,createView,ensureSheetDoc,scaleValue,scaleLabel} from '../js/cad_sheet.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');

test('numeric placement scales, ratio arrays/objects and inherited scales stay represented without mutation',()=>{
  for(const scale of [2,.5,.73,[2,1],{n:3,d:2},null]) {
    const before=JSON.stringify(scale),control=drawingViewScaleControl(scale,'Inherited');
    assert.equal(control.options.filter(o=>o.value===control.value).length,1);
    assert.equal(JSON.stringify(scale),before);
    if(scale)assert.ok(Math.abs(scaleValue(control.value.split(':').map(Number))-scaleValue(scale))<1e-6);
    else assert.equal(control.value,'sheet');
  }
  const def={drawing:createSheetDoc({views:[]})};
  def.drawing.views.push(createView('auxiliary',{id:'a',scale:.73}));
  const cold=JSON.parse(JSON.stringify(def));ensureSheetDoc(cold);
  assert.equal(cold.drawing.views[0].scale,.73,'valid scalar is preserved in canonical storage');
});

test('actual syncSheetPanel handles numeric Auxiliary scale when dimension tool refreshes selection',()=>{
  const start=source.indexOf('function syncSheetPanel() {'),end=source.indexOf('/* What the hint bar says',start);
  assert.ok(start>=0&&end>start);
  const doc=createSheetDoc({views:[]});doc.views=[createView('front',{id:'p',primary:true}),createView('auxiliary',{id:'a',scale:2})];
  const before=JSON.stringify(doc),attrs=new Map();let builds=0,selection={kind:'view',id:'a'};
  const host={getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>attrs.set(k,v),querySelector:()=>null,querySelectorAll:()=>[]};
  const context={root:{querySelector:id=>id==='#mdSheetPanel'?host:null},E:{mode:'drawing'},drawingDocument:()=>doc,
    drawingSheet:()=>({selection:()=>selection}),scaleLabel,drawingViewScaleControl,buildSheetPanel:()=>builds++,document:{activeElement:null},syncDanglingDims:()=>{}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  assert.doesNotThrow(()=>context.syncSheetPanel());assert.equal(builds,1);
  assert.doesNotThrow(()=>context.syncSheetPanel());assert.equal(builds,1,'unchanged panel reuses signature');
  selection=null;assert.doesNotThrow(()=>context.syncSheetPanel());assert.equal(builds,2);
  doc.views[1].scale=.73;assert.doesNotThrow(()=>context.syncSheetPanel());assert.equal(builds,3);
  doc.views[1].scale=2;assert.equal(JSON.stringify(doc),before,'refresh never rewrites authored scale');
});

test('actual selected-view dropdown retains nonstandard numeric Auxiliary scale and accepts explicit user ratio',()=>{
  const start=source.indexOf('var scaleControl=drawingViewScaleControl'),end=source.indexOf('sheetRow(views, t("drawHiddenLines")',start);
  assert.ok(start>=0&&end>start);
  const selectedView=createView('auxiliary',{scale:.73}),calls=[];let dropdown,draws=0;
  const context={selectedView,views:{},drawingViewScaleControl,t:k=>k,
    sheetRow(){},sheetSelect:(options,value,change)=>{dropdown={options,value,change};return {};},
    sheet:{setSheetOption:(key,value)=>calls.push([key,value])},drawSketch:()=>draws++};
  vm.createContext(context);assert.doesNotThrow(()=>vm.runInContext(source.slice(start,end),context));
  assert.equal(dropdown.value,'0.73:1');
  assert.ok(dropdown.options.some(o=>o.value===dropdown.value));assert.equal(selectedView.scale,.73);
  dropdown.change('2:1');assert.equal(calls[0][0],'viewScale');assert.deepEqual(Array.from(calls[0][1]),[2,1]);
  dropdown.change('sheet');assert.deepEqual(calls[1],['viewScale','sheet']);assert.equal(draws,2);
});

test('actual drawing form maps Auxiliary checkbox to boolean control and preserves unchecked false',async()=>{
  const start=source.indexOf('function sheetForm(title, fields, hint) {'),end=source.indexOf('function sheetPrompt(',start);
  assert.ok(start>=0&&end>start);
  let form;const classes=new Set();
  const context={root:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},t:x=>x,openQuickForm:options=>{form=options;return true;}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  for(const checked of [false,true]) {
    const pending=context.sheetForm('Auxiliary view',[{key:'flip',label:'Reverse sight direction',type:'checkbox',value:false},{key:'face',type:'select',value:'native-face'}]);
    assert.equal(form.fields[0].type,'boolean','ordinary Quickform must render a checkbox, not a false textbox');
    assert.equal(form.fields[0].value,false);form.onApply({flip:checked,face:'native-face'});
    const answer=await pending;assert.equal(answer.flip,checked);assert.equal(typeof answer.flip,'boolean');assert.equal(answer.face,'native-face');
    assert.equal(classes.has('md-sheet-form'),false);
  }
  const cancelled=context.sheetForm('Auxiliary view',[{key:'flip',type:'checkbox',value:false}]);form.onCancel();assert.equal(await cancelled,null);
});
