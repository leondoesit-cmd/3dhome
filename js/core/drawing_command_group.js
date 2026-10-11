export function drawingCommandGroup(command) {
  if (command.startsWith('sheet')) return 'drawGroupGeometry';
  if (['select','dim','angle','diam','baseline','chain'].includes(command)) return 'drawGroupDimensions';
  if (['note','insertimage','insertprojectimage','editimage','removeimage'].includes(command)) return 'drawGroupAnnotations';
  if (['saveformat','applyformat','savetemplate','newtemplate'].includes(command)) return 'drawGroupFormats';
  if (['mdSheetAutoDim','mdSheetModelItems'].includes(command)) return 'drawGroupModelDimensions';
  if (['mdSheetHidden','mdSheetFit'].includes(command)) return 'drawGroupDisplay';
  if (['mdSheetPrint','mdSheetExport'].includes(command)) return 'drawGroupOutput';
  return 'drawGroupViews';
}
