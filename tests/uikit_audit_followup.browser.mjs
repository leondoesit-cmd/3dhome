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
    const kit=await import('/uikit/index.js');
    const {createIconContract}=await import('/js/uikit_host/icon_overrides.js');
    const {createLabelContract}=await import('/js/uikit_host/texts.js');
    window.kit=kit;
    document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="/uikit/uikit.css">');
    document.body.innerHTML='<main id="mount" style="width:600px;min-height:400px"><button id="save"><i class="ph ph-floppy-disk"></i><span>Save</span></button></main>';
    window.defaults={v:1,variants:{base:{root:'root',patch:{}},phone:{root:'root',patch:{}}},nodes:{
      root:{type:'dock',children:['first','second']},first:{type:'group',children:['save','open'],label:'First'},second:{type:'group',children:['other']},
      save:{type:'item',ref:'save',constraints:{resize:'none'}},open:{type:'item',ref:'open'},other:{type:'item',ref:'other'},
    },overrides:{text:{},tokens:{}}};
    const records=new Map();window.records=records;
    window.storage={load:k=>records.get(k)||null,save:(k,v)=>{records.set(k,v);return true;},clear:k=>records.delete(k)};
    window.ui=kit.createUIKit({mount:document.querySelector('#mount'),defaults,storage,
      registry:[{id:'save',title:'Save',kind:'command',constraints:{hide:false},adopt:()=>document.querySelector('#save')},
        {id:'open',title:'Open',kind:'command'},{id:'other',title:'Other',kind:'command'}],
      labels:createLabelContract(document,()=>ui.doc.overrides.text),
      icons:{...createIconContract(),list:()=>['star'],render:(name,el)=>{el.textContent=name;}},
      tokens:[{name:'--accent',type:'text',label:'Accent'}],i18n:{lang:()=> 'en'},
    });
    ui.mount();await ui.edit(true);ui.refreshNow();
    window.select=(id,additive=false)=>{ui.editor.command('select',{id,additive});ui.refreshNow();};
    window.tree=()=>{const el=document.querySelector('.uikit-ins-tree');el.open=true;el.dispatchEvent(new Event('toggle'));return el;};
    window.row=id=>tree().querySelector('[data-node-id="'+id+'"]');
    window.frame=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  });
  return page;
}

test('canvas snapshots carry root canvas pixels and live form values',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(async()=>{
    const {snapshot}=await import('/uikit/editor/ghost.js');
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;canvas.getContext('2d').fillStyle='#ff0000';canvas.getContext('2d').fillRect(0,0,8,8);
    const shot=snapshot(canvas,{w:8,h:8});const rgba=[...shot.querySelector('canvas').getContext('2d').getImageData(1,1,1,1).data];
    const input=document.createElement('textarea');input.value='Unsaved text';const text=snapshot(input,{w:100,h:50}).querySelector('textarea').value;
    return {rgba,text};
  }),{rgba:[255,0,0,255],text:'Unsaved text'});
});

test('tree double clicks drill once and inline Escape cancels without leaving editor',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    const r=row('first');const original=ui.editor.focus;
    // Real click sequence; the tree recreates the row after selection.
    r.click();row('first').click();row('first').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
    const focus=original();
    row('save').querySelector('.uikit-ins-tree-rename').click();const input=document.querySelector('.uikit-ins-tree-inline-input');
    input.value='Never commit';const event=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});input.dispatchEvent(event);
    return {focus,prevented:event.defaultPrevented,editing:ui.editing,label:ui.doc.nodes.save.label??null,inline:!!document.querySelector('.uikit-ins-tree-inline-input')};
  }),{focus:'first',prevented:true,editing:true,label:null,inline:false});
});

test('tree inline Enter prevents form defaults and commits',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    row('save').querySelector('.uikit-ins-tree-rename').click();const input=document.querySelector('.uikit-ins-tree-inline-input');input.value='Saved name';
    const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.dispatchEvent(event);
    return {prevented:event.defaultPrevented,label:ui.doc.nodes.save.label};
  }),{prevented:true,label:'Saved name'});
});

test('deselecting and reselecting an item expands its ancestors again',opts,async()=>{
  const p=await setup();assert.equal(await p.eval(()=>{
    select('save');row('first').querySelector('.uikit-ins-tree-mark').click();select(null);select('save');
    return !!row('save');
  }),true);
});

test('multi-selection hide is one undo step and respects inherited protection',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    select('save');select('open',true);select('other',true);ui.editor.command('hide');
    const hidden=['save','open','other'].map(id=>!!ui.doc.nodes[id].hidden);ui.undo();
    return {hidden,undo:['save','open','other'].map(id=>!!ui.doc.nodes[id].hidden)};
  }),{hidden:[false,true,true],undo:[false,false,false]});
});

