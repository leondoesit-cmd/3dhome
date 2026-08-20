import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tutorial = await readFile(new URL("../js/planner_tutorial.js", import.meta.url), "utf8");
const videoStudioCode = await readFile(new URL("../js/video_studio.js", import.meta.url), "utf8");
const videoPresetsCode = await readFile(new URL("../js/video_presets.js", import.meta.url), "utf8");
const view3dCode = await readFile(new URL("../js/view3d.js", import.meta.url), "utf8");
const i18n = await readFile(new URL("../js/i18n.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("VideoStudio class and export methods are defined in js/video_studio.js", () => {
  assert.match(videoStudioCode, /export class VideoStudio/);
  assert.match(videoStudioCode, /getFrameDuration\(\)/);
  assert.match(videoStudioCode, /getTotalDurationMs\(\)/);
  assert.match(videoStudioCode, /addFrame\(/);
  assert.match(videoStudioCode, /removeFrame\(/);
  assert.match(videoStudioCode, /moveFrame\(/);
  assert.match(videoStudioCode, /duplicateFrame\(/);
  assert.match(videoStudioCode, /reverse\(\)/);
  assert.match(videoStudioCode, /clear\(\)/);
  assert.match(videoStudioCode, /play\(\)/);
  assert.match(videoStudioCode, /pause\(\)/);
  assert.match(videoStudioCode, /togglePlay\(\)/);
  assert.match(videoStudioCode, /goToFrame\(/);
  assert.match(videoStudioCode, /nextFrame\(/);
  assert.match(videoStudioCode, /prevFrame\(/);
  assert.match(videoStudioCode, /renderCurrent\(/);
  assert.match(videoStudioCode, /applyTransition\(/);
  assert.match(videoStudioCode, /drawHud\(/);
  assert.match(videoStudioCode, /exportVideo\(/);
});

test("VideoStudio presets and ready-made reels gallery are exported", () => {
  assert.match(videoStudioCode, /export async function captureOrbitTurntable/);
  assert.match(videoStudioCode, /export async function captureMultiViewAngles/);
  assert.match(videoStudioCode, /export async function captureCurrentSnapshot/);
  assert.match(videoStudioCode, /export function openVideoStudio/);
  assert.match(videoStudioCode, /video-studio-reels-bar/);
  assert.match(videoStudioCode, /getReadyMadeReels/);
  assert.match(videoStudioCode, /window\.__openVideoStudio = openVideoStudio/);
});

test("video_presets exports getTopicVideoFrames and getReadyMadeReels with bilingual support", () => {
  assert.match(videoPresetsCode, /export function getTopicVideoFrames/);
  assert.match(videoPresetsCode, /export function getReadyMadeReels/);
  assert.match(videoPresetsCode, /drawTopBar/);
  assert.match(videoPresetsCode, /drawLeftSidebar/);
  assert.match(videoPresetsCode, /drawCADCanvas/);
  assert.match(videoPresetsCode, /drawRightInspector/);
  assert.match(videoPresetsCode, /drawPlanToolbar/);
  assert.match(videoPresetsCode, /drawMouseCursor/);
  assert.match(videoPresetsCode, /createUIFrame/);
  assert.match(videoPresetsCode, /onLangChange/);
});

test("the planner guide embeds a fast video player with diagram toggle for each topic", () => {
  assert.match(tutorial, /getTopicVideoFrames/);
  assert.match(tutorial, /setupTopicVisual/);
  assert.match(tutorial, /planner-guide-mode-switch/);
  assert.match(tutorial, /planner-guide-video-canvas/);
  assert.match(tutorial, /planner-guide-video-ctrls/);
  assert.match(tutorial, /planner-guide-open-studio-btn/);
  assert.match(tutorial, /is-active-step/);
});

test("view3d exports camera orbit getters and setters for multi-angle video captures", () => {
  assert.match(view3dCode, /export function setOrbitCamera\(/);
  assert.match(view3dCode, /export function getOrbitCamera\(\)/);
});

test("the planner guide includes the quick_videos topic and video practice track", () => {
  assert.match(tutorial, /id:\s*"quick_videos"/);
  assert.match(tutorial, /planner_guide_quick_videos/);
  assert.match(tutorial, /planner_guide_launch_video_studio/);
  assert.match(tutorial, /diagram\(kind\)/);
  assert.match(tutorial, /quick_videos:/);
  assert.match(tutorial, /openVideoStudio/);
  assert.match(tutorial, /data-hub="video"/);
});

test("index.html and CSS include Video Studio launcher, embedded video player and styles", () => {
  assert.match(html, /id="videoStudioBtn"/);
  assert.match(html, /data-i18n-title="video_studio_title"/);
  assert.match(css, /\.video-studio-modal/);
  assert.match(css, /\.video-studio-canvas/);
  assert.match(css, /\.video-studio-timeline/);
  assert.match(css, /\.video-studio-presets/);
  assert.match(css, /\.video-studio-frame-card/);
  assert.match(css, /\.video-studio-ctrl-bar/);
  assert.match(css, /\.planner-guide-video-canvas/);
  assert.match(css, /\.planner-guide-mode-switch/);
  assert.match(css, /\.planner-guide-video-ctrls/);
});

test("Hebrew and English dictionaries contain all Video Studio and reel keys", () => {
  const he = i18n.slice(i18n.indexOf("  he: {"), i18n.indexOf("  en: {"));
  const en = i18n.slice(i18n.indexOf("  en: {"));

  const requiredKeys = [
    "planner_hub_video",
    "planner_hub_video_desc",
    "planner_guide_quick_videos",
    "planner_guide_quick_videos_body",
    "planner_video_1",
    "planner_video_2",
    "planner_video_3",
    "planner_video_4",
    "planner_video_tip",
    "planner_video_dont",
    "planner_guide_launch_video_studio",
    "planner_guide_view_video",
    "planner_guide_view_diagram",
    "planner_guide_open_studio",
    "video_reel_orbit_title",
    "video_reel_orbit_desc",
    "video_reel_walls_title",
    "video_reel_walls_desc",
    "video_reel_types_title",
    "video_reel_types_desc",
    "video_reel_openings_title",
    "video_reel_openings_desc",
    "planner_tour_video_track",
    "planner_tour_video_track_desc",
    "planner_tour_vid_intro_t",
    "planner_tour_vid_intro_b",
    "planner_tour_vid_intro_tip",
    "planner_tour_vid_capture_t",
    "planner_tour_vid_capture_b",
    "planner_tour_vid_capture_tip",
    "planner_tour_vid_trans_t",
    "planner_tour_vid_trans_b",
    "planner_tour_vid_trans_tip",
    "planner_tour_vid_done_b",
    "video_studio_title",
    "video_studio_desc",
    "video_studio_capture_orbit",
    "video_studio_capture_orbit_dense",
    "video_studio_capture_multiview",
    "video_studio_capture_timelapse",
    "video_studio_capture_snapshot",
    "video_studio_upload_media",
    "video_studio_play",
    "video_studio_pause",
    "video_studio_prev_frame",
    "video_studio_next_frame",
    "video_studio_loop",
    "video_studio_pingpong",
    "video_studio_fps",
    "video_studio_frame_delay",
    "video_studio_transition",
    "video_studio_trans_cut",
    "video_studio_trans_crossfade",
    "video_studio_trans_wipe_left",
    "video_studio_trans_wipe_right",
    "video_studio_trans_zoom",
    "video_studio_trans_flash",
    "video_studio_hud_overlay",
    "video_studio_export_video",
    "video_studio_export_frames",
    "video_studio_recording",
    "video_studio_capturing",
    "video_studio_no_frames",
    "video_studio_frame_count",
    "video_studio_clear_all",
    "video_studio_reverse",
    "video_studio_speed",
  ];

  requiredKeys.forEach((key) => {
    assert.match(he, new RegExp(`\\b${key}:`), `Missing Hebrew key: ${key}`);
    assert.match(en, new RegExp(`\\b${key}:`), `Missing English key: ${key}`);
  });
});
