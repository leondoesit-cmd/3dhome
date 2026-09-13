import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDoc, parentIndex } from '../model/validate.js';
import { emptyDoc } from '../model/schema.js';
import { resolve } from '../model/resolve.js';
import { insert, resize, resetField, resetNode, ungroup } from '../model/ops.js';
import { matchesLetter } from '../runtime/keys.js';
import { dropIndicator, dropPlaceholder, insertionIndex } from '../editor/drag.js';
import { applyScopedLayout, presentation, scopeTokens } from '../model/layout_scope.js';

const box = {x:0,y:0,w:300,h:100};
const rtl = [{x:200,y:0,w:100,h:100},{x:100,y:0,w:100,h:100},{x:0,y:0,w:100,h:100}];
test('RTL drop seams match the insertion order at both ends and between children',()=>{
  for(const [x,index,seam] of [[299,0,300],[199,1,200],[99,2,100],[1,3,0]]){
    assert.equal(insertionIndex(rtl,{x,y:10},'row'),index);
    assert.equal(dropIndicator(box,rtl,index,'row').x,seam-1);
    assert.equal(dropPlaceholder(box,rtl,index,'row',{w:20,h:20}).x,seam-20);
  }
});
test('reverse vertical layout uses the trailing edge for the initial seam',()=>{
  const rects=rtl.map(r=>({x:0,y:r.x,w:100,h:100}));
  assert.equal(dropIndicator({x:0,y:0,w:100,h:300},rects,0,'col').y,299);
});
test('an unmeasured drop indicator is absent',()=>assert.equal(dropIndicator(null,[],0,'row'),null));
test('parent lookup safely rejects missing documents and node maps',()=>{
  for(const doc of [null,{}, {nodes:null},{nodes:[]}]) assert.equal(parentIndex(doc).size,0);
});
test('array variant maps and array patches remain serializable after repair',()=>{
  for(const variants of [[],{base:[]},{base:{root:'n:root',patch:[]}}]){
    const doc=normalizeDoc({...emptyDoc(),variants}).doc;
    const loaded=JSON.parse(JSON.stringify(doc));
    assert.equal(loaded.variants.base.root,'n:root');
    assert.deepEqual(loaded.variants.base.patch,{});
  }
});
test('partial node constraints preserve registry requirements',()=>{
  const doc=emptyDoc();doc.nodes['n:root'].children=['a'];doc.nodes.a={type:'item',ref:'a',constraints:{resize:'none'}};
  const node=resolve(doc,{registry:[{id:'a',constraints:{hide:false,minW:25}}]}).tree.children[0];
  assert.deepEqual(node.constraints,{hide:false,minW:25,resize:'none'});
});
test('insert copies nested caller data and gives a new container its defaults',()=>{
  const node={type:'group',size:{w:50}};
  const result=insert(emptyDoc(),{id:'g',parent:'n:root',node});node.size.w=200;
  assert.equal(result.nodes.g.size.w,50);assert.deepEqual(result.nodes.g.children,[]);
  assert.equal(result.nodes.g.hidden,false);
});
test('programmatic size edits clamp negative dimensions',()=>{
  const doc=resize(emptyDoc(),{id:'n:root',size:{w:-10,h:0}});
  assert.deepEqual(doc.nodes['n:root'].size,{w:1,h:1});
});
test('reset restores shipped presentation without changing structure or app text',()=>{
  const defaults=emptyDoc();defaults.nodes['n:root'].size={w:320};defaults.nodes['n:root'].orient='col';
  const doc=structuredClone(defaults);doc.nodes['n:root'].size={w:700};doc.nodes['n:root'].orient='row';doc.nodes['n:root'].icon='star';doc.overrides.text={en:{save:'Keep'}};
  const one=resetField(doc,{id:'n:root',field:'size',defaults});
  assert.deepEqual(one.nodes['n:root'].size,{w:320});assert.equal(one.nodes['n:root'].orient,'row');
  const all=resetNode(doc,{id:'n:root',defaults});assert.deepEqual(all.nodes,defaults.nodes);assert.deepEqual(all.overrides.text,doc.overrides.text);
  assert.equal(resetNode(all,{id:'n:root',defaults}),all);
});
test('breakpoint reset removes its patch and inherits base instead of shipped values',()=>{
  const defaults=emptyDoc();const doc=structuredClone(defaults);doc.nodes['n:root'].size={w:400};doc.variants.phone={root:'n:root',patch:{'n:root':{size:{w:200}}}};
  const next=resetField(doc,{id:'n:root',field:'size',variant:'phone',defaults});
  assert.equal(presentation(next,'phone')['n:root'].size.w,400);
});
test('ungroup tolerates a document without variant metadata',()=>{
  const doc={nodes:{root:{type:'dock',children:['g']},g:{type:'group',children:['a']},a:{type:'item'}}};
  assert.deepEqual(ungroup(doc,{id:'g'}).nodes.root.children,['a']);
});
test('AZERTY undo follows the letter, while Hebrew and Option keep physical fallbacks',()=>{
  assert.equal(matchesLetter({key:'z',code:'KeyW',ctrlKey:true},'z'),true);
  assert.equal(matchesLetter({key:'w',code:'KeyZ',metaKey:true},'z'),false);
  assert.equal(matchesLetter({key:'ז',code:'KeyZ',ctrlKey:true},'z'),true);
  assert.equal(matchesLetter({key:'Dead',code:'KeyE',altKey:true},'e'),true);
});
test('changing layout preserves app-wide localized text and isolated responsive themes',()=>{
  const current=emptyDoc();current.overrides.text={en:{save:'Keep'}};current.overrides.tokens={'--accent':'red'};current.variants.phone={root:'n:root',tokens:{},patch:{}};
  const next=applyScopedLayout(current,emptyDoc());
  assert.deepEqual(next.overrides.text,current.overrides.text);assert.deepEqual(scopeTokens(next,'phone'),{});
});
