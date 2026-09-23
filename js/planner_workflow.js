// Always-visible mouse controls for the manual drafting workflow.
import { S } from './state.js';
import { t, onLangChange } from './i18n.js';
import { setTool, disarmRoomStamp } from './interaction.js';
import { fitView, render2D, onAfterRender } from './plan2d.js';
import { unitLabel, fmtLen, parseLen } from './display_units.js';
import { openingDrawDefaults, setOpeningDrawDefault } from './opening_draw_defaults.js';
import { ROOM_PRESETS } from './room_presets.js';

export function initPlannerWorkflow() {
  const workspace = document.getElementById('workspace');
  if (!workspace || document.getElementById('planner-workflow')) return;
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
    window.__setViewMode?.('plan');
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
    document.body.classList.toggle('workflow-hide-layers'); update();
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
  function label(id, value) {
    const c = controls[id];
    if (c.label.textContent !== value) c.label.textContent = value;
  }
  function update() {
    bar.setAttribute('aria-label', t('workflow_title'));
    label('workflowUnits', t('workflow_units') + ': ' + unitLabel('plan'));
    controls.workflowUnits.b.title = ['rooms', 'openings', 'furniture'].map(d => t('workflow_' + d) + ': ' + unitLabel(d)).join(' · ');
    label('workflowFit', t('workflow_fit'));
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
