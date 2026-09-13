import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, findChrome } from '../tools/browser_harness.mjs';
const opts = await findChrome() ? {} : {skip:'Chrome unavailable'};
let page;
test.after(async()=>{if(page)await page.close();});
async function setup(){
  page ||= await openPage({width:1200,height:900});
  await page.goto('/uikit/demo/fixture.html',{boot:false});
  await page.eval(async()=>{
    const {createUIKit,createLocalStorage,ops}=await import('/uikit/index.js');
    for(const key of Object.keys(localStorage)) if(key.startsWith('regression:'))localStorage.removeItem(key);
    document.body.innerHTML='<main id="mount"></main><section id="borrowed" hidden></section>';
    const defaults={version:1,variants:{base:{root:'root'},phone:{root:'root',patch:{}}},nodes:{
      root:{type:'dock',children:['first','leaf','second','floating','vertical','borrowed']},
      first:{type:'group',children:['save']},leaf:{type:'separator'},second:{type:'group',children:[]},
      save:{type:'item',ref:'save',label:'Instance'},
      floating:{type:'float',children:[],rect:{x:12,y:15,w:180,h:140}},
      vertical:{type:'stack',children:[],constraints:{resize:'y'},size:{h:100}},
      borrowed:{type:'stack',children:[],slot:'borrowed'},
    },overrides:{text:{'*':{save:'Global'}},tokens:{}}};
    window.ui=createUIKit({mount:document.querySelector('#mount'),defaults,
      registry:[{id:'save',kind:'command',title:'Save',textKey:'save'}],
      slots:{borrowed:document.querySelector('#borrowed')},storage:createLocalStorage({prefix:'regression:'}),
      i18n:{lang:()=> 'en'},icons:{list:()=>['star'],render:(name,el)=>{el.textContent=name;}}});
    window.ops=ops;ui.mount();await ui.edit(true);ui.refreshNow();
    window.select=id=>{ui.editor.command('select',{id});ui.refreshNow();};
    window.field=label=>document.querySelector('input[aria-label="'+label+'"]');
    window.input=(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));ui.refreshNow();};
  });
  return page;
}

test('floating inspector edits rect and resets both geometry overrides with one undo',opts,async()=>{
  const p=await setup();
  const result=await p.eval(()=>{
    select('floating');const initial=[field('Width in pixels').value,field('Height in pixels').value];
    input(field('Width in pixels'),'240');const edited={...ui.doc.nodes.floating.rect};
    field('Width in pixels').parentElement.querySelector('button').click();
    const reset=ui.doc.nodes.floating.rect;ui.undo();
    return {initial,edited,reset:reset??null,undo:ui.doc.nodes.floating.rect};
  });
  assert.deepEqual(result.initial,['180','140']);
  assert.deepEqual(result.edited,{x:12,y:15,w:240,h:140});
  assert.deepEqual(result.reset,{x:12,y:15,w:180,h:140});assert.deepEqual(result.undo,result.edited);
});

test('vertical-only panels expose their size reset',opts,async()=>{
  const p=await setup();
  assert.deepEqual(await p.eval(()=>{
    select('vertical');input(field('Height in pixels'),'140');const reset=field('Height in pixels').parentElement.querySelector('button');
    const visible=!!reset&&!reset.hidden&&!reset.parentElement.hidden;reset.click();
    return {visible,size:ui.doc.nodes.vertical.size??null};
  }),{visible:true,size:{h:100}});
});

