import { cabinetProductionParts } from './cabinet_production_parts.js';
import { planCabinetJoinery, validateCabinetHardwareArticle, createSavedCabinetJoinery, cabinetSavedJoineryReport } from './cabinet_joinery.js';
import { getLang } from './i18n.js';
const text=(en,he)=>getLang()==='en'?en:he;
const el=(tag,content)=>{const n=document.createElement(tag);if(content)n.textContent=content;return n;};
export function mountCabinetJoinery(host,getItems,download,onChange=change=>change()){
  const details=el('details');details.className='nz-cnc';details.id='nzJoinery';
  details.appendChild(el('summary',text('Mating joinery planner','תכנון מחברים בין לוחות')));host.appendChild(details);
  details.appendChild(el('p',text('Choose two boards and enter the exact connector drawing and shop drilling dimensions. X stations share physically aligned lower-left datums; the edge Y offset is measured across board thickness. All values are millimetres.','בחרו שני לוחות והזינו נתונים משרטוט המחבר ונתוני קידוח הסדנה. תחנות X דורשות יישור פיזי של נקודות הייחוס השמאליות התחתונות; היסט Y בקנט נמדד לאורך עובי הלוח. כל המידות במ״מ.')));
  const fields={};
  function field(key,title,kind='input'){
    const label=el('label',title),input=el(kind);label.className='nz-production-field';input.id='nzJoinery'+key;input.dataset.joineryField=key;label.appendChild(input);details.appendChild(label);fields[key]=input;return input;
  }
  const face=field('facePanel',text('Face panel','לוח לקידוח פאה'),'select'),edge=field('edgePanel',text('Edge panel','לוח לקידוח קנט'),'select');
  const sizes=el('p');sizes.id='nzJoinerySizes';details.appendChild(sizes);
  const kind=field('kind',text('Connector type','סוג מחבר'),'select');
  for(const [value,label] of [['dowel',text('Dowel','דיבל')],['confirmat',text('Confirmat screw','בורג קונפירמט')]]){const option=el('option',label);option.value=value;kind.appendChild(option);}
  for(const [key,en,he] of [['manufacturer','Manufacturer','יצרן'],['sku','Exact article / SKU','מק״ט מדויק'],['revision','Drawing revision','מהדורת שרטוט'],['sourceDrawing','Source drawing reference','מקור השרטוט']])field(key,text(en,he));
  for(const [key,en,he] of [
    ['diameterMm','Connector diameter (mm)','קוטר המחבר (מ״מ)'],['lengthMm','Connector length (mm)','אורך המחבר (מ״מ)'],
    ['faceDiameterMm','Face bore diameter (mm)','קוטר קידוח פאה (מ״מ)'],['faceDepthMm','Face bore depth (mm)','עומק קידוח פאה (מ״מ)'],
    ['edgeDiameterMm','Edge bore diameter (mm)','קוטר קידוח קנט (מ״מ)'],['edgeDepthMm','Edge bore depth (mm)','עומק קידוח קנט (מ״מ)'],
    ['minEdgeDistanceMm','Minimum station / face edge distance (mm)','מרחק מינימלי משולי הלוח (מ״מ)'],
    ['faceOffsetMm','Face Y offset (mm)','היסט Y בפאה (מ״מ)'],['edgeOffsetMm','Edge Y offset within thickness (mm)','היסט Y בתוך עובי הקנט (מ״מ)'],
  ]){const input=field(key,text(en,he));input.type='number';input.min='0';input.step='any';}
  const through=field('faceThrough',text('Face bore passes through board','קידוח הפאה עובר את הלוח'));through.type='checkbox';
  const positions=field('positions',text('X stations (mm), separated by commas','תחנות X במ״מ, מופרדות בפסיקים'));positions.placeholder='';
  const catalogKey='modelforge.cabinet-hardware-articles.v1';
  const catalog=el('details');catalog.appendChild(el('summary',text('Reusable shop hardware articles','קטלוג פרזול של הסדנה')));details.appendChild(catalog);
  catalog.appendChild(el('p',text('Shop-authored, unverified article definitions. Saving an article never saves panel selections or drilling stations.','הגדרות פרזול שהוזנו בסדנה ואינן מאומתות. שמירת פריט אינה שומרת לוחות או תחנות קידוח.')));
  const catalogSelect=el('select');catalogSelect.id='nzJoineryCatalog';catalogSelect.setAttribute('aria-label',text('Saved hardware articles','פריטי פרזול שמורים'));catalog.appendChild(catalogSelect);
  const catalogStatus=el('p');catalogStatus.id='nzJoineryCatalogStatus';catalogStatus.setAttribute('role','status');catalog.appendChild(catalogStatus);
  const replaceLabel=el('label',text('Replace an existing manufacturer / SKU / revision explicitly','החלפה מפורשת של יצרן / מק״ט / גרסה קיימים')),replaceArticle=el('input');replaceArticle.type='checkbox';replaceArticle.id='nzJoineryCatalogReplace';replaceLabel.appendChild(replaceArticle);catalog.appendChild(replaceLabel);
  let articles=[];
  const articleKey=a=>JSON.stringify([a.manufacturer,a.sku,a.revision]);
  function cleanArticle(a){
    const problems=validateCabinetHardwareArticle(a);if(problems.length)throw new Error(problems.map(p=>p.message).join(' '));
    return {manufacturer:a.manufacturer.trim(),sku:a.sku.trim(),revision:a.revision.trim(),sourceDrawing:a.sourceDrawing.trim(),kind:a.kind,dimensions:{diameterMm:a.dimensions.diameterMm,lengthMm:a.dimensions.lengthMm},drilling:{faceDiameterMm:a.drilling.faceDiameterMm,faceDepthMm:a.drilling.faceDepthMm,edgeDiameterMm:a.drilling.edgeDiameterMm,edgeDepthMm:a.drilling.edgeDepthMm,minEdgeDistanceMm:a.drilling.minEdgeDistanceMm,faceThrough:!!a.drilling.faceThrough}};
  }
  function decodeCatalog(value){
    if(!value||value.schema!=='modelforge-shop-hardware-catalog'||value.version!==1||!Array.isArray(value.articles)||value.articles.length>1000)throw new Error('Expected a version 1 shop hardware catalog with at most 1000 articles.');
    const list=value.articles.map(cleanArticle),keys=new Set();for(const article of list){const key=articleKey(article);if(keys.has(key))throw new Error('Duplicate manufacturer / SKU / revision in imported catalog.');keys.add(key);}return list;
  }
  function catalogData(list=articles){return {schema:'modelforge-shop-hardware-catalog',version:1,verified:false,articles:list};}
  function renderCatalog(selected=catalogSelect.value){catalogSelect.replaceChildren();const empty=el('option',text('Select a saved article','בחרו פריט שמור'));empty.value='';catalogSelect.appendChild(empty);for(const a of articles){const option=el('option',a.manufacturer+' · '+a.sku+' · '+a.revision);option.value=articleKey(a);catalogSelect.appendChild(option);}catalogSelect.value=articles.some(a=>articleKey(a)===selected)?selected:'';}
  function storeCatalog(incoming){
    const next=articles.slice();for(const a of incoming){const index=next.findIndex(old=>articleKey(old)===articleKey(a));if(index<0)next.push(a);else if(JSON.stringify(next[index])!==JSON.stringify(a)){if(!replaceArticle.checked)throw new Error('This article revision already exists. Choose a new revision or explicitly enable replacement.');next[index]=a;}}
    if(next.length>1000)throw new Error('The catalog is limited to 1000 articles.');
    localStorage.setItem(catalogKey,JSON.stringify(catalogData(next)));articles=next;replaceArticle.checked=false;renderCatalog(incoming[0]?articleKey(incoming[0]):'');catalogStatus.textContent=text('Saved locally. Article definitions remain unverified.','נשמר מקומית. הגדרות הפרזול אינן מאומתות.');
  }
  function catalogButton(id,title,action){const button=el('button',title);button.id=id;button.type='button';button.addEventListener('click',()=>{try{action();}catch(error){catalogStatus.textContent=error.message;}});catalog.appendChild(button);}
  catalogButton('nzJoineryCatalogSave',text('Save current article','שמירת הפריט הנוכחי'),()=>storeCatalog([cleanArticle(input().article)]));
  catalogButton('nzJoineryCatalogLoad',text('Load selected article','טעינת הפריט הנבחר'),()=>{const a=articles.find(entry=>articleKey(entry)===catalogSelect.value);if(!a)throw new Error('Select a saved article.');for(const key of ['manufacturer','sku','revision','sourceDrawing','kind'])fields[key].value=a[key];for(const [key,value] of Object.entries({...a.dimensions,...a.drilling})){if(key==='faceThrough')through.checked=value;else fields[key].value=value;}invalidate();catalogStatus.textContent=text('Loaded unverified article; review the mating operations again.','הפריט נטען ללא אימות; יש לבדוק מחדש את פעולות החיבור.');});
  catalogButton('nzJoineryCatalogExport',text('Export hardware catalog JSON','ייצוא קטלוג פרזול JSON'),()=>download('cabinet-shop-hardware-catalog.json',JSON.stringify(catalogData(),null,2),'application/json'));
  const importLabel=el('label',text('Import hardware catalog JSON','ייבוא קטלוג פרזול JSON')),importCatalog=el('input');importCatalog.type='file';importCatalog.accept='.json,application/json';importCatalog.id='nzJoineryCatalogImport';importLabel.appendChild(importCatalog);catalog.appendChild(importLabel);
  importCatalog.addEventListener('change',async()=>{try{const file=importCatalog.files[0];if(!file)return;if(file.size>1000000)throw new Error('Hardware catalog exceeds 1 MB.');storeCatalog(decodeCatalog(JSON.parse(await file.text())));}catch(error){catalogStatus.textContent=error.message;}finally{importCatalog.value='';}});
  try{const stored=localStorage.getItem(catalogKey);if(stored)articles=decodeCatalog(JSON.parse(stored));}catch(error){catalogStatus.textContent=text('Saved catalog could not be loaded: ','לא ניתן לטעון את הקטלוג השמור: ')+error.message;}
  renderCatalog();
  const review=el('button',text('Review mating operations','בדיקת פעולות החיבור'));review.type='button';review.id='nzJoineryReview';details.appendChild(review);
  const status=el('div');status.id='nzJoineryStatus';status.setAttribute('role','status');details.appendChild(status);
  const preview=el('div');preview.id='nzJoineryPreview';details.appendChild(preview);
  const save=el('button',text('Download reviewed joinery JSON','הורדת בדיקת חיבורים JSON'));save.type='button';save.id='nzJoineryDownload';save.disabled=true;details.appendChild(save);
  const persist=el('button',text('Save reviewed plan to cabinet','שמירת תכנית בדוקה בארון'));persist.id='nzJoineryPersist';persist.type='button';persist.disabled=true;details.appendChild(persist);
  const savedList=el('div');savedList.id='nzJoinerySavedPlans';details.appendChild(savedList);
  let parts=[],reviewed=null,editing=null;
  function renderSaved(){
    const report=cabinetSavedJoineryReport(getItems());savedList.replaceChildren();savedList.appendChild(el('h4',text('Saved cabinet joinery plans','תכניות חיבור שמורות בארון')));
    for(const entry of report.plans){
      const row=el('div');row.appendChild(el('p',entry.id+' · '+(entry.valid?text('Current — review only','עדכני — לבדיקה בלבד'):text('STALE / invalid — excluded from drawings','לא עדכני / לא תקין — לא נכלל בשרטוטים'))));
      for(const issue of entry.issues)row.appendChild(el('p',issue.message));
      const owner=getItems().find(item=>String(item.id)===entry.ownerItemId),plans=owner?.cab?.joineryPlans;
      const load=el('button',text('Load and revalidate','טעינה ובדיקה מחדש'));load.type='button';
      load.addEventListener('click',()=>{try{
        const plan=plans.find(p=>p?.id===entry.id);if(!plan?.request)throw new Error('This plan has no valid request. Remove it and create a new plan.');
        loadPanels();const request=plan.request;face.value=request.facePanel?.id;options(edge,request.edgePanel?.id,face.value);
        for(const key of ['manufacturer','sku','revision','sourceDrawing','kind'])fields[key].value=request.article?.[key]||'';
        for(const [key,value]of Object.entries({...request.article?.dimensions,...request.article?.drilling})){if(key==='faceThrough')through.checked=!!value;else if(fields[key])fields[key].value=value;}
        positions.value=Array.isArray(request.positions)?request.positions.join(','):'';fields.faceOffsetMm.value=request.faceOffsetMm??'';fields.edgeOffsetMm.value=request.edgeOffsetMm??'';
        editing={ownerItemId:entry.ownerItemId,id:entry.id};reviewed=build();render(reviewed);status.textContent+=text(' Inspect the current operations and save to replace this plan.',' בדקו את הפעולות הנוכחיות ושמרו להחלפת התכנית.');
      }catch(error){invalidate();status.textContent=error.message;}});row.appendChild(load);
      const remove=el('button',text('Remove plan','הסרת תכנית'));remove.type='button';remove.addEventListener('click',()=>{onChange(()=>{owner.cab.joineryPlans=plans.filter(p=>p?.id!==entry.id);});editing=null;invalidate();renderSaved();});row.appendChild(remove);savedList.appendChild(row);
    }
    for(const issue of report.issues.filter(i=>!i.planId))savedList.appendChild(el('p',issue.message));
  }
  function invalidate(){reviewed=null;save.disabled=true;persist.disabled=true;preview.replaceChildren();status.textContent=text('Review the current panel selection and connector details.','בדקו את הלוחות והמחבר שנבחרו.');}
  function options(select,selected,exclude){select.replaceChildren();const placeholder=el('option',text('Select a panel','בחרו לוח'));placeholder.value='';select.appendChild(placeholder);for(const p of parts){if(p.id===exclude)continue;const option=el('option',p.id+' · '+p.role);option.value=p.id;select.appendChild(option);}select.value=parts.some(p=>p.id===selected&&p.id!==exclude)?selected:'';}
  function dimensions(){
    sizes.textContent=[face.value,edge.value].filter(Boolean).map(id=>{const p=parts.find(v=>v.id===id),d=p?.substrate||p?.finished;return d?id+': '+d.length+' × '+d.width+' × '+d.thickness+' mm · '+(p.substrate?text('substrate dimensions','מידות לוח בסיס'):text('FINISHED dimensions only — substrate / edge deductions unknown','מידות גמר בלבד — מידות בסיס והפחתות קנט לא ידועות')):'';}).join(' | ');
  }
  function loadPanels(){const selectedFace=face.value,selectedEdge=edge.value;const manifest=cabinetProductionParts(getItems());parts=manifest.parts.filter(p=>p.geometry==='rectangle'&&p.stockRole!=='glass'&&p.finished&&[p.finished.length,p.finished.width,p.finished.thickness].every(v=>Number.isFinite(v)&&v>0));options(face,selectedFace,'');options(edge,selectedEdge,face.value);dimensions();return manifest;}
  function input(){
    const panel=id=>{const p=parts.find(v=>v.id===id);return p?{id:p.id,...(p.substrate||p.finished),dimensionBasis:p.substrate?'substrate':'finished-only'}:null;};
    const number=key=>fields[key].value.trim()===''?null:Number(fields[key].value);
    return {facePanel:panel(face.value),edgePanel:panel(edge.value),article:{kind:kind.value,manufacturer:fields.manufacturer.value.trim(),sku:fields.sku.value.trim(),revision:fields.revision.value.trim(),sourceDrawing:fields.sourceDrawing.value.trim(),dimensions:{diameterMm:number('diameterMm'),lengthMm:number('lengthMm')},drilling:{faceDiameterMm:number('faceDiameterMm'),faceDepthMm:number('faceDepthMm'),edgeDiameterMm:number('edgeDiameterMm'),edgeDepthMm:number('edgeDepthMm'),minEdgeDistanceMm:number('minEdgeDistanceMm'),faceThrough:through.checked}},positions:positions.value.split(',').map(v=>v.trim()===''?null:Number(v.trim())),faceOffsetMm:number('faceOffsetMm'),edgeOffsetMm:number('edgeOffsetMm')};
  }
  function build(){const manifest=loadPanels(),request=input(),report=planCabinetJoinery(request);if(manifest.issues.some(i=>['missing-item-id','duplicate-item-id','layout-failed','invalid-edge-allowance','invalid-substrate','edge-datum-mismatch','edge-topology-mismatch','unsupported-edge-allowance','invalid-rough-allowance'].includes(i.code))){report.operations=[];report.hardware=[];report.issues.push({code:'invalid-production-parts',message:text('Resolve production panel identity, geometry or substrate errors before planning.','יש לתקן שגיאות מזהה, גאומטריה או לוח בסיס לפני התכנון.')});}return {request,report,signature:JSON.stringify({request,manifest})};}
  function render(result){
    preview.replaceChildren();status.textContent=result.report.operations.length?text('Mating operations ready for shop review; not machine-qualified.','פעולות החיבור מוכנות לבדיקת הסדנה; אינן מאושרות למכונה.'):text('Complete or correct the fields below.','יש להשלים או לתקן את הנתונים.');
    const issues=el('ul');for(const issue of result.report.issues)issues.appendChild(el('li',issue.message));preview.appendChild(issues);
    if(result.report.operations.length){const table=el('table'),head=el('tr');for(const title of [text('Pair','זוג'),text('Panel / setup','לוח / קידוח'),'X / Y mm','Ø / '+text('depth mm','עומק מ״מ')])head.appendChild(el('th',title));table.appendChild(head);result.report.operations.forEach((op,index)=>{const row=el('tr');for(const value of [String(Math.floor(index/2)+1),op.panelId+' / '+op.setup,op.x+' / '+op.y,op.diameter+' / '+op.depth])row.appendChild(el('td',value));table.appendChild(row);});preview.appendChild(table);}
    save.disabled=!result.report.operations.length;persist.disabled=save.disabled;
  }
  review.addEventListener('click',()=>{try{editing=null;reviewed=build();render(reviewed);}catch(error){invalidate();status.textContent=error.message;}});
  save.addEventListener('click',()=>{try{const current=build();if(!reviewed||reviewed.signature!==current.signature){reviewed=null;render(current);save.disabled=true;status.textContent=text('Design or setup changed. Review the new operations before downloading.','העיצוב או ההגדרות השתנו. בדקו מחדש את הפעולות לפני ההורדה.');return;}if(!current.report.operations.length){render(current);return;}download('cabinet-joinery-review.json',JSON.stringify({...current.report,input:current.request},null,2),'application/json');}catch(error){invalidate();status.textContent=error.message;}});
  persist.addEventListener('click',()=>{try{
    const current=build();if(!reviewed||reviewed.signature!==current.signature||!current.report.operations.length)throw new Error('Review the current design and operations before saving.');
    const plan=createSavedCabinetJoinery(getItems(),current.request,editing?{id:editing.id}:{}),owner=getItems().find(item=>String(item.id)===plan.ownerItemId);
    if(editing&&editing.ownerItemId!==plan.ownerItemId)throw new Error('Revalidated plan must remain on its owning cabinet. Create a new review for another cabinet.');
    const existing=Array.isArray(owner.cab.joineryPlans)?owner.cab.joineryPlans:[];
    onChange(()=>{owner.cab.joineryPlans=[...existing.filter(p=>p?.id!==plan.id),plan];});editing=null;invalidate();renderSaved();status.textContent=text('Saved to cabinet. Create a fresh production revision to include it.','נשמר בארון. צרו גרסת ייצור חדשה כדי לכלול את התכנית.');
  }catch(error){status.textContent=error.message;}});
  face.addEventListener('change',()=>{options(edge,edge.value,face.value);dimensions();});edge.addEventListener('change',dimensions);
  details.addEventListener('input',invalidate);details.addEventListener('change',invalidate);
  function refresh(){try{loadPanels();invalidate();renderSaved();}catch(error){invalidate();status.textContent=error.message;}}
  refresh();return {refresh};
}
