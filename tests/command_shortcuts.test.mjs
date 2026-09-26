import test from 'node:test';
import assert from 'node:assert/strict';
import {shortcutConflict,validShortcutBindings} from '../js/core/command_shortcuts.js';
test('custom shortcuts reject built-in and custom collisions',()=>{
 assert.match(shortcutConflict('R','temporaryaxes'),/built-in/);
 assert.match(shortcutConflict('F','temporaryaxes'),/built-in/);
 assert.equal(shortcutConflict(' U ','temporaryaxes'),'');
 assert.match(shortcutConflict('u','shell',{temporaryaxes:'u'}),/another/);
 assert.equal(shortcutConflict('u','temporaryaxes',{temporaryaxes:'u'}),'');
 assert.match(shortcutConflict('Ctrl+U','temporaryaxes'),/one letter/);
});
test('stored shortcut preferences normalize and discard invalid conflicts',()=>{
 assert.deepEqual(validShortcutBindings({axes:'U',shell:'u',revolve:'r',bad:3}),{axes:'u'});
 assert.deepEqual(validShortcutBindings(null),{});
});
