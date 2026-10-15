// Always-visible mouse controls for the manual drafting workflow.
import { S } from './state.js';
import { t, onLangChange } from './i18n.js';
import { setTool, disarmRoomStamp } from './interaction.js';
import { fitView, render2D, onAfterRender } from './plan2d.js';
import { frameView } from './view3d.js';
import { unitLabel, fmtLen, parseLen } from './display_units.js';
import { openingDrawDefaults, setOpeningDrawDefault } from './opening_draw_defaults.js';
import { ROOM_PRESETS } from './room_presets.js';

export function initPlannerWorkflow() {
  const workspace = document.getElementById('workspace');
  if (!workspace || document.getElementById('planner-workflow')) return;
  const layers2DKey = 'mf_plan_layers_2d';
  const layers3DKey = 'mf_plan_layers_3d';
  /* 2D and 3D have different useful defaults, and a user's choice in one
     viewport must not be overwritten just by visiting the other. */
  if (!document.body.classList.contains('planner-3d-active')) {
    try { document.body.classList.toggle('workflow-hide-layers', localStorage.getItem(layers2DKey) === '1'); } catch (_) {}
  }
  const bar = document.createElement('div');
  bar.id = 'planner-workflow';
  bar.setAttribute('role', 'toolbar');
  const controls = {};
  const nameInput = document.getElementById('r_name');
  const roomLabels = document.createElement('select');
  roomLabels.id = 'workflow-room-label';
  roomLabels.style.cssText = 'width:100%;margin:0 0 12px';
  nameInput?.parentElement.after(roomLabels);
  const labelKeys = [...new Set(ROOM_PRESETS.map(p => p.i18n)), 'workflow_powder', 'workflow_mudroom', 'workflow_kitchen_beverage'];
  function updateRoomLabels() {
    roomLabels.replaceChildren();
    roomLabels.setAttribute('aria-label', t('workflow_room_label'));
    for (const key of ['', ...labelKeys]) {
      const option = document.createElement('option');
      option.value = key; option.textContent = t(key || 'workflow_room_label');
      roomLabels.append(option);
    }
  }
  roomLabels.addEventListener('change', () => {
    if (!roomLabels.value || !nameInput || S.sel?.kind !== 'room') return;
    nameInput.focus();
    nameInput.value = t(roomLabels.value);
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    nameInput.blur();
    roomLabels.value = '';
  });
  updateRoomLabels();
  onLangChange(updateRoomLabels);
  let entryKey = '';
  function button(id, icon, action) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = id;
    const glyph = document.createElement('i'); glyph.className = 'ph ph-' + icon;
    glyph.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    b.append(glyph, label); b.addEventListener('click', action);
    bar.append(b); controls[id] = { b, label };
    return b;
  }
  button('workflowUnits', 'ruler', () => window.dispatchEvent(new CustomEvent('unit-open-settings')));
  button('workflowFit', 'arrows-out', () => {
    // in the 3D view, frame the model there instead of leaving 3D for the plan
    if (document.getElementById('center-canvas')?.classList.contains('max-view-3d')) { frameView(); return; }
    requestAnimationFrame(() => {
      fitView();
      // Leave room for the tool ribbon and dimensions around the footprint.
      const scale = window.matchMedia("(max-width: 600px)").matches ? 0.9 : 0.72;
      S.OX = S.CW / 2 + (S.OX - S.CW / 2) * scale;
      S.OY = S.CH / 2 + (S.OY - S.CH / 2) * scale;
      S.SC *= scale;
      render2D();
    });
  });
  button('workflowLayers', 'stack', () => {
    const hidden = document.body.classList.toggle('workflow-hide-layers');
    try {
      localStorage.setItem(document.body.classList.contains('planner-3d-active') ? layers3DKey : layers2DKey, hidden ? '1' : '0');
    } catch (_) {}
    update();
    window.dispatchEvent(new Event('resize'));
  });
  button('workflowSpace', 'sidebar-simple', () => {
    document.body.classList.toggle('workflow-more-space'); update();
    window.dispatchEvent(new Event('resize'));
  });
  const sizes = document.createElement('div'); sizes.className = 'workflow-opening';
  const fields = {};
  for (const field of ['width', 'height', 'sill']) {
    const row = document.createElement('label'), caption = document.createElement('span');
    const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'decimal';
    input.id = 'workflow-opening-' + field;
    input.addEventListener('input', () => {
      const valid = setOpeningDrawDefault(S.tool, field, parseLen(input.value, 'openings'));
      input.setCustomValidity(valid ? '' : t('workflow_valid_size'));
    });
    input.addEventListener('change', () => input.reportValidity());
    row.append(caption, input); sizes.append(row); fields[field] = { row, caption, input };
  }
  bar.append(sizes);
  const hint = document.createElement('span'); hint.className = 'workflow-hint'; bar.append(hint);
  button('workflowDone', 'check', () => {
    // Placed walls/items are already committed. Discard only the next preview.
    S.placeType = null; S.previewPt = null;
    disarmRoomStamp(); setTool('select');
    window.dispatchEvent(new CustomEvent('planner-place'));
    render2D(); update();
  });
  function label(id, value, title = value) {
    const c = controls[id];
    if (c.label.textContent !== value) c.label.textContent = value;
    // the desktop column shows icons only: the name rides on the tooltip
    if (c.b.title !== title) c.b.title = title;
  }
  function update() {
    bar.setAttribute('aria-label', t('workflow_title'));
    label('workflowUnits', t('workflow_units') + ': ' + unitLabel('plan'),
      ['rooms', 'openings', 'furniture'].map(d => t('workflow_' + d) + ': ' + unitLabel(d)).join(' · '));
    label('workflowFit', t(document.getElementById('center-canvas')?.classList.contains('max-view-3d') ? 'frame' : 'workflow_fit'));
    const layersHidden = document.body.classList.contains('workflow-hide-layers');
    label('workflowLayers', t(layersHidden ? 'workflow_show_layers' : 'workflow_hide_layers'));
    controls.workflowLayers.b.setAttribute('aria-expanded', String(!layersHidden));
    const moreSpace = document.body.classList.contains('workflow-more-space');
    label('workflowSpace', t(moreSpace ? 'workflow_restore' : 'workflow_space'));
    controls.workflowSpace.b.setAttribute('aria-pressed', String(moreSpace));
    const active = !!S.placeType || (S.tool && S.tool !== 'select');
    const values = openingDrawDefaults(S.tool);
    sizes.hidden = !values;
    const nextKey = values ? S.tool + ':' + unitLabel('openings') : '';
    if (values) {
      for (const field of Object.keys(fields)) {
        const f = fields[field];
        f.caption.textContent = t('workflow_' + field) + ' (' + unitLabel('openings') + ')';
        f.row.hidden = field === 'sill' && S.tool !== 'window';
        if (entryKey !== nextKey) {
          f.input.value = fmtLen(values[field], { domain: 'openings', suffix: false, digits: 2 });
          f.input.setCustomValidity('');
        }
      }
    }
    entryKey = nextKey;
    controls.workflowDone.b.disabled = !active;
    label('workflowDone', t('workflow_done'));
    const message = t(active ? 'workflow_drawing_hint' : 'workflow_select_hint');
    if (hint.textContent !== message) hint.textContent = message;
  }
  workspace.before(bar);
  onAfterRender(update);
  onLangChange(update);
  ['planner-tool', 'planner-place', 'planner-units', 'planner-viewport'].forEach(name => window.addEventListener(name, update));
  update();
}
