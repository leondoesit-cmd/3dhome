import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validLimitMateBounds} from '../js/cad_mate_model.js';
import {defaultTopologyMateAlignment} from '../js/cad_mate_reference_choices.js';
import {solveTopologyMates} from '../js/cad_mates.js';
import {assemblyMobilityReport} from '../js/core/assembly_mobility_status.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
test('mate removal exposes its type and occurrence detail to accessibility and keeps callback intact',()=>{
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('function mateRow('),end=source.indexOf('\n}',start)+2;
  const el=tag=>({tag,children:[],attributes:{},appendChild(child){this.children.push(child);},setAttribute(key,value){this.attributes[key]=value;}});
  const row=vm.runInNewContext(`(${source.slice(start,end)})`,{el,btn:(text,action)=>Object.assign(el('button'),{text,action}),t:key=>key==='del'?'Delete':key});
  const host=el('div');let removed=0;
  row(host,'Lock 4','Crank ↔ Piston pin',null,()=>removed++);
  const button=host.children[0].children.find(node=>node.tag==='button');
  assert.equal(button.attributes['aria-label'],'Delete · Lock 4 · Crank ↔ Piston pin');
  assert.equal(button.title,button.attributes['aria-label']);button.action();assert.equal(removed,1);
  const other=el('div');row(other,'Lock 5','Crank ↔ Rod',null,()=>{});
  assert.notEqual(other.children[0].children.at(-1).attributes['aria-label'],button.attributes['aria-label']);
});

