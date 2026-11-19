// Reconciles one item's mesh inputs. Definitions can be edited in place, so
// their serialized values are shared only during a synchronous syncItems pass.
export function itemMeshSignature(it, entry, definition, catalogRevision, physics, definitions) {
  try {
    const shape = { ...it };
    for (const key of ["x", "z", "rot"]) if (Object.hasOwn(shape, key)) shape[key] = 0;
    delete shape.lightOn;
    delete shape.lightI;
    delete shape.lightColor;
    if (entry?.lamp && it.type !== "fireplace") delete shape.smart;
    if ((entry?.lamp || entry?.taskLamp) && !physics) {
      delete shape.on;
      delete shape.elev;
      delete shape.hold;
    }
    let cached = definitions?.get(definition);
    if (!cached || cached.revision !== definition?.revision) {
      // rebuildDefinition writes the latest instance's diagnostics and time
      // onto the shared definition. Neither is geometry input for a sibling.
      const inputs = definition && { ...definition };
      if (inputs && Object.hasOwn(inputs, "lastRebuild")) {
        const record = { ...inputs.lastRebuild };
        delete record.ok;
        delete record.signature;
        delete record.rebuiltAt;
        delete record.issues;
        inputs.lastRebuild = Object.keys(record).length ? record : undefined;
      }
      cached = { revision: definition?.revision, text: JSON.stringify(inputs) };
      definitions?.set(definition, cached);
    }
    return catalogRevision + "|" + JSON.stringify(shape) + "|" + cached.text;
  } catch {
    return null; // Unserializable inputs must rebuild on every reconcile.
  }
}
