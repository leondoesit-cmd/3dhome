import {drawingCommandGroup} from './core/drawing_command_group.js';
import {drawingRailPlan} from './core/drawing_rail_groups.js';
const rails = new WeakMap();
export function resetMobileDrawingRail(owner) {
  const s = rails.get(owner);
  if (!s) return;
  s.buttons.forEach(b => delete b.dataset.mobileRailHidden);
  s.toolbar.querySelectorAll('.md-drawing-tools-sep').forEach(n => delete n.dataset.mobileRailHidden);
  s.head.remove();s.next.remove();s.menu.remove();
  s.toolbar.removeEventListener('click',s.click);
  owner.removeEventListener('pointerdown',s.dismiss);
  window.removeEventListener('resize',s.resize);
  rails.delete(owner);
}
export function syncMobileDrawingRail(owner, t, enabled) {
  if (!enabled) { resetMobileDrawingRail(owner);return; }
  const toolbar = owner.querySelector('#mdDrawingTools');
  if (!toolbar) return;
  let s = rails.get(owner);
  if (!s) {
    const control = icon => {
      const b = document.createElement('button');b.type='button';b.className='md-drawing-rail-control';b.innerHTML='<i class="ph '+icon+'"></i>';return b;
    };
    s = {toolbar,buttons:[...toolbar.querySelectorAll('button')],group:'drawGroupDimensions',page:0,lastActive:null,head:control('ph-squares-four'),next:control('ph-caret-down'),menu:document.createElement('div')};
    s.menu.className='md-drawing-rail-groups';s.menu.hidden=true;s.menu.setAttribute('role','group');
    owner.querySelector('.md-mid').appendChild(s.menu);
    toolbar.prepend(s.head);toolbar.appendChild(s.next);
    s.head.addEventListener('click',()=>{s.menu.hidden=!s.menu.hidden;s.head.setAttribute('aria-expanded',String(!s.menu.hidden));});
    s.next.addEventListener('click',()=>{s.page++;syncMobileDrawingRail(owner,t,true);});
    s.click = e => {
      if (!e.target.closest('button') || e.target.closest('.md-drawing-rail-control')) return;
      s.menu.hidden=true;s.head.setAttribute('aria-expanded','false');
      requestAnimationFrame(()=>{if(owner.isConnected)syncMobileDrawingRail(owner,t,document.body.classList.contains('compact-nav'));});
    };
    s.resize = ()=>syncMobileDrawingRail(owner,t,document.body.classList.contains('compact-nav'));
    s.dismiss = e=>{if(!s.menu.contains(e.target) && !s.head.contains(e.target)){s.menu.hidden=true;s.head.setAttribute('aria-expanded','false');}};
    owner.addEventListener('pointerdown',s.dismiss);
    toolbar.addEventListener('click',s.click);window.addEventListener('resize',s.resize);
    rails.set(owner,s);
  }
  const key = b => b.dataset.drawingTool || b.id;
  if (!owner.classList.contains('md-isdrawing')) s.menu.hidden=true;
  const active = s.buttons.find(b=>b.dataset.drawingTool && b.classList.contains('on'));
  if (active && key(active)!==s.lastActive) {
    s.lastActive=key(active);
    if (key(active)!=='select') {s.group=drawingCommandGroup(key(active));s.page=0;}
  }
  const height = owner.querySelector('.md-mid').getBoundingClientRect().height;
  const plan = drawingRailPlan(s.buttons.map(key),s.group,s.page,Math.max(1,Math.floor((height-164)/46)));
  s.group=plan.group;s.page=plan.page;
  s.buttons.forEach(b=>{b.dataset.mobileRailHidden=String(!plan.visible.includes(key(b)));});
  toolbar.querySelectorAll('.md-drawing-tools-sep').forEach(n=>{n.dataset.mobileRailHidden='true';});
  s.head.title=t('drawToolGroups')+' · '+t(plan.group);s.head.setAttribute('aria-label',s.head.title);s.head.setAttribute('aria-expanded',String(!s.menu.hidden));
  s.next.hidden=plan.pages===1;s.next.title=t('drawNextTools')+' · '+(plan.page+1)+'/'+plan.pages;s.next.setAttribute('aria-label',s.next.title);
  s.menu.replaceChildren();
  plan.groups.forEach(group=>{
    const b=document.createElement('button');b.type='button';b.textContent=t(group);b.className=group===plan.group?'on':'';b.setAttribute('aria-pressed',String(group===plan.group));
    b.addEventListener('click',()=>{s.group=group;s.page=0;s.menu.hidden=true;syncMobileDrawingRail(owner,t,true);});s.menu.appendChild(b);
  });
}
