import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  i18n: {
    localize(key) {
      return key;
    },
    format(key, data) {
      return `${key}:${JSON.stringify(data)}`;
    },
    lang: "en"
  },
  world: { id: "test-world", title: "Test World" },
  scenes: [],
  actors: [],
  items: [],
  tables: [],
  macros: [],
  journal: []
};

globalThis.foundry = {
  utils: {
    randomID() {
      return "generated-id";
    },
    escapeHTML(value) {
      return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
  }
};

globalThis.CONFIG = {
  statusEffects: [
    { id: "prone", name: "EFFECT.StatusProne" },
    { id: "blinded", name: "EFFECT.StatusBlind" }
  ]
};

globalThis.Roll = {
  validate(formula) {
    return /^\d*d\d+([+-]\d+)?$/.test(formula);
  }
};

globalThis.FormApplication = class {};
globalThis.HTMLElement = class HTMLElement {};

const __test__ = await import("../scripts/trigger-data.js");

test("normalizeAction keeps the fields of the new action types", () => {
  assert.deepEqual(
    __test__.normalizeAction({ type: "play-sound", sound: " sounds/crit.ogg ", volume: 0.5, visibility: "gm" }),
    { type: "play-sound", sound: "sounds/crit.ogg", volume: 0.5, visibility: "gm" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "apply-effect", status: "prone", rounds: "2", target: "targets" }),
    { type: "apply-effect", status: "prone", effectUuid: "", rounds: 2, target: "targets" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "apply-effect", effectUuid: "Item.i.ActiveEffect.e", target: "somewhere" }),
    { type: "apply-effect", status: "", effectUuid: "Item.i.ActiveEffect.e", rounds: null, target: "actor" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "change-resource", path: "system.bennies.value", operation: "subtract", value: " 1 " }),
    { type: "change-resource", path: "system.bennies.value", operation: "subtract", value: "1" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "show-image", image: "a.webp", caption: " Hi " }),
    { type: "show-image", image: "a.webp", caption: "Hi", visibility: "public" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "roll-formula", formula: "1d10", flavor: "Fumble", visibility: "player" }),
    { type: "roll-formula", formula: "1d10", flavor: "Fumble", visibility: "player" }
  );
});

test("normalizeAction drops incomplete or unsafe new actions", () => {
  assert.equal(__test__.normalizeAction({ type: "play-sound", sound: "" }), null);
  assert.equal(__test__.normalizeAction({ type: "apply-effect" }), null);
  assert.equal(__test__.normalizeAction({ type: "change-resource", path: "name", value: "1" }), null);
  assert.equal(__test__.normalizeAction({ type: "change-resource", path: "system.x", value: "" }), null);
  assert.equal(__test__.normalizeAction({ type: "show-image", image: " " }), null);
  assert.equal(__test__.normalizeAction({ type: "roll-formula", formula: "" }), null);
  assert.equal(__test__.normalizeAction({ type: "change-resource", path: "system.x", value: "2", operation: "multiply" }).operation, "add");
});

