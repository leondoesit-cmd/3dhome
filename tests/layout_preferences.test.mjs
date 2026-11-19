import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRequiredItems,LAYOUT_TYPES} from '../js/layout_preferences.js';
test('furnishing defaults use stable service and office room types',()=>{
 assert.deepEqual(defaultRequiredItems('office'),['desk','officeChair']);
 assert.deepEqual(defaultRequiredItems('wc'),['toilet','vanity']);
 assert.deepEqual(defaultRequiredItems('bathroom'),['toilet','shower','vanity']);
 assert.deepEqual(defaultRequiredItems('corridor'),[]);
 for(const type of ['office','wc','bathroom','kitchen','laundry'])assert.ok(defaultRequiredItems(type).every(item=>LAYOUT_TYPES.includes(item)));
});
