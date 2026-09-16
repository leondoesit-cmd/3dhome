/* Paged mobile menus -------------------------------------------------------
   Long editor panels should read like a small set of cards, not like a web
   page trapped inside another web page. This helper keeps the original form
   nodes (and therefore every listener/value) but groups them into discrete
   pages. Only one page exists in the layout at a time; arrows, dots, keyboard
   navigation and a short horizontal swipe move between pages. */

var mounted = new WeakMap();

function visibleHeight(node) {
  var cs = getComputedStyle(node);
  if (cs.display === "none" || cs.visibility === "hidden") return 0;
  var r = node.getBoundingClientRect();
  return Math.ceil(r.height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0));
}

function isSectionStart(node) {
  return node.matches(
    ".m-sheet-sec, .cbm-sec, .con-block, .sub-panel, .md-command-group, " +
    ".md-inspector-section, .cb-control-group, .cb-grp",
  );
}

function language() {
  return document.documentElement.lang === "he" ? "he" : "en";
}

function cleanLabel(text) {
  return String(text || "").replace(/\s+/g, " ").trim().replace(/[:·–—-]+$/, "");
}

/* A page dot says only that content exists somewhere else. Derive a short
   section name from the real controls already on each page so navigation is
   meaningful without maintaining a second inspector taxonomy. */
function pageLabel(group, index) {
  var selectors = [
    "[data-mobile-page-title]", "h2", "h3", "h4", "h5", "h6", "legend",
    ".m-sheet-sec", ".con-head", ".sub-panel-title", ".wi-section-title", "label",
  ];
  for (var s = 0; s < selectors.length; s++) {
    for (var i = 0; i < group.length; i++) {
      var node = group[i];
      var found = node.matches && node.matches(selectors[s]) ? node : node.querySelector && node.querySelector(selectors[s]);
      if (!found || !visibleHeight(node) || !visibleHeight(found)) continue;
      var explicit = found.getAttribute && found.getAttribute("data-mobile-page-title");
      var label = cleanLabel(explicit || found.textContent);
      if (label) return label.slice(0, 28);
    }
  }
  for (var j = 0; j < group.length; j++) {
    var control = group[j].matches && group[j].matches("button,[aria-label]")
      ? group[j]
      : group[j].querySelector && group[j].querySelector("button,[aria-label]");
    var fallback = cleanLabel(control && (control.getAttribute("aria-label") || control.textContent));
    if (fallback) return fallback.slice(0, 28);
  }
  return (language() === "he" ? "חלק " : "Section ") + (index + 1);
}

export function releasePagedMenu(host) {
  var state = host && mounted.get(host);
  if (!state) return;
  var parent = state.anchor.parentNode;
  if (parent) {
    state.nodes.forEach(function (row) { parent.insertBefore(row, state.anchor); });
    state.shell.remove();
    state.anchor.remove();
  }
  host.classList.remove("mobile-paged-menu");
  mounted.delete(host);
}