test("validateEditorAction reports problems of the new action types per slot", () => {
  const errors = (action, index = 0) => __test__.validateEditorAction(action, index);

  assert.deepEqual(errors({ type: "play-sound", sound: "", volumePercent: "150" }, 1), [
    'SRT.Validation.SoundMissing:{"slot":2}',
    'SRT.Validation.VolumeRange:{"slot":2}'
  ]);
  assert.deepEqual(errors({ type: "play-sound", sound: "a.ogg", volumePercent: "" }), []);
  assert.deepEqual(errors({ type: "apply-effect" }), ['SRT.Validation.EffectMissing:{"slot":1}']);
  assert.deepEqual(errors({ type: "apply-effect", status: "flying" }), ['SRT.Validation.StatusUnknown:{"slot":1}']);
  assert.deepEqual(errors({ type: "apply-effect", status: "prone", rounds: "0" }), ['SRT.Validation.RoundsInvalid:{"slot":1}']);
  assert.deepEqual(errors({ type: "apply-effect", effectUuid: "Item.i.ActiveEffect.e", rounds: "3" }), []);
  assert.deepEqual(errors({ type: "change-resource", path: "flags.x", value: "" }), [
    'SRT.Validation.ResourcePath:{"slot":1}',
    'SRT.Validation.ResourceValueMissing:{"slot":1}'
  ]);
  assert.deepEqual(errors({ type: "change-resource", path: "system.x", value: "lots" }), ['SRT.Validation.ResourceValueInvalid:{"slot":1}']);
  assert.deepEqual(errors({ type: "change-resource", path: "system.x", value: "{{roll.total}}" }), []);
  assert.deepEqual(errors({ type: "show-image", image: "" }), ['SRT.Validation.ImageMissing:{"slot":1}']);
  assert.deepEqual(errors({ type: "roll-formula", formula: "" }), ['SRT.Validation.FormulaMissing:{"slot":1}']);
  assert.deepEqual(errors({ type: "roll-formula", formula: "banana" }), ['SRT.Validation.FormulaInvalid:{"slot":1}']);
  assert.deepEqual(errors({ type: "roll-formula", formula: "1d{{roll.total}}" }), []);

  // Older action types and empty slots keep their behavior: no validation errors.
  assert.deepEqual(errors({ type: "chat-message", template: "" }), []);
  assert.deepEqual(errors({ type: "" }), []);
  assert.deepEqual(__test__.validateEditorActions([{ type: "none" }, { type: "show-image" }]), ['SRT.Validation.ImageMissing:{"slot":2}']);
});

test("action field state shows only the fields of each new action type", () => {
  const visible = (type) => Object.entries(__test__.getActionFieldState(type)).filter(([, shown]) => shown).map(([field]) => field).sort();

  assert.deepEqual(visible("play-sound"), ["sound", "visibility", "volume"]);
  assert.deepEqual(visible("apply-effect"), ["effectTarget", "effectUuid", "rounds", "status"]);
  assert.deepEqual(visible("change-resource"), ["resourceOperation", "resourcePath", "resourceValue"]);
  assert.deepEqual(visible("show-image"), ["caption", "image", "visibility"]);
  assert.deepEqual(visible("roll-formula"), ["flavor", "formula", "visibility"]);
});

test("status choices list the system statuses and keep an unknown saved status", () => {
  const choices = __test__.getStatusEffectChoices("custom-status");
  assert.deepEqual(Object.keys(choices), ["", "blinded", "prone", "custom-status"]);
  assert.equal(choices[""], "SRT.Dialog.StatusNone");
  assert.equal(choices.prone, "EFFECT.StatusProne");
});

test("buildEditableActions fills the new fields and shows the volume in percent", () => {
  const [sound, effect, empty] = __test__.buildEditableActions([
    { type: "play-sound", sound: "a.ogg", volume: 0.35, visibility: "gm" },
    { type: "apply-effect", status: "prone", rounds: 2, target: "targets" }
  ]);

  assert.equal(sound.volumePercent, 35);
  assert.equal(sound.sound, "a.ogg");
  assert.equal(effect.status, "prone");
  assert.equal(effect.rounds, 2);
  assert.equal(effect.target, "targets");
  assert.equal(empty.volumePercent, 80);
  assert.equal(empty.operation, "add");
  assert.equal(empty.target, "actor");
});

function createDialogHtml(values) {
  return {
    find(selector) {
      return {
        val: () => values[selector] ?? "",
        prop: () => false
      };
    }
  };
}

test("the trigger card summary describes the new actions", () => {
  const presented = __test__.presentTrigger(__test__.normalizeTrigger({
    id: "combo",
    name: "Combo",
    actions: [
      { type: "play-sound", sound: "a.ogg", visibility: "public" },
      { type: "change-resource", path: "system.attributes.inspiration", operation: "add", value: "1" }
    ]
  }));

  assert.equal(presented.actionLabel, "SRT.Action.PlaySound (SRT.Visibility.Public) + SRT.Action.ChangeResource: system.attributes.inspiration +1");
});

