import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const mobile=readFileSync(new URL('../js/modeler_mobile.js',import.meta.url),'utf8');
const start=mobile.indexOf('    if (api.state().mode === "drawing") {',mobile.indexOf('} else if (key === "cmd")'));
const end=mobile.indexOf('    setSheetSearch(true);',start);
assert.ok(start>=0&&end>start);
const run=new Function('api','buildDrawingCommands','borrowPanel','markGroupDrawers',mobile.slice(start,end));
test('actual mobile All tools opens Sketch repeatedly on a projected plane and Features after leaving it',()=>{
 const tabs=[],panels=[];let drawing=0;
 const state={mode:'3d',modelPlaneActive:true,emptyPart:false,docType:'part',commandTab:'features'};
 const api={state:()=>state,setCommandTab:tab=>{tabs.push(tab);state.commandTab=tab;}};
 const open=()=>run(api,()=>drawing++,p=>panels.push(p),()=>{});
 open();assert.equal(tabs.at(-1),'sketch');state.commandTab='features';open();assert.equal(tabs.at(-1),'sketch');
 state.modelPlaneActive=false;open();assert.equal(tabs.at(-1),'features');
 state.mode='2d';open();assert.equal(tabs.at(-1),'sketch');
 state.mode='3d';state.docType='assembly';open();assert.equal(tabs.at(-1),'assembly');
 state.docType='part';state.emptyPart=true;open();assert.equal(tabs.at(-1),'sketch');
 state.mode='drawing';const previous=tabs.length;open();assert.equal(drawing,1);assert.equal(tabs.length,previous);
 assert.ok(panels.every(p=>p==='.md-commandmanager'));
});
test('native modeler adapter exposes active projected sketch independently of 3D mode',()=>{
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 const field=source.match(/modelPlaneActive: !!E\.modelPlaneActive,/);assert.ok(field);
 const read=new Function('E','return ({'+field[0]+'});');
 assert.equal(read({mode:'3d',modelPlaneActive:true}).modelPlaneActive,true);
 assert.equal(read({mode:'3d',modelPlaneActive:false}).modelPlaneActive,false);
});
