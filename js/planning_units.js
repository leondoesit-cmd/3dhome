export const PLANNING_UNITS=Object.freeze({cm:1,mm:.1,m:100,in:2.54,ft:30.48});
export const toDisplayLength=(cm,unit)=>cm/(PLANNING_UNITS[unit]||1);
export const fromDisplayLength=(value,unit)=>value*(PLANNING_UNITS[unit]||1);
