import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRequiredItems,LAYOUT_TYPES} from '../js/layout_preferences.js';
test('furnishing defaults use stable service and office room types',()=>{
 assert.deepEqual(defaultRequiredItems('office'),['desk']);
 assert.deepEqual(defaultRequiredItems('wc'),['toilet','sink']);
 assert.deepEqual(defaultRequiredItems('bathroom'),['toilet','shower','sink']);
 assert.deepEqual(defaultRequiredItems('corridor'),[]);
 for(const type of ['office','wc','bathroom','kitchen','laundry'])assert.ok(defaultRequiredItems(type).every(item=>LAYOUT_TYPES.includes(item)));
});