test('divider insertion follows the selected child instead of targeting a resolved leaf',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    select('save');ui.editor.command('insertSeparator');return ui.doc.nodes.first.children.map(id=>ui.doc.nodes[id].type);
  }),['item','separator','item']);
});

test('reset confirmation Escape dismisses only the confirmation',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    document.querySelector('.uikit-ins-danger').click();const confirmation=document.querySelector('.uikit-ins-confirm');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    return {hidden:confirmation.hidden,editing:ui.editing};
  }),{hidden:true,editing:true});
});

test('customize suppresses host context menus but leaves text-field menus available',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    let host=0;document.querySelector('#save').addEventListener('contextmenu',()=>host++);
    const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('#save').dispatchEvent(event);
    const input=document.querySelector('[data-uikit-field=label]');const textEvent=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});input.dispatchEvent(textEvent);
    return {host,prevented:event.defaultPrevented,textPrevented:textEvent.defaultPrevented};
  }),{host:0,prevented:true,textPrevented:false});
});

test('adopted icon edits reach the glyph and restore exact host markup on unmount',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    const icon=document.querySelector('#save i');const before=icon.className;
    ui.editor.command('reicon',{id:'save',icon:'ph-star'});const changed=icon.classList.contains('ph-star');
    ui.unmount();return {changed,restored:icon.className===before};
  }),{changed:true,restored:true});
});

test('untagged button labels update without destroying glyphs or container children',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    const button=document.querySelector('#save'),icon=button.querySelector('i');ui.editor.command('retitle',{id:'save',label:'Keep'});
    const changed=button.querySelector('span').textContent;ui.editor.command('retitle',{id:'first',label:'Tools'});
    const intact=button.querySelector('i')===icon;ui.unmount();return {changed,intact,restored:button.querySelector('span').textContent};
  }),{changed:'Keep',intact:true,restored:'Save'});
});

test('memory-backed named layouts are immutable snapshots and individually deletable',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    ui.saveNamedLayout('Original');const id=ui.savedLayouts()[0].id;ui.doc.nodes.first.label='Mutated externally';
    const saved=records.get('layout:saved')[0].doc.nodes.first.label;
    const deleted=ui.deleteNamedLayout(id);return {saved,deleted,count:ui.savedLayouts().length};
  }),{saved:'First',deleted:true,count:0});
});

test('reset clears retired saved scopes on opaque storage adapters',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    ui.setVariant('tablet');ui.saveNamedLayout('Tablet');ui.setVariant('base');ui.resetAll();
    return {retired:records.has('layout:saved:tablet'),index:records.has('layout:saved-scopes')};
  }),{retired:false,index:false});
});

test('saved layout delete control removes only its own entry',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    ui.saveNamedLayout('One');ui.saveNamedLayout('Two');
    ui.editor.refreshLanguage();document.querySelector('.uikit-ins-delete-layout').click();return ui.savedLayouts().map(l=>l.name);
  }),['Two']);
});

test('shorthand theme colors get a distinct darker hover color',opts,async()=>{
  const p=await setup();assert.equal(await p.eval(()=>{
    const input=document.querySelector('[data-token="--accent"]');input.value='#48f';input.dispatchEvent(new Event('input',{bubbles:true}));
    return ui.doc.overrides.tokens['--accent-hover'];
  }),'#3a75db');
});

test('language repaint preserves selection, tree search, expansion and an inline draft',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    select('save');const search=tree().querySelector('input[type=search]');search.value='Save';search.dispatchEvent(new Event('input',{bubbles:true}));
    row('save').querySelector('.uikit-ins-tree-rename').click();document.querySelector('.uikit-ins-tree-inline-input').value='Half typed';
    ui.editor.refreshLanguage();
    return {selection:ui.editor.selection(),open:tree().open,query:tree().querySelector('input[type=search]').value,draft:document.querySelector('.uikit-ins-tree-inline-input')?.value};
  }),{selection:['save'],open:true,query:'save',draft:'Half typed'});
});

test('layout import invokes host migration and reports migration errors without applying',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(async()=>{
    ui.unmount();let calls=0;
    const instance=kit.createUIKit({mount:document.querySelector('#mount'),defaults,migrateDocument:raw=>{calls++;if(raw.fail)throw Error('bad');return {...raw,nodes:{...raw.nodes,root:{...raw.nodes.root,label:'Migrated'}}};}});
    instance.mount();calls=0;const result=instance.importLayout(JSON.stringify(defaults));const label=instance.doc.nodes.root.label;
    const before=instance.doc;const bad=instance.importLayout({fail:true});const unchanged=instance.doc===before;instance.unmount();
    return {ok:result.ok,calls,label,bad:bad.ok,unchanged};
  }),{ok:true,calls:2,label:'Migrated',bad:false,unchanged:true});
});

