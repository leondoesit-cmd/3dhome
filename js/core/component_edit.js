// Assembly occurrences keep their source definition until the editor commits.
// This also prevents a draft, Undo, or Cancel from modifying a library snapshot.
export function componentEditCopy(component) {
  if (!component?.def || component.asm) throw new Error("Select a part component");
  return JSON.parse(JSON.stringify(component.def));
}

export function commitComponentEdit(component, working) {
  const committed = JSON.parse(JSON.stringify(working));
  if (committed.metadata) delete committed.metadata.contextEditor;
  component.def = committed;
  component.name = committed.name;
  return committed;
}
