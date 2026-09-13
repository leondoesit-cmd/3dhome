import {ENGINEERING_MATERIALS,engineeringMaterial,initialMaterialProfile,materialProfileFor,upsertMaterialProfile,validateMaterialProfile} from './engineering_materials.js';
import {evaluateGearService,gearQualificationSignature} from './cad_gear_validation.js';
const words={
 title:['נתוני חומר הנדסיים','Engineering material data'],mate:['נתוני חומר לגלגל המשולב','Mating material data'],service:['עומס וסבולות','Loads and tolerances'],rating:['רישום דירוג לתצורה','Record configuration rating'],check:['בדיקת חומר ועומס','Check material and load'],
 catalog:['חומר','Material'],grade:['דרגה / מפרט חומר','Grade / material specification'],condition:['מצב / טיפול / כיוון סיבים','Condition / treatment / grain direction'],source:['מקור נתוני ההסמכה','Qualification data reference'],model:['מודל חומר','Material model'],isotropic:['אלסטי איזוטרופי','Isotropic elastic'],rated:['דירוג לתצורת גלגל מסוימת','Configuration-specific rating'],
 hint:['נתוני חוזק חייבים להתאים לדרגה ולתנאי העבודה. ניתן לשמור נתונים חסרים להשלמה.','Strength data must match the grade and service conditions. Incomplete records can be saved for later completion.'],
 E:['מודול יאנג (MPa)','Young modulus (MPa)'],nu:['מקדם פואסון','Poisson ratio'],bending:['מאמץ כפיפה מותר למחזורי העבודה (MPa)','Allowable bending stress for qualified life (MPa)'],contact:['מאמץ מגע מותר (MPa)','Allowable contact stress (MPa)'],
 minTemp:['טמפרטורה מינימלית מוסמכת (°C)','Qualified minimum temperature (°C)'],maxTemp:['טמפרטורה מרבית מוסמכת (°C)','Qualified maximum temperature (°C)'],cycles:['מספר מחזורים מוסמך','Qualified life (cycles)'],maxHours:['משך עבודה מוסמך (שעות)','Qualified service duration (hours)'],maxRpm:['מהירות מרבית מוסמכת (rpm)','Qualified maximum speed (rpm)'],environment:['סביבה / לחות מוסמכת','Qualified environment / moisture'],lubrication:['סיכה מוסמכת','Qualified lubrication'],
 method:['שיטת בדיקה','Check method'],screen:['בדיקת כפיפה ומגע ראשונית','Preliminary bending/contact screening'],mateProfile:['הסמכת חומר לגלגל המשולב','Mating material qualification'],none:['בחר הסמכת חומר','Select material qualification'],
 torque:['מומנט בגלגל הנבחר (Nm)','Torque on selected gear (Nm)'],rpm:['מהירות בגלגל הנבחר (rpm)','Selected gear speed (rpm)'],hours:['משך עבודה (שעות)','Service duration (hours)'],temp:['טמפרטורת עבודה (°C)','Operating temperature (°C)'],env:['סביבה / לחות בעבודה','Operating environment / moisture'],lube:['סיכה בעבודה','Operating lubrication'],mateWidth:['רוחב הגלגל המשולב (מ״מ)','Mating gear face width (mm)'],
 application:['מקדם עומס חיצוני (≥1)','Application load factor (≥1)'],dynamic:['מקדם דינמי (≥1)','Dynamic load factor (≥1)'],face:['מקדם פיזור עומס (≥1)','Face load factor (≥1)'],sfB:['מקדם בטיחות כפיפה / מומנט (≥1)','Bending / torque safety factor (≥1)'],sfH:['מקדם בטיחות למאמץ מגע (≥1)','Contact stress safety factor (≥1)'],
 Y1:['מקדם Lewis לגלגל הנבחר (לפי מודול)','Selected gear Lewis factor (module-based Y)'],Y2:['מקדם Lewis לגלגל המשולב','Mating gear Lewis factor (module-based Y)'],Ysource:['מקור מקדמי צורת השן','Tooth form-factor reference'],
 center:['סטיית מרחק צירים ± (מ״מ)','Center distance deviation ± (mm)'],tooth1:['סטיית עובי שן בגלגל הנבחר ± (מ״מ)','Selected tooth thickness deviation ± (mm)'],tooth2:['סטיית עובי שן בגלגל המשולב ± (מ״מ)','Mating tooth thickness deviation ± (mm)'],minimum:['חופש מינימלי נדרש (מ״מ)','Required minimum backlash (mm)'],maximum:['חופש מרבי מותר (מ״מ)','Allowed maximum backlash (mm)'],profile:['סבולת פרופיל בשרטוט (מ״מ)','Drawing profile tolerance (mm)'],measured:['שגיאת פרופיל נמדדת (מ״מ)','Measured profile deviation (mm)'],measurement:['מקור מדידת פרופיל','Profile measurement reference'],
 ratingHint:['הדוח חייב לכסות גאומטריה זו, שני החומרים, רוחבי הפנים ותנאי העבודה. שינוי התצורה יבטל את התאמתו.','The supplied report must cover this geometry, both materials, face widths and qualified service envelope. Configuration changes invalidate the match.'],
 rated1:['מומנט מדורג לגלגל הנבחר (Nm)','Rated selected gear torque (Nm)'],rated2:['מומנט מדורג לגלגל המשולב (Nm)','Rated mating gear torque (Nm)'],ratingSource:['הפניה לדוח דירוג לתצורה זו','Rating report for this configuration'],
 screenHint:['זוהי בדיקה ראשונית; אין אישור ISO 6336. דירוג מוסמך נדרש לעץ, חומרים אנאיזוטרופיים ותצורות מחוץ למודל האלסטי.','This is a preliminary check, without ISO 6336 approval. Wood, anisotropic materials and configurations outside the elastic model need a configuration-specific rating.'],
 saved:['נשמרו נתונים; ניתן לבדוק כעת','Data saved; ready to check'],missing:['נדרשת השלמת נתונים','Data needs completion'],pass:['הבדיקה הראשונית עברה','Screening passed'],within:['בתוך הדירוג שסופק','Within the supplied rating'],attention:['נדרשת בדיקה','Needs attention'],approval:['אישור ייצור: לא ניתן בבדיקה זו','Production approval: not issued by this check'],changed:['המודל השתנה; פתח שוב את הטופס','The model changed; reopen the form'],
};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createMaterialValidationUI(host){
  const t=k=>words[k]?.[host.language()==='he'?0:1]||k;
  const num=(key,label,value=0,min)=>({key,label:t(label),type:'number',value,step:.01,...(min===undefined?{}:{min})});
  const text=(key,label,value='')=>({key,label:t(label),type:'text',value});
  const choose=(key,label,value,choices)=>({key,label:t(label),type:'select',value,choices});
  const current=(def,id)=>{const p=host.definition()===def&&def.parts.find(p=>p.id===id);if(!p)throw new Error(t('changed'));return p;};
  function profile(part,mating=false){
    const def=host.definition(),id=part.id,profileId=mating?part.gearVerification?.mateMaterialProfileId:part.materialQualificationId;
    const previous=materialProfileFor(def,profileId),catalog=previous?.catalogId||part.materialCatalogId||(part.materialId&&engineeringMaterial('toolbox:'+part.materialId)?'toolbox:'+part.materialId:'custom');
    const initial=previous||initialMaterialProfile(engineeringMaterial(catalog)?catalog:'custom',host.uid());
    let selected=initial.catalogId;
    const fields=[choose('catalogId','catalog',initial.catalogId,ENGINEERING_MATERIALS.map(m=>({value:m.id,label:esc(m.name)+' · '+m.catalog}))),text('grade','grade',initial.grade),text('condition','condition',initial.condition),text('source','source',initial.source),
      choose('model','model',initial.model,[{value:'qualified-rating',label:t('rated')},{value:'isotropic-elastic',label:t('isotropic')}]),
      num('youngModulusMPa','E',initial.youngModulusMPa,0),num('poissonRatio','nu',initial.poissonRatio),num('allowableBendingMPa','bending',initial.allowableBendingMPa,0),num('allowableContactMPa','contact',initial.allowableContactMPa,0),
      num('minTemperatureC','minTemp',initial.minTemperatureC),num('maxTemperatureC','maxTemp',initial.maxTemperatureC),num('maxCycles','cycles',initial.maxCycles,0),num('maxHours','maxHours',initial.maxHours||0,0),num('maxRpm','maxRpm',initial.maxRpm,0),text('environment','environment',initial.environment),text('lubrication','lubrication',initial.lubrication)];
    host.form({action:'material-qualification',title:t(mating?'mate':'title'),hint:t('hint'),fields,onLive(values){
      if(values.catalogId===selected)return;selected=values.catalogId;
      const fresh=initialMaterialProfile(selected,initial.id);
      for(const field of fields){if(field.key==='catalogId')continue;const input=host.root().querySelector('#mdQuickSettings [data-parameter="'+field.key+'"] input, #mdQuickSettings [data-parameter="'+field.key+'"] select');if(input){input.value=fresh[field.key]??'';input.dispatchEvent(new Event('change',{bubbles:true}));}}
    },onApply(values){try{
      const p=current(def,id),record={...values,id:initial.id};host.undo(t('title'));upsertMaterialProfile(def,record);
      if(mating){p.gearVerification=p.gearVerification||{};p.gearVerification.mateMaterialProfileId=record.id;}
      else {p.materialQualificationId=record.id;p.materialCatalogId=record.catalogId;p.materialName=record.grade;}
      delete p.gearVerificationReport;host.flash(t(validateMaterialProfile(record,{elastic:record.model==='isotropic-elastic'}).length?'missing':'saved'));return true;
    }catch(error){host.flash(error.message);return false;}}});
  }
  function service(part){
    const def=host.definition(),id=part.id,s=part.gearVerification||{},N=(key,label,fallback=0,min)=>num(key,label,s[key]??fallback,min),T=(key,label)=>text(key,label,s[key]||'');
    const profiles=(def.engineeringMaterials||[]).map(p=>({value:p.id,label:esc(p.grade||engineeringMaterial(p.catalogId)?.name||p.id)+' · '+esc(p.condition||'')}));
    const fields=[choose('method','method',s.method||'qualified-rating',[{value:'qualified-rating',label:t('rated')},{value:'elastic-screening',label:t('screen')}]),choose('mateMaterialProfileId','mateProfile',s.mateMaterialProfileId||'',[{value:'',label:t('none')},...profiles]),
      N('torqueNm','torque',0,0),N('rpm','rpm',0,0),N('hours','hours',0,0),N('temperatureC','temp',20),T('environment','env'),T('lubrication','lube'),N('mateWidthMm','mateWidth',Math.abs(part.to-part.from)*10,0),
      N('applicationFactor','application',1,1),N('dynamicFactor','dynamic',1,1),N('faceLoadFactor','face',1,1),N('bendingSafety','sfB',1.5,1),N('contactSafety','sfH',1.5,1),
      N('driverFormFactor','Y1',0,0),N('mateFormFactor','Y2',0,0),T('formFactorSource','Ysource'),
      N('centerToleranceMm','center',0,0),N('driverToothToleranceMm','tooth1',0,0),N('mateToothToleranceMm','tooth2',0,0),N('minimumBacklashMm','minimum',0,0),N('maximumBacklashMm','maximum',0,0),N('profileToleranceMm','profile',0,0),N('measuredProfileErrorMm','measured',0,0),T('measurementSource','measurement')];
    host.form({action:'gear-service',title:t('service'),hint:t('screenHint'),fields,onApply(values){try{const p=current(def,id);host.undo(t('service'));p.gearVerification={...p.gearVerification,...values};delete p.gearVerificationReport;delete def.lastStandardsAudit;return true;}catch(error){host.flash(error.message);return false;}}});
  }
  function rating(part){
    const def=host.definition(),id=part.id,r=part.gearVerification?.rating||{};
    if(!materialProfileFor(def,part.materialQualificationId)||!materialProfileFor(def,part.gearVerification?.mateMaterialProfileId)){host.flash(t('missing'));return;}
    const signature=gearQualificationSignature(part,def);
    host.form({action:'gear-rating',title:t('rating'),hint:t('ratingHint'),fields:[num('driverTorqueNm','rated1',r.driverTorqueNm||0,0),num('mateTorqueNm','rated2',r.mateTorqueNm||0,0),text('source','ratingSource',r.source||'')],onApply(values){try{
      const p=current(def,id);if(signature!==gearQualificationSignature(p,def))throw new Error(t('changed'));
      if(!(values.driverTorqueNm>0&&values.mateTorqueNm>0&&values.source.trim()))throw new Error(t('missing'));
      host.undo(t('rating'));p.gearVerification.rating={...values,signature};delete p.gearVerificationReport;delete def.lastStandardsAudit;return true;
    }catch(error){host.flash(error.message);return false;}}});
  }
  function check(part){
    const def=host.definition();
    if((part.standardCompliance||part.standardPart)?.family!=='involute-gear'){
      const p=materialProfileFor(def,part.materialQualificationId),issues=validateMaterialProfile(p,{elastic:p?.model==='isotropic-elastic'});
      host.report(t('title'),t(issues.length?'missing':'saved'),issues.length?issues.map(i=>i.message):[p.grade,p.condition,p.source,t('approval')]);return;
    }
    const result=evaluateGearService(part,def),label=result.status==='screening-passed'?'pass':result.status==='within-declared-rating'?'within':'attention';
    const fmt=value=>Array.isArray(value)?value.map(fmt).join(' … '):typeof value==='number'?Number(value.toPrecision(6)):String(value);
    host.report(t('service'),t(label),[t('approval'),...result.issues.map(i=>i.field+': '+i.message),...result.checks.map(c=>c.name+': '+fmt(c.actual)+' / limit '+fmt(c.limit)),...result.limitations]);
  }
  return {profile,service,rating,check,label:t};
}
