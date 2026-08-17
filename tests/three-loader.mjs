// Node 22.14 has `module.register` but not `registerHooks`. Stub the browser
// import-map packages elevation tests never actually execute.
export function resolve(specifier, context, nextResolve) {
  if (specifier === "three")
    return {
      url: "data:text/javascript,const THREE = { Color: class Color {} }; export default THREE; export const Color = THREE.Color;",
      shortCircuit: true,
    };
  if (specifier.startsWith("three/"))
    return {
      url: "data:text/javascript,export class RoundedBoxGeometry {}",
      shortCircuit: true,
    };
  return nextResolve(specifier, context);
}
