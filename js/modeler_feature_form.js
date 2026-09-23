import { evaluateExpression, expandUnitLiterals } from "./sketch_equations.js";
// Feature property manager: grouped parameter forms with live callbacks.
// The editor supplies DOM helpers, document units, and reference options.

import { featureEditorGroups } from "./core/feature_catalog.js";
import { endConditionHidesDepth, isUpToFace } from "./core/extrude_extent.js";
import { linearPatternAxisDefinitions, linearPatternDirection, patternAxisEnabled } from "./core/pattern_geometry.js";
import { holeTableRow } from "./cad_hole_wizard.js";
import { toolboxFamily } from "./cad_toolbox.js";

export function featureControlValue(control) {
  if (control.field.type === "boolean") return !!control.input.checked;
  if (control.field.type === "number") {
    try { return evaluateFeatureNumber(control.input.value, control.field); }
    catch (error) { return NaN; }
  }
  return control.input.value;
}

// Arithmetic is evaluated once on entry, in the field's displayed units.
// It does not create a persistent equation or execute JavaScript.
export function evaluateFeatureNumber(raw, field) {
  let text = String(raw).trim();
  // Geometry uses centimeters internally. Explicit unit literals avoid manual
  // conversion when working from metric or inch engineering drawings.
  if (field.unit === "length" || field.unit === "angle") text = expandUnitLiterals(text, field.unit);
  // Preserve numeric scientific notation emitted by small geometry values.
  const value = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : evaluateExpression(text);
  if (!Number.isFinite(value)) throw new Error("Enter a finite number");
  if (field.min != null && value < Number(field.min)) throw new Error("Minimum: " + field.min);
  if (field.max != null && value > Number(field.max)) throw new Error("Maximum: " + field.max);
  if (/^(count|.*Count|count[XYZ])$/.test(field.key) && !Number.isInteger(value)) throw new Error("Enter a whole number");
  return value;
}

export function validateFeatureInputs(host) {
  const inputs = Array.from(host.querySelectorAll('input[data-parameter-type="number"]'));
  for (const input of inputs) {
    if (input.closest('.parameter-hidden, .parameter-inactive')) continue;
    if (input._validateFeatureValue) input._validateFeatureValue();
    if (!input.checkValidity()) {
      const group = input.closest('details'); if (group) group.open = true;
      input.focus(); input.reportValidity(); return false;
    }
  }
  return true;
}

export function featureReferenceValue(feature, type) {
  if (type === "axis-reference" && feature && feature.references && feature.references.axis) return feature.references.axis;
  if (type === "plane-reference" && feature && feature.references && feature.references.plane) return feature.references.plane;
  var refs = feature && feature.references && feature.references.references || [];
  var found = refs.find(function (reference) {
    var id = typeof reference === "string" ? reference : reference && reference.id;
    return type === "axis-reference" ? String(id || "").indexOf("axis:") === 0 : String(id || "").indexOf("plane:") === 0;
  });
  if (found) return typeof found === "string" ? found : found.id;
  return type === "axis-reference" ? "axis:y" : "plane:right";
}

export function readFeatureParameterForm(controls, baseParams) {
  var params = { ...(baseParams || {}) }, references = {}, valid = true;
  controls.forEach(function (control) {
    if (control.input.closest && control.input.closest(".parameter-hidden, .parameter-inactive")) return;
    var value = featureControlValue(control);
    if (typeof value === "number" && !Number.isFinite(value)) { valid = false; return; }
    if (control.field.key === "$axisReference") references.axis = value;
    else if (control.field.key === "$planeReference") references.plane = value;
    else params[control.field.key] = value;
  });
  if (params.endCondition === "mid-plane") params.symmetric = true;
  if (["axisX", "axisY", "axisZ"].some(function (key) { return Object.prototype.hasOwnProperty.call(params, key); }) || params.directionAxis) {
    params.direction = linearPatternDirection(params);
  }
  return { params: params, references: references, valid: valid };
}

