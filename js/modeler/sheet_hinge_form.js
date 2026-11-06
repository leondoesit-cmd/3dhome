import { flatPattern } from "../cad_sheet_metal.js";
import { hingeTools, recordHingeHistory, sheetPlate, sheetWithPlateDimensions } from "../cad_sheet_hinge.js";

export function hingeForm({p,plate,document,t,openQuickForm,selectedSolid,pushUndo,invalidatePartMeshAfterEdit,targetId,uid}) {
  const sheet = document.sheetMetal, span = Math.max(plate.width,plate.height);
  const pitch = Math.min(5,span), width = pitch*0.45;
  let failure = "";
  openQuickForm({
    action:"sheetHinge", title:t("sheetHinge"), hint:t("sheetHingeHint"),
    fields:[
      {key:"edge",label:t("mfgEdge"),type:"select",value:plate.width>=plate.height?"top":"right",
        choices:["top","bottom","right","left"].map(value => ({value,label:t(value)}))},
      {key:"width",label:t("sheetTabWidth"),type:"number",unit:"length",min:1e-6,value:width},
      {key:"count",label:t("sheetTabCount"),type:"number",min:1,max:256,step:1,value:Math.min(13,1+Math.floor((span-width)/pitch))},
      {key:"pitch",label:t("sheetTabPitch"),type:"number",unit:"length",min:1e-6,value:pitch},
      {key:"offset",label:t("sheetTabOffset"),type:"number",unit:"length",min:0,value:0},
      {key:"radius",label:t("mfgRadius"),type:"number",unit:"length",min:1e-6,value:sheet.insideRadius || plate.thickness},
      {key:"straight",label:t("sheetTabStraight"),type:"number",unit:"length",min:1e-6,value:(sheet.insideRadius || plate.thickness)+plate.thickness},
    ],
    failureMessage:() => failure,
    onApply(values) {
      try {
        if (selectedSolid()!==p || document.sheetMetal!==sheet) throw new Error(t("sheetMetalSelectPlate"));
        const spec = {...values};
        const currentPlate = sheetPlate(p);
        if (!currentPlate || p.suppressed || p.exactError || p.exactPending) throw new Error(t("sheetMetalSelectPlate"));
        const tools = hingeTools(currentPlate,spec);
        const candidate = {...sheetWithPlateDimensions(sheet,currentPlate),hinge:spec};
        flatPattern(candidate);
        let history;
        if (targetId) {
          history = structuredClone({sketches:document.sketches,features:document.features,history:document.history,
            rollbackIndex:document.rollbackIndex,revision:document.revision});
          recordHingeHistory(history,tools,targetId,t("sheetHinge"),"hem_"+uid(),p.featureId);
          candidate.hingeFeatureIds = tools.map(tool=>tool.featureId);
        }
        pushUndo(t("sheetHinge"));
        if (history) {
          for (const key of ["sketches","features","history","rollbackIndex","revision"]) document[key] = history[key];
        }
        document.sheetMetal = candidate;
        p.merges3d = [...(p.merges3d || []),...tools];
        invalidatePartMeshAfterEdit(p);
        return true;
      } catch (error) {
        failure = error.message;
        return false;
      }
    },
  });
}
