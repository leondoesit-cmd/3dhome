// Keep the command's accessible name equal to its visible action. Dirty state
// belongs to the existing described status and tooltip, not the command name.
export function syncSaveButtonAccessibility(button,{label,dirty,dirtyText,shortcut='Ctrl+S'}) {
  button.dataset.tip=dirty ? dirtyText+' · '+shortcut : shortcut;
  button.setAttribute('aria-label',label);
  button.removeAttribute('title');
}
