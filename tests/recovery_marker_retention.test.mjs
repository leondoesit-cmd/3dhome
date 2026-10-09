import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {needsRecovery,pruneCleanSessions} from '../js/recovery.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/persist.js',import.meta.url),'utf8');
function lifecycle(localSnapshot,clean={},dbSession=null){
 const saved=new Map([['clean',JSON.stringify(clean)]]);if(localSnapshot)saved.set('auto',JSON.stringify(localSnapshot));
 const localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
 let now=2000;
 const names=['readAuto','readMap','writeMap','markClean'];
 const api=new Function('localStorage','CLEAN_KEY','AUTO_KEY','sessionId','autoDBSession','Date','pruneCleanSessions',names.map(name=>sourceFunctionText(source,name)).join('\n')+';return {markClean,readMap,setSession(id){sessionId=id;}};')
  (localStorage,'clean','auto','later-0',dbSession,{now:()=>now},pruneCleanSessions);
 return {saved,clean:()=>api.readMap('clean'),exit(id){api.setSession(id);now++;api.markClean();}};
}

test('actual clean-exit lifecycle retains an old clean planner snapshot through 120 model-only sessions',()=>{
 const snap={session:'planner-old',at:900,json:'{"rooms":[]}'},f=lifecycle({at:snap.at,session:snap.session,indexedDB:true},{'planner-old':1000},snap.session);
 const storedSnapshot=f.saved.get('auto');
 for(let i=0;i<120;i++)f.exit('model-'+i);
 const clean=f.clean();assert.equal(clean['planner-old'],1000);assert.equal(Object.keys(clean).length,40);
 assert.ok(clean['model-119']);assert.equal(clean['model-0'],undefined,'unreferenced old markers still prune');
 assert.equal(needsRecovery(snap,{now:100000,staleMs:20000,cleanAt:clean[snap.session],alive:false}),false);
 assert.equal(f.saved.get('auto'),storedSnapshot,'autosave metadata is never rewritten or deleted by pruning');
 assert.equal(f.saved.size,2);
});

test('separate local fallback and IndexedDB snapshot clean markers both remain bounded and protected',()=>{
 const f=lifecycle({session:'local-backup',at:800,json:'{}'},{'local-backup':900,'db-backup':700},'db-backup');
 for(let i=0;i<100;i++)f.exit('new-'+i);
 assert.equal(f.clean()['local-backup'],900);assert.equal(f.clean()['db-backup'],700);assert.equal(Object.keys(f.clean()).length,40);
 for(const session of ['local-backup','db-backup'])assert.equal(needsRecovery({session,json:'{}',at:600},{now:100000,staleMs:20000,cleanAt:f.clean()[session],alive:false}),false);
});

test('a genuinely unsaved retained planner snapshot never receives an invented clean marker',()=>{
 const snap={session:'crashed-planner',json:'{}',at:900},f=lifecycle({session:snap.session,at:snap.at,indexedDB:true},{},snap.session);
 for(let i=0;i<100;i++)f.exit('model-'+i);
 assert.equal(f.clean()[snap.session],undefined);assert.equal(Object.keys(f.clean()).length,40);
 assert.equal(needsRecovery(snap,{now:100000,staleMs:20000,cleanAt:f.clean()[snap.session],alive:false}),true);
 assert.equal(needsRecovery(snap,{now:100000,staleMs:20000,cleanAt:undefined,alive:true}),false,'live source tab remains protected');
 const editedAfterClean={...snap,at:1100};assert.equal(needsRecovery(editedAfterClean,{now:100000,staleMs:20000,cleanAt:1000,alive:false}),true,'older clean marker never suppresses newer edits');
});

test('replacement snapshots release obsolete clean-marker protection and keep current owner',()=>{
 const f=lifecycle({session:'old',at:800,indexedDB:true},{old:900},'new');
 f.saved.set('auto',JSON.stringify({session:'new',at:1000,indexedDB:true}));
 for(let i=0;i<100;i++)f.exit(i===0?'new':'session-'+i);
 assert.equal(f.clean().old,undefined);assert.ok(f.clean().new);assert.equal(Object.keys(f.clean()).length,40);
 assert.match(source,/writeAutoDB\(snap\)\.then\(function \(\) \{\s*autoDBSession = snap\.session;/);
 assert.match(source,/readAutoDB\(\)[\s\S]*?autoDBSession = dbSnap\?\.session \|\| null;/);
 assert.deepEqual(pruneCleanSessions({old:1},[],40),{old:1});
});
