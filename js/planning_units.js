export const PLANNING_UNITS=Object.freeze({cm:1,mm:.1,m:100,in:2.54,ft:30.48});
export const toDisplayLength=(cm,unit)=>cm/(PLANNING_UNITS[unit]||1);
export const fromDisplayLength=(value,unit)=>value*(PLANNING_UNITS[unit]||1);

const UNIT_ALIAS=Object.freeze({
  cm:"cm",centimetre:"cm",centimeter:"cm",centimetres:"cm",centimeters:"cm",
  mm:"mm",millimetre:"mm",millimeter:"mm",millimetres:"mm",millimeters:"mm",
  m:"m",metre:"m",meter:"m",metres:"m",meters:"m",
  in:"in",inch:"in",inches:"in",'"':"in",
  ft:"ft",foot:"ft",feet:"ft","'":"ft",
});

function aliasUnit(value){
  const key=String(value||"").trim().toLowerCase();
  return UNIT_ALIAS[key]||null;
}

function finiteNumber(value){
  const n=typeof value==="number"?value:Number(value);
  return Number.isFinite(n)?n:NaN;
}

/* Architectural length entry: 2.74m, 274cm, 9'-6", 108in, or a bare number in
   the current display unit. Stored coordinates stay centimetres. */
export function parseLength(text,defaultUnit){
  const raw=String(text==null?"":text).trim();
  if(!raw)return NaN;
  const fallback=PLANNING_UNITS[defaultUnit]?defaultUnit:"cm";
  const feetInches=raw.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/i);
  if(feetInches){
    const feet=finiteNumber(feetInches[1]);
    const inches=feetInches[2]==null?0:finiteNumber(feetInches[2]);
    if(!Number.isFinite(feet)||!Number.isFinite(inches))return NaN;
    // The sign belongs to the whole length: -5'-6" is -(5'6"), as formatLength
    // writes it, not -5' + 6".
    const sign=raw.startsWith("-")?-1:1;
    return sign*(Math.abs(feet)*PLANNING_UNITS.ft+inches*PLANNING_UNITS.in);
  }
  const unitValue=raw.match(/^(-?\d+(?:\.\d+)?)\s*([A-Za-z'"]+)?$/);
  if(!unitValue)return NaN;
  const amount=finiteNumber(unitValue[1]);
  if(!Number.isFinite(amount))return NaN;
  const unit=aliasUnit(unitValue[2])||fallback;
  return fromDisplayLength(amount,unit);
}

export function formatLength(cm,unit,options){
  const opts=options||{};
  const use=PLANNING_UNITS[unit]?unit:"cm";
  const value=toDisplayLength(cm,use);
  if(!Number.isFinite(value))return "";
  if(use==="ft"&&opts.feetInches!==false){
    const totalIn=value*12;
    const sign=totalIn<0?"-":"";
    const abs=Math.abs(totalIn);
    let feet=Math.floor(abs/12+1e-9);
    let inches=Number((abs-feet*12).toFixed(opts.digits!=null?opts.digits:1));
    if(inches>=12){feet+=1;inches=0;}
    return sign+feet+"'-"+String(inches).replace(/\.0$/, "")+'"';
  }
  const digits=opts.digits!=null?opts.digits:(use==="m"?2:use==="mm"?0:use==="in"?2:2);
  const shown=Number(value.toFixed(digits));
  return opts.suffix===false?String(shown):shown+" "+use;
}

export function formatArea(cm2,unit,options){
  const opts=options||{};
  const use=PLANNING_UNITS[unit]?unit:(unit==="sqft"||unit==="sq_ft"||unit==="ft2"?"ft":"cm");
  if(!Number.isFinite(cm2))return "";
  const imperial=use==="ft"||use==="in"||unit==="sqft"||unit==="sq_ft"||unit==="ft2";
  const value=imperial?cm2/PLANNING_UNITS.ft/PLANNING_UNITS.ft:cm2/10000;
  const shown=Number(value.toFixed(opts.digits!=null?opts.digits:2));
  if(opts.suffix===false)return String(shown);
  return shown+(imperial?" sq ft":" m²");
}

/* Area entry: "12.5", "12.5 m²", "140 sq ft". Bare numbers are square metres
   except when the project is in feet/inches, where they are square feet.
   Returns square metres. */
export function parseArea(text,defaultUnit){
  const raw=String(text==null?"":text).trim();
  if(!raw)return NaN;
  const fallback=PLANNING_UNITS[defaultUnit]?defaultUnit:(defaultUnit==="sqft"||defaultUnit==="sq_ft"?"ft":"cm");
  const imperial=fallback==="ft"||fallback==="in";
  const labeled=raw.match(/^(-?\d+(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|ft²|ft2|sq\.?\s*m|m²|m2)?$/i);
  if(!labeled)return NaN;
  const amount=finiteNumber(labeled[1]);
  if(!Number.isFinite(amount))return NaN;
  const suffix=(labeled[2]||"").toLowerCase().replace(/\s+/g,"");
  const asSqft=suffix==="sq.ft"||suffix==="sqft"||suffix==="ft²"||suffix==="ft2"||(!suffix&&imperial);
  if(asSqft)return amount*PLANNING_UNITS.ft*PLANNING_UNITS.ft/10000;
  return amount;
}
