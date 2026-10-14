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

const { __test__ } = await import("../scripts/trigger-manager.js");

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

  const sections = ["visibility", "template", "sound", "volume", "status"].map((field) => ({ dataset: { srtActionField: field }, hidden: false }));
  __test__.applyActionFieldState({ querySelectorAll: () => sections }, "play-sound");
  assert.deepEqual(sections.map((section) => section.hidden), [false, true, false, false, true]);
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

test("renderExtendedActionFields renders named inputs, picker buttons and escaped values", () => {
  const [action] = __test__.buildEditableActions([{ type: "show-image", image: "a\".webp", caption: "<b>Hi</b>" }]);
  const html = __test__.renderExtendedActionFields(action, 2);

  for (const name of ["triggerSound2", "triggerSoundVolume2", "triggerEffectStatus2", "triggerEffectUuid2", "triggerEffectRounds2", "triggerEffectTarget2", "triggerResourcePath2", "triggerResourceOperation2", "triggerResourceValue2", "triggerImage2", "triggerImageCaption2", "triggerRollFormula2", "triggerRollFlavor2"]) {
    assert.match(html, new RegExp(`name="${name}"`));
  }
  assert.match(html, /data-srt-file-picker="audio" data-srt-file-target="triggerSound2"/);
  assert.match(html, /data-srt-file-picker="imagevideo" data-srt-file-target="triggerImage2"/);
  assert.match(html, /value="a&quot;\.webp"/);
  assert.match(html, /value="&lt;b&gt;Hi&lt;\/b&gt;"/);
  assert.match(html, /<option value="prone" >EFFECT.StatusProne<\/option>/);
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

test("readTriggerDialog reads the new fields and converts the volume to 0..1", () => {
  const result = __test__.readTriggerDialog(createDialogHtml({
    'input[name="triggerName"]': "Fumble",
    'select[name="triggerActionType0"]': "play-sound",
    'select[name="triggerActionVisibility0"]': "gm",
    'input[name="triggerSound0"]': "sounds/fumble.ogg",
    'input[name="triggerSoundVolume0"]': "40",
    'select[name="triggerActionType1"]': "change-resource",
    'input[name="triggerResourcePath1"]': "system.bennies.value",
    'select[name="triggerResourceOperation1"]': "subtract",
    'input[name="triggerResourceValue1"]': "1"
  }));

  assert.equal(result.name, "Fumble");
  assert.deepEqual(__test__.normalizeActionList(result.actions), [
    { type: "play-sound", sound: "sounds/fumble.ogg", volume: 0.4, visibility: "gm" },
    { type: "change-resource", path: "system.bennies.value", operation: "subtract", value: "1" }
  ]);
});

test("readTriggerDialog throws with every problem so the editor stays open", () => {
  assert.throws(() => __test__.readTriggerDialog(createDialogHtml({
    'input[name="triggerName"]': "Broken",
    'select[name="triggerActionType0"]': "roll-formula",
    'select[name="triggerActionType2"]': "show-image"
  })), (error) => error.message === 'SRT.Validation.FormulaMissing:{"slot":1} SRT.Validation.ImageMissing:{"slot":3}');
});

test("promptTriggerData saves new actions through the editor", async () => {
  const originalDialog = globalThis.Dialog;
  let renderedContent = "";
  globalThis.Dialog = {
    async prompt({ content, callback }) {
      renderedContent = content;
      return callback(createDialogHtml({
        'input[name="triggerName"]': "Prone on a fumble",
        'select[name="triggerActionType0"]': "apply-effect",
        'select[name="triggerEffectStatus0"]': "prone",
        'input[name="triggerEffectRounds0"]': "1",
        'select[name="triggerEffectTarget0"]': "actor"
      }));
    }
  };

  try {
    const saved = await __test__.promptTriggerData({
      id: "fumble",
      name: "Fumble",
      filters: { users: ["user-a"] },
      actions: [{ type: "roll-formula", formula: "1d10", flavor: "", visibility: "gm" }]
    });

    assert.match(renderedContent, /name="triggerRollFormula0" value="1d10"/);
    assert.deepEqual(saved.actions, [{ type: "apply-effect", status: "prone", effectUuid: "", rounds: 1, target: "actor" }]);
    // The user filter has no editor field and survives the edit.
    assert.deepEqual(saved.filters.users, ["user-a"]);
  } finally {
    globalThis.Dialog = originalDialog;
  }
});

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

test("file picker buttons open Foundry's FilePicker and write the chosen path back", () => {
  const opened = [];
  globalThis.foundry.applications = {
    apps: {
      FilePicker: {
        implementation: class {
          constructor(options) {
            this.options = options;
            opened.push(this);
          }

          render(options) {
            this.rendered = options;
          }
        }
      }
    }
  };
  globalThis.Event = class {
    constructor(type, options) {
      this.type = type;
      this.options = options;
    }
  };

  const input = {
    value: "sounds/old.ogg",
    events: [],
    dispatchEvent(event) {
      this.events.push(event.type);
    }
  };
  const button = {
    dataset: { srtFilePicker: "audio", srtFileTarget: "triggerSound0" },
    handler: null,
    addEventListener(_event, handler) {
      this.handler = handler;
    }
  };
  const root = {
    querySelectorAll: (selector) => selector === "[data-srt-file-picker]" ? [button] : [],
    querySelector: (selector) => selector === '[name="triggerSound0"]' ? input : null
  };

  __test__.configureFilePickerButtons(root);
  button.handler({ preventDefault() {} });

  assert.equal(opened.length, 1);
  assert.equal(opened[0].options.type, "audio");
  assert.equal(opened[0].options.current, "sounds/old.ogg");
  assert.deepEqual(opened[0].rendered, { force: true });
  opened[0].options.callback("sounds/new.ogg");
  assert.equal(input.value, "sounds/new.ogg");
  assert.deepEqual(input.events, ["change"]);

  delete globalThis.foundry.applications;
});

test("the editor checks the form before the V1 dialog submits and keeps it open on errors", () => {
  const listeners = {};
  const app = { addEventListener(type, handler, capture) { listeners[type] = { handler, capture }; } };
  const content = new HTMLElement();
  content.closest = () => app;
  content.querySelectorAll = () => [];
  const values = {
    'input[name="triggerName"]': "Broken",
    'select[name="triggerActionType0"]': "roll-formula"
  };
  const dialogHtml = { ...createDialogHtml(values), 0: content };
  const notes = [];
  const event = (extra) => ({ stopped: 0, prevented: 0, stopPropagation() { this.stopped += 1; }, preventDefault() { this.prevented += 1; }, ...extra });

  assert.equal(__test__.guardTriggerDialogSubmit(dialogHtml, (message) => notes.push(message)), true);
  assert.equal(listeners.click.capture, true);

  const click = event({ target: { closest: (selector) => selector === ".dialog-button" } });
  listeners.click.handler(click);
  assert.equal(click.stopped, 1);
  assert.deepEqual(notes, ['SRT.Validation.FormulaMissing:{"slot":1}']);

  const enter = event({ key: "Enter", target: { tagName: "INPUT" } });
  listeners.keydown.handler(enter);
  assert.equal(enter.stopped, 1);

  const otherClick = event({ target: { closest: () => null } });
  listeners.click.handler(otherClick);
  assert.equal(otherClick.stopped, 0);

  values['input[name="triggerRollFormula0"]'] = "1d10";
  const valid = event({ target: { closest: (selector) => selector === ".dialog-button" } });
  listeners.click.handler(valid);
  assert.equal(valid.stopped, 0);
  assert.equal(notes.length, 2);
});

test("new triggers start with the default execution mode from the settings", async () => {
  const originalDialog = globalThis.Dialog;
  const originalSettings = game.settings;
  let renderedContent = "";
  game.settings = {
    settings: new Map([["sephrals-roll-triggers.defaultExecutionMode", {}]]),
    get(_module, key) {
      return { defaultExecutionMode: "chat-button", maxActionsPerMessage: 10 }[key] ?? false;
    }
  };
  globalThis.Dialog = {
    async prompt({ content }) {
      renderedContent = content;
      return null;
    }
  };
  try {
    assert.equal(__test__.getDefaultExecutionMode(), "chat-button");
    assert.equal(await __test__.promptTriggerData(), null);
    assert.match(renderedContent, /<option value="chat-button" selected>/);
  } finally {
    globalThis.Dialog = originalDialog;
    game.settings = originalSettings;
  }
  assert.equal(__test__.getDefaultExecutionMode(), "confirm-gm");
});
