import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PRO_CATALOG,proTools,proLabel} from '../js/pro_catalog.js';
import {buildCommandCatalog,commandUnavailableReason} from '../js/modeler_commands.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const ribbon=fs.readFileSync(new URL('../js/pro_ribbon.js',import.meta.url),'utf8'),modeler=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function catalog(editor){return buildCommandCatalog({t:x=>x,editor,closedSketchProfile:()=>null,activeParts:()=>[]});}
test('current Assembly ribbon, Allcommands lookup and ordinary Cmd names reach all three real handlers',()=>{
 const group=PRO_CATALOG.model.tabs.find(([tab])=>tab==='Assembly')[1].find(([name])=>name==='Component patterns');assert.ok(group);
 const E={docType:'assembly',assembly:{components:[{id:'seed'},{id:'carrier'}],componentPatterns:[{id:'p'}]}},calls=[];
 const commands=catalog(E);
 const run=new Function('commandUnavailableReason','DIRECT_COMMAND_TOOLS','openComponentPatternForm','closeCommandSearch','syncCommandManager',sourceFunctionText(modeler,'runCommand')+';return runCommand;')(id=>commandUnavailableReason(id,commands),{},mode=>calls.push(mode),()=>{},()=>{});
 const api=new Function('proTools','proLabel','L','runProBinding','syncActive',['editorToolNames','editorToolNamed','suggestTools'].map(n=>sourceFunctionText(ribbon,n)).join('\n')+';return {editorToolNamed,suggestTools};')(proTools,proLabel,x=>x,bind=>run(bind.split(':')[1]),()=>{});
 const entries=[['componentpattern','Component Pattern','create'],['editcomponentpattern','Edit Component Pattern','edit'],['removecomponentpattern','Remove Component Pattern','remove']];
 for(const [id,label,mode] of entries){
  assert.ok(group[1].some(t=>t.bind==='mcmd:'+id));
  for(const query of [label,id,proLabel(label,'he')]){const tool=api.editorToolNamed('model',query);assert.equal(tool?.bind,'mcmd:'+id);const result=api.suggestTools('model',query).find(t=>t.label===label);assert.ok(result);result.run();assert.equal(calls.at(-1),mode);}
  assert.equal(api.editorToolNamed('plan',label),null);
 }
 assert.equal(calls.length,9);
});
test('availability follows document and eligible real occurrences; edit/remove require a recipe without changing authoring',()=>{
 const E={docType:'part',assembly:{components:[{id:'seed'},{id:'carrier'}]}};let commands=catalog(E),before=JSON.stringify(E);
 for(const id of ['componentpattern','editcomponentpattern','removecomponentpattern'])assert.equal(commandUnavailableReason(id,commands),'cmdNeedAssembly');assert.equal(JSON.stringify(E),before);
 E.docType='assembly';commands=catalog(E);assert.equal(commandUnavailableReason('componentpattern',commands),'');
 for(const id of ['editcomponentpattern','removecomponentpattern'])assert.equal(commandUnavailableReason(id,commands),'Create a Component Pattern first');
 for(const invalid of [{componentPattern:{patternId:'x'}},{asm:{components:[]}},{suppressed:true}]){E.assembly.components[1]={id:'carrier',...invalid};assert.match(commandUnavailableReason('componentpattern',commands),/Insert a seed component/);}
 E.assembly.components[1]={id:'carrier'};E.assembly.componentPatterns=[{id:'p'}];before=JSON.stringify(E);
 for(const id of ['componentpattern','editcomponentpattern','removecomponentpattern'])assert.equal(commandUnavailableReason(id,commands),'');assert.equal(JSON.stringify(E),before);
});
