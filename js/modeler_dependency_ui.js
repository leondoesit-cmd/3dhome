const hosts=new WeakMap();
export function dependencyTreeIndex(model){
  const index=new Map();
  function walk(nodes,parent){for(const node of nodes||[]){index.set(node.id,{node,parent});walk(node.children,node.id);}}
  walk(model?.nodes,null);return index;
}
export function dependencyTreeAnchor(index,target,visible){
  const candidates=[...index.values()].filter(({node})=>(node.dependencyId||node.targetId)===target);
  for(const candidate of candidates){let item=candidate;
    while(item){if(visible.has(item.node.id))return {id:item.node.id,collapsed:item!==candidate};item=index.get(item.parent);}}
  return null;
}
function element(tag,cls,text){const node=document.createElement(tag);node.className=cls||'';if(text!==undefined)node.textContent=text;return node;}
function rowVisible(row){
  const r=row.getBoundingClientRect();if(!r.width||!r.height||r.bottom<=0||r.top>=window.innerHeight)return false;
  for(let parent=row.parentElement;parent;parent=parent.parentElement){
    const overflow=window.getComputedStyle(parent).overflowY;
    if(['auto','scroll','hidden','clip'].includes(overflow)){const b=parent.getBoundingClientRect();if(r.bottom<=b.top||r.top>=b.bottom)return false;}
  }
  return true;
}
function redrawArrows(root,record){
  root.querySelectorAll('.md-dependency-arrows').forEach(n=>n.remove());
  root.querySelectorAll('.md-dependency-anchor').forEach(n=>n.classList.remove('md-dependency-anchor'));
  if(!record.state)return;
  const index=dependencyTreeIndex(record.model);
  for(const mount of root.querySelectorAll('.md-tree-mount')){
    const bounds=mount.getBoundingClientRect(),visible=new Map();
    for(const row of mount.querySelectorAll('[data-node-id]')){
      const r=row.getBoundingClientRect();if(rowVisible(row))visible.set(row.dataset.nodeId,r);
    }
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('md-dependency-arrows');
    svg.setAttribute('width',String(mount.scrollWidth||bounds.width));svg.setAttribute('height',String(mount.scrollHeight||bounds.height));svg.setAttribute('aria-hidden','true');
    for(const edge of record.state.relations){
      const a=dependencyTreeAnchor(index,edge.from,visible),b=dependencyTreeAnchor(index,edge.to,visible);if(!a||!b)continue;
      for(const anchor of [a,b])if(anchor.collapsed){const row=[...mount.querySelectorAll('[data-node-id]')].find(n=>n.dataset.nodeId===anchor.id);row?.classList.add('md-dependency-anchor');}
      if(a.id===b.id)continue;
      const from=visible.get(a.id),to=visible.get(b.id),x=Math.max(4,Math.min(from.right,to.right)-bounds.left-8),y1=(from.top+from.bottom)/2-bounds.top,y2=(to.top+to.bottom)/2-bounds.top;
      const path=document.createElementNS(ns,'path');path.setAttribute('d',`M${x-8},${y1} H${x} V${y2} H${x-8} M${x-5},${y2-3} L${x-8},${y2} L${x-5},${y2+3}`);path.setAttribute('class',record.state.upstream.has(edge.from)?'parent':'child');svg.appendChild(path);
    }
    mount.appendChild(svg);
  }
}
export function renderDependencyPresentation(root,model,state,options,onOptions){
  const host=root.querySelector('#mdParts');if(!host)return;
  let record=hosts.get(root);
  if(!record){record={};hosts.set(root,record);
    root.addEventListener('scroll',()=>redrawArrows(root,record),true);
    if(typeof ResizeObserver!=='undefined'){record.observer=new ResizeObserver(()=>redrawArrows(root,record));record.observer.observe(root);}
  }
  Object.assign(record,{model,state});
  let panel=host.querySelector('.md-dependency-panel');
  if(!panel){panel=element('div','md-dependency-panel');panel.setAttribute('aria-label','Dynamic reference visualization');
    const controls=element('div','md-dependency-controls');
    for(const [key,name] of [['parents','Parent references'],['children','Child references']]){
      const label=element('label'),input=element('input');input.type='checkbox';input.dataset.dependencyOption=key;input.setAttribute('aria-label',name);
      input.addEventListener('change',()=>onOptions(key,input.checked));label.append(input,element('span','',name));controls.appendChild(label);
    }
    panel.append(controls,element('div','md-dependency-callouts'));host.insertBefore(panel,host.firstChild);
  }
  for(const input of panel.querySelectorAll('input'))input.checked=options[input.dataset.dependencyOption]!==false;
  const calls=panel.querySelector('.md-dependency-callouts');calls.replaceChildren();
  if(state){
    const focus=state.graph.nodes.get(state.focus);calls.appendChild(element('strong','',focus.name));
    const index=dependencyTreeIndex(model),visible=new Set([...root.querySelectorAll('[data-node-id]')].filter(rowVisible).map(n=>n.dataset.nodeId));
    for(const edge of state.relations){
      const from=state.graph.nodes.get(edge.from),to=state.graph.nodes.get(edge.to),line=element('div','md-dependency-reference');
      line.appendChild(element('span','',from.name+' → '+to.name));
      const a=dependencyTreeAnchor(index,edge.from,visible),b=dependencyTreeAnchor(index,edge.to,visible);
      const endpoints=[['Parent',from,a],['Child',to,b]].filter(([, ,anchor])=>!anchor||anchor.collapsed).map(([role,node,anchor])=>role+' '+node.name+': '+(anchor?'inside '+index.get(anchor.id).node.name:'outside visible tree'));
      line.appendChild(element('small','',edge.label+(endpoints.length?' · '+endpoints.join(' · '):'')));calls.appendChild(line);
    }
    if(!state.relations.length)calls.appendChild(element('small','','No enabled authored references'));
  }
  redrawArrows(root,record);
}
