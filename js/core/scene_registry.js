// Track tagged scene objects through Three's childadded/childremoved events.
// Tags are assigned by builders before attachment. Detached subtrees release
// their listeners, so replacement/disposal cannot retain old scene graphs.
export function createSceneRegistry(root, matches) {
  const members = new Set(), watched = new Set();
  function added(event) { attach(event.child); }
  function removed(event) { detach(event.child); }
  function attach(object) {
    if (watched.has(object)) return;
    watched.add(object);
    if (matches(object)) members.add(object);
    object.addEventListener('childadded', added);
    object.addEventListener('childremoved', removed);
    object.children.forEach(attach);
  }
  function detach(object) {
    watched.delete(object); members.delete(object);
    object.removeEventListener('childadded', added);
    object.removeEventListener('childremoved', removed);
    object.children.forEach(detach);
  }
  attach(root);
  return { members, dispose() { detach(root); } };
}
