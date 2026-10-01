import test from 'node:test';import assert from 'node:assert/strict';import {exactMateReferenceChoices} from '../js/cad_mate_reference_choices.js';
test('gear bore references precede thousands of tooth flats without dropping native choices',()=>{
 const origin={x:0,y:0,z:0},normal={x:0,y:1,z:0};
 const side=Array.from({length:3200},(_,i)=>({kind:'face',persistentId:'side'+i,semantic:'side:'+i,descriptor:{surface:'plane',origin,normal}}));
 const cap={kind:'face',persistentId:'cap',semantic:'end',descriptor:{surface:'plane',origin,normal}};
 const bore={kind:'face',persistentId:'bore',descriptor:{surface:'cylinder',origin,axis:normal,radius:1}};
 const rim={kind:'edge',persistentId:'rim',descriptor:{curve:'circle',origin,axis:normal,radius:1}};
 const list=exactMateReferenceChoices([...side,cap,rim,bore]);
 assert.deepEqual(list.slice(0,4).map(c=>c.entry.persistentId),['axis:bore','bore','rim','cap']);assert.equal(list.length,3204);
});
