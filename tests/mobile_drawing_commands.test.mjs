import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {drawingCommandGroup} from '../js/core/drawing_command_group.js';

const source=readFileSync(new URL('../js/modeler_mobile.js',import.meta.url),'utf8');
function actual(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0);const end=source.indexOf('\n}',start);return source.slice(start,end+2);}
function node(){const classes=new Set();return {children:[],dataset:{},attributes:{},classList:{contains:k=>classes.has(k),add(k){classes.add(k);},remove(k){classes.delete(k);},toggle(k,on){if(on)classes.add(k);else classes.delete(k);}},appendChild(n){this.children.push(n);},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(){},querySelector(){return null;},addEventListener(k,f){this[k]=f;}};}
function rig(state={mode:'drawing',emptyPart:true}){
  const calls=[],body=node(),targetKeys=['select','dim','sheetellipse','note','detail','saveformat'];
  const targets=targetKeys.map(key=>({...node(),isConnected:true,disabled:false,title:key,
    getAttribute:()=>key,querySelector:q=>q==='span'?{textContent:key}:null,
    click(){calls.push('native:'+key);}}));
  const owner={querySelector:()=>null,querySelectorAll:q=>q==='#mdDrawingTools button'?targets:[]};
  const c={api:{root:owner,state:()=>state,setCommandTab:tab=>calls.push('tab:'+tab)},document:{createElement:node,body:node()},
    sheet:node(),sheetBody:body,sheetTitle:node(),backdrop:node(),openKey:null,
    t:k=>k,drawingCommandGroup,closeSheet:()=>calls.push('close'),sync:()=>{},syncNav:()=>{},ensureSheet:()=>{},release:()=>{},
    setSheetTall:()=>{},setSheetSearch:()=>{},borrowPanel:q=>calls.push('borrow:'+q),markGroupDrawers:()=>{},
    dockRail:()=>false,requestAnimationFrame:()=>{},pageOpenSheet:()=>{}};
  vm.createContext(c);vm.runInContext(['gridBtn','grid','section','buildDrawingCommands','showSheet'].map(actual).join('\n'),c);
  return {c,calls,targets,owner,groups:()=>body.children.filter(n=>n.className?.includes('md-mobile-drawing-group')),
    buttons:()=>body.children.flatMap(n=>n.children.filter(c=>c.className?.includes('md-mobile-drawing-commands')).flatMap(g=>g.children))};
}

