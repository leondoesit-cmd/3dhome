import {KEY_TOOL} from '../modeler_commands.js';
const reserved=new Set([...Object.keys(KEY_TOOL),'r','s','f']);
export function shortcutConflict(key,command,bindings={}) {
 const normalized=String(key||'').trim().toLowerCase();
 if(!normalized)return '';
 if(!/^[a-z]$/.test(normalized))return 'Use one letter (A–Z), without modifiers.';
 if(reserved.has(normalized))return 'This key is already assigned to a built-in command.';
 if(Object.entries(bindings).some(([id,value])=>id!==command&&value===normalized))return 'This key is already assigned to another custom command.';
 return '';
}
export function validShortcutBindings(value) {
 const result={};
 if(!value||typeof value!=='object'||Array.isArray(value))return result;
 for(const [id,key] of Object.entries(value)){
  if(typeof key==='string'&&key.trim()&&!shortcutConflict(key,id,result))result[id]=key.trim().toLowerCase();
 }
 return result;
}
