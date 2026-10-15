import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const modeler=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const tree=fs.readFileSync(new URL('../js/modeler_tree.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');
const rowClasses=new Function(sourceFunctionText(tree,'rowClasses')+';return rowClasses;')();
function matchingDeclarations(classes){
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,selectors])=>selectors.split(',').some(selector=>{
    selector=selector.trim();
    return /^#modeler (?:\.[\w-]+)+$/.test(selector)&&[...selector.matchAll(/\.([\w-]+)/g)].every(([,name])=>classes.has(name));
  })).map(([, ,body])=>body).join('\n');
}
function fixture(){
  const E={dependencyHighlight:null},ids=['boss','base','pattern','unrelated'];
  const rows=ids.map(id=>{
    const classes=new Set(rowClasses({kind:'feature'}).split(' '));
    return {dataset:{historyTarget:id},classes,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}};
  });
  const root={querySelectorAll:()=>rows};
  const apply=new Function('E','root',sourceFunctionText(modeler,'dependencyRole')+sourceFunctionText(modeler,'applyDependencyTreeClasses')+';return applyDependencyTreeClasses;')(E,root);
  return {E,rows,apply};
}
test('production unified dependency rows receive distinct visible roles and clear without authored mutation',()=>{
  const f=fixture(),source={features:[{id:'base'},{id:'boss',inputs:['base']},{id:'pattern',inputs:['boss']}]},before=JSON.stringify(source);
  f.E.dependencyHighlight={focus:'boss',upstream:new Set(['base']),downstream:new Set(['pattern'])};f.apply();
  const expected=['focus','upstream','downstream','dim'];
  f.rows.forEach((row,i)=>{
    assert.ok(row.classes.has('md-tree-row'));
    assert.ok(!row.classes.has('md-parametric-node'));
    assert.ok(row.classes.has('md-dependency-'+expected[i]));
    const styles=matchingDeclarations(row.classes);
    if(i===3)assert.match(styles,/opacity:\s*\.42/);else{
      assert.match(styles,/box-shadow:\s*inset 3px/);assert.match(styles,/background:\s*color-mix/);
    }
  });
  assert.match(matchingDeclarations(f.rows[0].classes),/var\(--warn\)/);
  assert.match(matchingDeclarations(f.rows[1].classes),/#38bdf8/);
  assert.match(matchingDeclarations(f.rows[2].classes),/#c084fc/);
  f.E.dependencyHighlight=null;f.apply();
  for(const row of f.rows)assert.ok(![...row.classes].some(c=>c.startsWith('md-dependency-')));
  assert.equal(JSON.stringify(source),before);
});
test('legacy dependency rows retain the same highlight declarations as unified rows',()=>{
  for(const role of ['focus','upstream','downstream','dim']){
    const legacy=matchingDeclarations(new Set(['md-parametric-node','md-dependency-'+role]));
    const unified=matchingDeclarations(new Set(['md-tree-row','md-dependency-'+role]));
    const marker=role==='dim'?/opacity:\s*\.42/ : /box-shadow:\s*inset 3px[^;]+;\s*background:[^;]+;/;
    assert.equal(legacy.match(marker)?.[0],unified.match(marker)?.[0]);assert.ok(unified.match(marker));
  }
});

test('dependency callout disappears when its panel or focus leaves the visible tree, without relocating to header',()=>{
 const src=fs.readFileSync(new URL('../js/modeler_dependency_ui.js',import.meta.url),'utf8');
 const box=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
 const ancestor={hidden:false,style:{overflowY:'hidden'},getBoundingClientRect:()=>box(0,100,390,500),parentElement:null};
 const panel={parentElement:ancestor,getBoundingClientRect:()=>box(10,120,300,60)};
 const row={dataset:{nodeId:'n'},parentElement:ancestor,getBoundingClientRect:()=>box(10,200,300,40)};
 const calls={hidden:false,style:{left:'20px',top:'180px'}};
 const root={querySelector:s=>s==='.md-dependency-panel'?panel:calls,querySelectorAll:s=>s==='[data-node-id]'?[row]:[]};
 const window={innerWidth:390,innerHeight:844,getComputedStyle:n=>n.style||{}};
 const redraw=new Function('window',sourceFunctionText(src,'dependencyTreeIndex')+sourceFunctionText(src,'dependencyTreeAnchor')+sourceFunctionText(src,'rowVisible')+sourceFunctionText(src,'redrawArrows')+';return redrawArrows;')(window);
 const record={model:{nodes:[{id:'n',targetId:'sketch'}]},state:{focus:'sketch',relations:[]}};
 for(const change of [()=>ancestor.hidden=true,()=>panel.getBoundingClientRect=()=>box(0,0,0,0),()=>row.getBoundingClientRect=()=>box(10,700,300,40),()=>record.dismissed=true]){
  ancestor.hidden=false;panel.getBoundingClientRect=()=>box(10,120,300,60);row.getBoundingClientRect=()=>box(10,200,300,40);record.dismissed=false;calls.hidden=false;
  change();redraw(root,record);assert.equal(calls.hidden,true);assert.deepEqual(calls.style,{left:'20px',top:'180px'});
 }
});