function numericInspector(mate){
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),nodes=[],undos=[],messages=[];
  const start=source.indexOf('      var extraField = function'),screwEnd=source.indexOf('      if (mate.type === "gear")',start);
  const limitStart=source.indexOf('      if (mate.type === "limit")',screwEnd),limitEnd=source.indexOf('\n    });',limitStart);
  const el=tag=>{const node={tag,children:[],attributes:{},listeners:{},appendChild(child){this.children.push(child);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(name,callback){this.listeners[name]=callback;}};nodes.push(node);return node;};
  let solves=0,refreshes=0;
  const context={mate,E:{assembly:{topologyMates:[mate]}},el,mateUiRow:el('div'),btn:()=>el('button'),t:key=>key,fin:Number.isFinite,
    modelLengthUnit:()=> 'mm',lengthToDocument:value=>value*10,lengthFromDocument:value=>value/10,
    validLimitMateBounds,assemblyMobilityReport,flash:value=>messages.push(value),pushUndo:()=>undos.push(JSON.parse(JSON.stringify(mate))),
    solveAssembly:()=>solves++,refreshAll:()=>refreshes++,invalidateInterference:()=>{},updateAssemblyContexts:()=>({issues:[]}),
    setScrewMateDrive(assembly,id,turns,beforeCommit){
      assert.equal(assembly.topologyMates[0],mate);assert.equal(id,mate.id);
      if(turns!==null&&Math.abs(turns)>3)return{ok:false};
      beforeCommit();if(turns===null)delete mate.driveTurns;else mate.driveTurns=turns;
      return{ok:true};
    },setScrewMateCoupledMotion(assembly,id,coupled,beforeCommit){
      assert.equal(assembly.topologyMates[0],mate);assert.equal(id,mate.id);
      if(!coupled)return{ok:false};
      beforeCommit();mate.coupledMotion=coupled;return{ok:true};
    }};
  vm.runInNewContext(source.slice(start,screwEnd)+source.slice(limitStart,limitEnd),context);
  return {mate,E:context.E,nodes,undos,messages,get solveFresh(){return context.assemblySolveFresh;},get solves(){return solves;},get refreshes(){return refreshes;},
    input:label=>nodes.find(node=>node.tag==='input'&&node.attributes['aria-label']===label)};
}
function enter(input){
  let prevented=false,stopped=false;
  input.listeners.keydown({key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(prevented,true);assert.equal(stopped,true);
}

test('Enter commits screw pitch and drive turns through actual mate callbacks before an inspector rebuild',()=>{
  const mate={type:'screw',pitch:.125,turns:0,coupledMotion:true};
  let f=numericInspector(mate),pitch=f.input('mateScrewPitch (mm/mateScrewTurn)');
  pitch.value='4';pitch.listeners.keydown({key:'Tab'});assert.equal(mate.pitch,.125);
  enter(pitch);assert.equal(mate.pitch,.4);assert.equal(f.undos.length,1);assert.equal(f.solves,1);assert.equal(f.refreshes,1);
  pitch.listeners.change();assert.equal(f.undos.length,1,'Enter then blur does not duplicate history');
  f=numericInspector(mate);assert.equal(f.input('mateScrewPitch (mm/mateScrewTurn)').value,'4');
  const drive=f.input('Drive turns (blank = free)');drive.value='2.5';enter(drive);assert.equal(mate.driveTurns,2.5);
  assert.equal(f.solveFresh,true);assert.equal(f.solves,0,'accepted atomic result is reused by the refresh');
  assert.equal(f.E.mateUnsatisfied.length,0);assert.equal(f.E.mateIssues.length,0);
  const acceptedUndos=f.undos.length,acceptedRefreshes=f.refreshes;
  drive.value='4';enter(drive);assert.equal(mate.driveTurns,2.5);assert.equal(drive.value,'2.5');
  assert.equal(f.undos.length,acceptedUndos);assert.equal(f.refreshes,acceptedRefreshes,'failed atomic solve does not rebuild or publish');
  drive.value='';enter(drive);assert.equal('driveTurns' in mate,false,'blank restores free motion');
  const invalid=f.input('mateScrewPitch (mm/mateScrewTurn)');invalid.value='-1';enter(invalid);
  assert.equal(mate.pitch,.4);assert.equal(invalid.value,'4');assert.equal(f.messages.length,2);
  const free={type:'screw',pitch:.4,turns:0};f=numericInspector(free);
  const turns=f.input('mateScrewTurns');turns.value='3';enter(turns);assert.equal(free.turns,3);
});

test('Enter commits Limit min/max in document units, preserves validation and persists across refresh',()=>{
  const mate={type:'limit',min:0,max:2};
  let f=numericInspector(mate),max=f.input('mateLimitMaximum (mm)');max.value='50';enter(max);
  assert.equal(mate.max,5);assert.equal(f.undos.length,1);assert.equal(f.solves,1);assert.equal(f.refreshes,1);
  max.listeners.change();assert.equal(f.undos.length,1);
  f=numericInspector(JSON.parse(JSON.stringify(mate)));assert.equal(f.input('mateLimitMaximum (mm)').value,'50');
  const min=f.input('mateLimitMinimum (mm)');min.value='60';enter(min);assert.equal(min.value,'0');assert.equal(f.mate.min,0);assert.equal(f.undos.length,0);
  min.value='10';enter(min);assert.equal(f.mate.min,1);assert.equal(f.mate.max,5);assert.equal(f.undos.length,1);assert.equal(f.undos[0].min,0);
});

test('coupling checkbox restores its saved state on failed atomic solve without history or refresh',()=>{
  const mate={id:'thread',type:'screw',pitch:.4,coupledMotion:true},f=numericInspector(mate);
  const mode=f.input('Couple screw rotation and travel');mode.checked=false;mode.listeners.change();
  assert.equal(mode.checked,true);assert.equal(mate.coupledMotion,true);assert.equal(f.undos.length,0);assert.equal(f.refreshes,0);
  assert.equal(f.messages.length,1);
});

test('native Screw creation captures the actual guided vice home instead of matching offset axis centroids',()=>{
  const assembly=JSON.parse(readFileSync(new URL('./fixtures/bench-vice-browser-native-mates.json',import.meta.url),'utf8'));
  const old=assembly.topologyMates.find(mate=>mate.type==='screw');
  assembly.topologyMates=assembly.topologyMates.filter(mate=>mate!==old);
  assert.notEqual(old.a.frame.origin.x,old.b.frame.origin.x);
  const before=assembly.components.map(component=>structuredClone(component.transform));let solved,undos=0;
  const environment={E:{assembly},fin:Number.isFinite,defaultTopologyMateAlignment,
    mateTypeFits:()=>({ok:true}),assemblyPickedRefs:()=>({a:old.a,b:old.b}),mateReferenceFromPick:pick=>structuredClone(pick),
    mateHolderById:id=>assembly.components.find(component=>component.id===id),pushUndo:()=>undos++,t:key=>key,flash:()=>{},
    uid:()=> 'new-native-screw',solveAssembly:()=>{solved=solveTopologyMates(assembly);},refreshAll:()=>{}};
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  vm.runInNewContext(sourceFunctionText(source,'addTopologyMate')+';addTopologyMate("screw");',environment);
  assert.equal(undos,1);assert.equal(solved.ok,true,JSON.stringify(solved));
  const created=assembly.topologyMates.at(-1);assert.equal(created.coupledMotion,true);
  assert.ok(Math.abs(created.coupledAxial0)<1e-5);
  assembly.components.forEach((component,index)=>{
    for(const key of ['x','y','z','rx','ry','rz'])assert.ok(Math.abs(component.transform[key]-before[index][key])<1e-5,key);
  });
});
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
