import {createPartDocument, createFeatureDefinition, recordSketchInHistory} from "../../js/core/parametric_document.js";
import {ensureConfigurations, captureConfiguration, setActiveConfiguration} from "../../js/cad_configurations.js";

export function designTablePart() {
  const doc = createPartDocument({name:"Pin", units:{length:"mm"}, metadata:{authoringSystem:"parametric-v1"}});
  const sketch = {id:"profile", name:"Profile", plane:"top", offset:0,
    points:[{id:1, x:0, y:0, fixed:true}], entities:[{id:2, type:"circle", c:1, r:2}],
    constraints:[{id:3, type:"diameter", name:"PinDiameter", entity:2, value:4}]};
  recordSketchInHistory(doc, sketch);
  createFeatureDefinition(doc, "extrude", {id:"boss", name:"Boss", references:{sketches:[sketch.id]},
    params:{sketchId:sketch.id, profileEntityIds:[2], depth:3, from:0, to:3}});
  doc.parts = [{id:"body", featureId:"boss", name:"Pin", kind:"ext", axis:"y", from:0, to:3,
    sketchId:"profile", sketchDriven:true, profileEntityIds:[2],
    pts:Array.from({length:32}, (_,i)=>({u:2*Math.cos(i*Math.PI/16), v:2*Math.sin(i*Math.PI/16)}))}];
  doc.activeSketch = sketch.id;
  ensureConfigurations(doc);
  captureConfiguration(doc, {name:"Long"});
  setActiveConfiguration(doc, "cfg_default");
  return doc;
}
