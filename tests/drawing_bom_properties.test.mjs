import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateBOM} from '../js/cad_interference.js';
import {assemblyPartNumber} from '../js/core/custom_properties.js';
import {buildDrawingScene} from '../js/cad_drawings.js';
import {sceneToSvg} from '../js/cad_sheet.js';

test('assembly sheet export respects ANSI Letter, explicit scale and title fields',()=>{
  const scene=buildDrawingScene({kind:'assembly',name:'LINKS',parts:[{id:1,kind:'box',x0:0,x1:10,y0:0,y1:1,z0:0,z1:2}]},
    {size:'Letter',orientation:'landscape',draftingStandard:'ANSI',units:'in',projection:'third',scale:[1,1],views:['iso'],
      title:'LINK',number:'56-7789',revision:'A',company:'D&M ENGINEERING',author:'Designer',date:'2026-09-30',balloons:[]});
  assert.deepEqual(scene.scale,[1,1]);
  assert.equal(scene.views.find(view=>view.id===scene.primaryId).scale,1,'sole isometric uses the title-block sheet scale');
  const svg=sceneToSvg(scene);
  assert.match(svg,/width="279\.4mm"/);
  assert.match(svg,/height="215\.9mm"/);
  const text=scene.items.filter(item=>item.type==='text').map(item=>item.text);
  for(const expected of ['LINK','56-7789','D&M ENGINEERING','Designer','2026-09-30']) assert.ok(text.includes(expected),expected);
  assert.ok(text.some(value=>value.includes('1:1')));
  assert.ok(!text.some(value=>value.includes('2:1')||value.includes('4:1')));
});

test('parts-only drawing BOM retains document properties and assigned stock material',()=>{
  const def={customProperties:{PartNo:'GIDS-SC-10009-7',Description:'7HOLES'},parts:[{materialCatalogId:'stock:aluminum2014'}]};
  const rows=generateBOM({components:[{modelKey:'bar7',name:'Long source library name',def},{modelKey:'bar7',def},
    {modelKey:'collar',def:{customProperties:{Number:'GIDS-SC-10012-3-16',Description:'SHAFT-COLLAR',Material:'1060 Alloy'}}}]});
  assert.equal(rows[0].quantity,2);
  assert.equal(rows[0].partNumber,'GIDS-SC-10009-7');
  assert.equal(rows[0].description,'7HOLES');
  assert.equal(rows[0].material,'Aluminum 2014');
  assert.equal(rows[1].partNumber,'GIDS-SC-10012-3-16');
  assert.equal(rows[1].material,'1060 Alloy');
  const scene=buildDrawingScene({kind:'assembly',parts:[]},{views:['iso'],balloons:rows.map((row,i)=>({...row,item:i+1,qty:row.quantity}))});
  const text=scene.items.filter(item=>item.type==='text').map(item=>item.text);
  assert.ok(text.includes('PART NUMBER'));
  assert.ok(text.includes('GIDS-SC-10009-7'));
  assert.ok(text.includes('7HOLES'));
  assert.ok(text.includes('Aluminum 2014'));
  assert.ok(text.includes('1060 Alloy'));
});

test('long BOM descriptions fit their cell and preserve the full exported tooltip',()=>{
  const description='A long source description '.repeat(30);
  const scene=buildDrawingScene({kind:'assembly',parts:[]},{views:['iso'],balloons:[{item:1,name:'Source',description,qty:1}]});
  const cell=scene.items.find(item=>item.fullText===description && item.text.endsWith('…'));
  assert.ok(cell.text.endsWith('…'));
  assert.ok(cell.text.length<description.length);
  assert.ok(cell.size>=1.8);
});