export function mountPagedMenu(host, options) {
  if (!host) return null;
  options = options || {};
  releasePagedMenu(host);
  host.classList.add("mobile-paged-menu");

  var all = Array.from(host.children).filter(function (node) {
    return !node.matches("script, style, .mobile-page-shell");
  });
  var pinned = options.pinSelector
    ? all.filter(function (node) { return node.matches(options.pinSelector); })
    : [];
  var nodes = all.filter(function (node) { return pinned.indexOf(node) < 0; });
  if (!nodes.length) {
    host.classList.remove("mobile-paged-menu");
    return null;
  }

  var shell = document.createElement("div");
  shell.className = "mobile-page-shell";
  var deck = document.createElement("div");
  deck.className = "mobile-page-deck";
  var nav = document.createElement("nav");
  nav.className = "mobile-page-nav";
  nav.setAttribute("aria-label", language() === "he" ? "ניווט בין דפים" : "Page navigation");
  var prev = document.createElement("button");
  var next = document.createElement("button");
  prev.type = next.type = "button";
  prev.className = "mobile-page-arrow";
  next.className = "mobile-page-arrow";
  prev.innerHTML = '<i class="ph ph-caret-left"></i>';
  next.innerHTML = '<i class="ph ph-caret-right"></i>';
  prev.setAttribute("aria-label", language() === "he" ? "העמוד הקודם" : "Previous page");
  next.setAttribute("aria-label", language() === "he" ? "העמוד הבא" : "Next page");
  var namedTabs = !!options.namedTabs;
  var tabs = document.createElement("span");
  tabs.className = namedTabs ? "mobile-page-tabs" : "mobile-page-dots";
  var count = document.createElement("span");
  count.className = "mobile-page-count";
  count.setAttribute("aria-live", "polite");
  nav.append(prev, tabs, count, next);
  shell.append(deck, nav);

  var anchor = document.createComment("mobile-pages");
  host.appendChild(anchor);
  host.insertBefore(shell, anchor);

  var available = Number(options.pageHeight) || Math.max(210, host.clientHeight - 104);
  var totalHeight = nodes.reduce(function (sum, node) { return sum + visibleHeight(node); }, 0);
  var needsPages = totalHeight > available;
  var groups = [], current = [], used = 0;
  nodes.forEach(function (node, index) {
    var h = visibleHeight(node);
    var force = needsPages && index > 0 && isSectionStart(node) && current.length && used > available * 0.38;
    if (current.length && (force || (h && used + h > available))) {
      groups.push(current);
      current = [];
      used = 0;
    }
    current.push(node);
    used += h || 1;
  });
  if (current.length) groups.push(current);

  /* A compact menu with only a few tiny rows should remain one card. The pager
     appears only when it removes scrolling rather than adding navigation.
     This was documented but never enforced: a single-page pager still wrapped
     the content in the shell, and the shell's own overflow:hidden then laid a
     late-arriving panel (the Extrude feature form) out at zero height. Nodes
     have not moved into pages yet here, so backing out is just a teardown. */
  if (groups.length < 2) {
    host.removeChild(shell);
    host.removeChild(anchor);
    host.classList.remove("mobile-paged-menu");
    return null;
  }

  var labels = groups.map(pageLabel);
  groups.forEach(function (group, pageIndex) {
    var page = document.createElement("section");
    page.className = "mobile-menu-page" + (pageIndex === 0 ? " on" : "");
    page.setAttribute("role", "tabpanel");
    page.setAttribute("aria-label", labels[pageIndex]);
    group.forEach(function (node) { page.appendChild(node); });
    deck.appendChild(page);
  });

  var pages = Array.from(deck.children), active = 0;
  function show(index) {
    active = Math.max(0, Math.min(pages.length - 1, index));
    pages.forEach(function (page, i) { page.classList.toggle("on", i === active); });
    Array.from(tabs.children).forEach(function (tab, i) {
      tab.classList.toggle("on", i === active);
      tab.setAttribute("aria-current", i === active ? "page" : "false");
      if (i === active && namedTabs) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    prev.disabled = active === 0;
    next.disabled = active === pages.length - 1;
    count.textContent = (active + 1) + " / " + pages.length;
  }
  pages.forEach(function (_, i) {
    var tab = document.createElement("button");
    tab.type = "button";
    tab.className = namedTabs ? "mobile-page-tab" : "mobile-page-dot";
    if (namedTabs) tab.textContent = labels[i];
    tab.setAttribute("aria-label", namedTabs
      ? labels[i]
      : (language() === "he" ? "עבור לעמוד " : "Go to page ") + (i + 1));
    tab.addEventListener("click", function () { show(i); });
    tabs.appendChild(tab);
  });
  prev.addEventListener("click", function () { show(active - 1); });
  next.addEventListener("click", function () { show(active + 1); });
  nav.hidden = pages.length < 2;

  var x0 = null;
  deck.addEventListener("touchstart", function (e) {
    x0 = e.touches.length === 1 ? e.touches[0].clientX : null;
  }, { passive: true });
  deck.addEventListener("touchend", function (e) {
    if (x0 == null || !e.changedTouches.length) return;
    var dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 42) return;
    show(active + (dx < 0 ? 1 : -1));
  }, { passive: true });

  var state = { host: host, shell: shell, anchor: anchor, nodes: nodes, show: show };
  mounted.set(host, state);
  show(0);
  return state;
}
