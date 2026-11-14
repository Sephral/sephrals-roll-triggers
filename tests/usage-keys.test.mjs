import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const scriptsDir = new URL("../scripts/", import.meta.url);
const sources = readdirSync(scriptsDir)
  .filter((name) => /\.m?js$/.test(name) && name !== "usage.mjs" && name !== "hub.mjs")
  .map((name) => [name, readFileSync(new URL(name, scriptsDir), "utf8")]);

const registered = [...readFileSync(new URL("srt.js", scriptsDir), "utf8").match(/features: \[([^\]]*)\]/)[1].matchAll(/"(\w+)"/g)].map((match) => match[1]);
const counted = new Map();
for (const [name, source] of sources) {
  for (const [, key] of source.matchAll(/countFeature\(MODULE_ID, "(\w+)"\)/g)) counted.set(key, [...(counted.get(key) ?? []), name]);
}

test("every counted feature is registered with the usage library, and every registered one is counted", () => {
  assert.deepEqual([...counted.keys()].sort(), [...registered].sort());
});

test("the new features are counted where they happen", () => {
  assert.deepEqual(counted.get("galleryOpen"), ["gallery-window.js"]);
  assert.deepEqual(counted.get("galleryAdd"), ["gallery-window.js"]);
  assert.deepEqual(counted.get("combatTriggerFired"), ["combat-service.js"]);
  assert.deepEqual([...new Set(counted.get("combatTriggerCreate"))].sort(), ["gallery-window.js", "trigger-manager.js"]);
});

test("the module manual lists what the report holds", () => {
  const manual = readFileSync(new URL("../MANUAL.md", import.meta.url), "utf8");
  assert.match(manual, /gallery of ready rules is opened/i);
  assert.match(manual, /combat triggers/i);
});
