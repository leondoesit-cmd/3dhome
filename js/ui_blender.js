/* The dialog behind Export ▸ GLB. js/blender_export.js does the work; this is
   the sheet of choices in front of it.

   The defaults are the Blender-correct ones, so the whole dialog can be
   ignored: Enter exports a metre-scale, named, recentred GLB. The switches
   exist because the two things people most often need to override — "give me
   the ground plane too" and "keep my centimetres" — are exactly the two that
   cannot be guessed from the model. Choices are remembered per browser, since
   an export is something you do a dozen times in an afternoon. */
import { t } from "./i18n.js";
import { flash, openModal } from "./ui.js";
import { defaultOptions, exportForBlender, exportFilename } from "./blender_export.js";

var STORE = "home3d.blenderExport";

function loadOptions() {
  var o = defaultOptions();
  try {
    var raw = JSON.parse(localStorage.getItem(STORE) || "{}");
    Object.keys(o).forEach(function (k) {
      if (raw[k] !== undefined && typeof raw[k] === typeof o[k]) o[k] = raw[k];
    });
  } catch (e) {}
  return o;
}
function saveOptions(o) {
  try {
    localStorage.setItem(STORE, JSON.stringify(o));
  } catch (e) {}
}

function row(label, hint, control) {
  return (
    '<label class="bx-row"><span class="bx-lbl">' +
    label +
    (hint ? '<span class="bx-hint">' + hint + "</span>" : "") +
    "</span>" +
    control +
    "</label>"
  );
}
function check(id, on) {
  return '<input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "/>";
}

export function openBlenderExport() {
  var opts = loadOptions();
  var dlg = openModal(t("bx_title"));
  dlg.modal.classList.add("bx-modal");
  var b = dlg.body;
  b.innerHTML =
    '<p class="bx-intro">' + t("bx_intro") + "</p>" +
    row(
      t("bx_format"),
      t("bx_format_h"),
      '<select id="bxFormat"><option value="glb">GLB (.glb)</option><option value="gltf">glTF (.gltf)</option></select>',
    ) +
    row(
      t("bx_units"),
      t("bx_units_h"),
      '<select id="bxUnits"><option value="m">' + t("bx_units_m") + '</option><option value="cm">' + t("bx_units_cm") + "</option></select>",
    ) +
    row(t("bx_recenter"), t("bx_recenter_h"), check("bxRecenter", opts.recenter)) +
    row(t("bx_lights"), t("bx_lights_h"), check("bxLights", opts.lights)) +
    row(t("bx_instances"), t("bx_instances_h"), check("bxInstances", opts.instances)) +
    row(t("bx_solidify"), t("bx_solidify_h"), check("bxSolidify", opts.solidifyViewAids)) +
    row(t("bx_ground"), t("bx_ground_h"), check("bxGround", opts.ground)) +
    row(t("bx_hidden"), t("bx_hidden_h"), check("bxHidden", opts.hidden)) +
    '<p class="bx-note">' + t("bx_note") + "</p>";
  b.querySelector("#bxFormat").value = opts.format;
  b.querySelector("#bxUnits").value = opts.units;

  var cancel = document.createElement("button");
  cancel.textContent = t("cancel");
  cancel.onclick = dlg.close;
  var go = document.createElement("button");
  go.className = "primary";
  go.innerHTML = '<i class="ph ph-download-simple"></i> <span>' + t("bx_go") + "</span>";
  dlg.actions.appendChild(cancel);
  dlg.actions.appendChild(go);

  function read() {
    return Object.assign(opts, {
      format: b.querySelector("#bxFormat").value,
      units: b.querySelector("#bxUnits").value,
      recenter: b.querySelector("#bxRecenter").checked,
      lights: b.querySelector("#bxLights").checked,
      instances: b.querySelector("#bxInstances").checked,
      solidifyViewAids: b.querySelector("#bxSolidify").checked,
      ground: b.querySelector("#bxGround").checked,
      hidden: b.querySelector("#bxHidden").checked,
    });
  }
  // the filename follows the format switch, so the button says what lands on disk
  function syncName() {
    go.querySelector("span").textContent = t("bx_go") + " · " + exportFilename(read());
  }
  b.addEventListener("change", syncName);
  syncName();

  go.onclick = function () {
    var o = read();
    saveOptions(o);
    go.disabled = true;
    go.querySelector("span").textContent = t("bx_working");
    runExport(o).then(
      function () {
        dlg.close();
      },
      function () {
        go.disabled = false;
        syncName();
      },
    );
  };
}

/* The export itself, without the dialog — the toolbar keeps a one-click path
   for anyone who has already settled on their options. */
export function runExport(options) {
  var o = Object.assign(loadOptions(), options || {});
  return exportForBlender(o).then(
    function (res) {
      var url = URL.createObjectURL(res.blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 4000);
      flash(summary(res), "success");
      return res;
    },
    function (err) {
      flash(err && err.message === "no3d" ? t("f_no3d") : t("bx_failed"), "error");
      throw err;
    },
  );
}

/* What actually landed in the file. Object and triangle counts are the numbers
   a Blender user checks against their own statistics overlay right after the
   import, so they are the ones worth putting in the toast. */
function summary(res) {
  var s = res.stats || {};
  var mb = (s.bytes || 0) / 1048576;
  return t("bx_done", {
    name: res.filename,
    objects: s.objects || 0,
    tris: (s.triangles || 0).toLocaleString(),
    size: (mb >= 1 ? mb.toFixed(1) + " MB" : Math.round((s.bytes || 0) / 1024) + " KB"),
  });
}
