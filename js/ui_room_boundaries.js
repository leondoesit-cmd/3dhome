import { S } from './state.js';
import { t } from './i18n.js';
import { fmtLen } from './display_units.js';
import { wallClearLength } from './geometry.js';

// Irregular rooms still have precisely editable walls and corners. Keep these
// targets reachable without selecting tiny handles on a phone canvas.
export function fillRoomBoundaries(room, select) {
  let host = document.getElementById('roomBoundaryEditor');
  if (!host) {
    host = document.createElement('details');
    host.id = 'roomBoundaryEditor';
    document.getElementById('r_l_shape_hint').after(host);
  }
  const open = host.open;
  host.replaceChildren();
  const title = document.createElement('summary');
  title.textContent = t('workflow_boundary_edit');
  host.append(title);
  const ids = new Set(room.key.split(','));
  S.walls.filter(w => ids.has(String(w.id))).forEach((wall, index) => {
    const row = document.createElement('div');
    row.className = 'workflow-boundary-row';
    const edit = document.createElement('button');
    edit.textContent = t('wall') + ' ' + (index + 1) + ' · ' + fmtLen(wallClearLength(wall), {domain:'rooms', digits:6});
    edit.onclick = () => select({kind:'wall', ref:wall});
    row.append(edit);
    for (const [label, key] of [['A','a'], ['B','b']]) {
      const point = S.nodes[wall[key]], button = document.createElement('button');
      button.textContent = label;
      button.title = 'X ' + fmtLen(point.x, {digits:6}) + ' · Z ' + fmtLen(point.z, {digits:6});
      button.setAttribute('aria-label', t('workflow_corner_edit') + ' ' + label + ' · ' + button.title);
      button.onclick = () => select({kind:'node', ref:wall[key]});
      row.append(button);
    }
    host.append(row);
  });
  host.open = open;
}
