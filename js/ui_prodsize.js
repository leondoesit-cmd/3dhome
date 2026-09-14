// "Real model" sizing — free-text search for a manufacturer + model, pull the
// product's true physical size off the web, and rescale the catalog model to it.
//
// Every FURN build() is parametric in it.w/it.d/it.h (local frame x=width,
// z=depth, y=height), so writing the real dimensions back onto the item IS the
// rescale — no mesh scaling, no distortion, and snapping/physics/cost keep
// working because the item stays an ordinary item.
//
// The network side lives in js/prodsize.js and runs on the relay
// (server/relay.mjs → /api/prodsize): retailer pages send no CORS headers, so
// the browser can never read them directly.
import { S } from "./state.js";
import { flabel, clearVSpanCache } from "./furniture.js";
import { pushHistory } from "./history.js";
import { t, getLang } from "./i18n.js";
import { render2D } from "./plan2d.js";
import { fillProps } from "./ui_props.js";
import { flash, openModal } from "./ui.js";
import { updateCost } from "./ui_tree.js";
import {
  applyDims, fmtDims, hostOf, toCm, unitFactor, normalizeText, labeledDims, compactDims, foldAxes,
} from "./prodsize.js";
import { fmtLen, unitLabel } from "./display_units.js";

var CACHE_KEY = "home3d_prodsize";
var CACHE_TTL = 30 * 24 * 3600e3;

