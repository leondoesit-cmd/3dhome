import test from 'node:test';
import assert from 'node:assert/strict';
import { massDisplaySystem } from '../js/mass_display_units.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)), `${a} != ${b}`);
test('IPS reproduces Planchard stepped-block volume, density and mass',()=>{
  const u=massDisplaySystem('ips');
  near(115.7336395*u.volume,7.0625);
  near(8.89*u.length,3.5);
  near((.0975*453.59237/16.387064)*u.density,.0975);
  near((7.0625*.0975*.45359237)*u.mass,.68859375);
});
test('inertia conversion uses mass times squared length in each system',()=>{
  for (const mode of ['mmg','ips']) {
    const u=massDisplaySystem(mode);
    near(u.inertia,u.mass*(100*u.length)**2);
  }
  near(massDisplaySystem('ips').inertia*.45359237*.0254**2,1);
  near(massDisplaySystem('mmg').inertia,1e9);
});
