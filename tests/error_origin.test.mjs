import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isExtensionOriginError} from '../js/core/error_origin.js';
test('only explicit extension origin is classified, never message text or application top frame',()=>{
 for(const prefix of ['chrome-extension://','moz-extension://','safari-web-extension://']) {
  assert.equal(isExtensionOriginError({filename:prefix+'id/main.js'}),true);
  assert.equal(isExtensionOriginError({reason:{stack:'Error: failed\n    at handleKeyDown ('+prefix+'id/script.js:1:2)\n    at app (http://localhost/js/main.js:2:3)'}}),true);
 }
 assert.equal(isExtensionOriginError({reason:{stack:'handleKeyDown@moz-extension://id/script.js:2:3'}}),true);
 for(const event of [
  {message:'chrome-extension://id/script.js failed'},
  {reason:'chrome-extension://id/script.js failed'},
  {filename:'http://localhost/js/main.js',error:{stack:'Error\n at x (chrome-extension://id/script.js:1:2)'}},
  {reason:{stack:'Error: chrome-extension://id/name\n at exportSvg (http://localhost/js/modeler.js:1:2)\n at x (chrome-extension://id/script.js:1:2)'}},
  {reason:{stack:'Error\n at unknown (<anonymous>:1:2)\n at x (chrome-extension://id/script.js:1:2)'}},
  {reason:new Error('export failed')}
 ])assert.equal(isExtensionOriginError(event),false);
});
test('actual persistence error listeners retain application/export/unknown failures without false extension toasts or cancellation',()=>{
 const source=readFileSync(new URL('../js/persist.js',import.meta.url),'utf8');const start=source.indexOf('function installErrorNet()'),end=source.indexOf('export function initPersistence',start);
 const callbacks=new Map(),flashes=[],fatals=[],window={addEventListener:(name,fn)=>callbacks.set(name,fn)};
 new Function('window','api','t','showFatal','isExtensionOriginError',source.slice(start,end)+';installErrorNet();')(window,{flash:(...args)=>flashes.push(args)},x=>x,x=>fatals.push(x),isExtensionOriginError);
 let canceled=0;
 for(const name of ['error','unhandledrejection']) {
  const extension={stack:'Error: extension crash\n at handleKeyDown (chrome-extension://abc/main.js:1:2)'};
  callbacks.get(name)({error:extension,reason:extension,preventDefault:()=>canceled++});assert.equal(flashes.length,0);
 }
 assert.equal(canceled,0,'browser console retains uncaught extension errors');
 callbacks.get('error')({filename:'http://localhost/js/modeler.js',message:'SVG export failed'});
 callbacks.get('unhandledrejection')({reason:new Error('bundle export failed')});
 callbacks.get('error')({message:'Script error.'});assert.equal(flashes.length,3);
 callbacks.get('error')({target:{tagName:'SCRIPT'}});assert.deepEqual(fatals,['err_asset']);
});
