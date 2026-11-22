import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const de = JSON.parse(readFileSync(new URL("../lang/de.json", import.meta.url), "utf8"));

globalThis.game = {
  i18n: { lang: "en", localize: (key) => en[key] ?? key, format: (key, data) => String(en[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (name in (data ?? {}) ? String(data[name]) : match)), has: (key) => key in en },
  settings: { settings: new Map(), get: () => undefined, set: async () => {} },
  system: { id: "dnd5e", title: "D&D", version: "5.3.3" },
  world: { id: "w", title: "World" },
  user: { isGM: true },
  tables: [], scenes: [], actors: [], items: [], macros: [], journal: []
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.foundry = { utils: { randomID: () => "abc123", escapeHTML: (value) => String(value) } };

const samples = await import("../scripts/sample-windows.js");

test("the made-up rules cover roll and combat rules, every execution mode and disabled rules", () => {
  const triggers = samples.sampleTriggers();
  assert.equal(triggers.length, samples.__test__.RULE_STATES.length);
  assert.ok(triggers.some((trigger) => trigger.kind === "combat"));
  assert.ok(triggers.some((trigger) => trigger.kind !== "combat"));
  assert.ok(triggers.some((trigger) => trigger.enabled === false));
  for (const mode of ["automatic", "confirm-gm", "chat-button", "gm-whisper-log", "disabled"]) {
    assert.ok(triggers.some((trigger) => trigger.executionMode === mode), mode);
  }
  assert.equal(new Set(triggers.map((trigger) => trigger.id)).size, triggers.length);
  assert.ok(triggers.every((trigger) => trigger.id.startsWith("srt-sample-") && trigger.name && !trigger.name.startsWith("SRT.")));
});

test("the manager context has rules and both kinds of profiles", () => {
  const context = samples.sampleManagerContext();
  assert.equal(context.hasTriggers, true);
  assert.equal(context.triggerCount, context.triggers.length);
  assert.ok(context.profiles.some((profile) => profile.source === "imported"));
  assert.ok(context.profiles.some((profile) => profile.source === "internal-preset"));
});

test("the bench run shows a match, a miss, a rule that is off, a stopped rule and an error", () => {
  const run = samples.sampleBenchRun();
  const states = new Set(run.views.map((view) => view.status));
  for (const status of ["match", "miss", "off", "stopped"]) assert.ok(states.has(status), status);
  assert.ok(run.views.some((view) => view.reasons.length));
  assert.ok(run.views.some((view) => view.conditions.some((condition) => condition.error)));
});

test("reaction cards come from the gallery texts with the made-up hero filled in", () => {
  const roll = samples.sampleReactionCards({ combat: false, gm: false });
  const gm = samples.sampleReactionCards({ combat: false, gm: true });
  const combat = samples.sampleReactionCards({ combat: true, gm: false });
  assert.ok(roll.length > 10 && gm.length > 3 && combat.length >= 4);
  assert.ok(gm.every((card) => card.gm));
  assert.ok([...roll, ...gm, ...combat].every((card) => !card.content.includes("{{")));
  assert.ok(roll.some((card) => card.content.includes("Ari")));
});

test("every sample label exists in English and German with the same keys", () => {
  const keys = (lang) => Object.keys(lang).filter((key) => key.startsWith("SRT.Sample.")).sort();
  assert.deepEqual(keys(en), keys(de));
  assert.ok(keys(en).length >= 20);
});
