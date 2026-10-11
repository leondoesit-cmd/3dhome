import {drawingCommandGroup} from './drawing_command_group.js';
export function drawingRailPlan(commands, group = 'drawGroupDimensions', page = 0, pageSize = 6) {
  const groups = [...new Set(commands.filter(c => c !== 'select').map(drawingCommandGroup))];
  const selected = groups.includes(group) ? group : groups[0];
  const items = commands.filter(c => c !== 'select' && drawingCommandGroup(c) === selected);
  const size = Math.max(1,Math.min(6,Math.floor(pageSize)));
  const pages = Math.max(1,Math.ceil(items.length/size));
  const at = ((page % pages)+pages)%pages;
  return {groups,group:selected,page:at,pages,visible:['select',...items.slice(at*size,(at+1)*size)]};
}