var expressionFieldId = 0;

export function featureField(host, field, value, options) {
  options = options || {};
  var el = options.el;
  var wrap = el("label", "md-quick-field type-" + field.type);
  wrap.dataset.parameter = field.key;
  var caption = el("span", "md-feature-field-label", field.label);
  if (field.unit) {
    var units = options.units || { length: "mm", angle: "deg" };
    caption.appendChild(el("small", "md-feature-unit", field.unit === "angle" ? (units.angle || "deg") : (units.length || "mm")));
  }
  wrap.appendChild(caption);
  var input;
  if (field.type === "boolean") {
    input = el("input"); input.type = "checkbox"; input.checked = !!value;
    wrap.appendChild(input); wrap.appendChild(el("span", "md-feature-switch", "<i></i>"));
  } else if (field.type === "select" || field.type === "axis-reference" || field.type === "plane-reference" || field.type === "helix-reference") {
    input = el("select");
    var choices = field.choices || (options.referenceOptions && options.referenceOptions(field.type)) || [];
    choices.forEach(function (choice) {
      var option = el("option", "", choice.label);
      option.value = choice.value;
      if (String(choice.value) === String(value)) option.selected = true;
      input.appendChild(option);
    });
    wrap.appendChild(input);
  } else {
    input = el("input"); input.type = "text"; input.value = value ?? "";
    if (field.min != null) input.min = field.min;
    if (field.max != null) input.max = field.max;
    input.step = field.step || ".1";
    wrap.appendChild(input);
  }
  if (field.type === "number") {
    input.inputMode = "text";
    input.spellcheck = false;
    var result = el("small", "md-expression-result");
    result.id = "mdExpression-" + field.key + "-" + (++expressionFieldId);
    input.setAttribute("aria-describedby", result.id);
    wrap.appendChild(result);
    var validate = function () {
      try {
        var number = evaluateFeatureNumber(input.value, field);
        input.setCustomValidity(""); input.removeAttribute("aria-invalid");
        result.textContent = String(input.value).trim() === String(number) ? "" : "= " + Number(number.toPrecision(12));
        result.classList.remove("invalid");
      } catch (error) {
        input.setCustomValidity(error.message); input.setAttribute("aria-invalid", "true");
        result.textContent = error.message; result.classList.add("invalid");
      }
    };
    input._validateFeatureValue = validate;
    input.addEventListener("input", validate); input.addEventListener("change", validate); validate();
  }
  input.dataset.parameter = field.key;
  input.dataset.parameterType = field.type;
  host.appendChild(wrap);
  return input;
}

