import { getLang } from './i18n.js';
import { cabinetProductionParts } from './cabinet_production_parts.js';
import { BANDING, bandLabel } from './stock.js';
import { cabinetProductionDrawingHTML } from './cabinet_production_drawings.js';
import { mountCabinetJoinery } from './ui_cabinet_joinery.js';
import { mountCabinetAllowanceBatch } from './ui_cabinet_allowance_batch.js';
import { cabinetOperationCoverage } from './cabinet_operation_coverage.js';
import { createCabinetReviewPackage, importCabinetReviewPackage } from './cabinet_review_package.js';
import { compareCabinetProductionJobs, cabinetRevisionDiffHTML, cabinetRevisionDiffCSV } from './cabinet_revision_diff.js';
import { mountCabinetInspection } from './ui_cabinet_inspection.js';
import { createCabinetStandardsContext, evaluateCabinetStandards } from './cabinet_standards.js';
import {
  CABINET_PRODUCTION_PRESETS, previewCabinetProductionPreset, applyCabinetProductionPreset,
  standardsContextForCabinetPreset, cabinetDesignToProductionReadiness,
} from './cabinet_production_presets.js';
import {
  createCabinetProductionJob, cabinetProductionStaleness, transitionCabinetProductionJob,
  recordCabinetStation, cabinetProductionCSV, cabinetProductionHTML, CABINET_STATIONS,
  importCabinetProductionJob,
} from './cabinet_production_workflow.js';

const label = (en, he) => getLang() === 'he' ? he : en;
const node = (tag, text) => { const el = document.createElement(tag); if (text != null) el.textContent = text; return el; };
const states = {pass:['Pass','עבר'],fail:['Fail','נכשל'],'not-applicable':['Not applicable','לא חל'],'not-evaluated':['Not evaluated','לא נבדק']};
const sessions = new Map();

