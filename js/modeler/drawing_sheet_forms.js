/* The CAD editor's drawing images and sheet forms, prompts, rows and selects,
   split out of drawing_sheet.js, split out of js/modeler/drawing_sheet.js. It
   shares the editor's state through live imports from ./drawing_sheet.js. */
import { SHEET_SIZES, STANDARD_SCALES, defaultViewLabel, effectiveViewSource, scaleLabel, viewSourceOwner } from "../cad_sheet.js";
import { setSheetTitleSource, sheetTitleMeta } from "../core/custom_properties.js";
import { lengthToDocument } from "../core/document_length_units.js";
import { decodeDrawingImage } from "../core/drawing_image.js";
import { importDrawingProjectImage } from "../core/drawing_project_image.js";
import { drawingViewScaleControl } from "../core/drawing_scale_control.js";
import { SECTION_HATCH_PATTERNS, sectionHatchCaption } from "../core/section_hatch.js";
import { bindDetailTagControls, bindSectionPositionControls, bindSectionTagControls } from "../modeler_drawing.js";
import { t, tf } from "../modeler_strings.js";
import { E, root } from "../modeler.js";
import { openQuickForm } from "./command_manager.js";
import { pushUndo } from "./document_history.js";
import { syncTools } from "./document_save.js";
import { drawSketch, drawingDocument, drawingSheet } from "./drawing_sheet_render.js";
import { btn, el, namedButton } from "./editor_dom.js";
import { syncHead } from "./library_io.js";
import { modelLengthUnit } from "./sketch_workflow.js";
import { setPanelCollapsed } from "./view_modes.js";
import {
  assemblyForDrawingSource, configuredDrawingStatus, drawingHostIs,
  drawingSourceChoices, resolveDrawingViewSource,
} from "./drawing_sheet.js";

async function chooseDrawingProjectImage() {
  const answer=await sheetForm('Insert project image',[
    {key:'url',label:'Project image URL',type:'text',value:''},
  ],'Use an app-served same-origin static PNG/JPEG asset. Pixels are embedded; external and file URLs are unsupported.',{drawingOnly:true});
  if(!answer)return null;
  return importDrawingProjectImage(answer.url);
}

function chooseDrawingImage() {
  return new Promise(function(resolve,reject){
    if(!root){resolve(null);return;}
    var input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg';input.hidden=true;
    var settled=false;
    function finish(value,error){if(settled)return;settled=true;input.remove();if(error)reject(error);else resolve(value);}
    input.addEventListener('cancel',function(){finish(null);},{once:true});
    input.addEventListener('change',function(){decodeDrawingImage(input.files&&input.files[0]).then(function(asset){finish(asset);},function(error){finish(null,error);});},{once:true});
    root.appendChild(input);input.click();
  });
}

function sheetForm(title, fields, hint, options={}) {
  return new Promise(function (resolve) {
    if (!root) { resolve(null); return; }
    root.classList.add("md-sheet-form");
    var settled = false;
    var finish = function (answer) {
      if (settled) return;
      settled = true;
      root.classList.remove("md-sheet-form");
      resolve(answer);
    };
    var opened = openQuickForm({
      action: "sheetprompt",
      drawingOnly:!!options.drawingOnly,
      icon: "ph-note-pencil",
      title: title,
      hint: hint || fields.map(function (field) { return field.hint; }).filter(Boolean)[0] || t("drawNoteHint"),
      fields: fields.map(function (field) {
        return { key: field.key, label: field.label || title, type: field.type === "checkbox" ? "boolean" : ["boolean","select","textarea"].includes(field.type) ? field.type : "text", choices:field.choices, value: field.value ?? "" };
      }),
      onApply: function (values) {
        var answer = {};
        fields.forEach(function (field) { answer[field.key] = ["boolean","checkbox"].includes(field.type) ? !!values[field.key] : String(values[field.key] || "").trim(); });
        finish(answer);
      },
      onCancel: function () { finish(null); },
    });
    if (!opened) finish(null);
  });
}

function sheetPrompt(title, value) {
  return sheetForm(title, [{ key: "text", label: title, value: value }]).then(function (answer) {
    return answer ? answer.text : null;
  });
}

