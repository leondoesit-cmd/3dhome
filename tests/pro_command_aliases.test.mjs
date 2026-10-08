import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proTools,proLabel} from '../js/pro_catalog.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/pro_ribbon.js',import.meta.url),'utf8');
test('Cmd resolves canonical Custom properties, legacy caption and Hebrew to the actual modeler command',()=>{
  let opened=0,closed=0;
  const modeler=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const runCommand=new Function('commandUnavailableReason','DIRECT_COMMAND_TOOLS','openCustomProperties','closeCommandSearch',sourceFunctionText(modeler,'runCommand')+';return runCommand;')
    (()=>null,{},()=>opened++,()=>closed++);
  const api=new Function('proTools','proLabel','L','runProBinding','syncActive',
    ['editorToolNames','editorToolNamed','suggestTools'].map(name=>sourceFunctionText(source,name)).join('\n')+';return {editorToolNamed,suggestTools};')
    (proTools,proLabel,label=>label,bind=>runCommand(bind.split(':')[1]),()=>{});
  for(const text of ['Custom properties','custom props','  CUSTOM PROPERTIES  ',proLabel('Custom properties','he')]){
    const tool=api.editorToolNamed('model',text);
    assert.equal(tool.bind,'mcmd:customprops');assert.equal(tool.label,'Custom properties');
    const suggestions=api.suggestTools('model',text);
    assert.equal(suggestions.length,1);assert.equal(suggestions[0].label,'Custom properties');suggestions[0].run();
  }
  assert.equal(opened,4);assert.equal(closed,4);
  assert.equal(api.editorToolNamed('model','Custom property'),null,'exact fallback does not guess');
  assert.equal(api.editorToolNamed('plan','Custom properties'),null,'alias respects editor scope');
  assert.equal(api.suggestTools('model','Custom').filter(item=>item.label==='Custom properties').length,1,'alias does not duplicate a suggestion');
});

test('precise Center rectangle is reachable by its canonical and previous Cmd names',()=>{
  const lookup=new Function('proTools','proLabel',['editorToolNames','editorToolNamed'].map(name=>sourceFunctionText(source,name)).join('\n')+';return editorToolNamed;')(proTools,proLabel);
  for(const name of ['Center rectangle','Centre rect','Centre rectangle','Dimensioned rectangle',proLabel('Center rectangle','he')])
    assert.equal(lookup('model',name)?.bind,'mcmd:centerrectangle',name);
});
