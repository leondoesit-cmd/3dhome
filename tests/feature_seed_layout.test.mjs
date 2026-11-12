import { stylesSource } from "./helpers/styles_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=stylesSource();
function declarations(selector) {
 const matches=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].trim().split(',').map(x=>x.trim()).includes(selector));
 return Object.assign({},...matches.map(match=>Object.fromEntries(match[2].split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf(':');return [x.slice(0,i).trim(),x.slice(i+1).trim()];}))));
}

test('component collector spans the form and bounds long lists with a vertical scroller',()=>{
 const field=declarations('#modeler .md-quick-field.type-feature-seeds');
 assert.equal(field['grid-column'],'1 / -1');
 assert.equal(field['grid-template-columns'],'minmax(0,1fr)','a component collector must not occupy the narrow numeric-input column');
 const collector=declarations('#modeler .md-feature-seed-collector');
 assert.equal(collector['overflow-y'],'auto');
 assert.match(collector['max-height'],/240px/);
 assert.match(collector['max-height'],/40vh/,'the list also fits short viewports');
});

test('component checkbox cannot collapse inside narrow forms and its label is a 44px target',()=>{
 const row=declarations('#modeler .md-feature-seed-row');
 assert.ok(parseFloat(row['min-height'])>=44);
 assert.match(row['grid-template-columns'],/^24px minmax\(0,1fr\)$/,'reserve the checkbox track before wrapping component names');
 const input=declarations('#modeler .md-feature-seed-row > input[type="checkbox"]');
 assert.ok(parseFloat(input.width)>=20);
 assert.ok(parseFloat(input['min-width'])>=20,'generic form input min-width zero must be overridden');
 assert.ok(parseFloat(input.height)>=20);
 assert.equal(input.opacity,'1');
 assert.equal(input.appearance,'auto');
 assert.equal(input.position,'static');
 assert.equal(declarations('#modeler .md-feature-seed-row > span')['overflow-wrap'],'anywhere');
});