test('actual phone All tools prioritizes Drawing over empty-Part Sketch and uses labelled native commands',()=>{
  const r=rig();r.c.showSheet('cmd');
  assert.equal(r.calls.length,0,'neither Sketch tab nor command-manager borrow replaces Drawing');
  assert.equal(r.buttons().length,r.targets.length);
  assert.deepEqual(r.buttons().map(b=>b.attributes['aria-label']),['select','dim','sheetellipse','note','detail','saveformat']);
  assert.deepEqual(r.buttons().map(b=>b.dataset.drawingCommand),['select','dim','sheetellipse','note','detail','saveformat']);
  assert.equal(r.c.api.root,r.owner);assert.equal(r.c.openKey,'cmd');
  assert.equal(r.c.sheet.classList.contains('md-drawing-command-sheet'),true);
});
test('a full native toolbar is split into atomic labelled groups of at most four touch commands',()=>{
  const r=rig(),template=r.targets[0];
  const targets=Array.from({length:40},(_,i)=>({...template,getAttribute:()=>String(i),querySelector:q=>q==='span'?{textContent:'Native tool '+i}:null}));
  r.owner.querySelectorAll=()=>targets;r.c.showSheet('cmd');
  assert.equal(r.groups().length,10);assert.equal(r.buttons().length,40);
  assert.deepEqual(r.buttons().map(b=>b.dataset.drawingCommand),targets.map(t=>t.getAttribute()));
  r.groups().forEach((group,i)=>{
    assert.equal(group.children.length,2,'pager atom includes heading and grid together');
    assert.match(group.className,/md-command-group/,'existing pager recognizes the section boundary');
    assert.equal(group.children[0].textContent,'modeDrawing · drawGroupViews');
    assert.equal(group.children[1].children.length,4,'two columns need only two touch rows');
    assert.equal(group.className.includes('md-drawing-group-continuation'),i>0,'only subsequent same-purpose chunks share a heading when adjacent on a page');
  });
});
test('purpose boundaries keep paper geometry separate from dimensions and images',()=>{
  const r=rig();r.c.showSheet('cmd');
  assert.deepEqual(r.groups().map(group=>group.children[0].textContent),[
    'modeDrawing · drawGroupDimensions','modeDrawing · drawGroupGeometry',
    'modeDrawing · drawGroupAnnotations','modeDrawing · drawGroupViews','modeDrawing · drawGroupFormats'
  ]);
  assert.deepEqual(r.groups().map(group=>group.children[1].children.map(button=>button.dataset.drawingCommand)),[
    ['select','dim'],['sheetellipse'],['note'],['detail'],['saveformat']
  ]);
  assert.ok(r.groups().every(group=>!group.className.includes('md-drawing-group-continuation')),'new purposes always keep their heading');
});
test('actual shortcut closes the sheet before dispatching the original native handler',()=>{
  const r=rig();r.c.showSheet('cmd');r.buttons()[3].click();
  assert.deepEqual(r.calls,['close','native:note']);
  r.buttons()[5].click();assert.deepEqual(r.calls.slice(-2),['close','native:saveformat']);
});
test('native ID-only Fit, Print, SVG, overall dimensions, Model Items and Hidden lines remain reachable',()=>{
  const r=rig();
  const ids=['mdSheetFit','mdSheetPrint','mdSheetExport','mdSheetAutoDim','mdSheetModelItems','mdSheetHidden'];
  for(const id of ids)r.targets.push({...node(),id,isConnected:true,disabled:false,
    getAttribute:k=>k==='aria-pressed' && id==='mdSheetHidden'?'true':null,
    querySelector:q=>q==='span'?{textContent:id}:null,click(){r.calls.push('native:'+id);}});
  r.c.showSheet('cmd');
  for(const id of ids){const button=r.buttons().find(b=>b.dataset.drawingCommand===id);assert.ok(button);button.click();}
  assert.deepEqual(r.calls,ids.flatMap(id=>['close','native:'+id]));
  assert.match(r.buttons().find(b=>b.dataset.drawingCommand==='mdSheetHidden').className,/ on$/);
});
test('stale owner, changed mode, disconnected and disabled drawing targets cannot dispatch',()=>{
  for(const change of [r=>{r.c.api.root={};},r=>{r.c.api.state=()=>({mode:'2d'});},r=>{r.targets[0].isConnected=false;},r=>{r.targets[0].disabled=true;}]){
    const r=rig();r.c.showSheet('cmd');change(r);r.buttons()[0].click();assert.deepEqual(r.calls,[]);
  }
  const disabled=rig();disabled.targets[2].disabled=true;disabled.c.showSheet('cmd');assert.equal(disabled.buttons()[2].disabled,true);
});
test('non-Drawing phone command routing retains native Sketch, Assembly and Features panels',()=>{
  for(const [state,tab] of [[{mode:'2d'},'sketch'],[{mode:'3d',emptyPart:true},'sketch'],[{mode:'3d',docType:'assembly'},'assembly'],[{mode:'3d'},'features']]){
    const r=rig(state);r.c.showSheet('cmd');assert.deepEqual(r.calls,['tab:'+tab,'borrow:.md-commandmanager']);assert.equal(r.buttons().length,0);
    assert.equal(r.c.sheet.classList.contains('md-drawing-command-sheet'),false);
  }
});

test('phone Drawing settings refresh and borrow the native sheet panel; Part keeps its inspector',()=>{
 const drawing=rig({mode:'drawing',emptyPart:false});let refreshed=0;
 drawing.c.api.ensureDrawingSheetFresh=()=>refreshed++;
 drawing.c.api.ensureInspectorFresh=()=>assert.fail('Drawing cannot open stale sketch inspector');
 drawing.c.showSheet('props');assert.equal(refreshed,1);assert.equal(drawing.c.sheetTitle.textContent,'sheetSetup');
 assert.deepEqual(drawing.calls,['borrow:#mdSheetPanel']);
 const part=rig({mode:'3d',docType:'part'});part.c.api.ensureInspectorFresh=()=>part.calls.push('fresh:inspector');
 part.c.showSheet('props');assert.deepEqual(part.calls,['fresh:inspector','borrow:.md-right']);
});
