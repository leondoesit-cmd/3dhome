/* initUI's shared state, lifted out of initUI's closure so that the pieces it
   wires (js/ui/run_action.js, js/ui/keyboard.js, ...) can read and write it.
   Valid because initUI() runs exactly once per page (js/main.js); a second
   call would share this state instead of starting fresh. */
export const uiLocals = {
  currentTexTarget: undefined, toggleToolNames: undefined, showShortcuts: undefined,
  AL_ACTS: undefined, selectAllItems: undefined, shortcutsModal: undefined, macCap: undefined,
};