function cacheGet(key) {
  try {
    var all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    var e = all[key];
    return e && Date.now() - e.at < CACHE_TTL ? e.data : null;
  } catch (e) {
    return null;
  }
}
function cachePut(key, data) {
  try {
    var all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    all[key] = { at: Date.now(), data: data };
    var keys = Object.keys(all);
    if (keys.length > 60)
      keys.sort(function (a, b) { return all[a].at - all[b].at; })
        .slice(0, keys.length - 60)
        .forEach(function (k) { delete all[k]; });
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (e) {} // quota: the lookup still worked, it just won't be remembered
}

function shownDims(d) {
  function n(v) { return v == null ? "—" : fmtLen(v, { suffix: false }); }
  return n(d.w) + " × " + n(d.d) + " × " + n(d.h);
}

function el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

// ---- the item panel's "linked product" line --------------------------------
export function fillSpecRow(it) {
  var row = document.getElementById("i_spec_row");
  if (!row) return;
  row.innerHTML = "";
  if (!it || !it.spec) {
    row.style.display = "none";
    return;
  }
  row.style.display = "flex";
  var a = el("a", "ps-spec-name", it.spec.title || it.spec.query || "");
  if (it.spec.url) {
    a.href = it.spec.url;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.title = it.spec.url;
  }
  var dims = el("span", "ps-spec-dims", fmtDims(it.spec) + " " + t("cm"));
  var clear = el("button", "ps-spec-clear");
  clear.innerHTML = '<i class="ph ph-x"></i>';
  clear.title = t("ps_unlink");
  clear.onclick = function () {
    pushHistory();
    delete it.spec;
    fillProps();
    render2D();
  };
  row.appendChild(el("i", it.spec.manual ? "ph ph-ruler" : "ph ph-link-simple"));
  row.appendChild(a);
  row.appendChild(dims);
  row.appendChild(clear);
}

// ---- lookup transport ------------------------------------------------------
async function lookup(params) {
  var qs = new URLSearchParams(params).toString();
  var r;
  try {
    r = await fetch("/api/prodsize?" + qs, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new Error("offline");
  }
  if (r.status === 404) throw new Error("norelay");
  if (!r.ok) throw new Error("http" + r.status);
  var ct = r.headers.get("content-type") || "";
  if (!/json/i.test(ct)) throw new Error("norelay"); // a plain static server served index.html
  return await r.json();
}

// ---- the dialog ------------------------------------------------------------
export function openProdSizeDialog() {
  if (!S.sel || S.sel.kind !== "item") {
    flash(t("ps_selectFirst"), "error");
    return;
  }
  var it = S.sel.ref;
  var dlg = openModal(t("ps_title") + " · " + flabel(it.type));
  dlg.overlay.querySelector(".bp-modal").classList.add("ps-modal");

  var hintRow = el("div", "ps-hint", t("ps_hint"));
  dlg.body.appendChild(hintRow);

  // free text: company + model. Everything typed is passed through verbatim —
  // one field, two fields or a whole sentence all work.
  var qRow = el("div", "bp-row ps-qrow");
  var brand = el("input");
  brand.type = "text";
  brand.placeholder = t("ps_brand_ph");
  brand.value = (it.spec && it.spec.brand) || "";
  var model = el("input");
  model.type = "text";
  model.placeholder = t("ps_model_ph");
  model.value = (it.spec && it.spec.model) || "";
  qRow.appendChild(brand);
  qRow.appendChild(model);
  dlg.body.appendChild(qRow);

  var urlRow = el("div", "bp-row ps-qrow");
  var urlIn = el("input");
  urlIn.type = "text";
  urlIn.placeholder = t("ps_url_ph");
  urlIn.dir = "ltr";
  urlRow.appendChild(urlIn);
  dlg.body.appendChild(urlRow);

  // Manual entry: the spec sheet in your hand always beats whatever the web
  // says, and it is the way through when the search comes back empty. Same
  // apply path as a search hit, so the swap/preview/history behavior is one
  // code path. Any unit may be chosen, and a whole size string can be pasted
  // into the width box ("80x28x202", 'רוחב 80 עומק 28 גובה 202') — it is split
  // by the same parser the web results go through.
  var manRow = el("div", "bp-row ps-manual");
  manRow.appendChild(el("span", "ps-manual-lbl", t("ps_manual")));
  function numIn(ph, v) {
    var i = el("input", "ps-man-num");
    i.type = "text";
    i.inputMode = "decimal";
    i.placeholder = ph;
    i.value = v != null ? Math.round(v) : "";
    manRow.appendChild(i);
    return i;
  }
  var mw = numIn(t("width"), it.w),
    md = numIn(t("depth"), it.d),
    mh = numIn(t("height"), it.h);
  var unitSel = el("select", "ps-man-unit");
  [["cm", 'ס"מ'], ["mm", "mm"], ["in", '"'], ["m", "m"]].forEach(function (u, i) {
    var o = el("option", null, i === 0 ? t("cm") : u[1]);
    o.value = u[0];
    unitSel.appendChild(o);
  });
  manRow.appendChild(unitSel);
  dlg.body.appendChild(manRow);
  dlg.body.appendChild(el("div", "ps-hint", t("ps_manual_hint")));

  var status = el("div", "bp-status");
  dlg.body.appendChild(status);
  var list = el("div", "ps-results");
  dlg.body.appendChild(list);

  var current = el("div", "ps-current");
  current.textContent = t("ps_current") + " " + fmtDims(it) + " " + t("cm");
  dlg.body.appendChild(current);

  var chosen = null,
    swap = false;

  var btnCancel = el("button", null, t("close"));
  btnCancel.onclick = dlg.close;
  var btnSwap = el("button", null, t("ps_swap"));
  btnSwap.style.display = "none";
  btnSwap.onclick = function () {
    swap = !swap;
    renderChosen();
  };
  var btnApply = el("button", "btn-accent", t("ps_apply"));
  btnApply.disabled = true;
  btnApply.onclick = function () {
    apply();
    dlg.close();
  };
  var btnSearch = el("button", "btn-accent", t("ps_search"));
  btnSearch.onclick = function () { run(false); };
  dlg.actions.appendChild(btnCancel);
  dlg.actions.appendChild(btnSwap);
  dlg.actions.appendChild(btnApply);
  dlg.actions.appendChild(btnSearch);

  [brand, model, urlIn].forEach(function (inp) {
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); run(false); }
    });
  });
  setTimeout(function () { (brand.value ? model : brand).focus(); }, 30);

  function query() {
    return (brand.value.trim() + " " + model.value.trim()).trim();
  }

  function dimsOf(r) {
    return swap ? { w: r.d, d: r.w, h: r.h } : { w: r.w, d: r.d, h: r.h };
  }

  /* ---- manual entry ---- */
  // one box → cm, honoring the unit picker; blank means "leave this axis alone"
  function manVal(inp) {
    var s = inp.value.trim();
    if (!s) return null;
    var cm = toCm(s, unitSel.value, null);
    return cm != null ? cm : null;
  }
  function manualDims() {
    return { w: manVal(mw), d: manVal(md), h: manVal(mh) };
  }
  // fill the boxes from a search hit, so a found size can still be fine-tuned
  function setManual(d) {
    unitSel.value = lastUnit = "cm";
    mw.value = d.w != null ? Math.round(d.w) : "";
    md.value = d.d != null ? Math.round(d.d) : "";
    mh.value = d.h != null ? Math.round(d.h) : "";
  }
  // a pasted "80x28x202" / 'רוחב 80 עומק 28 גובה 202' fills all three at once
  function splitPaste(str) {
    var lab = foldAxes(labeledDims(normalizeText(str)));
    if (lab.w != null || lab.d != null || lab.h != null) return lab;
    var tri = compactDims(str)[0];
    if (!tri) return null;
    return { w: tri[0].cm, d: tri[1].cm, h: tri[2].cm }; // typed order is W×D×H
  }
  function useManual() {
    var d = manualDims();
    var sel = list.querySelector(".ps-card.on");
    if (sel) sel.classList.remove("on");
    chosen = d.w == null && d.d == null && d.h == null
      ? null
      : { w: d.w, d: d.d, h: d.h, how: "manual", title: "", url: "", host: "", conf: 1 };
    renderChosen();
  }
  [mw, md, mh].forEach(function (inp) {
    inp.addEventListener("input", function () {
      if (/[x×*a-zA-Zא-ת]/.test(inp.value)) {
        var parsed = splitPaste(inp.value);
        if (parsed) setManual(parsed);
      }
      useManual();
    });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && chosen) { e.preventDefault(); apply(); dlg.close(); }
    });
  });
  // Switching the unit re-expresses what is already typed instead of silently
  // reinterpreting it — the boxes start prefilled in cm, so cm→in must show
  // 78 3/4, not treat "200" as 200 inches.
  var lastUnit = "cm";
  unitSel.addEventListener("change", function () {
    var f = unitFactor(unitSel.value) || 1;
    [mw, md, mh].forEach(function (inp) {
      var cm = toCm(inp.value.trim(), lastUnit, null);
      if (cm != null) inp.value = Math.round((cm / f) * 100) / 100;
    });
    lastUnit = unitSel.value;
    useManual();
  });

  function renderChosen() {
    if (!chosen) {
      btnApply.disabled = true;
      btnSwap.style.display = "none";
      current.textContent = t("ps_current") + " " + fmtDims(it) + " " + t("cm");
      return;
    }
    var d = applyDims(it, dimsOf(chosen));
    btnApply.disabled = false;
    btnSwap.style.display = "";
    current.innerHTML = "";
    current.appendChild(el("span", null, t("ps_current") + " " + fmtDims(it)));
    current.appendChild(el("i", "ph ph-arrow-left ps-arrow"));
    current.appendChild(el("strong", null, fmtDims(d) + " " + t("cm")));
  }

  function renderResults(res) {
    list.innerHTML = "";
    chosen = null;
    swap = false;
    renderChosen();
    if (!res.results.length) {
      list.appendChild(el("div", "bp-warn", t("ps_none")));
      return;
    }
    res.results.forEach(function (r) {
      var card = el("div", "ps-card");
      var head = el("div", "ps-card-head");
      head.appendChild(el("span", "ps-dims", fmtDims(r) + " " + t("cm")));
      var conf = el("span", "ps-conf");
      conf.textContent = "●●●●●".slice(0, Math.max(1, Math.round(r.conf * 5)));
      conf.title = t("ps_conf") + " " + Math.round(r.conf * 100) + "%";
      head.appendChild(conf);
      card.appendChild(head);
      card.appendChild(el("div", "ps-title", r.title || ""));
      var src = el("div", "ps-src");
      var host = el("span", null, (r.sources || [r.host]).join(", "));
      src.appendChild(host);
      if (r.url) {
        var a = el("a", null, t("ps_open"));
        a.href = r.url;
        a.target = "_blank";
        a.rel = "noreferrer noopener";
        a.onclick = function (e) { e.stopPropagation(); };
        src.appendChild(a);
      }
      card.appendChild(src);
      card.onclick = function () {
        var prev = list.querySelector(".ps-card.on");
        if (prev) prev.classList.remove("on");
        card.classList.add("on");
        chosen = r;
        swap = false;
        setManual(r); // mirror it into the manual boxes so it can be corrected
        renderChosen();
      };
      list.appendChild(card);
    });
    // preselect the strongest match; the user can still pick another
    list.firstChild.click();
  }

  async function run(nocache) {
    var url = urlIn.value.trim(),
      q = query();
    if (!q && !url) {
      status.textContent = t("ps_needq");
      return;
    }
    var params = {
      q: q || url,
      w: Math.round(it.w),
      d: Math.round(it.d),
      h: Math.round(it.h),
      lang: getLang(),
    };
    if (/^https?:\/\//i.test(url)) params.url = url;
    var ckey = JSON.stringify(params);
    var hit = !nocache && cacheGet(ckey);
    if (hit) {
      status.textContent = t("ps_cached");
      renderResults(hit);
      return;
    }
    btnSearch.disabled = true;
    status.textContent = t("ps_searching");
    list.innerHTML = "";
    try {
      var res = await lookup(params);
      cachePut(ckey, res);
      status.textContent = t("ps_scanned", { n: res.scanned }) + (res.cached ? " · " + t("ps_cached") : "");
      renderResults(res);
    } catch (e) {
      var m = String(e.message || e);
      status.textContent = "";
      var warn = el("div", "bp-warn bp-error");
      warn.appendChild(el("span", null, m === "norelay" || m === "offline" ? t("ps_norelay") : t("ps_failed")));
      if (m === "norelay" || m === "offline") {
        var pre = el("pre", null, "node server/relay.mjs");
        warn.appendChild(pre);
      }
      list.innerHTML = "";
      list.appendChild(warn);
    } finally {
      btnSearch.disabled = false;
    }
  }

  function apply() {
    var d = applyDims(it, dimsOf(chosen));
    var named = query();
    pushHistory();
    it.w = d.w;
    it.d = d.d;
    it.h = d.h;
    // Hand-entered sizes with no product named are just a resize — recording a
    // "linked product" for them would put an empty link row on the item.
    if (chosen.how === "manual" && !named) delete it.spec;
    else
      it.spec = {
        brand: brand.value.trim(),
        model: model.value.trim(),
        query: named,
        title: chosen.title || named,
        url: chosen.url || "",
        host: chosen.host || hostOf(chosen.url || ""),
        manual: chosen.how === "manual" || undefined,
        w: d.w, d: d.d, h: d.h,
        at: Date.now(),
      };
    clearVSpanCache(); // the piece now reaches a different height
    S.dirty3D = true;
    render2D();
    fillProps();
    updateCost();
    flash(t("ps_applied", { dims: fmtDims(d) }), "success");
  }
}
