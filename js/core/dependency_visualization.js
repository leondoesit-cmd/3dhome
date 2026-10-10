// Exact authored relationships; this graph never solves or mutates CAD.
export const occurrenceDependencyId=path=>'occurrence:'+JSON.stringify(path.map(String));
export const mateDependencyId=(path,kind,id)=>'assembly-mate:'+JSON.stringify([path.map(String),kind,String(id)]);
export function partDependencyGraph(document){
  const nodes=new Map(),edges=[];
  for(const item of [...(document?.sketches||[]),...(document?.features||[])])nodes.set(String(item.id),{id:String(item.id),name:item.name||item.type||item.id,kind:item.type?'feature':'sketch'});
  for(const item of [...(document?.references||[]),...(document?.referenceGeometry||[])]){const id=String(item.id??item.persistentId??'');if(id)nodes.set(id,{id,name:item.name||item.type||id,kind:'reference'});}
  const idOf=ref=>String(ref?.id??ref?.featureId??ref?.persistentId??ref??'');
  const connect=(from,to,label)=>{if(nodes.has(from)&&nodes.has(to)&&from!==to&&!edges.some(e=>e.from===from&&e.to===to))edges.push({from,to,label});};
  for(const sketch of document?.sketches||[]){
    const refs=[sketch.referenceId,sketch.support?.ownerFeatureId,...(sketch.references?.features||[]),...(sketch.references?.references||[])].filter(Boolean).map(idOf);
    for(const from of refs)connect(from,String(sketch.id),'Sketch support');
  }
  for(const reference of [...(document?.references||[]),...(document?.referenceGeometry||[])]){
    const to=idOf(reference);for(const ref of [...(reference.references?.features||[]),...(reference.references?.references||[])])connect(idOf(ref),to,'Reference geometry support');
  }
  for(const feature of document?.features||[]){
    const refs=[...(feature.inputs||[]),...(feature.references?.features||[]),...(feature.references?.sketches||[]),...(feature.references?.references||[])].map(idOf);
    if(feature.params?.sketchId)refs.push(String(feature.params.sketchId));
    for(const ref of feature.references?.topology||[])if(ref.ownerFeatureId)refs.push(String(ref.ownerFeatureId));
    for(const from of new Set(refs))connect(from,String(feature.id),'Authored reference');
  }
  return {nodes,edges};
}
export function assemblyDependencyGraph(assembly){
  const nodes=new Map(),edges=[],issues=[];
  function walk(owner,path,names=[]){
    for(const component of owner?.components||[]){
      if((owner.components||[]).filter(c=>String(c.id)===String(component.id)).length!==1){issues.push({reason:'Ambiguous component occurrence'});continue;}
      const p=path.concat(component.id),id=occurrenceDependencyId(p);
      const label=names.concat(component.name||component.modelKey||String(component.id));
      nodes.set(id,{id,name:label.join(' / '),kind:'component',path:p.map(String)});
      if(component.asm)walk(component.asm,p,label);
    }
    for(const [kind,mates] of [['legacy',owner?.mates],['topology',owner?.topologyMates]])for(const mate of mates||[]){
      const id=mateDependencyId(path,kind,mate.id);
      nodes.set(id,{id,name:names.concat(mate.name||mate.type+' '+mate.id).join(' / '),kind:'mate',suppressed:!!mate.suppressed});
      for(const side of ['a','b']){
        const ref=mate[side],componentId=kind==='topology'?ref?.componentId:ref;
        const matches=(owner.components||[]).filter(c=>String(c.id)===String(componentId));
        let component=matches.length===1?matches[0]:null,p=path.concat(componentId);
        if(componentId==='assembly:origin'){
          const origin=occurrenceDependencyId(p);nodes.set(origin,{id:origin,name:names.concat('Assembly origin').join(' / '),kind:'reference'});
          edges.push({from:origin,to:id,label:`${ref.kind||'Topology'} ${ref.persistentId||''}`,side});continue;
        }
        if(!component){issues.push({mate:id,side,reason:'Missing component occurrence'});continue;}
        // Nested native topology IDs are emitted as exact child-id path prefixes.
        let local=kind==='topology'?String(ref?.persistentId||''):'';
        while(component.asm&&local.includes('/')){
          const prefix=local.slice(0,local.indexOf('/'));
          const matches=(component.asm.components||[]).filter(c=>String(c.id)===prefix);
          if(matches.length!==1){component=null;break;}
          component=matches[0];p.push(component.id);local=local.slice(local.indexOf('/')+1);
        }
        if(!component){issues.push({mate:id,side,reason:'Invalid nested occurrence path'});continue;}
        if(nodes.has(occurrenceDependencyId(p)))edges.push({from:occurrenceDependencyId(p),to:id,label:kind==='topology'?`${ref.kind||'Topology'} ${ref.persistentId||''}`:'Component constraint',side});
      }
    }
  }
  walk(assembly,[]);return {nodes,edges,issues};
}
export function dependencyVisualization(graph,focus,{parents=true,children=true}={}){
  if(!graph.nodes.has(focus))return null;
  const upstream=new Set(),downstream=new Set();
  function visit(id,backward,set){
    for(const edge of graph.edges){const next=backward?(edge.to===id?edge.from:null):(edge.from===id?edge.to:null);
      if(next&&next!==focus&&!set.has(next)){set.add(next);visit(next,backward,set);}}
  }
  if(parents)visit(focus,true,upstream);if(children)visit(focus,false,downstream);
  const included=new Set([focus,...upstream,...downstream]);
  return {focus,upstream,downstream,graph,relations:graph.edges.filter(e=>included.has(e.from)&&included.has(e.to))};
}