/* ---- the sheet panel ----
   Drawing mode hides the feature tree and the inspector — neither says anything
   about a sheet — and puts the drafting document's own properties in their
   place: the paper, the views on it, and the title block. Built once and then
   only updated, so a field being typed into is never rebuilt underneath the
   caret. */
function sheetRow(host, label, control) {
  var row = el("label", "md-sheet-row", "<span>" + label + "</span>");
  row.appendChild(control);
  host.appendChild(row);
  return control;
}

function sheetSelect(options, value, onChange) {
  var select = el("select", "");
  options.forEach(function (option) {
    var node = el("option", "");
    node.textContent = option.label;
    node.value = option.value;
    select.appendChild(node);
  });
  select.value = value;
  select.addEventListener("change", function () { onChange(select.value); });
  return select;
}

function sheetViewSourceRow(host, doc, view, sheet) {
  const owner = viewSourceOwner(doc, view);
  const source = effectiveViewSource(doc, view);
  const choices = drawingSourceChoices();
  const keyOf = (entry) => entry.kind + ':' + entry.key;
  const current = source && !drawingHostIs(source) ? keyOf(source) : '';
  const model = E.docType === 'assembly' ? E.assembly : E.def;
  const options = [{ value: '', label: 'This ' + E.docType + ' · ' + model.name }];
  for (const entry of choices) {
    options.push({ value: keyOf(entry), label: (entry.kind === 'part' ? 'Part' : 'Assembly') + ' · ' + entry.name });
  }
  if (current && !choices.some((entry) => keyOf(entry) === current)) {
    options.push({ value: current, label: 'Missing · ' + (source.name || source.key) });
  }
  const select = sheetSelect(options, current, (value) => {
    sheet.setSheetOption('viewSource', choices.find((entry) => keyOf(entry) === value) || null);
    drawSketch();
  });
  select.id = 'mdSheetViewSource';
  select.disabled = owner?.id !== view.id;
  sheetRow(host, select.disabled ? 'Model source (from parent)' : 'Model source', select);
}

function sheetToggle(host, label, checked, onChange) {
  var row = el("label", "md-sheet-check");
  var box = el("input", "");
  box.type = "checkbox";
  box.checked = !!checked;
  box.addEventListener("change", function () { onChange(box.checked); });
  row.appendChild(box);
  row.appendChild(el("span", "", label));
  host.appendChild(row);
  return box;
}

function sheetGroup(host, title, defaultOpen, key) {
  var group = el("details", "md-sheet-group");
  if(key)group.setAttribute('data-sheet-group',key);
  group.open = defaultOpen !== false;
  group.appendChild(el("summary", "", title));
  var body = el("div", "md-sheet-group-body");
  group.appendChild(body);
  host.appendChild(group);
  return body;
}

/* Field values are written straight into the document as you type; the undo
   entry is opened once per visit to a field, so backing out of a title block
   edit does not cost twenty undos. */
function bindTitleField(input, key) {
  var opened = false;
  input.addEventListener("focus", function () { opened = false; });
  input.addEventListener("input", function () {
    if (!opened) { pushUndo(t("opSheetTitle")); opened = true; }
    var doc = drawingDocument();
    doc.title[key] = input.value;
    drawSketch();
  });
}

function bindTitleSource(picker, key, host) {
  picker.addEventListener("change", function () {
    pushUndo(t("opSheetTitle"));
    setSheetTitleSource(drawingDocument(), key, picker.value);
    drawSketch();buildSheetPanel(host);
  });
}

