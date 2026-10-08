import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/pro_ribbon.js',import.meta.url),'utf8');
test('Pro ribbon leaves the Assembly tab on a Part transition without resetting deliberate Part tab selections',()=>{
 let assembly=true,index=3;const calls=[];
 const host={dataset:{proDocumentType:'assembly'},querySelector:()=>({dataset:{proTab:String(index)}})};
 const root={classList:{contains:()=>assembly},querySelector:()=>host};
 const context={document:{querySelector:()=>root},PRO_CATALOG:{model:{tabs:[['Sketch'],['Features'],['Reference'],['Assembly'],['Evaluate']]}},LS_TAB:'tabs',fillRibbon:(h,editor,next,key)=>{calls.push({next,key});index=next;}};
 const sync=new Function(...Object.keys(context),sourceFunctionText(source,'syncModelDocumentRibbon')+';return syncModelDocumentRibbon;')(...Object.values(context));
 sync();assert.equal(calls.length,0);assembly=false;sync();assert.deepEqual(calls,[{next:1,key:'tabs.model'}]);
 index=3;sync();assert.equal(calls.length,1,'a user can deliberately inspect Assembly commands while still in Part mode');
 assembly=true;sync();index=4;assembly=false;sync();assert.equal(calls.length,1,'shared Evaluate tools keep the selected tab');
});
test('Pro explosion button mirrors disabled state and can recover when Assembly mode returns',()=>{
 const attrs={'aria-label':'Explode','aria-pressed':'false','aria-disabled':'true'};
 const sourceButton={getAttribute:key=>attrs[key]??null,title:'Explode'};
 const button={dataset:{proBind:'mcmd:explode'},attrs:{},querySelector:()=>({textContent:''}),getAttribute(key){return this.attrs[key]??null;},setAttribute(key,value){this.attrs[key]=value;}};
 const sync=new Function('document',sourceFunctionText(source,'syncExplodeBinding')+';return syncExplodeBinding;')({querySelector:()=>sourceButton});
 sync(button);assert.equal(button.disabled,true);assert.equal(button.attrs['aria-disabled'],'true');
 attrs['aria-disabled']='false';attrs['aria-pressed']='true';sync(button);assert.equal(button.disabled,false);assert.equal(button.attrs['aria-pressed'],'true');
});