test('tree dwell expansion keeps the source row connected and marked while dragging',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(async()=>{
    tree();await frame();row('second').querySelector('.uikit-ins-tree-mark').click();
    const source=row('save'),a=source.getBoundingClientRect(),b=row('second').getBoundingClientRect();
    source.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerType:'mouse',clientX:a.x+50,clientY:a.y+a.height/2,bubbles:true}));
    document.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:b.x+50,clientY:b.y+b.height/2,bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,650));
    const result={connected:!!document.querySelector('.uikit-ins-tree-row.is-dragging')?.isConnected,expanded:row('second').getAttribute('aria-expanded')};
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return result;
  }),{connected:true,expanded:'true'});
});

test('ResizeObserver releases replaced layout elements during an editing session',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(async()=>{
    await ui.edit(false);const Original=window.ResizeObserver,observed=new Set();let unobserved=0;
    window.ResizeObserver=class{observe(el){observed.add(el);}unobserve(el){observed.delete(el);unobserved++;}disconnect(){observed.clear();}};
    try{
      await ui.edit(true);ui.editor.sync();const old=ui.wrapperFor('first');
      const next=structuredClone(ui.doc);next.nodes.root.children=['second'];ui.setDoc(next);ui.refreshNow();ui.editor.sync();
      return {released:!observed.has(old),unobserved:unobserved>0};
    }finally{await ui.edit(false);window.ResizeObserver=Original;}
  }),{released:true,unobserved:true});
});

test('file read failure displays feedback and keeps the document',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(()=>{
    const Original=window.FileReader;window.FileReader=class{readAsText(){this.onerror();}};
    try{
      const input=document.querySelector('input[type=file]'),before=ui.doc;
      Object.defineProperty(input,'files',{value:[new File(['x'],'layout.json')]});input.dispatchEvent(new Event('change',{bubbles:true}));
      return {message:document.querySelector('.uikit-ins-feedback').textContent,unchanged:before===ui.doc};
    }finally{window.FileReader=Original;}
  }),{message:'Could not read file.',unchanged:true});
});

test('anchorless icon picker has explicit centered viewport placement',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(async()=>{
    const {openIconPicker}=await import('/uikit/editor/icon_picker.js');
    const picker=openIconPicker({document,icons:{list:()=>[]}});const r=picker.getBoundingClientRect();
    const centered=Math.abs(r.left+r.width/2-document.documentElement.clientWidth/2)<2;
    const placed=!!picker.style.left&&!!picker.style.top;picker.__cleanup();return{centered,placed};
  }),{centered:true,placed:true});
});

test('borrowed overlay slots define floating drag coordinates without adding host classes',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(async()=>{
    ui.unmount();const host=document.createElement('section');host.style.cssText='position:absolute;left:120px;top:100px;width:500px;height:400px';document.body.appendChild(host);
    const layout={v:1,nodes:{root:{type:'dock',children:['float']},float:{type:'float',children:[],rect:{x:40,y:50,w:120,h:90}}},variants:{base:{root:'root'}},overrides:{}};
    const instance=kit.createUIKit({mount:document.querySelector('#mount'),defaults:layout,slots:{overlay:host}});instance.mount();await instance.edit(true);instance.refreshNow();await frame();
    const element=instance.wrapperFor('float'),r=element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:5,pointerType:'mouse',clientX:r.x+45,clientY:r.y+35,bubbles:true}));
    document.dispatchEvent(new PointerEvent('pointermove',{pointerId:5,pointerType:'mouse',clientX:r.x+65,clientY:r.y+65,bubbles:true}));
    const rect=instance.doc.nodes.float.rect;document.dispatchEvent(new PointerEvent('pointerup',{pointerId:5,bubbles:true}));const decorated=host.classList.contains('uikit-slot');instance.unmount();
    return {x:rect.x,y:rect.y,decorated};
  }),{x:60,y:80,decorated:false});
});

test('long press drills into a container without subsequently dragging the old parent',opts,async()=>{
  const p=await setup();assert.deepEqual(await p.eval(async()=>{
    const element=ui.wrapperFor('save'),r=element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:6,pointerType:'touch',clientX:r.x+10,clientY:r.y+10,bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,550));const before=ui.doc;
    document.dispatchEvent(new PointerEvent('pointermove',{pointerId:6,pointerType:'touch',clientX:r.x+200,clientY:r.y+100,bubbles:true}));
    document.dispatchEvent(new PointerEvent('pointerup',{pointerId:6,pointerType:'touch',clientX:r.x+200,clientY:r.y+100,bubbles:true}));
    return{focus:ui.editor.focus(),selection:ui.editor.selection(),unchanged:before===ui.doc};
  }),{focus:'first',selection:['save'],unchanged:true});
});
