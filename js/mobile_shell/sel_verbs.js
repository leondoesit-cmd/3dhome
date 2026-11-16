/* the verbs each selection kind answers to on the phone's contextual row
   (#m-ctx), split out of js/mobile_shell.js. It shares the editor's state
   through live imports from ../mobile_shell.js. */
import { t } from "../i18n.js";
import { S } from "../state.js";
import { run, selKind, showSheet } from "../mobile_shell.js";
import { fitText } from "../fit_cabinet_strings.js";
import { onWallByType } from "../item_orient.js";
import { wallPlaneText } from "../wall_plane_strings.js";

/* "On wall" (the planner action itemOnWall), as the 3D selection strip
   offers it (js/build3d_selection.js): same words and icon, pressed while
   the piece hangs, pressed and disabled for a type that always hangs. Not
   for a locked piece (the action leaves it alone). */
function onWallVerb(it) {
  if (!it || it.locked) return null;
  var fixed = !(it.hold && it.hold.onWall) && onWallByType(it.type);
  return {
    icon: "ph-frame-corners",
    label: fitText("onWall"),
    title: fixed ? wallPlaneText("alwaysOnWall") : fitText("onWallTip"),
    pressed: !!(it.hold && it.hold.onWall) || fixed,
    on: !!(it.hold && it.hold.onWall) || fixed,
    disabled: fixed,
    run: function () { run("itemOnWall"); },
  };
}

function selActionList() {
  var kind = selKind();
  var propsBtn = { icon: "ph-sliders-horizontal", label: t("m_a_props"), run: function () { showSheet("props"); } };
  var delBtn = { icon: "ph-trash", label: t("m_a_del"), danger: true, run: function () { run("deleteSel"); } };
  var dupBtn = { icon: "ph-copy", label: t("m_a_dup"), run: function () { run("dupSel"); } };
  var finishBtn = { icon: "ph-paint-brush-broad", label: t("m_a_finish"), run: function () { run("openTextureGallery"); } };

  if (kind === "item") {
    /* Orienting a piece is the most repeated edit in a furnished plan and it
       had no control at all outside the inspector's rotation row. */
    return [
      { icon: "ph-arrow-clockwise", label: t("m_a_rot90"), run: function () { run("rotSel90"); } },
      finishBtn,
      onWallVerb(S.sel.ref),
      propsBtn,
      dupBtn,
      delBtn,
    ].filter(Boolean);
  }
  if (kind === "items") {
    return [
      { icon: "ph-arrow-clockwise", label: t("m_a_rot90"), run: function () { run("rotSel90"); } },
      dupBtn,
      propsBtn,
      delBtn,
    ];
  }
  if (kind === "opening") {
    var op = S.sel.ref;
    var hinged = op && op.type === "door" && !op.isSliding && !op.isPocket;
    return hinged
      ? [{ icon: "ph-flip-horizontal", label: t("m_a_swing"), run: function () { run("flipSwing"); } }, propsBtn, delBtn]
      : [propsBtn, delBtn];
  }
  if (kind === "wall") {
    return [
      { icon: "ph-door", label: t("m_a_adddoor"), run: function () { run("addWallDoor"); } },
      finishBtn,
      { icon: "ph-grid-four", label: t("m_a_addwindow"), run: function () { run("addWallWindow"); } },
      propsBtn,
      { icon: "ph-flip-horizontal", label: t("m_a_flipwall"), run: function () { run("reverseWallLayers"); } },
      delBtn,
    ];
  }
  if (kind === "node") {
    return [
      { icon: "ph-angle", label: t("m_a_square"), run: function () { run("ndSquare"); } },
      propsBtn,
      delBtn,
    ];
  }
  if (kind === "marker") {
    return [
      { icon: "ph-armchair", label: t("m_a_place"), run: function () { run("mkPlace"); } },
      propsBtn,
      delBtn,
    ];
  }
  if (kind === "room") {
    /* The floor material is the one room property nobody can name from memory
       and everybody recognises on sight, and it was four taps and an OS wheel
       of 23 words away. Deliberately NOT joined by Auto-arrange: that action
       tidies EVERY room (autoArrangeAll), and a verb on this room's row that
       rearranges the whole plan is the same lie as a Copy button that copies
       nothing. */
    return [
      { icon: "ph-paint-roller", label: t("m_a_floor"), run: function () { run("roomFloor"); } },
      finishBtn,
      propsBtn,
      delBtn,
    ];
  }
  return [propsBtn, delBtn];
}

export { selActionList };
