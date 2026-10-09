import test from 'node:test';
import assert from 'node:assert/strict';
import {finishCacheParameters} from '../js/core/finish_cache_parameters.js';
import {stableStringify} from '../js/core/dependency_graph.js';

test('uniform Shell preview omission matches catalog empty overrides without changing the request',()=>{
  const preview={thickness:.2,direction:'inside',tolerance:.001,join:'arc',removeOpenings:true};
  const committed={...preview,faceThicknesses:[]};
  assert.equal(stableStringify(finishCacheParameters('shell',preview)),stableStringify(finishCacheParameters('shell',committed)));
  assert.equal(Object.hasOwn(preview,'faceThicknesses'),false);
});

test('real Shell face overrides, face identities and thickness changes retain distinct cache recipes',()=>{
  const uniform={thickness:.2,faceThicknesses:[]};
  const override={thickness:.2,faceThicknesses:[{faceId:'wall',thickness:.3}]};
  const key=p=>stableStringify(finishCacheParameters('shell',p));
  assert.notEqual(key(uniform),key(override));
  assert.notEqual(key(override),key({...override,faceThicknesses:[{faceId:'other-wall',thickness:.3}]}));
  assert.notEqual(key(override),key({...override,faceThicknesses:[{faceId:'wall',thickness:.31}]}));
  assert.equal(finishCacheParameters('shell',override),override);
  assert.equal(finishCacheParameters('fillet',uniform),uniform);
});
