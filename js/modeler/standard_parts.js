/* Toolbox standard parts inserted whole — the ISO 4017 hex screw — and the
   plain material they are given. Moved out of the tutorial module
   (js/modeler/sketch_guide.js), which owned them only because its old screw
   track was their first caller. */
import { t } from "../modeler_strings.js";
import { pushUndo } from "../modeler/document_history.js";
import { setDocumentType } from "../modeler/document_save.js";
import { addPart } from "../modeler/library_store.js";
import { fitSketch } from "../modeler/sketch_workflow.js";
import { updateTourProgress } from "../modeler/welcome_coach.js";
import { uid } from "../state.js";
import { E, refreshAll } from "../modeler.js";

function tourMaterial(color) { return {color:color||"#55b7a7",metal:0.08,rough:0.58}; }

function insertISO4017Screw() {
  if(E.docType!=="part")setDocumentType("part");
  var group=uid(),spec={family:"hex-screw",standard:"ISO 4017:2022",diameterMm:8,pitchMm:1.25,lengthMm:30,flankAngleDeg:60,toleranceClass:"6g",productGrade:"A",series:"coarse",headAcrossFlatsMm:13,headHeightMm:5.3};
  var acrossCorners=13/Math.sqrt(3)/10,hex=[];
  for(var i=0;i<6;i++){var a=Math.PI/6+i*Math.PI/3;hex.push({u:Math.cos(a)*acrossCorners,v:Math.sin(a)*acrossCorners});}
  pushUndo(t("stdScrewCommand"));
  addPart(Object.assign({id:uid(),kind:"cyl",name:"ISO 4017 M8×30",x:0,y:0,z:0,r:.4,h:3,standardGroupId:group,standardRole:"thread",standardCompliance:spec,threadGeometry:{mode:"modeled",profile:"ISO-metric-60",pitchMm:1.25,flankAngleDeg:60,toleranceClass:"6g"}},tourMaterial("#aeb7c2")));
  addPart(Object.assign({id:uid(),kind:"ext",name:"Hex head",axis:"y",from:3,to:3.53,pts:hex,holes:[],standardGroupId:group,standardRole:"head"},tourMaterial("#bbc3cc")));
  E.def.lastStandardsAudit=null;E.sel=E.def.parts[E.def.parts.length-2];refreshAll();fitSketch();updateTourProgress();
}

export { insertISO4017Screw, tourMaterial };
