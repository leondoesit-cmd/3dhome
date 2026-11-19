import { stylesSource } from "./helpers/styles_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TOOL_SEARCH_ENTRIES, searchToolEntries } from "../js/tool_search.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = stylesSource();

test("top toolbar exposes an accessible tool search combobox", () => {
  assert.match(html, /id="toolSearch"/);
  assert.match(html, /id="toolSearchInput"[\s\S]*role="combobox"/);
  assert.match(html, /aria-controls="toolSearchResults"/);
  assert.match(css, /\.tool-search-panel/);
});

test("task language finds the intended guided tool", () => {
  assert.equal(searchToolEntries(TOOL_SEARCH_ENTRIES, "draw a room", 3)[0].id, "room");
  assert.equal(searchToolEntries(TOOL_SEARCH_ENTRIES, "add furniture", 3)[0].id, "furniture");
  assert.equal(searchToolEntries(TOOL_SEARCH_ENTRIES, "scan with lidar", 3)[0].id, "scan");
  assert.equal(searchToolEntries(TOOL_SEARCH_ENTRIES, "צייר חדר", 3)[0].id, "room");
});

test("guided entries explain both location and usage", () => {
  for (const entry of TOOL_SEARCH_ENTRIES) {
    assert.ok(entry.location, `${entry.id} is missing a location`);
    assert.ok(entry.help?.en && entry.help?.he, `${entry.id} is missing bilingual guidance`);
    assert.ok(entry.tool || entry.action || entry.reveal, `${entry.id} is not actionable`);
  }
});