test('rename everywhere overrides this instance and wildcard reset remains reachable',opts,async()=>{
  const p=await setup();
  const result=await p.eval(()=>{
    select('save');const label=document.querySelector('[data-uikit-field=label]');
    const everywhere=[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Rename app text'));
    everywhere.querySelector('input').click();input(label,'Shared');
    const renamed=ui.resolved().tree.children[0].children[0].label;
    everywhere.querySelector('button').click();ui.refreshNow();
    const fallback=ui.resolved().tree.children[0].children[0].label;
    everywhere.querySelector('button').click();ui.refreshNow();
    return {renamed,fallback,reset:ui.resolved().tree.children[0].children[0].label};
  });
  assert.deepEqual(result,{renamed:'Shared',fallback:'Global',reset:'Save'});
});

test('Escape closes an open icon picker when focus has moved outside it',opts,async()=>{
  const p=await setup();
  assert.deepEqual(await p.eval(()=>{
    select('save');document.querySelector('.uikit-ins-header-icon').click();
    field('Width in pixels').focus();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    return {picker:!!document.querySelector('.uikit-ins-icon-picker'),editor:!!document.querySelector('.uikit-ins')};
  }),{picker:false,editor:true});
});

test('public wrapper lookup and releasing hidden borrowed slots preserve host state',opts,async()=>{
  const p=await setup();
  assert.deepEqual(await p.eval(()=>{
    const same=ui.wrapperFor('save')===document.querySelector('[data-uikit-id=save]');
    const borrowed=document.querySelector('#borrowed');ui.unmount();return {same,hidden:borrowed.hidden};
  }),{same:true,hidden:true});
});

test('reset all removes named layouts for active and retired variants',opts,async()=>{
  const p=await setup();
  assert.deepEqual(await p.eval(()=>{
    ui.saveNamedLayout('Desktop');ui.setVariant('phone');ui.saveNamedLayout('Phone');
    localStorage.setItem('regression:layout:saved:retired','[]');
    localStorage.setItem('regression:other:saved:phone','[]');ui.resetAll();
    return {remaining:Object.keys(localStorage).filter(k=>k.startsWith('regression:layout:saved')),other:localStorage.getItem('regression:other:saved:phone')};
  }),{remaining:[],other:'[]'});
});

test('move out skips leaf siblings and reaches an empty compatible container',opts,async()=>{
  const p=await setup();
  assert.deepEqual(await p.eval(()=>{
    select('save');ui.editor.command('moveOut',{dir:1});
    return {first:ui.doc.nodes.first.children,second:ui.doc.nodes.second.children};
  }),{first:[],second:['save']});
});

test('tree action buttons retain native Space and Enter activation',opts,async()=>{
  const p=await setup();
  assert.deepEqual(await p.eval(()=>{
    select('save');
    const tree=document.querySelector('.uikit-ins-tree');tree.open=true;tree.dispatchEvent(new Event('toggle'));
    const button=document.querySelector('.uikit-ins-tree-row[data-node-id=save] .uikit-ins-tree-rename');
    button.focus();
    return ['Enter',' '].map(key=>{
      const e=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});button.dispatchEvent(e);return e.defaultPrevented;
    });
  }),[false,false]);
});

test('Enter commits coordinate inputs before confirming a precision session',opts,async()=>{
  const p=await setup();
  assert.deepEqual(await p.eval(async()=>{
    await ui.edit(false);
    const {startTouchPrecisionTrial}=await import('/js/touch_precision_ui.js');
    const canvas=document.createElement('canvas');canvas.style.cssText='width:400px;height:400px';document.body.appendChild(canvas);
    let confirmed=null;
    startTouchPrecisionTrial({canvas,mode:'rough',x:20,y:30,screenToModel:p=>p,modelToScreen:p=>p,onConfirm:p=>{confirmed=p;}});
    const input=document.querySelector('.touch-refine-coordinates input');input.focus();input.value='125';
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    return {confirmed,closed:!document.querySelector('.touch-precision-session')};
  }),{confirmed:{x:125,y:30},closed:true});
});

test('viewport swap restores a late parent or its original detached state',opts,async()=>{
  const p=await setup();
  assert.deepEqual(await p.eval(async()=>{
    const {createViewportSwap}=await import('/js/editor_view.js');
    const bigHost=document.createElement('section'),home=document.createElement('section');document.body.append(bigHost,home);
    const wrap=document.createElement('div'),anchor=document.createElement('span');
    const swap=createViewportSwap({wrap,bigHost});home.append(wrap,anchor);swap(true);swap(false);
    const lateParent=wrap.parentElement===home&&wrap.nextSibling===anchor;
    const detached=document.createElement('div'),swapDetached=createViewportSwap({wrap:detached,bigHost});
    swapDetached(false);swapDetached(true);swapDetached(false);
    return {lateParent,detached:detached.parentElement===null};
  }),{lateParent:true,detached:true});
});
