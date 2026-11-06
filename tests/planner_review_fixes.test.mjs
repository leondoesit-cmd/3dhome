import { stylesSource } from "./helpers/styles_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {S} from '../js/state.js';
import {detectRooms} from '../js/geometry.js';
import {roomClearArea} from '../js/room_area.js';
import {roomMinDim} from '../js/room_cons.js';
import {addOpeningFromCorner,conCurrent,solveWallCons,stabilizeOpeningCornerRefs} from '../js/wall_constraints.js';
import {saveUnitSettings} from '../js/unit_settings.js';
import {fmtLen,parseLen} from '../js/display_units.js';

function polygon(points){
  S.nodes=points.map(([x,z])=>({x,z}));
  S.walls=points.map((_,i)=>({id:i+1,a:i,b:(i+1)%points.length,thickness:10,height:270}));
  S.openings=[];S.items=[];S.roomMeta={};S.wallCons=[];S.roomCons=[];S.idc=100;
  return detectRooms()[0];
}

test('usable area is kept separate from reference-line area',()=>{
  const room=polygon([[0,0],[400,0],[400,300],[0,300]]);
  assert.equal(room.area/10000,12);
  assert.equal(roomClearArea(S,room).area,11.31);
});

test('door and island values round-trip through the unit shown by their panel',()=>{
  saveUnitSettings({preset:'imperial',overrides:{}});
  assert.equal(fmtLen(90,{domain:'openings',suffix:false}),'35.4');
  assert.ok(Math.abs(parseLen('35.4','openings')-90)<0.1);
  assert.equal(parseLen('60','openings'),152.4);
  assert.equal(parseLen('108','furniture'),274.32);
  saveUnitSettings({preset:'metric_cm',overrides:{}});
  assert.equal(fmtLen(90,{domain:'openings',suffix:false}),'90');
  assert.equal(parseLen('60','openings'),60);
  assert.equal(parseLen('108','furniture'),108);
});

test('a short wall return is not reported as the room width',()=>{
  const room=polygon([[0,0],[400,0],[400,85],[450,85],[450,215],[400,215],[400,300],[0,300]]);
  assert.equal(Math.round(roomMinDim(room.key)),130);
});

test('an opening corner dimension survives its host wall being split',()=>{
  S.nodes=[{x:0,z:0},{x:400,z:0}];
  S.walls=[{id:1,a:0,b:1,thickness:10,height:270}];
  S.openings=[{id:9,type:'door',wall:1,s:300,width:80,height:205,sill:0}];
  S.items=[];S.wallCons=[];S.roomMeta={};S.idc=20;
  const dimension=addOpeningFromCorner(9,'a');
  stabilizeOpeningCornerRefs(S.walls[0]);
  S.nodes.push({x:200,z:0});
  S.walls[0].b=2;
  S.walls.push({id:2,a:2,b:1,thickness:10,height:270});
  S.openings[0].wall=2;S.openings[0].s=100;
  solveWallCons();
  assert.equal(Math.round(conCurrent(dimension)),Math.round(dimension.value));
  assert.equal(S.openings[0].s,100);
});

test('planner chrome exposes paired doors and visible overflow affordances',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const css=stylesSource();
  const chrome=await readFile(new URL('../js/planner_chrome.js',import.meta.url),'utf8');
  const ui=await readFile(new URL('../js/ui.js',import.meta.url),'utf8');
  const view3d=await readFile(new URL('../js/view3d.js',import.meta.url),'utf8');
  assert.match(html,/option value="double"/);
  assert.match(html,/id="o_leaf_a"/);
  assert.match(html,/id="o_swing_grid"/);
  assert.match(css,/#plan-toolbar::-webkit-scrollbar \{ width: 6px/);
  assert.doesNotMatch(css,/#view-2d\.plan-tiny \.layer-chips \{ display: none/);
  assert.match(chrome,/resetLayers\(\);/);
  assert.match(ui,/parseFieldLength\(this\.value, id\)/);
  assert.match(view3d,/userData\.type = "double"/);
});
