import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('Enter commits a listed mate value without relying on browser blur dispatch',()=>{
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('function mateRow('),end=source.indexOf('\n}',start)+2;
  const nodes=[];
  const el=(tag)=>{const node={tag,children:[],listeners:{},appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;}};nodes.push(node);return node;};
  const mate={type:'distance',value:.15};let commits=0;
  const row=vm.runInNewContext(`(${source.slice(start,end)})`,{el,btn:()=>el('button'),t:value=>value});
  row(el('div'),'Distance','arm ↔ eye',null,()=>{},null,{label:'Distance (cm)',value:mate.value,onChange(value){mate.value=Number(value);commits++;}});
  const input=nodes.find(node=>node.tag==='input');input.value='.35';
  input.listeners.keydown({key:'Tab'});assert.equal(mate.value,.15);
  let prevented=false,stopped=false;
  input.listeners.keydown({key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(mate.value,.35);assert.equal(commits,1);assert.equal(prevented,true);assert.equal(stopped,true);
  assert.equal(JSON.parse(JSON.stringify(mate)).value,.35);
});