export function mountCabinetProduction(host, getItems, download, onChange, getRecipes = () => []) {
  const root = node('details'); root.className = 'nz-production'; root.id = 'nzProduction';
  root.appendChild(node('summary', label('Production parts & standards', 'חלקי ייצור ותקנים'))); host.appendChild(root);
  const intro = node('p', label('Define cut allowances, assess the destination market and keep revision-bound shop documents.', 'הגדירו תוספות ניסור, בדקו את שוק היעד ושמרו מסמכי עבודה לפי גרסה.'));
  root.appendChild(intro);
  const status = node('p'); status.id = 'nzProductionStatus'; status.setAttribute('role', 'status'); root.appendChild(status);
  function field(parent, title, control, id) {
    const row = node('label'); row.className = 'nz-production-field';
    row.appendChild(node('span', title)); row.appendChild(control); parent.appendChild(row);
    if (id) control.id = id;
    return control;
  }
  function options(control, values) { for (const [value, title] of values) { const o = node('option', title); o.value = value; control.appendChild(o); } return control; }
  function button(parent, title, action, id) {
    const b = node('button', title); b.type = 'button'; b.className = 'nz-wide'; if (id) b.id = id;
    b.addEventListener('click', () => { try { action(); } catch (error) { status.textContent = error.message; } }); parent.appendChild(b); return b;
  }
  let key = '', session;
  function currentSession() {
    // Same live objects retain sessions; independent imported projects cannot inherit a release by reusing IDs.
    const items = getItems();
    const scope = items.map(it => String(it.id)).sort().join('\u0000');
    if (!session || key !== scope || !session.items.every(it => items.includes(it))) {
      key = scope;
      session = [...sessions.values()].find(s => s.scope === scope && s.items.length === items.length && s.items.every(it => items.includes(it)));
      if (!session) { session = {scope,items:[...items],context:createCabinetStandardsContext(),job:null,archives:[]}; sessions.set(session, session); }
      syncContext();
    }
    return session;
  }

  const setupSection = node('details'); setupSection.className = 'nz-production-setup'; setupSection.open = true;
  setupSection.appendChild(node('summary', label('Design-to-production setup', 'הגדרה מתכנון לייצור'))); root.appendChild(setupSection);
  setupSection.appendChild(node('p', label('Start from a documented regional convention, preview the exact model changes, then complete each handoff gate. Presets are editable starting points—not code compliance or machine approval.', 'התחילו ממוסכמה אזורית מתועדת, צפו בשינויים המדויקים במודל והשלימו כל שער מסירה. התבניות הן נקודת פתיחה ולא אישור תקינה או מכונה.')));
  const presetSelect = field(setupSection,label('Convention & standards preset','תבנית מוסכמה ותקינה'),options(node('select'),CABINET_PRODUCTION_PRESETS.map(profile=>[profile.id,getLang()==='he'?profile.labelHe:profile.label])),'nzProductionPreset');
  const presetSummary=node('div');presetSummary.id='nzProductionPresetSummary';presetSummary.className='nz-preset-summary';setupSection.appendChild(presetSummary);
  const presetChanges=node('div');presetChanges.id='nzProductionPresetChanges';presetChanges.className='nz-preset-changes';setupSection.appendChild(presetChanges);
  const presetActions=node('div');presetActions.className='nz-production-actions';setupSection.appendChild(presetActions);
  const readiness=node('div');readiness.id='nzProductionReadiness';readiness.className='nz-readiness';setupSection.appendChild(readiness);
  let shownSession=null;
  function showPresetPreview(){
    const value=previewCabinetProductionPreset(getItems(),presetSelect.value),profile=value.preset,c=profile.construction;
    presetSummary.replaceChildren();presetChanges.replaceChildren();
    presetSummary.appendChild(node('strong',(getLang()==='he'?profile.labelHe:profile.label)+' · '+(getLang()==='he'?profile.regionHe:profile.region)));
    presetSummary.appendChild(node('p',label('Construction: ','מבנה: ')+c.system+' · '+label('units ','יחידות ')+profile.units+' · '+label('panel ','לוח ')+(c.panelMm??label('shop-defined','לפי הסדנה'))+' mm · '+label('back ','גב ')+(c.backMm??label('shop-defined','לפי הסדנה'))+' mm · '+label('reveal ','מרווח ')+(c.revealMm??label('shop-defined','לפי הסדנה'))+' mm'));
    presetSummary.appendChild(node('p',label('Standards focus: ','מוקד תקינה: ')+profile.standards.focus.join(', ')+' · '+label('market ','שוק ')+profile.standards.market));
    for(const note of profile.notes)presetSummary.appendChild(node('p',note));
    for(const reference of profile.references){const p=node('p'),a=node('a',reference.label);a.href=reference.url;a.target='_blank';a.rel='noopener noreferrer';p.appendChild(a);presetSummary.appendChild(p);}
    const changed=value.changes.filter(change=>change.fields.length);
    const heading=node('p',changed.length?changed.length+label(' cabinets would change.',' ארונות ישתנו.'):label('No model changes in this scope.','אין שינויי מודל בהיקף זה.'));heading.className='nz-preset-count';presetChanges.appendChild(heading);
    for(const change of changed){
      const row=node('details');row.appendChild(node('summary',change.itemId+' · '+change.family+' · '+change.fields.length+label(' changes',' שינויים')));
      for(const field of change.fields)row.appendChild(node('p',field.field+': '+String(field.before??label('not recorded','לא תועד'))+' → '+String(field.after)+(field.units?' '+field.units:'')));
      presetChanges.appendChild(row);
    }
    for(const skipped of value.skipped)presetChanges.appendChild(node('p',skipped.itemId+' · '+skipped.reason));
    if(value.stockIssues.length){
      const stock=node('details');stock.className='nz-preset-stock';stock.open=true;
      stock.appendChild(node('summary',value.stockIssues.length+label(' parts would lack matching sheet stock',' חלקים יהיו ללא לוח תואם')));
      stock.appendChild(node('p',label('The cut plan will exclude these parts until the design or stock catalog is corrected.','תוכנית הניסור לא תכלול חלקים אלה עד לתיקון המידות או קטלוג הלוחות.')));
      for(const issue of value.stockIssues.slice(0,12))stock.appendChild(node('p',issue.partId+' · '+issue.message));
      if(value.stockIssues.length>12)stock.appendChild(node('p','+'+(value.stockIssues.length-12)+label(' more parts',' חלקים נוספים')));
      presetChanges.appendChild(stock);
    }
  }
  presetSelect.addEventListener('change',showPresetPreview);
  button(presetActions,label('Apply construction + standards scope','החל מבנה + תחום תקינה'),()=>{
    currentSession();if(!getItems().length)throw new Error('No cabinets are in scope.');
    const id=presetSelect.value;
    onChange(()=>applyCabinetProductionPreset(getItems(),id));
    session.context=standardsContextForCabinetPreset(id,getItems(),session.context);
    syncContext();refresh();
  },'nzProductionApplyPreset');
  button(presetActions,label('Use standards scope only','החל תחום תקינה בלבד'),()=>{
    currentSession();session.context=standardsContextForCabinetPreset(presetSelect.value,getItems(),session.context);syncContext();assess();showReadiness();
  },'nzProductionApplyPresetScope');
  function showReadiness(){
    if(!session)return;readiness.replaceChildren();
    let recipes=[],recipeMessage='';
    try{recipes=getRecipes();}catch(error){recipeMessage=error.message;}
    const report=cabinetDesignToProductionReadiness(getItems(),{recipes,standardsContext:session.context,job:session.job});
    const head=node('div');head.className='nz-readiness-head '+report.status;
    head.appendChild(node('strong',label('Handoff readiness','מוכנות למסירה')+' · '+report.summary.complete+'/'+report.stages.length));
    head.appendChild(node('span',report.summary.blocked+label(' blocked · ',' חסומים · ')+report.summary.review+label(' review',' לבדיקה')));readiness.appendChild(head);
    for(const value of report.stages){
      const row=node('details');row.className='nz-readiness-stage '+value.status;
      const summary=node('summary');summary.appendChild(node('span',value.label));summary.appendChild(node('b',value.status==='complete'?label('Complete','הושלם'):value.status==='review'?label('Review','בדיקה'):label('Blocked','חסום')));row.appendChild(summary);
      row.appendChild(node('p',value.summary));
      for(const issue of value.issues.slice(0,20))row.appendChild(node('p',issue.message||issue.reason||String(issue)));
      if(value.issues.length>20)row.appendChild(node('p','+'+(value.issues.length-20)+label(' more findings',' ממצאים נוספים')));
      readiness.appendChild(row);
    }
    if(recipeMessage)readiness.appendChild(node('p',recipeMessage));
    readiness.appendChild(node('p',report.notice));
  }

  const partsSection = node('details'); partsSection.appendChild(node('summary', label('Part sizes & edge banding', 'מידות חלקים וקנטים'))); root.appendChild(partsSection);
  const partSelect = field(partsSection, label('Physical part', 'חלק'), node('select'), 'nzProductionPart');
  const dimensions = node('p'); dimensions.id = 'nzProductionDimensions'; partsSection.appendChild(dimensions);
  partsSection.appendChild(node('p', label('Length is the longer finished edge; start/end refer to that part’s local size axes. Enter all four edges explicitly, including 0 for an unbanded edge. Grain follows the stock.', 'האורך הוא הצלע הארוכה המוגמרת. התחלה וסוף מתייחסים לצירי המידה המקומיים. הזינו ארבעה קנטים, כולל 0 לצלע ללא קנט.')));
  const edgeInputs = {};
  for (const [name, title] of [['lengthStart','Length start'],['lengthEnd','Length end'],['widthStart','Width start'],['widthEnd','Width end']]) {
    const row = node('fieldset'); row.appendChild(node('legend', title)); partsSection.appendChild(row);
    const thickness = field(row, label('Band thickness (mm)', 'עובי קנט (מ״מ)'), node('input'));
    thickness.type = 'number'; thickness.min = '0'; thickness.step = '0.1'; thickness.dataset.edge = name;
    const stock = field(row, label('Band stock / SKU', 'מק״ט קנט'), options(node('select'), [['',label('No band / unspecified','ללא קנט / לא הוגדר')],...BANDING.map(b=>[b.id,bandLabel(b,getLang()==='en')])]));
    stock.addEventListener('change',()=>{ thickness.value = stock.value ? BANDING.find(b=>b.id===stock.value).t*10 : 0; });
    edgeInputs[name] = {thickness, stock};
  }
  const roughL = field(partsSection, label('Total extra length for rough blank (mm)', 'תוספת כוללת לאורך הגלם (מ״מ)'), node('input'), 'nzProductionRoughL');
  const roughW = field(partsSection, label('Total extra width for rough blank (mm)', 'תוספת כוללת לרוחב הגלם (מ״מ)'), node('input'), 'nzProductionRoughW');
  for (const el of [roughL, roughW]) { el.type = 'number'; el.min = '0'; el.step = '0.1'; }
  const datumSection = node('details'); datumSection.appendChild(node('summary', label('Machining stock datum', 'ראשית צירי הגלם לעיבוד'))); partsSection.appendChild(datumSection);
  datumSection.appendChild(node('p', label('Allocate rough trimming stock to the minimum model-axis edges. This mapping applies only to a complete shop drilling recipe with matching axes. Generic hinge and carcass drilling remains blocked when stock differs from finished dimensions.', 'חלקו את תוספת הגלם לצלעות המינימום בצירי המודל. המיפוי חל רק על מתכון קידוח מלא בעל צירים תואמים.')));
  const datumL = field(datumSection, label('Extra stock at length start (mm)', 'תוספת גלם בתחילת האורך (מ״מ)'), node('input'), 'nzProductionDatumL');
  const datumW = field(datumSection, label('Extra stock at width start (mm)', 'תוספת גלם בתחילת הרוחב (מ״מ)'), node('input'), 'nzProductionDatumW');
  for (const input of [datumL,datumW]) { input.type='number'; input.min='0'; input.step='any'; }
  const datumReviewer = field(datumSection, label('Datum reviewer', 'בודק ראשית הצירים'), node('input'), 'nzProductionDatumReviewer');
  const datumReference = field(datumSection, label('Stock setup drawing reference', 'מסמך הגדרת הגלם'), node('input'), 'nzProductionDatumReference');
  const datumStatus = node('p'); datumStatus.id='nzProductionDatumStatus'; datumSection.appendChild(datumStatus);
  let manifest = null;
  function selectedPart() { return manifest?.parts.find(p => p.id === partSelect.value); }
  function sizeText(size) { return size ? [size.length,size.width,size.thickness].map(v => Number(v.toFixed(3))).join(' × ') + ' mm' : label('Not specified', 'לא הוגדר'); }
  function showPart() {
    const p = selectedPart();
    dimensions.textContent = p ? p.id + ' · ' + label('Finished: ', 'מוגמר: ') + sizeText(p.finished) + ' · ' + label('Substrate: ', 'לוח: ') + sizeText(p.substrate) + ' · ' + label('Rough: ', 'גלם: ') + sizeText(p.rough) + ' · ' + p.datum : label('No cabinet parts in this scope.', 'אין חלקי ארון בהיקף זה.');
    const item = getItems().find(it => String(it.id) === p?.itemId), override = item?.cab?.productionOverrides?.[p?.partId];
    for (const [name, controls] of Object.entries(edgeInputs)) { controls.thickness.value = override?.edges?.[name]?.thicknessMm ?? ''; controls.stock.value = override?.edges?.[name]?.stockId ?? ''; }
    roughL.value = override?.roughAllowance?.lengthMm ?? ''; roughW.value = override?.roughAllowance?.widthMm ?? '';
    datumL.value=override?.machiningDatum?.lengthStartExtraMm ?? ''; datumW.value=override?.machiningDatum?.widthStartExtraMm ?? '';
    datumReviewer.value=override?.machiningDatum?.reviewedBy ?? ''; datumReference.value=override?.machiningDatum?.sourceDrawing ?? '';
    datumStatus.textContent=p?.stockMapping ? label('Stock datum recorded for matching shop recipes.', 'ראשית צירי הגלם תועדה למתכונים תואמים.') + ' ΔL '+p.stockMapping.offsetLength+' mm · ΔW '+p.stockMapping.offsetWidth+' mm' : label('No valid stock datum recorded.', 'לא תועדה ראשית צירי גלם תקפה.');
  }
  partSelect.addEventListener('change', showPart);
  button(partsSection, label('Apply part allowances', 'החל תוספות לחלק'), () => {
    const p = selectedPart(), item = getItems().find(it => String(it.id) === p?.itemId);
    if (!p || !item || p.geometry !== 'rectangle') throw new Error('Select a rectangular physical board.');
    const edges = Object.fromEntries(Object.entries(edgeInputs).map(([name, controls]) => [name,{thicknessMm:controls.thickness.value.trim() === '' ? null : Number(controls.thickness.value),stockId:controls.stock.value.trim()}]));
    const override = {datum:p.datum,topologyBinding:p.topologyBinding,edges,roughAllowance:{lengthMm:roughL.value.trim() === '' ? null : Number(roughL.value),widthMm:roughW.value.trim() === '' ? null : Number(roughW.value)}};
    const candidate = JSON.parse(JSON.stringify(item)); candidate.cab.productionOverrides ||= {}; candidate.cab.productionOverrides[p.partId] = override;
    const report = cabinetProductionParts([candidate]);
    const bad = report.issues.filter(i => i.partId === p.id && /invalid-|unsupported-edge|edge-datum|edge-stock|edge-topology/.test(i.code));
    if (bad.length) throw new Error(bad.map(i => i.message).join(' '));
    onChange(() => { item.cab.productionOverrides ||= {}; item.cab.productionOverrides[p.partId] = override; });
    refresh();
  }, 'nzProductionApplyEdges');
  button(datumSection,label('Record stock datum','תעד ראשית צירי גלם'),()=>{
    const p=selectedPart(),item=getItems().find(it=>String(it.id)===p?.itemId);
    if(!p?.substrate || !p?.rough || !item?.cab?.productionOverrides?.[p.partId]) throw new Error('Apply valid part allowances first.');
    if(!datumL.value.trim() || !datumW.value.trim()) throw new Error('Enter both start-edge stock amounts explicitly, including zero.');
    const candidate=JSON.parse(JSON.stringify(item));
    const mapping={datum:p.datum,topologyBinding:p.topologyBinding,stockSignature:p.stockSignature,reviewedBy:datumReviewer.value.trim(),sourceDrawing:datumReference.value.trim(),lengthStartExtraMm:Number(datumL.value),widthStartExtraMm:Number(datumW.value)};
    candidate.cab.productionOverrides[p.partId].machiningDatum=mapping;
    const report=cabinetProductionParts([candidate]),mapped=report.parts.find(part=>part.id===p.id);
    if(!mapped?.stockMapping) throw new Error(report.issues.filter(issue=>issue.partId===p.id).map(issue=>issue.message).join(' ') || 'Stock datum is invalid.');
    onChange(()=>{item.cab.productionOverrides[p.partId].machiningDatum=mapping;}); refresh();
  },'nzProductionApplyDatum');
  const joinery = mountCabinetJoinery(root,getItems,download,onChange);
  const batchAllowances = mountCabinetAllowanceBatch(root,getItems,onChange);
  const coverageSection=node('details');coverageSection.appendChild(node('summary',label('Machining operation coverage','כיסוי פעולות עיבוד')));root.appendChild(coverageSection);
  coverageSection.appendChild(node('p',label('Check which physical parts have a complete drilling recipe, an explicit no-drill reason, partial generic patterns or missing operations. Saved joinery is counted separately and does not complete a CNC recipe.','בדקו לאילו חלקים קיים מתכון קידוח מלא, נימוק ללא קידוח או פעולות חסרות. תכניות חיבור נספרות בנפרד.')));
  const coverageStatus=node('p');coverageStatus.id='nzProductionCoverageStatus';coverageStatus.setAttribute('role','status');coverageSection.appendChild(coverageStatus);
  const coverageRows=node('div');coverageRows.id='nzProductionCoverageRows';coverageSection.appendChild(coverageRows);
  const coverageLabels={ 'complete-drilling':label('Recipe drilling','קידוח לפי מתכון'),'explicit-no-drill':label('Explicit no-drill','ללא קידוח — מנומק'),'generic-partial':label('Generic / partial','כללי / חלקי'),missing:label('Missing','חסר'),unsupported:label('Unsupported','לא נתמך') };
  function showCoverage(){
    coverageRows.replaceChildren();
    try{
      const report=cabinetOperationCoverage(getItems(),getRecipes());
      coverageStatus.textContent=report.parts.length+label(' parts · review only',' חלקים · לבדיקה בלבד');
      for(const part of report.parts){const row=node('details');row.appendChild(node('summary',part.id+' · '+(coverageLabels[part.coverage]||part.coverage)));row.appendChild(node('p',label('Drilling operations: ','פעולות קידוח: ')+part.drillingCount+' · A '+part.faces.A+' / B '+part.faces.B+' · '+label('Saved joinery review operations: ','פעולות חיבור לבדיקה: ')+part.joineryReviewCount));if(part.noDrillReason)row.appendChild(node('p',part.noDrillReason));for(const issue of part.issues||[])row.appendChild(node('p',issue.message));coverageRows.appendChild(row);}
      for(const issue of report.issues)coverageRows.appendChild(node('p',issue.message));
    }catch(error){coverageStatus.textContent=error.message;}
  }
  coverageSection.addEventListener('toggle',()=>{if(coverageSection.open)showCoverage();});
  button(coverageSection,label('Refresh operation coverage','רענון כיסוי פעולות'),showCoverage,'nzProductionCoverageRefresh');
  button(coverageSection,label('Download coverage report','הורדת דוח כיסוי פעולות'),()=>download('cabinet-operation-coverage.json',JSON.stringify(cabinetOperationCoverage(getItems(),getRecipes()),null,2),'application/json'),'nzProductionCoverageExport');

  const standardsSection = node('details'); standardsSection.appendChild(node('summary', label('Market requirements & evidence', 'דרישות שוק ומסמכים'))); root.appendChild(standardsSection);
  const market = field(standardsSection, label('Destination market', 'שוק יעד'), options(node('select'), [['international','International / unspecified'],['US','United States'],['EU','European Union'],['UK','United Kingdom'],['IL','Israel — local pack not yet evaluated'],['CA','Canada — local pack not yet evaluated'],['AU','Australia — local pack not yet evaluated']]), 'nzProductionMarket');
  const product = field(standardsSection, label('Product type', 'סוג מוצר'), options(node('select'), [['unknown','Unspecified'],['kitchen','Kitchen cabinet'],['vanity','Bathroom vanity'],['wardrobe','Wardrobe / clothing storage'],['bookcase','Bookcase'],['office','Office casework']]), 'nzProductionProduct');
  const factsDetails = node('details'); factsDetails.appendChild(node('summary',label('Set applicability & measured dimensions','הגדרת תחולה ומידות שנמדדו'))); standardsSection.appendChild(factsDetails);
  const factInputs=[];
  for(const [name,en,he] of [
    ['domesticUse','Domestic / kitchen use','שימוש ביתי / מטבח'],
    ['architecturalCasework','Architectural casework contract','חוזה נגרות אדריכלית'],
    ['containsRegulatedCompositeWood','Contains regulated composite wood','מכיל לוחות עץ מרוכבים מפוקחים'],
    ['adaRequired','US accessible project (ADA applies)','פרויקט נגיש בארה״ב (ADA חל)'],
    ['ada8043Required','Residential work-surface provision applies','דרישת משטח עבודה למגורים חלה'],
    ['adjustableWorkSurface','Work surface is adjustable','משטח העבודה מתכוונן'],
    ['freestanding','Freestanding furniture','ריהוט עומד עצמאי'],
    ['bedroomClothingStorage','Bedroom clothing storage','אחסון בגדים בחדר שינה'],
    ['hasDrawersOrHingedDoors','Has drawers or hinged doors','כולל מגירות או דלתות ציר'],
    ['reachExempt','Assessed as exempt from REACH entry 77','נבדק ונמצא פטור מסעיף REACH 77'],
  ]) {
    const input=field(factsDetails,label(en,he),options(node('select'),[['',label('Unknown','לא ידוע')],['true',label('Yes','כן')],['false',label('No','לא')]]),'nzProductionFact'+name);
    factInputs.push({name,input,type:'boolean'});
  }
  for(const [name,en,he,type] of [
    ['workSurfaceHeightMm','Work surface height (mm)','גובה משטח עבודה (מ״מ)','number'],
    ['workSurfaceWidthMm','Clear work surface width (mm)','רוחב משטח עבודה פנוי (מ״מ)','number'],
    ['heightMm','Furniture height (mm)','גובה ריהוט (מ״מ)','number'],
    ['massKg','Measured furniture mass (kg)','מסת ריהוט שנמדדה (ק״ג)','number'],
    ['enclosedVolumeLitres','Enclosed storage volume (litres)','נפח אחסון סגור (ליטר)','number'],
    ['manufacturedOn','Manufacturing date','תאריך ייצור','date'],
    ['placedOnMarketOn','Placing-on-market date','תאריך שיווק','date'],
  ]) {
    const input=field(factsDetails,label(en,he),node('input'),'nzProductionFact'+name); input.type=type;
    if(type==='number'){ input.min='0'; input.step='any'; }
    factInputs.push({name,input,type});
  }
  const rules = node('div'); rules.id = 'nzProductionRules'; standardsSection.appendChild(rules);
  const contextDetails = node('details'); contextDetails.appendChild(node('summary', label('Scope facts & evidence records', 'נתוני תחולה ומסמכים'))); standardsSection.appendChild(contextDetails);
  contextDetails.appendChild(node('p', label('This catalog is partial. References record evidence but do not certify the cabinet. Unknown or stale evidence remains not evaluated.', 'הקטלוג חלקי. מסמכים אינם אישור תקינה. נתונים חסרים או לא עדכניים נותרים ללא בדיקה.')));
  const contextEditor = field(contextDetails, label('Assessment context (JSON)', 'נתוני בדיקה (JSON)'), node('textarea'), 'nzProductionContext'); contextEditor.rows = 10; contextEditor.spellcheck = false;
  let contextDirty = false;
  contextEditor.addEventListener('input', () => { contextDirty = true; status.textContent = label('Apply assessment edits before exporting.', 'החילו את נתוני הבדיקה לפני ייצוא.'); });
  function syncContext() { if (!session) return; market.value = session.context.market; product.value = session.context.productType; contextEditor.value = JSON.stringify(session.context,null,2); contextDirty = false; for(const {name,input} of factInputs) input.value=session.context.facts[name] == null ? '' : String(session.context.facts[name]); }
  for(const {name,input,type} of factInputs) input.addEventListener('change',()=>{
    currentSession();
    if(input.value==='') delete session.context.facts[name];
    else session.context.facts[name]=type==='boolean'?input.value==='true':type==='number'?Number(input.value):input.value;
    syncContext(); assess(); showReadiness();
  });
  for (const control of [market, product]) control.addEventListener('change', () => { currentSession(); session.context = createCabinetStandardsContext({...session.context,market:market.value,productType:product.value}); syncContext(); assess(); showReadiness(); });
  button(contextDetails, label('Apply assessment facts', 'החל נתוני בדיקה'), () => {
    const value = JSON.parse(contextEditor.value);
    if (!value || typeof value !== 'object' || Array.isArray(value) || (value.evidence != null && !Array.isArray(value.evidence)) || (value.facts != null && (typeof value.facts !== 'object' || Array.isArray(value.facts)))) throw new Error('Use an assessment object with facts and an evidence array.');
    session.context = createCabinetStandardsContext(value); syncContext(); assess(); showReadiness();
  }, 'nzProductionApplyContext');
  function assess() {
    if (!session) return;
    const assessment = evaluateCabinetStandards(getItems(), session.context); rules.replaceChildren();
    for (const rule of assessment.rules) {
      const row = node('details'), pair = states[rule.status] || states['not-evaluated'];
      row.appendChild(node('summary', rule.label + ' · ' + label(...pair)));
      row.appendChild(node('p', rule.reason));
      const source = node('a', label('Source and edition', 'מקור ומהדורה') + ': ' + rule.edition);
      if (/^https:\/\//.test(rule.source)) { source.href = rule.source; source.target = '_blank'; source.rel = 'noopener noreferrer'; }
      row.appendChild(source); rules.appendChild(row);
    }
    return assessment;
  }
  button(standardsSection, label('Download assessment & evidence template', 'הורד בדיקה ותבנית מסמכים'), () => {
    if (contextDirty) throw new Error('Apply assessment edits first.');
    const assessment = assess();
    download('cabinet-standards-review.json', JSON.stringify({assessment,context:session.context,evidenceTemplate:{ruleId:'',edition:'',designSignature:assessment.designSignature,designVersion:assessment.designVersion,reference:'',result:'unknown'}},null,2),'application/json');
  }, 'nzProductionStandardsExport');

  const workflow = node('details'); workflow.appendChild(node('summary', label('Job revisions & shop documents', 'גרסאות ומסמכי עבודה'))); root.appendChild(workflow);
  const jobName = field(workflow, label('Job name', 'שם עבודה'), node('input'), 'nzProductionJobName'); jobName.value = 'cabinet-job'; jobName.maxLength = 120;
  const jobStatus = node('p'); jobStatus.id = 'nzProductionJobStatus'; workflow.appendChild(jobStatus);
  const issueList = node('div'); issueList.id = 'nzProductionIssueList'; workflow.appendChild(issueList);
  const acknowledge = field(workflow,label('I reviewed the listed document limitations','בדקתי את מגבלות המסמכים'),node('input'),'nzProductionAcknowledge'); acknowledge.type = 'checkbox';
  const reviewer = field(workflow, label('Reviewer / operator', 'בודק / מפעיל'), node('input'), 'nzProductionReviewer');
  const reviewRef = field(workflow, label('Review record reference', 'מסמך בדיקה'), node('input'), 'nzProductionReviewRef');
  workflow.appendChild(node('p', label('Checking or releasing these documents records a human review. It does not authorize CNC production. Export the job JSON to retain its snapshot and station records.', 'בדיקה ושחרור מסמכים מתעדים בדיקה אנושית, ואינם מאשרים ייצור CNC. ייצאו JSON לשמירת הגרסה ונתוני התחנות.')));
  function retainPreviousJob() { if(session.job) session.archives.push(session.job); }
  button(workflow, label('Create current revision snapshot', 'צור גרסה מהתכנון הנוכחי'), () => { currentSession(); const next=createCabinetProductionJob(getItems(),{jobId:jobName.value.trim() || 'cabinet-job'}); retainPreviousJob(); session.job = next; acknowledge.checked = false; showJob(); }, 'nzProductionSnapshot');
  function freshJob() {
    currentSession();
    if (!session.job) throw new Error('Create a revision snapshot first.');
    if (cabinetProductionStaleness(session.job,getItems()).stale) throw new Error('The design changed. Create a new revision snapshot before exporting or recording work.');
    return session.job;
  }
  for (const [state,title] of [['checked',label('Record document check','תעד בדיקת מסמכים')],['released',label('Release review documents','שחרר מסמכי בדיקה')]]) button(workflow,title,() => {
    const job = freshJob();
    session.job = transitionCabinetProductionJob(job,state,{items:getItems(),reviewer:reviewer.value,evidence:reviewRef.value,acknowledgedIssues:acknowledge.checked ? [...new Set(job.manifest.issues.map(i=>i.code))] : []}); showJob();
  },'nzProduction'+state);
  for (const [id,title,filename,mime,render] of [
    ['CSV',label('Production parts CSV','חלקי ייצור CSV'),'cabinet-parts-review.csv','text/csv',cabinetProductionCSV],
    ['Labels',label('Printable part labels','תוויות חלקים להדפסה'),'cabinet-part-labels.html','text/html',job=>cabinetProductionHTML(job,{document:'labels'})],
    ['Traveler',label('Assembly travelers','דפי מעקב הרכבה'),'cabinet-assembly-travelers.html','text/html',job=>cabinetProductionHTML(job,{document:'traveler'})],
    ['Drawings',label('Dimensioned part drawings','שרטוטי חלקים עם מידות'),'cabinet-part-drawings.html','text/html',job=>cabinetProductionDrawingHTML(job,getItems(),{recipes:getRecipes()})],
    ['Job',label('Save job snapshot JSON','שמור גרסת עבודה JSON'),'cabinet-production-job.json','application/json',job=>JSON.stringify(job,null,2)],
  ]) button(workflow,title,()=>download(filename,render(freshJob()),mime),id==='Labels'?'nzProductionExportLabels':'nzProductionExport'+id);
  const inspection = mountCabinetInspection(workflow,()=>({job:session?.job,items:getItems()}),download);
  const packageSection=node('details');packageSection.appendChild(node('summary',label('Manufacturing review package','חבילת בדיקה לייצור')));workflow.appendChild(packageSection);
  packageSection.appendChild(node('p',label('One JSON package retains the job revision, applied recipes, standards context and generated review documents together. Its integrity check detects changed content; it is not a digital signature or a production approval.','חבילת JSON אחת שומרת את הגרסה, המתכונים, נתוני התקינה ומסמכי הבדיקה יחד. בדיקת שלמות אינה חתימה דיגיטלית או אישור ייצור.')));
  const packageStatus=node('p');packageStatus.id='nzProductionPackageStatus';packageStatus.setAttribute('role','status');packageSection.appendChild(packageStatus);
  let packageArchive=null;
  const packageFiles=field(packageSection,label('Contained document','מסמך בחבילה'),node('select'),'nzProductionPackageFiles');
  function showPackage(value){packageArchive=value;packageFiles.replaceChildren();options(packageFiles,value.files.map(file=>[file.name,file.name]));packageStatus.textContent=value.revision+' · '+value.files.length+label(' archived review documents · integrity checked',' מסמכי בדיקה בארכיון · השלמות נבדקה');}
  button(packageSection,label('Build & download review package','יצירה והורדת חבילת בדיקה'),()=>{
    if(contextDirty)throw new Error('Apply assessment edits before packaging.');
    const value=createCabinetReviewPackage(freshJob(),getItems(),{recipes:getRecipes(),standardsContext:session.context,inspectionPlan:inspection.getPlan()});showPackage(value);
    download('cabinet-review-package.json',JSON.stringify(value,null,2),'application/json');
  },'nzProductionPackageExport');
  button(packageSection,label('Share review package with shop','שתף חבילת בדיקה עם הסדנה'),async()=>{
    try {
      if(contextDirty)throw new Error('Apply assessment edits before packaging.');
      const value=createCabinetReviewPackage(freshJob(),getItems(),{recipes:getRecipes(),standardsContext:session.context,inspectionPlan:inspection.getPlan()});
      showPackage(value);
      const content=JSON.stringify(value,null,2),file=new File([content],'cabinet-review-package.json',{type:'application/json'});
      if(navigator.share && navigator.canShare?.({files:[file]})) {
        await navigator.share({files:[file],title:'Cabinet review package',text:'Revision '+value.revision+' · review documents only'});
        packageStatus.textContent=label('Package handed to the system share sheet. Confirm delivery with the workshop.','החבילה נמסרה לחלון השיתוף. ודאו מסירה מול הסדנה.');
      } else {
        download(file.name,content,file.type);
        packageStatus.textContent=label('Package downloaded. Attach the file to your message to the workshop.','החבילה הורדה. צרפו את הקובץ להודעה לסדנה.');
      }
    } catch(error) { if(error.name!=='AbortError') status.textContent=error.message; }
  },'nzProductionPackageShare');
  const packageImport=field(packageSection,label('Verify saved review package JSON','בדיקת חבילת JSON שמורה'),node('input'),'nzProductionPackageImport');packageImport.type='file';packageImport.accept='.json,application/json';
  packageImport.addEventListener('change',async()=>{try{
    const file=packageImport.files[0];if(!file)return;
    packageArchive=null;packageFiles.replaceChildren();
    if(file.size>25000000)throw new Error('Review package exceeds 25 MB.');
    showPackage(importCabinetReviewPackage(await file.text()));
  }catch(error){packageStatus.textContent=error.message;}finally{packageImport.value='';}});
  button(packageSection,label('Download selected packaged document','הורדת המסמך הנבחר מהחבילה'),()=>{
    const file=packageArchive?.files.find(value=>value.name===packageFiles.value);if(!file)throw new Error('Build or verify a review package first.');
    download(file.name,file.content,file.mime);
  },'nzProductionPackageDocument');
  const importFile = field(workflow,label('Load saved job JSON (reopens as draft)','טען גרסה שמורה כטיוטה'),node('input'),'nzProductionImport'); importFile.type = 'file'; importFile.accept = '.json,application/json';
  importFile.addEventListener('change',async()=>{ try { const file=importFile.files[0]; if (!file) return; if(file.size>10000000) throw new Error('Job file exceeds 10 MB.'); const imported=importCabinetProductionJob(await file.text()); retainPreviousJob(); session.job=imported; jobName.value=session.job.jobId; acknowledge.checked=false; showJob(); } catch(error){ status.textContent=error.message; } finally { importFile.value=''; } });
  const archiveSelect=field(workflow,label('Previous snapshots in this session','גרסאות קודמות במפגש זה'),node('select'),'nzProductionArchive');
  button(workflow,label('Download previous snapshot as archive','הורד גרסה קודמת לארכיון'),()=>{
    const previous=session.archives[Number(archiveSelect.value)];
    if(!previous) throw new Error('No previous snapshot selected.');
    download('cabinet-archive-'+previous.revision+'.json',JSON.stringify(previous,null,2),'application/json');
  },'nzProductionExportArchive');
  const diffSection=node('details');diffSection.appendChild(node('summary',label('Compare revisions','השוואת גרסאות')));workflow.appendChild(diffSection);
  diffSection.appendChild(node('p',label('Compare the selected previous snapshot with the current saved snapshot. Topology changes require checking part identity; matching IDs do not guarantee the same physical board.','השוו את הגרסה הקודמת שנבחרה לגרסה השמורה הנוכחית. שינוי מבני מחייב בדיקה מחדש של זהות החלקים.')));
  const diffStatus=node('p');diffStatus.id='nzProductionDiffStatus';diffStatus.setAttribute('role','status');diffSection.appendChild(diffStatus);
  const diffRows=node('div');diffRows.id='nzProductionDiffRows';diffSection.appendChild(diffRows);
  function comparisonJobs(){
    const after=freshJob(),before=session.archives[Number(archiveSelect.value)];
    if(!before)throw new Error('Select a previous snapshot to compare.');
    return {before,after};
  }
  button(diffSection,label('Compare selected revisions','השוואת הגרסאות הנבחרות'),()=>{
    const {before,after}=comparisonJobs(),report=compareCabinetProductionJobs(before,after);diffRows.replaceChildren();
    diffStatus.textContent=before.revision+' → '+after.revision+' · '+report.summary.added+label(' added · ',' נוספו · ')+report.summary.removed+label(' removed · ',' הוסרו · ')+report.summary.changed+label(' changed',' השתנו');
    for(const part of report.parts){const row=node('details');row.appendChild(node('summary',part.id+' · '+part.change));row.appendChild(node('p',part.physicalContinuity));for(const change of part.fields)row.appendChild(node('p',change.field+': '+JSON.stringify(change.before)+' → '+JSON.stringify(change.after)));diffRows.appendChild(row);}
    if(report.joineryChanges.length)diffRows.appendChild(node('p',label('Saved joinery changed.','תכניות החיבור השתנו.')));
    if(report.hardwareEvidenceChanges.length)diffRows.appendChild(node('p',label('Hardware evidence changed.','מסמכי הפרזול השתנו.')));
    if(report.sourceChanges.length)diffRows.appendChild(node('p',label('Source cabinet settings changed; see exported comparison.','הגדרות המקור השתנו; ראו דוח השוואה.')));
  },'nzProductionCompare');
  for(const [suffix,filename,mime,render] of [['HTML','cabinet-revision-comparison.html','text/html',cabinetRevisionDiffHTML],['CSV','cabinet-revision-comparison.csv','text/csv',cabinetRevisionDiffCSV]])button(diffSection,label('Download comparison ','הורדת השוואה ')+suffix,()=>{const {before,after}=comparisonJobs();download(filename,render(before,after),mime);},'nzProductionDiff'+suffix);
  archiveSelect.addEventListener('change',()=>{diffRows.replaceChildren();diffStatus.textContent=label('Compare to refresh the selected revisions.','השוו כדי לרענן את הגרסאות הנבחרות.');});
  const station = field(workflow,label('Next station','תחנה הבאה'), options(node('select'),CABINET_STATIONS.map(s=>[s,s])), 'nzProductionStation');
  const skip = field(workflow,label('Skip band/drill — give reason in record reference','דלג על קנט/קידוח — ציינו סיבה בשדה המסמך'),node('input'),'nzProductionSkip'); skip.type='checkbox';
  button(workflow,label('Record selected part at station','תעד את החלק בתחנה'),()=>{
    const job = freshJob(); session.job = recordCabinetStation(job,{revision:job.revision,partId:partSelect.value,station:station.value,operator:reviewer.value,note:reviewRef.value,items:getItems(),skipped:skip.checked,skipReason:reviewRef.value}); showJob();
  },'nzProductionRecordStation');
  function showJob() {
    const job = session?.job;
    inspection.refresh();diffRows.replaceChildren();diffStatus.textContent='';
    issueList.replaceChildren();
    const selectedArchive=archiveSelect.value; archiveSelect.replaceChildren();
    options(archiveSelect,(session?.archives||[]).map((previous,index)=>[String(index),previous.jobId+' · '+previous.revision+' · '+previous.status]));
    if(session?.archives[Number(selectedArchive)]) archiveSelect.value=selectedArchive;
    if (!job) { jobStatus.textContent = label('No revision snapshot yet.','טרם נוצרה גרסה.'); showReadiness(); return; }
    for(const issue of job.manifest.issues) issueList.appendChild(node('p',issue.message));
    const stale = cabinetProductionStaleness(job,getItems()).stale;
    jobStatus.textContent = job.jobId + ' · ' + job.revision + ' · ' + (stale ? label('STALE — design changed','לא עדכני — התכנון השתנה') : job.status) + ' · ' + job.stationRecords.length + label(' station records',' רשומות תחנה');
    showReadiness();
  }
  function refresh() {
    currentSession();
    manifest = cabinetProductionParts(getItems());
    const selected = partSelect.value; partSelect.replaceChildren();
    options(partSelect,manifest.parts.map(p=>[p.id,p.itemId+' · '+p.partId+' · '+sizeText(p.finished)]));
    if (manifest.parts.some(p=>p.id===selected)) partSelect.value = selected;
    status.textContent = manifest.parts.length + label(' physical parts · ',' חלקים · ') + manifest.issues.length + label(' review findings',' ממצאי בדיקה');
    if(shownSession!==session){
      const recorded=[...new Set(getItems().map(item=>item?.cab?.productionConvention?.presetId).filter(Boolean))];
      presetSelect.value=recorded.length===1&&CABINET_PRODUCTION_PRESETS.some(profile=>profile.id===recorded[0])?recorded[0]:'manual';
      shownSession=session;
    }
    showPresetPreview();showPart(); assess(); showJob(); joinery.refresh(); batchAllowances.refresh(); if(coverageSection.open)showCoverage();
  }
  return {refresh};
}