function buildSheetPanel(host) {
  var doc = drawingDocument(), sheet = drawingSheet();
  var owner=E.docType==='assembly'?E.assembly:E.def,ownerIdentity=owner?.key||owner?.id||owner;
  var sameOwner=host._sheetPanelOwner===ownerIdentity&&host._sheetPanelOwnerType===E.docType;
  var groupState=new Map(),scrollTop=sameOwner&&Number.isFinite(host.scrollTop)?Math.max(0,host.scrollTop):0;
  if(sameOwner)host.querySelectorAll('[data-sheet-group]').forEach(function(group){groupState.set(group.getAttribute('data-sheet-group'),group.open);});
  host.innerHTML = "";
  var head = el("div", "md-sheet-head");
  head.innerHTML = '<i class="ph ph-file-dashed"></i><b>' + t("sheetSetup") + "</b>";
  var headActions = el("div", "md-sheet-head-actions");
  var collapseBtn = namedButton(btn('<i class="ph ph-sidebar-simple"></i>', function () {
    setPanelCollapsed("right", true);
  }, "md-sheet-icon"), t("collapsePanel") || "Collapse");
  headActions.appendChild(collapseBtn);
  head.appendChild(headActions);
  host.appendChild(head);

  /* A dangling dimension is drawn in red on the paper, but the paper may be
     scrolled away from it — so the sheet panel is where it can be acted on. */
  var dangling = el("div", "md-sheet-dangling");
  dangling.id = "mdSheetDangling";
  dangling.hidden = true;
  host.appendChild(dangling);

  var setup = sheetGroup(host, t("sheetSetup"),true,'setup');
  sheetRow(setup, t("sheetSize"), sheetSelect(Object.keys(SHEET_SIZES).map(function (key) {
    return { value: key, label: SHEET_SIZES[key].label + "  " + Math.round(SHEET_SIZES[key].w) + "×" + Math.round(SHEET_SIZES[key].h) };
  }), doc.size, function (value) { sheet.setSheetOption("size", value); drawSketch(); })).id = "mdSheetSize";
  sheetRow(setup, t("sheetOrientation"), sheetSelect([
    { value: "landscape", label: t("sheetLandscape") }, { value: "portrait", label: t("sheetPortrait") },
  ], doc.orientation, function (value) { sheet.setSheetOption("orientation", value); drawSketch(); })).id = "mdSheetOrientation";
  sheetRow(setup, t("sheetScale"), sheetSelect([{ value: "fit", label: t("sheetScaleFit") }].concat(
    STANDARD_SCALES.map(function (scale) { return { value: scale.join(":"), label: scaleLabel(scale) }; })
  ), doc.scale === "fit" ? "fit" : scaleLabel(doc.scale).replace(":", ":"), function (value) {
    sheet.setSheetOption("scale", value === "fit" ? "fit" : value.split(":").map(Number));
    drawSketch();
  })).id = "mdSheetScale";
  sheetRow(setup, t("sheetUnits"), sheetSelect([
    { value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "m", label: "m" }, { value: "in", label: "in" },
  ], doc.units, function (value) { sheet.setSheetOption("units", value); drawSketch(); })).id = "mdSheetUnits";
  if(E.docType==='assembly'&&E.assembly){
    setup.appendChild(btn('Auto component balloons',function(){sheet.autoComponentBalloons();drawSketch();},'md-sheet-btn'));
    sheetRow(setup,t('drawingBOMScope'),sheetSelect([{value:'partsOnly',label:t('drawingBOMPartsOnly')},{value:'indented',label:t('drawingBOMIndented')}],E.assembly.drawingSettings?.bomScope==='indented'?'indented':'partsOnly',function(value){
      pushUndo(t('opSheetSetup'));E.assembly.drawingSettings ||= {};E.assembly.drawingSettings.bomScope=value==='indented'?'indented':'partsOnly';
      sheet.invalidateLayout();drawSketch();syncHead();
    })).id='mdSheetBOMScope';
  }
  sheetRow(setup,t("sheetDraftingStandard"),sheetSelect([{value:"custom",label:t("sheetCustomStandard")},{value:"ANSI",label:"ANSI · inch / third angle"},{value:"ISO",label:"ISO · mm / first angle"}],doc.draftingStandard||"custom",function(value){
    sheet.setSheetOption("draftingStandard",value);
    /* A drawing's drafting convention and display units are independent of
       the part's modelling units. ANSI style is also used for MMGS parts; do
       not silently turn their sketches into inches when the sheet is styled. */
    drawSketch();
  })).id="mdSheetStandard";
  sheetRow(setup,t("sheetSecondaryUnits"),sheetSelect([{value:"",label:t("sheetNoSecondary")},...["mm","cm","m","in"].map(value=>({value,label:value}))],doc.secondaryUnits||"",function(value){sheet.setSheetOption("secondaryUnits",value);drawSketch();})).id="mdSheetSecondaryUnits";
  sheetRow(setup,t("sheetSecondaryPrecision"),sheetSelect([0,1,2,3,4,5,6].map(value=>({value:String(value),label:String(value)})),String(doc.secondaryPrecision??2),function(value){sheet.setSheetOption("secondaryPrecision",value);drawSketch();})).id="mdSheetSecondaryPrecision";
  sheetRow(setup,t("sheetPrecision"),sheetSelect([{value:"auto",label:t("sheetPrecisionAuto")},...[0,1,2,3,4,5,6].map(value=>({value:String(value),label:String(value)}))],Number.isInteger(doc.precision)?String(doc.precision):"auto",function(value){sheet.setSheetOption("precision",value);drawSketch();})).id="mdSheetPrecision";
  sheetToggle(setup,t("sheetTrailingZeros"),doc.trailingZeros??Number.isInteger(doc.precision),function(on){sheet.setSheetOption("trailingZeros",on);drawSketch();}).id="mdSheetTrailingZeros";
  sheetRow(setup, t("sheetProjection"), sheetSelect([
    { value: "third", label: t("sheetThirdAngle") }, { value: "first", label: t("sheetFirstAngle") },
  ], doc.projection, function (value) { sheet.setSheetOption("projection", value); drawSketch(); })).id = "mdSheetProjection";
  sheetToggle(setup, t("drawHiddenLines"), doc.showHidden !== false, function (on) { sheet.setSheetOption("showHidden", on); drawSketch(); syncTools(); }).id = "mdSheetHiddenBox";
  sheetToggle(setup, t("sheetShowCenters"), doc.showCenters !== false, function (on) { sheet.setSheetOption("showCenters", on); drawSketch(); }).id = "mdSheetCentersBox";
  sheetToggle(setup, t("sheetShowZones"), doc.showZones !== false, function (on) { sheet.setSheetOption("showZones", on); drawSketch(); }).id = "mdSheetZonesBox";
  setup.appendChild(btn('<i class="ph ph-layout"></i> ' + t("sheetRelayout"), function () { sheet.relayout(); drawSketch(); }, "md-sheet-btn"));
  /* Callouts are read off the feature tree, never typed: the button is here
     rather than in the tool row because it annotates every hole at once. */
  setup.appendChild(btn('<i class="ph ph-crosshair"></i> ' + t("sheetHoleCallouts"), function () { sheet.addHoleCallouts(); drawSketch(); }, "md-sheet-btn"));
  setup.appendChild(btn('<i class="ph ph-ruler"></i> ' + t("drawModelItems"), function () { sheet.insertModelItems(); drawSketch(); }, "md-sheet-btn"));

  var views = sheetGroup(host, t("sheetViews"),true,'views');
  var list = el("div", "md-sheet-views");
  doc.views.forEach(function (view) {
    var selection = sheet.selection();
    var row = el("div", "md-sheet-view" + (selection && selection.kind === "view" && selection.id === view.id ? " on" : ""));
    var name = btn('<i class="ph ph-frame-corners"></i><span>' + (view.label || view.dir) + (sectionHatchCaption(view) ? " · " + sectionHatchCaption(view) : "") + "</span><small>" +
      scaleLabel(sheet.scene().views.find(function (placed) { return placed.id === view.id; })?.scale || view.scale || sheet.scene().scale) + "</small>", function () {
      sheet.select({ kind: "view", id: view.id });
    }, "md-sheet-view-name");
    var sourceState=resolveDrawingViewSource(view);
    if(sourceState.status!=='host'){
      /* Which model a view draws is visible in the list, not only once the
         view is selected: a sheet mixing two models must read as one. */
      var sourceTag=el('small','md-sheet-view-source');
      sourceTag.textContent=sourceState.name+(sourceState.status==='missing'?' (missing)':'');
      sourceTag.title=(sourceState.source.kind==='assembly'?'Assembly: ':'Part: ')+sourceTag.textContent;
      sourceTag.setAttribute('data-view-source',sourceState.source.kind+':'+sourceState.source.key);
      sourceTag.style.cssText='max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'+(sourceState.status==='missing'?';color:var(--danger)':'');
      name.insertBefore(sourceTag,name.lastChild);
    }
    row.appendChild(name);
    var nativeState=configuredDrawingStatus(view);
    if(nativeState)row.appendChild(el('small','md-sheet-view-native-status',nativeState.status==='ready'?'Native configuration ready · geometry only':nativeState.status==='error'?'Native configuration failed · '+nativeState.reason:nativeState.status==='unsupported'?nativeState.reason:'Native configuration rebuilding'));
    row.appendChild(namedButton(btn('<i class="ph ph-trash"></i>', function () {
      sheet.select({ kind: "view", id: view.id });
      sheet.deleteSelection();
      drawSketch();
    }, "md-sheet-view-del"), t("opDeleteView")));
    list.appendChild(row);
  });
  views.appendChild(list);
  var available = sheet.availableViews();
  if (available.length) {
    var adder = sheetSelect([{ value: "", label: t("sheetAddView") }].concat(available.map(function (dir) {
      return { value: dir, label: defaultViewLabel(dir) };
    })), "", function (value) {
      if (!value) return;
      sheet.addView(value);
      drawSketch();
    });
    adder.className = "md-sheet-add-view";
    views.appendChild(adder);
  }
  var selected = sheet.selection();
  var selectedView = selected && selected.kind === "view" && doc.views.filter(function (view) { return view.id === selected.id; })[0];
  if (selectedView) {
    if(selectedView.section) {
      var sectionTagInput=el('input','');
      sectionTagInput.type='text';sectionTagInput.value=selectedView.section.tag || 'A';
      sectionTagInput.maxLength=8;sectionTagInput.setAttribute('aria-label','Section tag');
      sheetRow(views,'Section tag',sectionTagInput);
      var sectionTagApply=el('button','md-sheet-btn','Apply Section tag');sectionTagApply.type='button';
      bindSectionTagControls(sectionTagInput,sectionTagApply,sheet,selectedView.id,drawSketch);
      views.appendChild(sectionTagApply);
      var sectionPositionUnit=modelLengthUnit(),sectionPositionAxis=selectedView.section.axis==='vertical'?'U':'V';
      var sectionPositionInput=el('input','');sectionPositionInput.type='number';sectionPositionInput.step='any';
      sectionPositionInput.value=String(lengthToDocument(Number(selectedView.section.at)||0,sectionPositionUnit));
      var sectionPositionLabel='Cut line '+sectionPositionAxis+' ('+sectionPositionUnit+')';
      sectionPositionInput.setAttribute('aria-label',sectionPositionLabel);
      sectionPositionInput.title='Signed parent-view coordinate along '+sectionPositionAxis+'.';
      sheetRow(views,sectionPositionLabel,sectionPositionInput);
      var sectionPositionApply=el('button','md-sheet-btn','Apply Section position');sectionPositionApply.type='button';
      bindSectionPositionControls(sectionPositionInput,sectionPositionApply,sheet,selectedView.id,sectionPositionUnit,drawSketch);
      views.appendChild(sectionPositionApply);
    }
    if(selectedView.detail) {
      var detailTagInput=el('input','');
      detailTagInput.type='text';detailTagInput.value=selectedView.detail.tag || 'A';
      detailTagInput.maxLength=8;detailTagInput.setAttribute('aria-label','Detail tag');
      sheetRow(views,'Detail tag',detailTagInput);
      var detailTagApply=el('button','md-sheet-btn','Apply Detail tag');detailTagApply.type='button';
      bindDetailTagControls(detailTagInput,detailTagApply,sheet,selectedView.id,drawSketch);
      views.appendChild(detailTagApply);
    }
    views.appendChild(btn('<i class="ph ph-copy"></i> Copy selected view', function(){
      sheet.duplicateSelectedView();
      drawSketch();
    }, "md-sheet-btn"));
    sheetViewSourceRow(views,doc,selectedView,sheet);
    const resolved = resolveDrawingViewSource(selectedView);
    const assembly = assemblyForDrawingSource(resolved);
    if (assembly) {
      const owner = viewSourceOwner(doc, selectedView);
      const choices = [{value:'', label:resolved.status === 'host' ? 'Follow assembly' : 'Source default (assembled)'},
        {value:'assembled', label:'Assembled'},
        ...(assembly.explodedViews || []).map(v => ({value:v.id, label:v.name || v.id}))];
      if (owner?.assemblyState && !choices.some(choice => choice.value === owner.assemblyState))
        choices.push({value:owner.assemblyState,label:'Missing exploded view'});
      const select = sheetSelect(choices, owner?.assemblyState || '', value => {
        sheet.setSheetOption('viewAssemblyState',value);
        drawSketch();
      });
      select.id = 'mdSheetAssemblyState';
      select.disabled = owner?.id !== selectedView.id;
      sheetRow(views,select.disabled ? 'Assembly state (from parent)' : 'Assembly state',select);
    }
    if(E.docType==='part'&&(E.def.configurations||[]).length>1&&resolveDrawingViewSource(selectedView).status==='host'){
      sheetRow(views,"Configuration",sheetSelect([{value:"active",label:"Active model"}].concat(E.def.configurations.map(function(cfg){
        return {value:cfg.id,label:cfg.name};
      })),selectedView.configurationId||"active",function(value){
        sheet.setSheetOption("viewConfiguration",value);
        drawSketch();
      })).id="mdSheetViewConfiguration";
    }
    if(selectedView.section || selectedView.alignedSection || selectedView.brokenOut) {
      var hatchPicker=sheetSelect(SECTION_HATCH_PATTERNS,selectedView.hatchPattern || 'uniform',function(value){
        sheet.setSheetOption('viewHatchPattern',value);drawSketch();
      });
      hatchPicker.setAttribute('aria-label','Section hatch pattern');
      sheetRow(views,'Section hatch pattern',hatchPicker);
      views.appendChild(el('small','md-note','Drafting pattern only; does not assign or certify material.'));
    }
    if(selectedView.section) {
      sheetRow(views,'Longitudinal ribs',sheetSelect([{value:'exclude',label:'Leave unhatched'},{value:'hatch',label:'Hatch with section'}],selectedView.section.excludeLongitudinalRibs===false?'hatch':'exclude',function(value){
        sheet.setSheetOption('viewExcludeRibs',value==='exclude');drawSketch();
      }));
    }
    var scaleControl=drawingViewScaleControl(selectedView.scale,t("sheetInherit"),{automatic:selectedView.scaleMode!=='sheet',effectiveScale:sheet.scene?.().views.find(function(placed){return placed.id===selectedView.id;})?.scale});
    sheetRow(views, t("sheetViewScale"), sheetSelect(scaleControl.options, scaleControl.value, function (value) {
      sheet.setSheetOption("viewScale", value === "sheet" || value === "auto" ? value : value.split(":").map(Number));
      drawSketch();
    }));
    sheetRow(views, t("drawHiddenLines"), sheetSelect([
      { value: "sheet", label: t("sheetInherit") }, { value: "on", label: t("drawOn") }, { value: "off", label: t("drawOff") },
    ], selectedView.hidden === null || selectedView.hidden === undefined ? "sheet" : selectedView.hidden ? "on" : "off", function (value) {
      sheet.setSheetOption("viewHidden", value === "sheet" ? "sheet" : value === "on");
      drawSketch();
    }));
    sheetRow(views, "Display style", sheetSelect([
      {value:"edges",label:"Hidden line drawing"},
      {value:"shaded",label:"Shaded"},
      {value:"shadedEdges",label:"Shaded with edges"},
    ], selectedView.displayStyle || "edges", function(value) {
      sheet.setSheetOption("viewDisplayStyle",value);
      drawSketch();
    }));
  }

  var title = sheetGroup(host, t("sheetTitleBlock"), false,'title');
  [["title", t("tbTitle"), "mdSheetTitleField"], ["number", t("tbNumber")], ["revision", t("tbRev")],
    ["author", t("tbAuthor")], ["company", t("tbCompany")], ["material", t("tbMaterial")],
    ["finish", t("tbFinish")], ["mass", t("tbMass")], ["date", t("tbDate")], ["tolerance", t("tbTolerance")],
  ].forEach(function (field) {
    var input = el("input", "");
    input.type = "text";
    input.value = doc.title[field[0]] || "";
    if (field[2]) input.id = field[2];
    input.setAttribute("data-title-field", field[0]);
    var source = doc.title.sources?.[field[0]];
    if (source && source !== "manual") {
      input.value = sheetTitleMeta(doc, E.docType === "assembly" ? E.assembly : E.def)[field[0]];
      input.disabled = true;
    }
    bindTitleField(input, field[0]);
    sheetRow(title, field[1], input);
    if (["title", "number"].includes(field[0])) {
      var picker = el("select", "");
      picker.setAttribute("data-title-source", field[0]);
      picker.setAttribute("aria-label", field[0] === "title" ? "Title source" : "Drawing number source");
      if (!source) { var legacy = el("option", "", "Existing behavior"); legacy.value = "legacy"; legacy.disabled = true; picker.appendChild(legacy); }
      var choices = [["manual", "Manual text"], ...(field[0] === "title" ? [["description", "Model Description"]] : []), ["name", field[0] === "title" ? "Model name" : "Model name (file-name equivalent)"]];
      choices.forEach(function (choice) { var option = el("option", "", choice[1]); option.value = choice[0]; picker.appendChild(option); });
      picker.value = source || "legacy";
      picker.title = "Choosing a source creates a persistent link. Missing source values display blank. Model name is this app's file-name equivalent; no suffix is removed. Existing fields keep their legacy behavior until you choose a source.";
      bindTitleSource(picker, field[0], host);
      sheetRow(title, field[0] === "title" ? "Title source" : "Drawing number source", picker);
    }
  });
  host.setAttribute("data-views", doc.views.map(function (view) { return view.id; }).join(","));
  syncDanglingDims(host);
  host.querySelectorAll('[data-sheet-group]').forEach(function(group){var key=group.getAttribute('data-sheet-group');if(groupState.has(key))group.open=groupState.get(key);});
  host._sheetPanelOwner=ownerIdentity;host._sheetPanelOwnerType=E.docType;
  host.scrollTop=Math.min(scrollTop,Math.max(0,host.scrollHeight-host.clientHeight));
}

