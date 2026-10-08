import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const element=(tag)=>({tag,children:[],events:{},appendChild(child){this.children.push(child);},
  addEventListener(name,handler){this.events[name]=handler;},setAttribute(){}});
const makeRow=(track)=>new Function('el','fin','pushUndo','refreshAll','t','propGen',
  sourceFunctionText(source,'numRow')+';return numRow;')(
  element,Number.isFinite,()=>track.undo++,()=>track.refresh++,()=>'',0);

test('six placement fields defer all mutation until Apply, while ordinary property fields still commit',()=>{
 const track={undo:0,refresh:0},host=element('div'),row=makeRow(track);
 let placed=3,ordinary=7;
 const deferred=row(host,'X',()=>placed,value=>{placed=value;},.1,null,true);
 deferred.value='18';deferred.events.change();
 deferred.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});
 assert.equal(placed,3);
 assert.deepEqual(track,{undo:0,refresh:0});
 const normal=row(host,'Width',()=>ordinary,value=>{ordinary=value;},.1);
 normal.value='12';normal.events.change();
 assert.equal(ordinary,12);
 assert.deepEqual(track,{undo:1,refresh:1});
});
