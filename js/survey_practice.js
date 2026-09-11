export const PRACTICE_SCENARIOS=['rectangle','connected','multilevel','site'];
export function practiceDocument(kind) {
  if(!PRACTICE_SCENARIOS.includes(kind))throw new Error('SURVEY_SCENARIO_INVALID');
  const nodes=[],walls=[],openings=[],nodeIds=new Map(),wallIds=new Map();
  const node=(x,z)=>{const key=x+','+z;if(!nodeIds.has(key)){nodeIds.set(key,nodes.length);nodes.push({x,z});}return nodeIds.get(key);};
  const loop=points=>points.forEach((p,i)=>{const q=points[(i+1)%points.length],a=node(...p),b=node(...q),key=[a,b].sort((a,b)=>a-b).join(':');if(!wallIds.has(key)){const id='practice-wall-'+walls.length;wallIds.set(key,id);walls.push({id,a,b,thickness:10,height:270,phase:'existing'});}});
  if(kind==='rectangle')loop([[0,0],[400,0],[400,300],[0,300]]);
  else if(kind==='multilevel'){loop([[0,0],[400,0],[400,650],[0,650]]);walls.forEach(w=>w.height=300);}
  else if(kind==='connected'){
    loop([[0,0],[350,0],[350,300],[0,300]]);
    loop([[350,0],[650,0],[650,150],[550,150],[550,300],[350,300]]);
  }else loop([[0,0],[500,0],[500,400],[0,400]]);
  openings.push({id:'practice-door',wall:walls[0].id,type:'door',s:120,width:85,height:205,sill:0});
  if(kind==='connected'){const shared=walls.find(w=>nodes[w.a].x===350&&nodes[w.b].x===350);openings.push({id:'practice-link',wall:shared.id,type:'passage',s:150,width:90,height:210,sill:0});}
  const scene={nodes,walls,openings,items:[],roomMeta:{},idc:1000,surveyFeatures:kind==='site'?[
    {id:'site-outline',kind:'polyline',category:'boundary',label:'Observed site perimeter',points:[{x:-200,y:0,z:-200},{x:900,y:0,z:-200},{x:900,y:30,z:700},{x:-200,y:0,z:700},{x:-200,y:0,z:-200}]},
    {id:'roof-west',kind:'face',category:'roof',label:'Roof west',points:[{x:0,y:270,z:0},{x:250,y:400,z:0},{x:250,y:400,z:400},{x:0,y:270,z:400}]},
    {id:'roof-east',kind:'face',category:'roof',label:'Roof east',points:[{x:250,y:400,z:0},{x:500,y:270,z:0},{x:500,y:270,z:400},{x:250,y:400,z:400}]}]:[]};
  const copy=()=>JSON.parse(JSON.stringify(scene));
  const floors=[{id:'practice-ground',name:'Ground',elevation:0,scene:copy()}];
  if(kind==='multilevel'){
    // A long straight flight with a linked opening in the upper slab.
    scene.items.push({id:'practice-stairs',type:'stairs',x:200,z:325,w:110,d:400,h:300,configuration:{stepCount:18},elev:0,rot:0});
    floors[0].scene=copy();const upper=copy();upper.items=[];upper.slabOpenings=[{id:'practice-void',stairsId:'practice-stairs',x:200,z:325,w:110,d:400,rot:0}];
    floors.push({id:'practice-upper',name:'Upper',elevation:300,scene:upper});
  }
  return {...scene,workspace:{id:'practice-'+kind,documentKey:'practice-'+kind,role:'owner',name:'Survey practice',floors,activeFloor:'practice-ground',baselines:[],redesign:{},survey:{enabled:true,mode:'practice',scenario:kind}}};
}
