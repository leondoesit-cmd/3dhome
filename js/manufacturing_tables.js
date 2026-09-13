import { STANDARD_DIMENSION_TABLES } from "./cad_standards.js";
import { STANDARD_PITCH_MM } from "./cad_knurl.js";
import * as fasteners from './toolbox/fastener_tables.js';
import * as pipes from './toolbox/pipe_tables.js';
import * as hardware from './toolbox/hardware_tables.js';
import {METRIC_HOLE_TABLE} from './cad_hole_wizard.js';
import {FIT_TABLE_DATA} from './cad_fits.js';
import {STOCK_MATERIALS} from './cad_appearances.js';

// Provenance is explicit even when it is missing. A local nominal table is
// useful for geometry, but is not evidence of a licensed standard edition.
const modules={standards:STANDARD_DIMENSION_TABLES,knurl:{STANDARD_PITCH_MM},fasteners,pipes,hardware,holes:{METRIC_HOLE_TABLE},fits:{FIT_TABLE_DATA},materials:{STOCK_MATERIALS}};
const paths={standards:'js/cad_standards.js',knurl:'js/cad_knurl.js',fasteners:'js/toolbox/fastener_tables.js',pipes:'js/toolbox/pipe_tables.js',hardware:'js/toolbox/hardware_tables.js',holes:'js/cad_hole_wizard.js',fits:'js/cad_fits.js',materials:'js/cad_appearances.js'};
export const MANUFACTURING_TABLES=Object.freeze(Object.fromEntries(Object.entries(modules).flatMap(([family,exports])=>Object.entries(exports)
  .filter(([,value])=>value&&typeof value==='object')
  .map(([name,data])=>[family+'.'+name,Object.freeze({id:family+'.'+name,family,data,
    source:{kind:'local-nominal-table',path:paths[family],reference:null},edition:null,verification:'unverified-edition',
    supportedKeys:Object.freeze(Array.isArray(data)?data.map(String):Object.keys(data)),interpolation:false,
    ...(family==='fits'?{source:{kind:'published-numeric-table',path:paths.fits,reference:FIT_TABLE_DATA.source,corrigendum:FIT_TABLE_DATA.corrigendum,sha256:FIT_TABLE_DATA.sha256},edition:FIT_TABLE_DATA.edition,verification:'numeric-widths-and-corrigenda-checked',supportedKeys:Object.freeze(Object.keys(FIT_TABLE_DATA.limits)),supportedRange:{diameterMm:{minExclusive:0,maxInclusive:3150},coverage:'Exact bands by tolerance class in data.limits; blank and footnote-restricted entries are unsupported'}}:{}),
    ...(family==='holes'?{fieldSources:{clearance:{fields:['closeMm','normalMm','looseMm'],source:'https://www.albanycountyfasteners.com/media/6b/b8/g0/1764944339/clearance-hole-chart.pdf?ts=1764944339',edition:'supplier-chart-2025',verification:'supplier-chart-checked'},tapDrill:{method:'nominal diameter minus pitch, rounded to available drill size',verification:'approximation'}}}:{}),
  })]))));

export function validateManufacturingTables(tables=MANUFACTURING_TABLES){
  const issues=[];
  const visit=(value,path)=>{
    if(typeof value==='number'&&!Number.isFinite(value))issues.push({code:'non-finite-table-value',path});
    if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))visit(item,path+'.'+key);
  };
  for(const [id,table]of Object.entries(tables)){
    if(!table.source?.path || !Object.hasOwn(table,'edition') || !table.supportedKeys?.length)issues.push({code:'incomplete-table-provenance',tableId:id});
    visit(table.data,id);
    if(table.family==='holes')for(const row of Object.values(table.data)){
      if(!(row.diameterMm<row.closeMm&&row.closeMm<row.normalMm&&row.normalMm<row.looseMm))issues.push({code:'invalid-clearance-series',tableId:id,size:row.size});
      if(Math.abs(row.tapDrillMm-(row.diameterMm-row.pitchMm))>0.051)issues.push({code:'invalid-tap-drill',tableId:id,size:row.size});
    }
    if(table.family==='fits'){
      const rows=table.data.ranges;
      if(!rows.every((r,i)=>r.max>(rows[i-1]?.max||0)&&Object.values(r.it).every(v=>v>0)))issues.push({code:'invalid-fit-ranges',tableId:id});
      for(const [key,bands] of Object.entries(table.data.limits))for(let i=0;i<bands.length;i++){
        const [min,max,lower,upper]=bands[i],grade=key.match(/\d+/)?.[0],it=rows.find(r=>max<=r.max)?.it[grade];
        if(!(min<max)||i&&min<bands[i-1][1]||!Number.isFinite(it)||Math.abs(upper-lower-it)>1e-6)issues.push({code:'invalid-fit-limit-band',tableId:id,key,min,max});
      }
    }
  }
  return {ok:!issues.length,issues,tableCount:Object.keys(tables).length};
}

export function manufacturingTableSupport(id,{key,edition,requireVerified=false}={}){
  const table=MANUFACTURING_TABLES[id];
  if(!table)return {ok:false,code:'unknown-table'};
  if(key!=null&&!table.supportedKeys.includes(String(key)))return {ok:false,code:'size-not-in-table',table};
  if((edition&&edition!==table.edition)||requireVerified)return {ok:false,code:'verified-edition-unavailable',table};
  return {ok:true,code:'nominal-geometry-only',table};
}
