import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cleanSpeechText, stopSpeaking, isSpeaking, speak, toggleSpeak, bindSpeakButton } from "../js/speech.js";

const speechCode = await readFile(new URL("../js/speech.js", import.meta.url), "utf8");
const plannerCode = await readFile(new URL("../js/planner_tutorial.js", import.meta.url), "utf8");
const modelerCode = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
const i18nCode = await readI18nSource();

test("speech module provides text normalization and cleaning", () => {
  assert.equal(cleanSpeechText("<kbd>Ctrl/Cmd</kbd> + <b>L</b>"), "Ctrl/Cmd + L");
  assert.equal(cleanSpeechText("<p>First sentence.</p><p>Second sentence.</p>"), "First sentence. Second sentence.");
  assert.equal(cleanSpeechText(["Step 1", "Step 2", "Tip"]), "Step 1. Step 2. Tip");
  assert.equal(cleanSpeechText("קירות → צמתים · פתחים"), "קירות, צמתים, פתחים");
  // the degree unit is spoken in the language being read, not always English
  assert.equal(cleanSpeechText("זווית 90° ואורך 360 ס״מ"), "זווית 90 מעלות ואורך 360 סנטימטר");
  assert.equal(cleanSpeechText("angle 90° and 360", "en-US"), "angle 90 degrees and 360");
  // a period between digits is a decimal point, not a sentence break
  assert.equal(cleanSpeechText("Length 3.05 m", "en-US"), "Length 3.05 m");
  assert.equal(cleanSpeechText("Done.Next", "en-US"), "Done. Next");
});

test("re-binding a speak button replaces the previous handler instead of stacking", () => {
  // The tour card is built once and only its contents change per step, so
  // renderStep() re-binds the SAME button. Stacking handlers made one click
  // start and immediately cancel an utterance, and read the previous step.
  const handlers = [];
  const btn = {
    className: "",
    classList: { toggle() {} },
    title: "",
    querySelector: () => null,
    setAttribute() {},
    addEventListener(type, fn) { handlers.push(fn); },
    removeEventListener(type, fn) {
      const i = handlers.indexOf(fn);
      if (i !== -1) handlers.splice(i, 1);
    },
  };
  bindSpeakButton(btn, () => "step one", "en");
  bindSpeakButton(btn, () => "step two", "en");
  bindSpeakButton(btn, () => "step three", "en");
  assert.equal(handlers.length, 1, "only the newest binding stays attached");
  assert.equal(typeof btn.__speakUnbind, "function");
  btn.__speakUnbind();
  assert.equal(handlers.length, 0, "unbind detaches the click handler");
});

test("speech engine is safe in headless / Node environment without throwing", () => {
  assert.equal(isSpeaking(), false);
  stopSpeaking();
  assert.equal(speak("Hello world", { lang: "en" }), false);
  assert.equal(toggleSpeak("Hello world", { lang: "en" }), false);
  assert.doesNotThrow(() => {
    bindSpeakButton(null, () => "test", "en");
  });
});

test("planner guide incorporates read-aloud buttons in hub, reference modal and live tour", () => {
  assert.match(plannerCode, /import \{ stopSpeaking, bindSpeakButton \} from "\.\/speech\.js"/);
  assert.match(plannerCode, /planner-guide-speak-btn/);
  assert.match(plannerCode, /plannerTourSpeak/);
  assert.match(plannerCode, /planner_guide_speak/);
  assert.match(plannerCode, /planner_tour_speak/);
});

test("modeler incorporates read-aloud buttons in tour hub, mode selection and steps", () => {
  assert.match(modelerCode, /import \{ stopSpeaking, bindSpeakButton \} from "\.\/speech\.js"/);
  assert.match(modelerCode, /id="mdTourSpeak"/);
  assert.match(modelerCode, /speakReadAloud/);
  assert.match(modelerCode, /speakStop/);
});

test("speech translation keys exist in Hebrew and English tables", () => {
  assert.match(i18nCode, /planner_guide_speak:\s*"הקרא מדריך"/);
  assert.match(i18nCode, /planner_guide_speak:\s*"Read guide aloud"/);
  assert.match(i18nCode, /planner_tour_speak:\s*"הקרא שלב"/);
  assert.match(i18nCode, /planner_tour_speak:\s*"Read step aloud"/);
  assert.match(i18nCode, /speak_read_aloud:\s*"הקראה קולית"/);
  assert.match(i18nCode, /speak_read_aloud:\s*"Read aloud"/);
});