test('ANSI A bench vice BOM wraps full descriptions and materials without changing properties',()=>{
  const descriptions=['Base','Base Plate','Movable jaw','Clamping plate underside keeper','Jaw screw','Screw bar','Socketed bar globe','Foot hex screw','Stepped retention bolt','Keeper screw'];
  const rows=descriptions.map((name,index)=>({item:index+1,partNumber:`BV${String(index+1).padStart(2,'0')}`,description:`BENCH VICE - ${name} - original designer example`,material:'Alloy Steel (SOLIDWORKS reference)',qty:1}));
  const before=JSON.stringify(rows);
  const scene=buildDrawingScene({kind:'assembly',parts:[]},{size:'Letter',views:['iso'],balloons:rows,overallDimensions:false});
  const frame=scene.items.find(item=>item.type==='rect' && item.fill==='#ffffff' && item.w===120);
  // The title block has the same width; the BOM is the upper white frame.
  const table=scene.items.filter(item=>item.type==='rect' && item.fill==='#ffffff' && item.w===120).sort((a,b)=>a.y-b.y)[0];
  assert.ok(frame && table);
  assert.ok(table.h>66,'rows grow to accommodate wrapping');
  assert.ok(table.y+table.h<165.9,'table stays above the title block on ANSI A');
  for(const row of rows){
    for(const value of [row.description,row.material]){
      const lines=scene.items.filter(item=>item.fullText===value && item.x>=table.x && item.x<table.x+table.w);
      // Repeated materials appear once for every row; each occurrence is fully visible.
      const expected=value===row.material ? value.repeat(rows.length) : value;
      assert.equal(lines.map(item=>item.text).join(' ').replace(/\s/g,''),expected.replace(/\s/g,''));
      for(const item of lines){assert.ok(item.size>=2);assert.ok(item.y>table.y && item.y<table.y+table.h);}
    }
  }
  assert.equal(JSON.stringify(rows),before);
  assert.match(sceneToSvg(scene),/<title>BENCH VICE - Clamping plate underside keeper - original designer example<\/title>/);
});

test('Letter assembly BOM reserves a band above a sole isometric view',()=>{
  const scene=buildDrawingScene({kind:'assembly',parts:[{id:'link',kind:'box',x0:0,x1:11.43,y0:0,y1:0.1524,z0:0,z1:5}]},
    {size:'Letter',scale:[1,1],views:['iso'],overallDimensions:false,balloons:Array.from({length:4},(_,i)=>({item:i+1,name:'Part '+i,qty:1}))});
  const table=scene.items.find(item=>item.type==='rect'&&item.style==='frame'&&item.fill==='#ffffff'&&item.h===30);
  assert.ok(table,'BOM frame exists');
  for(const view of scene.views) assert.ok(view.box.y>=table.y+table.h+12,'geometry stays below BOM');
  assert.equal(scene.dims.size,0,'assembly sheet does not invent isometric overall dimensions');
});

test('instance part number takes precedence without replacing the source document',()=>{
  const def={customProperties:{PartNo:'SOURCE',Description:'SOURCE DESCRIPTION'}};
  const row=generateBOM({components:[{modelKey:'source',def,customProperties:{PartNumber:'INSTANCE',Description:'INSTANCE DESCRIPTION'}}]})[0];
  assert.equal(row.partNumber,'INSTANCE');
  assert.equal(row.description,'INSTANCE DESCRIPTION');
  assert.equal(def.customProperties.PartNo,'SOURCE');
});

test('fresh browser-exported book part numbers appear in the BOM reader',()=>{
  const source=(name)=>JSON.parse(readFileSync(new URL(`../artifacts/planchard/${name}-browser-2026-10-03.mforge`,import.meta.url),'utf8')).mainModel;
  const base=source('DP01-base'),bracket=source('DP02-bracket'),brace=source('DP03-brace');
  assert.equal(base.customProperties['Part number'],'6');
  assert.equal(bracket.customProperties.BookPartNumber,'5');
  assert.equal(brace.customProperties.BookPartNumber,'2');
  const rows=generateBOM({components:[{modelKey:base.key,name:base.name,def:base},{modelKey:bracket.key,name:bracket.name,def:bracket},{modelKey:brace.key,name:brace.name,def:brace}]});
  assert.deepEqual(rows.map(row=>row.partNumber),['6','5','2']);
  assert.equal(assemblyPartNumber({def:base}),'6');
  assert.equal(assemblyPartNumber({def:bracket}),'5');
  assert.equal(assemblyPartNumber({def:brace}),'2');
});

test('canonical part numbers keep their existing priority over book aliases',()=>{
  const source={customProperties:{PartNo:'SOURCE',BookPartNumber:'BOOK SOURCE','Part number':'HUMAN SOURCE'}};
  const comp={def:source,customProperties:{PartNumber:'INSTANCE',BookPartNumber:'BOOK INSTANCE'}};
  assert.equal(assemblyPartNumber(comp),'INSTANCE');
  assert.equal(generateBOM({components:[{modelKey:'x',...comp}]})[0].partNumber,'INSTANCE');
  delete comp.customProperties.PartNumber;
  assert.equal(assemblyPartNumber(comp),'SOURCE');
  delete source.customProperties.PartNo;
  assert.equal(assemblyPartNumber(comp),'BOOK INSTANCE');
  delete comp.customProperties.BookPartNumber;
  assert.equal(assemblyPartNumber(comp),'BOOK SOURCE');
  delete source.customProperties.BookPartNumber;
  assert.equal(assemblyPartNumber(comp),'HUMAN SOURCE');
});