/* Which dimensions no longer measure anything, and a way to reach each one.
   Built from the scene, so it can never disagree with what the paper shows. */
function syncDanglingDims(host) {
  var box = host && host.querySelector("#mdSheetDangling");
  if (!box) return;
  var sheet = drawingSheet(), issues = sheet.danglingDims();
  var signature = issues.map(function (issue) { return issue.id; }).join(",");
  if (box.getAttribute("data-issues") === signature) return;
  box.setAttribute("data-issues", signature);
  box.innerHTML = "";
  box.hidden = !issues.length;
  if (!issues.length) return;
  var head = el("div", "md-sheet-dangling-head");
  head.innerHTML = '<i class="ph ph-warning"></i><b>' + t("drawDangling") + "</b>";
  box.appendChild(head);
  box.appendChild(el("div", "md-sheet-dangling-note", tf("drawDanglingCount", { count: issues.length })));
  issues.forEach(function (issue) {
    var button = btn("", function () {
      sheet.select({ kind: issue.kind || "dim", id: issue.id });
    }, "md-sheet-dangling-item");
    /* Persistent ids come from the document, so they go in as text. */
    button.textContent = "⚠ " + (issue.missing.length ? issue.missing.join(", ") : issue.id);
    button.title = t("drawDanglingSelect");
    box.appendChild(button);
  });
}

export {
  buildSheetPanel, chooseDrawingImage, chooseDrawingProjectImage, sheetForm,
  sheetPrompt, sheetRow, sheetSelect, syncDanglingDims,
};
