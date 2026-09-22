import { cabinetDrillingRecipeDraft } from './cabinet_manufacturing.js';
import { getLang } from './i18n.js';
import { CABINET_CONTROLLER_PROFILES, CABINET_HARDWARE_REFERENCES, newCabinetShopProfile, parseCabinetShopProfile } from './cabinet_shop_profiles.js';
import { cabinetCNCBundle } from './cabinet_postprocessor.js';

const STORAGE='modelforge.cabinet-shop-profile.v1';
const label=(en,he)=>getLang()==='en'?en:he;
const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};

export function mountCabinetShopSetup(host,getItems,download) {
  let profile=newCabinetShopProfile(),bundle=null,profileDirty=false;
  try{const stored=localStorage.getItem(STORAGE);if(stored){const loaded=parseCabinetShopProfile(stored);if(loaded.profile?.schema===profile.schema)profile=loaded.profile;}}catch{}
  const details=node('details');details.className='nz-cnc';details.appendChild(node('summary',label('Machine profiles & simulation','פרופילי מכונה וסימולציה')));host.appendChild(details);
  details.appendChild(node('p',label('Choose a controller dialect, then enter the measured shop setup. All generated programs remain simulation-only.','בחרו בקר והזינו את נתוני המכונה והכלים. התוכניות המופקות מיועדות לסימולציה בלבד.')));
  function field(title,input){const l=node('label',title);l.appendChild(input);details.appendChild(l);return input;}
  const controller=field(label('Controller','בקר'),node('select'));controller.id='nzCncController';
  for(const target of CABINET_CONTROLLER_PROFILES){const op=node('option',target.name);op.value=target.id;controller.appendChild(op);}
  controller.value=profile.controller;
  const hardware=field(label('Hardware reference','מקור פרזול'),node('select'));hardware.id='nzCncHardware';
  for(const reference of CABINET_HARDWARE_REFERENCES){const op=node('option',reference.name);op.value=reference.id;hardware.appendChild(op);}
  hardware.value=profile.hardwareReference;
  const referenceNote=node('p');details.appendChild(referenceNote);
  function references(){
    referenceNote.replaceChildren();
    for(const {key,input} of nativeControls)input.parentElement.hidden=controller.value!==({woodwopMachine:'homag-woodwop',biesseOrigin:'biesse-bsolid',scmReverseZ:'scm-prisma-xxl'}[key]);
    const entries=[CABINET_CONTROLLER_PROFILES.find(c=>c.id===controller.value),CABINET_HARDWARE_REFERENCES.find(h=>h.id===hardware.value)];
    for(const entry of entries){if(!entry)continue;const p=node('p',entry.notes||'');if(entry.source){const a=node('a',label('Vendor / controller reference','מקור יצרן / בקר'));a.href=entry.source;a.target='_blank';a.rel='noopener noreferrer';p.appendChild(a);}referenceNote.appendChild(p);}
  }
  const inputs=[];
  for(const [title,path] of [
    [label('Work envelope X (mm)','תחום עבודה X (מ״מ)'),['travel','x']],
    [label('Work envelope Y (mm)','תחום עבודה Y (מ״מ)'),['travel','y']],
    [label('Available Z travel (mm)','מהלך Z זמין (מ״מ)'),['travel','z']],
    [label('Clearance above stock (mm)','גובה בטוח מעל הלוח (מ״מ)'),['safeZ']],
    [label('Through-hole allowance (mm)','תוספת לקדח עובר (מ״מ)'),['breakthrough']],
    [label('Initial tool position X (mm)','מיקום כלי התחלתי X (מ״מ)'),['startPosition','x']],
    [label('Initial tool position Y (mm)','מיקום כלי התחלתי Y (מ״מ)'),['startPosition','y']],
  ]){
    const input=field(title,node('input'));input.type='number';input.min='0';input.step='0.1';input.value=path.length===2?(profile[path[0]]?.[path[1]]??''):(profile[path[0]]??'');
    inputs.push({input,path});input.addEventListener('change',()=>{const value=input.value===''?null:Number(input.value);if(path.length===2){if(!profile[path[0]]||typeof profile[path[0]]!=='object'||Array.isArray(profile[path[0]]))profile[path[0]]={};profile[path[0]][path[1]]=value;}else profile[path[0]]=value;syncEditor();invalidate();});
  }
  const flip=field(label('B-face flip','היפוך צד B'),node('select'));
  for(const [value,text] of [['mirror-x','Mirror X'],['mirror-y','Mirror Y']]){const op=node('option',text);op.value=value;flip.appendChild(op);}flip.value=profile.flip;
  const rotation=field(label('Board rotation','סיבוב הלוח'),node('select'));
  for(const value of [0,90,180,270]){const op=node('option',value+'°');op.value=String(value);rotation.appendChild(op);}rotation.value=String(profile.rotation);
  const nativeControls=[];
  for(const [key,title,values] of [
    ['woodwopMachine','woodWOP machine type',['HOMAG','CF-HOMAG','FK-HOMAG','WEEKE']],
    ['biesseOrigin','Biesse work origin',null],
    ['scmReverseZ','SCM Prisma Z convention',['false','true']],
  ]){
    const input=field(title,node(values?'select':'input'));
    if(values){const placeholder=node('option','Select…');placeholder.value='';input.appendChild(placeholder);for(const value of values){const op=node('option',key==='scmReverseZ'?(value==='true'?'Positive Z toward table (OSAI)':'Positive Z away from table'):value);op.value=value;input.appendChild(op);}}
    else{input.type='number';input.min='1';input.max='999';input.step='1';}
    input.id='nzCncNative'+key;nativeControls.push({key,input});
    input.addEventListener('change',()=>{if(!profile.native||typeof profile.native!=='object'||Array.isArray(profile.native))profile.native={};profile.native[key]=input.value===''?null:key==='scmReverseZ'?input.value==='true':input.value;syncEditor();invalidate();});
  }
  const tools=field(label('Tools: one row per drill','כלים: שורה לכל מקדח'),node('textarea'));tools.id='nzCncTools';tools.rows=6;tools.spellcheck=false;
  const toolRows=node('div');toolRows.id='nzCncToolRows';details.appendChild(toolRows);
  const addTool=node('button',label('Add drilling tool','הוסף מקדח'));addTool.id='nzCncAddTool';details.appendChild(addTool);
  tools.parentElement.hidden=true;
  details.appendChild(node('p',label('Each tool needs number, diameter, feed (mm/min), rpm, maxDepth (mm), holderDiameter (mm), spinupSeconds. Values must come from your tooling setup.','לכל כלי נדרשים מספר, קוטר, קצב הזנה, סל״ד, עומק מרבי, קוטר מעטפת וזמן האצה, בהתאם לכלים במכונה.')));
  const advanced=node('details');advanced.appendChild(node('summary',label('Import / edit complete shop profile','ייבוא / עריכת פרופיל מלא')));details.appendChild(advanced);
  const editor=node('textarea');editor.id='nzCncProfile';editor.rows=14;editor.spellcheck=false;editor.setAttribute('aria-label',label('Shop profile JSON','פרופיל JSON'));advanced.appendChild(editor);
  const apply=node('button',label('Apply profile JSON','החל פרופיל JSON'));apply.id='nzCncApply';advanced.appendChild(apply);
  const draftRecipe=node('button',label('Download complete drilling recipe draft','הורד טיוטת מתכון קידוח מלא'));draftRecipe.id='nzCncRecipeDraft';advanced.appendChild(draftRecipe);
  draftRecipe.addEventListener('click',()=>{try{download('cabinet-shop-recipe-draft.json',JSON.stringify({...profile,completeRecipes:cabinetDrillingRecipeDraft(getItems())},null,2),'application/json');}catch(error){status.textContent=error.message;}});
  advanced.appendChild(node('p',label('Complete recipes list every wood panel with its dimensions and datum axes. Fill hardware part numbers, drawing reference and each panel’s holes or no-drilling reason, then apply the complete profile. Cabinet edits invalidate old recipes.','מתכון מלא כולל כל לוח, מידות וצירי ייחוס. מלאו מספרי פרזול, שרטוט וכל הקדחים או סיבה ללא קידוח, והחילו את הפרופיל. שינוי הארון מבטל מתכון ישן.')));
  const exportProfile=node('button',label('Download profile','הורד פרופיל'));advanced.appendChild(exportProfile);
  const validate=node('button',label('Validate & build simulation','בדיקה ובניית סימולציה'));validate.id='nzCncValidate';validate.className='nz-wide';details.appendChild(validate);
  const status=node('div');status.id='nzCncStatus';status.setAttribute('role','status');details.appendChild(status);
  const files=field(label('Program preview','תצוגת תוכנית'),node('select'));files.id='nzCncFiles';
  const drawing=node('div');drawing.id='nzCncDrawing';details.appendChild(drawing);
  const preview=node('textarea');preview.id='nzCncPreview';preview.rows=10;preview.readOnly=true;preview.setAttribute('aria-label',label('Simulation program','תוכנית לסימולציה'));details.appendChild(preview);
  const downloadProgram=node('button',label('Download selected simulation program','הורד תוכנית סימולציה נבחרת'));downloadProgram.id='nzCncDownload';downloadProgram.disabled=true;details.appendChild(downloadProgram);
  const downloadBundle=node('button',label('Download simulation bundle','הורד חבילת סימולציה'));downloadBundle.id='nzCncBundle';downloadBundle.disabled=true;details.appendChild(downloadBundle);
  function invalidate(){bundle=null;files.replaceChildren();drawing.replaceChildren();preview.value='';downloadProgram.disabled=true;downloadBundle.disabled=true;status.textContent=label('Validate the current cabinet and setup to generate a preview.','יש לבדוק את הארון וההגדרות העדכניים כדי ליצור תצוגה.');}
  function renderTools(){
    toolRows.replaceChildren();
    (Array.isArray(profile.tools)?profile.tools:[]).forEach((tool,i)=>{
      const row=node('fieldset');row.appendChild(node('legend',label('Drill ','מקדח ')+(i+1)));row.className='nz-cnc-tool';
      for(const [key,title] of [['number','Tool number'],['diameter','Diameter (mm)'],['feed','Feed (mm/min)'],['rpm','Spindle RPM'],['maxDepth','Reach (mm)'],['holderDiameter','Holder envelope (mm)'],['holderBottomOffset','Holder bottom above tip (mm, signed)'],['spinupSeconds','Spin-up (s)']]){
        const l=node('label',title),input=node('input');input.type='number';input.step=key==='number'?'1':'0.1';input.min='0';input.value=tool?.[key]??'';input.setAttribute('data-tool-field',key);l.appendChild(input);row.appendChild(l);
        if(key==='holderBottomOffset') input.removeAttribute('min');
        input.addEventListener('change',()=>{if(!profile.tools[i]||typeof profile.tools[i]!=='object'||Array.isArray(profile.tools[i]))profile.tools[i]={};profile.tools[i][key]=input.value===''?null:Number(input.value);editor.value=JSON.stringify(profile,null,2);tools.value=JSON.stringify(profile.tools,null,2);invalidate();});
      }
      const nativeLabel=node('label','Biesse tool database name'),nativeInput=node('input');nativeInput.value=tool?.nativeName||'';nativeInput.maxLength=64;nativeLabel.appendChild(nativeInput);row.appendChild(nativeLabel);nativeLabel.hidden=profile.controller!=='biesse-bsolid';
      nativeInput.addEventListener('change',()=>{if(!profile.tools[i]||typeof profile.tools[i]!=='object'||Array.isArray(profile.tools[i]))profile.tools[i]={};profile.tools[i].nativeName=nativeInput.value;editor.value=JSON.stringify(profile,null,2);tools.value=JSON.stringify(profile.tools,null,2);invalidate();});
      const remove=node('button',label('Remove tool' ,'הסר כלי'));remove.addEventListener('click',()=>{profile.tools.splice(i,1);syncEditor();invalidate();});row.appendChild(remove);toolRows.appendChild(row);
    });
  }
  function syncEditor(){editor.value=JSON.stringify(profile,null,2);tools.value=JSON.stringify(profile.tools||[],null,2);renderTools();}
  addTool.addEventListener('click',()=>{profile.tools=Array.isArray(profile.tools)?profile.tools:[];if(profile.tools.length>=100)return;let number=1;while(profile.tools.some(t=>t?.number===number))number++;profile.tools.push({number,diameter:null,feed:null,rpm:null,maxDepth:null,holderDiameter:null,spinupSeconds:null});syncEditor();invalidate();});
  function showProgram(index){
    preview.value=bundle?.files[index]?.content||'';drawing.replaceChildren();const setup=bundle?.setups[index];if(!setup)return;
    drawing.appendChild(node('p',setup.panelId+' · Face '+setup.face+' · Tool '+setup.toolNumber+' · '+setup.flip+' · '+setup.rotation+'° · '+(setup.panelDatum?.description||'')+(setup.panelDatum?.xAxis?' · X='+setup.panelDatum.xAxis+', Y='+setup.panelDatum.yAxis+', thickness='+setup.panelDatum.faceAxis:'')));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+profile.travel.x+' '+profile.travel.y);svg.setAttribute('role','img');svg.setAttribute('aria-label',label('Board, clamps and drilling positions in the work envelope','לוח, מלחציים ומיקומי קידוח בתחום העבודה'));svg.style.width='100%';svg.style.height='180px';
    function shape(type,attrs,title){const el=document.createElementNS(svg.namespaceURI,type);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(title){const t=document.createElementNS(svg.namespaceURI,'title');t.textContent=title;el.appendChild(t);}svg.appendChild(el);}
    shape('rect',{x:0,y:0,width:profile.travel.x,height:profile.travel.y,fill:'#18202b'});
    const swapped=setup.rotation===90||setup.rotation===270,w=swapped?setup.panelDimensions.w:setup.panelDimensions.l,h=swapped?setup.panelDimensions.l:setup.panelDimensions.w;
    shape('rect',{x:profile.origin.x,y:profile.origin.y,width:w,height:h,fill:'#d7c4a6'});
    for(const c of profile.clamps)shape('rect',{x:c.x,y:c.y,width:c.w,height:c.h,fill:'#d9794b'},'Clamp');
    for(const op of setup.operations)shape('circle',{cx:op.x,cy:op.y,r:Math.max(op.diameter/2,4),fill:'#146a9b'},op.id+' · depth '+op.depth+' mm');
    drawing.appendChild(svg);
  }
  function syncFields(){for(const {key,input} of nativeControls)input.value=profile.native?.[key]===null||profile.native?.[key]===undefined?'':String(profile.native[key]);controller.value=profile.controller;hardware.value=profile.hardwareReference||'generic';flip.value=profile.flip;rotation.value=String(profile.rotation);for(const {input,path} of inputs)input.value=(path.length===2?profile[path[0]]?.[path[1]]:profile[path[0]])??'';references();syncEditor();}
  function save(){try{localStorage.setItem(STORAGE,JSON.stringify(profile));}catch{status.appendChild(node('p',label('Settings could not be saved locally. Download the profile to keep it.','לא ניתן לשמור הגדרות מקומית. הורידו את הפרופיל לשמירה.')));}}
  controller.addEventListener('change',()=>{profile.controller=controller.value;references();syncEditor();invalidate();});
  hardware.addEventListener('change',()=>{profile.hardwareReference=hardware.value;references();syncEditor();invalidate();});
  flip.addEventListener('change',()=>{profile.flip=flip.value;syncEditor();invalidate();});rotation.addEventListener('change',()=>{profile.rotation=Number(rotation.value);syncEditor();invalidate();});
  tools.addEventListener('input',invalidate);tools.addEventListener('change',()=>{try{const value=JSON.parse(tools.value);if(!Array.isArray(value))throw new Error('Tools must be an array.');profile.tools=value;editor.value=JSON.stringify(profile,null,2);}catch(error){status.textContent=error.message;}});
  editor.addEventListener('input',()=>{profileDirty=true;invalidate();});
  apply.addEventListener('click',()=>{try{const parsed=parseCabinetShopProfile(editor.value);if(parsed.profile?.schema!=='modelforge-cabinet-shop-profile'||parsed.profile.version!==1)throw new Error('Unsupported shop profile schema.');profile=parsed.profile;profileDirty=false;syncFields();invalidate();status.textContent=parsed.issues.map(i=>i.message).join(' ');save();}catch(error){status.textContent=error.message;}});
  function build(){
    if(profileDirty){invalidate();status.textContent=label("Apply the edited profile JSON first.","יש להחיל קודם את פרופיל ה-JSON שנערך.");return null;}
    try{profile.tools=JSON.parse(tools.value);if(!Array.isArray(profile.tools))throw new Error('Tools must be an array.');bundle=cabinetCNCBundle(getItems(),profile);}
    catch(error){invalidate();status.textContent=error.message;return null;}
    files.replaceChildren();drawing.replaceChildren();preview.value='';status.replaceChildren();
    status.appendChild(node('strong',bundle.status==='simulation-ready'?label('Simulation ready — not production qualified','מוכן לסימולציה — לא מאומת לייצור'):label('Export blocked','הייצוא חסום')));
    for(const issue of [...bundle.issues,...bundle.warnings])status.appendChild(node('p',issue.message));
    bundle.files.forEach((file,i)=>{const op=node('option',file.name);op.value=String(i);files.appendChild(op);});
    if(bundle.files.length)showProgram(0);
    downloadProgram.disabled=!bundle.files.length;downloadBundle.disabled=!bundle.files.length;save();return bundle;
  }
  validate.addEventListener('click',build);files.addEventListener('change',()=>showProgram(Number(files.value)));
  downloadProgram.addEventListener('click',()=>{const selected=Number(files.value),fresh=build();const file=fresh?.files[selected];if(file)download(file.name,file.content,'text/plain');});
  downloadBundle.addEventListener('click',()=>{const fresh=build();if(fresh?.files.length)download('cabinet-simulation-bundle.json',JSON.stringify(fresh,null,2),'application/json');});
  exportProfile.addEventListener('click',()=>download('cabinet-shop-profile.json',JSON.stringify(profile,null,2),'application/json'));
  function getRecipes(){
    if(profileDirty) throw new Error('Apply the edited shop profile before exporting part drawings.');
    return JSON.parse(JSON.stringify(profile.completeRecipes||[]));
  }
  syncFields();invalidate();return {invalidate,getRecipes};
}