export function renderFeatureParameterForm(host, type, state, onLive, options) {
  options = options || {};
  var el = options.el;
  var controls = [], groups = featureEditorGroups(type), patternMode = state.params && state.params.mode || "linear", patternDrafts = { linear: {}, circular: {}, curve: {} };
  var patternModeKeys = {
    linear: ["axisX", "countX", "spacingX", "spacingIncrementX", "axisY", "countY", "spacingY", "spacingIncrementY", "axisZ", "countZ", "spacingZ", "spacingIncrementZ"],
    circular: ["count", "angle", "radialDistance", "axis", "equalSpacing"],
    curve: ["curveCount", "curveSpacingMode", "curveSpacing", "curveAlign"],
  };
  function rememberPatternSettings(mode) {
    if (type !== "pattern") return;
    (patternModeKeys[mode] || []).forEach(function (key) {
      var control = controls.find(function (item) { return item.field.key === key; });
      if (control) { var value = featureControlValue(control); if (typeof value !== "number" || Number.isFinite(value)) patternDrafts[mode][key] = value; }
    });
  }
  function restorePatternSettings(mode) {
    if (type !== "pattern") return;
    Object.entries(patternDrafts[mode] || {}).forEach(function (entry) {
      var control = controls.find(function (item) { return item.field.key === entry[0]; });
      if (!control) return;
      if (control.field.type === "boolean") control.input.checked = !!entry[1];
      else control.input.value = entry[1];
    });
  }
  function syncConditionalFields(changedKey) {
    if (type === "thread") {
      var enabled=controls.find(function(item){return item.field.key==="useFitLimits";});
      controls.filter(function(item){return ["fitSource","majorMinMm","majorMaxMm","pitchMinMm","pitchMaxMm","minorMinMm","minorMaxMm"].includes(item.field.key);}).forEach(function(item){
        item.input.closest(".md-quick-field").classList.toggle("parameter-hidden",!enabled?.input.checked);
      });
    }
    if (type === "toolbox") {
      var familyControl = controls.find(function (item) { return item.field.key === "kind"; });
      var sizeControl = controls.find(function (item) { return item.field.key === "sizeKey"; });
      var lengthControl = controls.find(function (item) { return item.field.key === "lengthMm"; });
      var family = familyControl && toolboxFamily(familyControl.input.value);
      if (family && sizeControl && (changedKey === "kind" || !sizeControl.input.options.length)) {
        var previousSize = sizeControl.input.value;
        sizeControl.input.innerHTML = "";
        (family.sizes || []).forEach(function (row) {
          var option = el("option", "", row.label || row.size || row.key);
          option.value = row.key || row.size;
          sizeControl.input.appendChild(option);
        });
        var available = (family.sizes || []).some(function (row) { return String(row.key || row.size) === String(previousSize); });
        sizeControl.input.value = available ? previousSize : family.defaultSize || (family.sizes[0] && (family.sizes[0].key || family.sizes[0].size)) || "";
      }
      if (family && lengthControl) {
        var lengthWrap = lengthControl.input.closest(".md-quick-field");
        if (lengthWrap) lengthWrap.classList.toggle("parameter-hidden", !family.hasLength);
        if (family.hasLength && changedKey === "kind") {
          var selected = (family.sizes || []).find(function (row) { return String(row.key || row.size) === String(sizeControl && sizeControl.input.value); });
          var preferred = family.defaultLength || (selected && selected.lengthMm) || (family.lengthOptions && family.lengthOptions[0]);
          if (Number(preferred) > 0) lengthControl.input.value = String(preferred);
        }
      }
    }
    var mode = controls.find(function (item) { return item.field.key === "mode"; });
    if (type === "pattern" && mode) {
      Object.entries(patternModeKeys).forEach(function (entry) {
        entry[1].forEach(function (key) {
          var control = controls.find(function (item) { return item.field.key === key; });
          var wrap = control && control.input.closest(".md-quick-field");
          if (wrap) wrap.classList.toggle("parameter-hidden", entry[0] !== mode.input.value);
        });
      });
      host.querySelectorAll(".md-feature-group").forEach(function (section) {
        var fields = Array.from(section.querySelectorAll(".md-quick-field"));
        section.classList.toggle("parameter-hidden", fields.length > 0 && fields.every(function (field) { return field.classList.contains("parameter-hidden"); }));
      });
      var linear = mode.input.value === "linear";
      ["axisX", "axisY", "axisZ"].forEach(function (axisKey) {
        var axisControl = controls.find(function (item) { return item.field.key === axisKey; }), enabled = linear && axisControl && axisControl.input.checked, suffix = axisKey.slice(-1);
        [axisKey, "count" + suffix, "spacing" + suffix, "spacingIncrement" + suffix].forEach(function (key) {
          var control = controls.find(function (item) { return item.field.key === key; }), wrap = control && control.input.closest(".md-quick-field");
          if (wrap) wrap.classList.toggle("parameter-inactive", key === axisKey ? !linear : !enabled);
        });
      });
      var circularCount = controls.find(function (item) { return item.field.key === "count"; }), circularWrap = circularCount && circularCount.input.closest(".md-quick-field");
      if (circularWrap) circularWrap.classList.toggle("parameter-inactive", mode.input.value !== "circular");
      host.querySelectorAll('[data-parameter="angle"],[data-parameter="radialDistance"],[data-parameter="axis"],[data-parameter="equalSpacing"]').forEach(function (node) {
        node.closest(".md-quick-field").classList.toggle("parameter-inactive", mode.input.value !== "circular");
      });
      var curve = mode.input.value === "curve";
      var spacingMode = controls.find(function (item) { return item.field.key === "curveSpacingMode"; });
      ["curveCount", "curveSpacingMode", "curveSpacing", "curveAlign"].forEach(function (key) {
        var control = controls.find(function (item) { return item.field.key === key; }), wrap = control && control.input.closest(".md-quick-field");
        // Arc spacing is only a number when the copies are not being fitted to
        // the whole run; fitted, the curve's own length decides it.
        if (wrap) wrap.classList.toggle("parameter-inactive", !curve || (key === "curveSpacing" && !(spacingMode && spacingMode.input.value === "spacing")));
      });
      if (linear) {
        var axisParams = {};
        ["X", "Y", "Z"].forEach(function (suffix) {
          ["axis", "count", "spacing"].forEach(function (prefix) {
            var key = prefix + suffix, control = controls.find(function (item) { return item.field.key === key; });
            axisParams[key] = prefix === "axis" ? !!(control && control.input.checked) : (control ? featureControlValue(control) : NaN);
          });
        });
        linearPatternAxisDefinitions(axisParams).forEach(function (definition) {
          if (definition.axis === "vector") return;
          var control = controls.find(function (item) { return item.field.key === "count" + definition.axis.toUpperCase(); });
          if (control && changedKey !== control.field.key && featureControlValue(control) !== definition.count) control.input.value = String(definition.count);
        });
      }
    }
    if (type === "fillet") {
      var variable = controls.find(function (item) { return item.field.key === "variableRadius"; });
      var endRadius = controls.find(function (item) { return item.field.key === "endRadius"; });
      var endWrap = endRadius && endRadius.input.closest(".md-quick-field");
      if (endWrap) endWrap.classList.toggle("parameter-hidden", !(variable && variable.input.checked));
      var fullRound=controls.find(function(item){return item.field.key==="fullRound";});
      ["radius","variableRadius","multipleRadius","endRadius","propagation","continuity"].forEach(function(key){
        var control=controls.find(function(item){return item.field.key===key;}),wrap=control?.input.closest(".md-quick-field");
        if(wrap)wrap.classList.toggle("parameter-hidden",!!fullRound?.input.checked || (key==="endRadius" && !variable?.input.checked));
      });
    }
    if (type === "chamfer" && mode) {
      var active = { secondDistance: mode.input.value === "two-distance", angle: mode.input.value === "distance-angle", flip: mode.input.value !== "equal-distance" };
      ["secondDistance", "angle", "flip"].forEach(function (key) {
        var control = controls.find(function (item) { return item.field.key === key; }), wrap = control && control.input.closest(".md-quick-field");
        if (wrap) wrap.classList.toggle("parameter-hidden", !active[key]);
      });
    }
    if (type === "extrude" || type === "extrudeCut") {
      var end = controls.find(function (item) { return item.field.key === "endCondition"; });
      var hideDepth = endConditionHidesDepth(end && end.input.value);
      var depthControl = controls.find(function (item) { return item.field.key === "depth"; });
      var depthWrap = depthControl && depthControl.input.closest(".md-quick-field");
      if (depthWrap) depthWrap.classList.toggle("parameter-hidden", hideDepth);
      host.classList.toggle("md-up-to-face", isUpToFace(end && end.input.value));
    }
    /* A field the current mode ignores is a field the user has to scroll past
       and wonder about. End radius means nothing until the fillet is variable,
       and a chamfer uses either a second distance or an angle, never both. */
    if (type === "fillet") {
      var variable = controls.find(function (item) { return item.field.key === "variableRadius"; });
      var endWrap = (controls.find(function (item) { return item.field.key === "endRadius"; }) || {}).input;
      endWrap = endWrap && endWrap.closest(".md-quick-field");
      if (endWrap) endWrap.classList.toggle("parameter-hidden", !(variable && variable.input.checked));
    }
    if (type === "chamfer") {
      var chamferMode = controls.find(function (item) { return item.field.key === "mode"; });
      var mode = chamferMode && chamferMode.input.value;
      [["secondDistance", "two-distance"], ["angle", "distance-angle"]].forEach(function (pair) {
        var control = controls.find(function (item) { return item.field.key === pair[0]; });
        var wrap = control && control.input.closest(".md-quick-field");
        if (wrap) wrap.classList.toggle("parameter-hidden", mode !== pair[1]);
      });
    }
    if (type === "hole") {
      var size = controls.find(function (item) { return item.field.key === "standardSize"; });
      var holeType = controls.find(function (item) { return item.field.key === "holeType"; });
      var row = size && holeTableRow(size.input.value);
      if (row && ["standardSize", "holeType", "fit"].indexOf(changedKey) >= 0) {
        var fit = (controls.find(function (item) { return item.field.key === "fit"; }) || {}).input;
        var fitKey = fit && fit.value === "close" ? "closeMm" : fit && fit.value === "loose" ? "looseMm" : "normalMm";
        /* Millimetres from the standards table become the centimetre field the
           form edits. Rounding the MILLIMETRE value first quantised the whole
           table to whole millimetres: M3 normal clearance (3.6) came out as 4,
           and the normal and loose fits (3.4 / 3.6) collapsed onto one value.
           Convert first, then trim only the noise from the division. */
        var setNum = function (key, mm) {
          var control = controls.find(function (item) { return item.field.key === key; });
          if (control && Number.isFinite(mm)) control.input.value = String(Math.round(mm * 1000) / 10000);
        };
        setNum("diameter", row[fitKey] || row.diameterMm);
        setNum("cboreDiameter", row.cboreDiaMm);
        setNum("cboreDepth", row.cboreDepthMm);
        setNum("countersinkDiameter", row.csinkDiaMm);
      }
      var tapped = holeType && String(holeType.input.value).indexOf("tap") === 0;
      var cbore = holeType && (holeType.input.value === "counterbore" || holeType.input.value === "tap-counterbore" || holeType.input.value === "spotface");
      var csink = holeType && (holeType.input.value === "countersink" || holeType.input.value === "tap-countersink");
      ["cboreDiameter","cboreDepth","counterbore"].forEach(function (key) {
        var control = controls.find(function (item) { return item.field.key === key; }), wrap = control && control.input.closest(".md-quick-field");
        if (wrap) wrap.classList.toggle("parameter-hidden", !cbore);
      });
      ["countersinkDiameter","csinkAngle","countersink"].forEach(function (key) {
        var control = controls.find(function (item) { return item.field.key === key; }), wrap = control && control.input.closest(".md-quick-field");
        if (wrap) wrap.classList.toggle("parameter-hidden", !csink);
      });
      ["threadMode","handedness","threadDepth"].forEach(function (key) {
        var control = controls.find(function (item) { return item.field.key === key; }), wrap = control && control.input.closest(".md-quick-field");
        if (wrap) wrap.classList.toggle("parameter-hidden", !tapped);
      });
      var holeEnd = controls.find(function (item) { return item.field.key === "endCondition"; });
      var holeLayout = controls.find(function (item) { return item.field.key === "layout"; });
      var layoutValue = holeLayout && holeLayout.input.value;
      controls.forEach(function (control) {
        var key = control.field.key, hidden;
        if (key === "depth") hidden = holeEnd && holeEnd.input.value === "through-all";
        else if (key === "fit") hidden = size && size.input.value === "custom";
        else if (["countX","countY","spacingX","spacingY"].includes(key)) hidden = layoutValue !== "linear";
        else if (["count","radius"].includes(key)) hidden = layoutValue !== "circular";
        else return;
        var wrap = control.input.closest(".md-quick-field");
        if (wrap) wrap.classList.toggle("parameter-hidden", !!hidden);
      });
    }
  }
  groups.forEach(function (group) {
    var section = el("details", "md-feature-group");
    section.open = true;
    var primaryFields = group.fields.filter(function (item) { return !item.advanced; });
    section.appendChild(el("summary", "", '<i class="ph ' + (group.icon || "ph-sliders-horizontal") + '"></i><span>' + group.label + "</span><small>" + primaryFields.length + "</small>"));
    var body = el("div", "md-feature-group-body");
    /* SOLIDWORKS keeps the settings you touch once a year — conic section,
       surface continuity, edge scope — folded away under Fillet Options.
       Inlining them here cost a phone 2.2 screens of scrolling to reach a
       radius box, so anything marked advanced goes in a collapsed group of
       its own and the common path stays one screen. */
    var advancedSection = null, advancedBody = null;
    function hostForField(field) {
      if (!field.advanced) return body;
      if (!advancedBody) {
        advancedSection = el("details", "md-feature-group md-feature-advanced");
        advancedSection.appendChild(el("summary", "", '<i class="ph ph-sliders-horizontal"></i><span>' + (options.advancedLabel || "More options") + "</span>"));
        advancedBody = el("div", "md-feature-group-body");
        advancedSection.appendChild(advancedBody);
      }
      return advancedBody;
    }
    group.fields.forEach(function (sourceField) {
      var field = { ...sourceField };
      if (type === "toolbox" && field.dynamicChoices === "toolbox-size") {
        var initialFamily = toolboxFamily(state.params && state.params.kind);
        field.choices = (initialFamily && initialFamily.sizes || []).map(function (row) { return { value:row.key || row.size, label:row.label || row.size || row.key }; });
      }
      var value = field.key === "$axisReference" ? featureReferenceValue(state, "axis-reference")
        : field.key === "$planeReference" ? featureReferenceValue(state, "plane-reference")
        : ["axisX", "axisY", "axisZ"].includes(field.key) ? patternAxisEnabled(state.params, field.key.slice(-1).toLowerCase())
        : state.params && state.params[field.key];
      if(type==="thread" && value==null && state.params?.fitLimits){
        var limits=state.params.fitLimits;
        if(field.key==="useFitLimits")value=true;
        else if(field.key==="fitSource")value=limits.source;
        else {
          var match=/^(major|pitch|minor)(Min|Max)Mm$/.exec(field.key);
          if(match)value=limits[match[1]+"Diameter"]?.[match[2].toLowerCase()];
        }
      }
      var input = featureField(hostForField(field), field, value, options);
      var control = { field: field, input: input };
      controls.push(control);
      var live = function () {
        if (type === "pattern" && field.key === "mode" && input.value !== patternMode) {
          rememberPatternSettings(patternMode); restorePatternSettings(input.value); patternMode = input.value;
        }
        if (type === "pattern" && ["axisX", "axisY", "axisZ"].includes(field.key) && !controls.some(function (item) { return ["axisX", "axisY", "axisZ"].includes(item.field.key) && item.input.checked; })) input.checked = true;
        syncConditionalFields(field.key);
        controls.forEach(function(item){if(item.input._validateFeatureValue)item.input._validateFeatureValue();});
        if (type === "pattern") rememberPatternSettings(patternMode);
        var next = readFeatureParameterForm(controls, state.params);
        if (onLive && next.valid) onLive(next);
      };
      input.addEventListener("input", live);
      input.addEventListener("change", live);
    });
    section.appendChild(body);
    if (advancedSection) section.appendChild(advancedSection);
    host.appendChild(section);
  });
  if (type === "pattern") { rememberPatternSettings("linear"); rememberPatternSettings("circular"); rememberPatternSettings("curve"); }
  syncConditionalFields();
  return controls;
}
