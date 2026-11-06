/* The planner's runAction: the single dispatch point for every named UI action
   (menus, buttons, shortcuts), lifted out of initUI, split out of
   js/ui/init_ui.js. It shares the editor's state through live imports from
   ../ui.js, and dispatches to the handlers in ./*_actions.js. */
import "../blueprint_trace.js";
import "../commands/index.js";
import "../constraint_engine.js";
import "../core/project_store.js";
import "../demo_house.js";
import "../display_units.js";
import "../export_delivery.js";
import "../floors.js";
import "../geometry.js";
import "../history.js";
import "../i18n.js";
import "../interaction.js";
import "../item_align.js";
import { setRotStep } from "../item_orient.js";
import "../layers.js";
import "../markers.js";
import "../mep.js";
import "../persist.js";
import "../physics_facade.js";
import "../plan_style.js";
import "../plan2d.js";
import "../slab_openings.js";
import "../stack.js";
import { S } from "../state.js";
import "../survey.js";
import "../ui_libpick.js";
import "../ui_mep.js";
import "../ui_params.js";
import "../ui_props.js";
import "../ui_tree.js";
import "../ui_warn.js";
import { flash, syncRotStepUI } from "../ui.js";
import "../view3d.js";
import "../wall_constraints.js";
import "../wall_curves.js";
import "../wall_types.js";
import "./ui_locals.js";
import { RUN_SELECTION_ACTIONS, runSelectionAction } from "./selection_actions.js";
import {
  RUN_NODE_CONSTRAINT_ACTIONS, RUN_WALL_CONSTRAINT_ACTIONS, RUN_WALL_MODIFIER_ACTIONS,
  runNodeConstraintAction, runWallConstraintAction, runWallModifierAction,
} from "./wall_actions.js";
import {
  RUN_FILE_ACTIONS, RUN_HISTORY_ACTIONS, runFileAction, runHistoryAction,
} from "./file_actions.js";
import {
  RUN_HINT_ACTIONS, RUN_MARKER_ACTIONS, RUN_PANEL_ACTIONS, RUN_VIEW_ACTIONS,
  runHintAction, runMarkerAction, runPanelAction, runViewAction,
} from "./view_actions.js";
import { RUN_OPENING_ACTIONS, runOpeningAction } from "./opening_actions.js";

// lifted out of initUI()
async function runAction(act, ev) {
  if (S.workspace && S.workspace.role === "viewer") {
    var readOnlyActions = ["workspace", "frame", "togglePlanStyle", "dollhouse", "drawing3d", "walk", "walkview", "freemove", "photo", "png2d", "png3d", "exportjson", "exportgltf", "exportCost", "tree", "shortcuts", "plannerTutorial", "viewPlan", "view3d", "viewSplit", "openModeler", "friends", "toggleLegacy", "newPlan", "toggleToolNames"];
    if (readOnlyActions.indexOf(act) < 0) {
      flash("Viewer access is read-only", "error");
      return;
    }
  }
  if (RUN_SELECTION_ACTIONS.has(act)) return runSelectionAction(act, ev);
  if (RUN_HISTORY_ACTIONS.has(act)) return runHistoryAction(act, ev);
  if (RUN_WALL_MODIFIER_ACTIONS.has(act)) return runWallModifierAction(act, ev);
  if (RUN_FILE_ACTIONS.has(act)) return runFileAction(act, ev);
  if (RUN_PANEL_ACTIONS.has(act)) return runPanelAction(act, ev);
  if (RUN_VIEW_ACTIONS.has(act)) return runViewAction(act, ev);
  if (RUN_HINT_ACTIONS.has(act)) return runHintAction(act, ev);
  if (RUN_MARKER_ACTIONS.has(act)) return runMarkerAction(act, ev);
  if (RUN_NODE_CONSTRAINT_ACTIONS.has(act)) return runNodeConstraintAction(act, ev);
  if (RUN_OPENING_ACTIONS.has(act)) return runOpeningAction(act, ev);
  if (RUN_WALL_CONSTRAINT_ACTIONS.has(act)) return runWallConstraintAction(act, ev);
  if (act && act.indexOf("rotStep") === 0) {
    // rotStep15 / rotStep45 / rotStep90
    setRotStep(parseInt(act.slice(7), 10));
    syncRotStepUI();
  }
}

export { runAction };
