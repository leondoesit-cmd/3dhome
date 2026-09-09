// Feature property manager: grouped parameter forms with live callbacks.
// The editor supplies DOM helpers, document units, and reference options.

import { featureEditorGroups } from "./core/feature_catalog.js";
import { linearPatternAxisDefinitions, linearPatternDirection, patternAxisEnabled } from "./core/pattern_geometry.js";
import { holeTableRow } from "./cad_hole_wizard.js";
import { toolboxFamily } from "./cad_toolbox.js";

export function featureControlValue(control) {
  if (control.field.type === "boolean") return !!control.input.checked;
  if (control.field.type === "number") return control.input.value === "" ? NaN : Number(control.input.value);
  return control.input.value;
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
  var params = { ...(baseParams || {}) }, references = {};
  controls.forEach(function (control) {
    var value = featureControlValue(control);
    if (typeof value === "number" && !Number.isFinite(value)) return;
    if (control.field.key === "$axisReference") references.axis = value;
    else if (control.field.key === "$planeReference") references.plane = value;
    else params[control.field.key] = value;
  });
  if (params.endCondition === "mid-plane") params.symmetric = true;
  if (["axisX", "axisY", "axisZ"].some(function (key) { return Object.prototype.hasOwnProperty.call(params, key); }) || params.directionAxis) {
    params.direction = linearPatternDirection(params);
  }
  return { params: params, references: references };
}

export function featureField(host, field, value, options) {
  options = options || {};
  var el = options.el;
  var wrap = el("label", "md-quick-field type-" + field.type);
  wrap.dataset.parameter = field.key;
  var caption = el("span", "md-feature-field-label", field.label);
  if (field.unit) {
    var units = options.units || { length: "cm", angle: "deg" };
    caption.appendChild(el("small", "md-feature-unit", field.unit === "angle" ? (units.angle || "deg") : (units.length || "cm")));
  }
  wrap.appendChild(caption);
  var input;
  if (field.type === "boolean") {
    input = el("input"); input.type = "checkbox"; input.checked = !!value;
    wrap.appendChild(input); wrap.appendChild(el("span", "md-feature-switch", "<i></i>"));
  } else if (field.type === "select" || field.type === "axis-reference" || field.type === "plane-reference") {
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
    input = el("input"); input.type = field.type === "text" ? "text" : "number"; input.value = value ?? "";
    if (field.min != null) input.min = field.min;
    if (field.max != null) input.max = field.max;
    input.step = field.step || ".1";
    wrap.appendChild(input);
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
      if (control) patternDrafts[mode][key] = featureControlValue(control);
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
            axisParams[key] = prefix === "axis" ? !!(control && control.input.checked) : Number(control && control.input.value);
          });
        });
        linearPatternAxisDefinitions(axisParams).forEach(function (definition) {
          if (definition.axis === "vector") return;
          var control = controls.find(function (item) { return item.field.key === "count" + definition.axis.toUpperCase(); });
          if (control && Number(control.input.value) !== definition.count) control.input.value = String(definition.count);
        });
      }
    }
    if (type === "fillet") {
      var variable = controls.find(function (item) { return item.field.key === "variableRadius"; });
      var endRadius = controls.find(function (item) { return item.field.key === "endRadius"; });
      var endWrap = endRadius && endRadius.input.closest(".md-quick-field");
      if (endWrap) endWrap.classList.toggle("parameter-hidden", !(variable && variable.input.checked));
    }
    if (type === "chamfer" && mode) {
      var active = { secondDistance: mode.input.value === "two-distance", angle: mode.input.value === "distance-angle", flip: mode.input.value !== "equal-distance" };
      ["secondDistance", "angle", "flip"].forEach(function (key) {
        var control = controls.find(function (item) { return item.field.key === key; }), wrap = control && control.input.closest(".md-quick-field");
        if (wrap) wrap.classList.toggle("parameter-hidden", !active[key]);
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
           and the normal and loose fits (3.6 / 3.8) collapsed onto one value.
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
      ["threadMode","handedness"].forEach(function (key) {
        var control = controls.find(function (item) { return item.field.key === key; }), wrap = control && control.input.closest(".md-quick-field");
        if (wrap) wrap.classList.toggle("parameter-hidden", !tapped);
      });
    }
  }
  groups.forEach(function (group) {
    var section = el("details", "md-feature-group");
    section.open = true;
    section.appendChild(el("summary", "", '<i class="ph ' + (group.icon || "ph-sliders-horizontal") + '"></i><span>' + group.label + "</span><small>" + group.fields.length + "</small>"));
    var body = el("div", "md-feature-group-body");
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
      var input = featureField(body, field, value, options);
      var control = { field: field, input: input };
      controls.push(control);
      var live = function () {
        if (type === "pattern" && field.key === "mode" && input.value !== patternMode) {
          rememberPatternSettings(patternMode); restorePatternSettings(input.value); patternMode = input.value;
        }
        if (type === "pattern" && ["axisX", "axisY", "axisZ"].includes(field.key) && !controls.some(function (item) { return ["axisX", "axisY", "axisZ"].includes(item.field.key) && item.input.checked; })) input.checked = true;
        syncConditionalFields(field.key);
        if (type === "pattern") rememberPatternSettings(patternMode);
        if (onLive) onLive(readFeatureParameterForm(controls, state.params));
      };
      input.addEventListener("input", live);
      input.addEventListener("change", live);
    });
    section.appendChild(body);
    host.appendChild(section);
  });
  if (type === "pattern") { rememberPatternSettings("linear"); rememberPatternSettings("circular"); rememberPatternSettings("curve"); }
  syncConditionalFields();
  return controls;
}
