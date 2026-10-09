import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateBOM} from '../js/cad_interference.js';
import {assemblyDrawingBOM,occurrenceBOMKey} from '../js/core/assembly_drawing_bom.js';
import {bomTableRows} from '../js/modeler_commands.js';

const bar=(id,cfg,partNumber,material='Aluminum 2014')=>({id,modelKey:'shared-bar',configurationId:cfg,
 name:'Occurrence '+id,customProperties:{PartNo:partNumber,Description:cfg},def:{material}});

test('shared bar configurations and printed occurrence numbers produce three distinct BOM rows',()=>{
 const assembly={components:[bar(1,'7HOLES','GIDS-7'),bar(2,'5HOLES','GIDS-5'),bar(3,'3HOLES','GIDS-3','Aluminum 1060')]};
 const before=JSON.stringify(assembly),rows=generateBOM(assembly);
 assert.deepEqual(rows.map(row=>[row.partNumber,row.description,row.material,row.quantity]),[
  ['GIDS-7','7HOLES','Aluminum 2014',1],['GIDS-5','5HOLES','Aluminum 2014',1],['GIDS-3','3HOLES','Aluminum 1060',1]]);
 assert.equal(new Set(rows.map(row=>row.key)).size,3);
 assert.deepEqual(bomTableRows(rows,assembly.components).map(row=>[row.description,row.material]),rows.map(row=>[row.description,row.material]));
 assert.equal(JSON.stringify(assembly),before,'BOM reading never changes model/configuration/material data');
});

test('configuration identity separates otherwise identical rows; equivalent repeated occurrences still combine',()=>{
 const a=bar(1,'cfg-a','PN'),b=bar(2,'cfg-b','PN'),repeat=bar(3,'cfg-a','PN');
 b.customProperties.Description=a.customProperties.Description;
 const rows=generateBOM({components:[a,b,repeat]});
 assert.deepEqual(rows.map(row=>row.quantity),[2,1]);
});

test('different occurrence number, description or material overrides cannot silently merge',()=>{
 const base=bar(1,'same','PN');
 const variants=['PartNo','Description','Material'].map((key,index)=>{
  const copy=structuredClone(base);copy.id=index+2;copy.customProperties[key]='Override '+key;return copy;
 });
 const rows=generateBOM({components:[base,...variants]});
 assert.equal(rows.length,4);assert.ok(rows.every(row=>row.quantity===1));
 assert.equal(rows[3].material,'Override Material');
});

test('actual LINKS browser export produces four rows and correct leaf balloon identities in both scopes',()=>{
 const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/LINKS-reference-material-bom-repaired-browser-2026-10-09.mforge',import.meta.url),'utf8'));
 const assembly=bundle.assemblies.find(item=>item.key==='asm_mun6h15b');assert.ok(assembly);
 const before=JSON.stringify(assembly);
 for(const scope of ['partsOnly','indented']){
  const bom=assemblyDrawingBOM(assembly,scope);
  assert.equal(bom.rows.length,4);assert.ok(bom.rows.every(row=>row.quantity===1));
  assert.deepEqual(bom.rows.map(row=>row.partNumber),['GIDS-SC-10009-7','GIDS-SC-10009-5','GIDS-SC-10009-3','GIDS-SC-10012-3-16']);
  for(const [index,component] of assembly.components.entries())assert.equal(String(bom.itemByPath.get(occurrenceBOMKey([component.id]))),String(index+1));
  // Read the actual material as saved; grouping must not "repair" the second
  // occurrence's still-1060 definition or fabricate a printed source grade.
  assert.equal(bom.rows[0].material,'Aluminum 2014');
  assert.equal(bom.rows[1].material,'Aluminum 1060');
 }
 assert.equal(JSON.stringify(assembly),before);
});
