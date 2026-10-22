import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lookupAssemblyComponent, standardPlaneEntries } from "../js/core/assembly_structure.js";
import { topologyReference } from "../js/cad_mates.js";

test("a string tree ID finds a numeric assembly component without changing its mate ID", () => {
  const battery = { id: 237, grounded: true };
  const plate = { id: 238, grounded: false };
  const assembly = { components: [battery, plate] };
  assert.equal(lookupAssemblyComponent(assembly, "237"), battery);
  assert.equal(lookupAssemblyComponent(assembly, "238"), plate);
  const plane = standardPlaneEntries().find((entry)=>entry.persistentId==="plane:right");
  const reference = topologyReference(lookupAssemblyComponent(assembly, "238").id,
    "face", plane.persistentId, plane.descriptor);
  assert.equal(reference.componentId, 238);
});

test("the assembly plane tree pick canonicalizes its holder before storing the reference", async () => {
  const source = modelerSource();
  const pick = source.slice(source.indexOf("function planeMateReference("), source.indexOf("\nfunction mateRow(", source.indexOf("function planeMateReference(")));
  assert.match(pick, /var holder = mateHolderById\(holderId\)/);
  assert.match(pick, /topologyReference\(holder\.id, "face", planeId/);
  assert.match(source, /function assemblyComponentById\(id\) \{\s*return lookupAssemblyComponent\(E\.assembly, id\)/);
});
