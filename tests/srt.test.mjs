import assert from "node:assert/strict";
import test from "node:test";

const hooks = {
  once: new Map(),
  on: new Map(),
  register(target, hook, callback) {
    const bucket = target.get(hook) ?? [];
    bucket.push(callback);
    target.set(hook, bucket);
  }
};

globalThis.Hooks = {
  once(hook, callback) {
    hooks.register(hooks.once, hook, callback);
  },
  on(hook, callback) {
    hooks.register(hooks.on, hook, callback);
  }
};

globalThis.FormApplication = class FormApplication {
  render() {
    return this;
  }
};

globalThis.game = {
  user: { isGM: true },
  release: { generation: 14 },
  i18n: {
    localize(key) {
      return key;
    }
  },
  settings: {
    settings: new Map(),
    get() {
      return undefined;
    }
  }
};

globalThis.ui = {
  controls: {
    control: { name: "tokens" },
    controls: { tokens: { name: "tokens" } },
    activations: [],
    activate(options) {
      this.activations.push(options);
      this.control = { name: options.control };
    }
  }
};

globalThis.window = {
  setTimeout(callback) {
    callback();
  }
};

globalThis.document = {
  button: null,
  querySelector(selector) {
    return selector === "[data-control='rollTriggers']" ? this.button : null;
  },
  querySelectorAll() {
    return [];
  }
};

const { __test__ } = await import("../scripts/srt.js");

test("registers a GM scene control for toggling the trigger manager", () => {
  const controls = {};
  for (const callback of hooks.on.get("getSceneControlButtons") ?? []) callback(controls);

  assert.equal(controls.rollTriggers.name, __test__.TRIGGER_MANAGER_CONTROL);
  assert.equal(controls.rollTriggers.title, "SRT.Controls.Title");
  assert.equal(controls.rollTriggers.tools.toggle.title, "SRT.Controls.Toggle");
  assert.equal(typeof controls.rollTriggers.tools.toggle.onChange, "function");
});

test("scene control registration is GM-only", () => {
  game.user.isGM = false;
  const controls = {};
  for (const callback of hooks.on.get("getSceneControlButtons") ?? []) callback(controls);

  assert.deepEqual(controls, {});
  game.user.isGM = true;
});

test("scene control fallback marks the v14 toolbar button", () => {
  const listeners = [];
  document.button = {
    dataset: {},
    addEventListener(event, callback) {
      listeners.push({ event, callback });
    }
  };

  __test__.installSceneControlClickFallback();
  __test__.installSceneControlClickFallback();

  assert.equal(document.button.dataset.srtClickFallbackInstalled, "true");
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].event, "click");
});

test("scene control restore returns to the token toolbar", () => {
  ui.controls.control = { name: "rollTriggers" };
  ui.controls.activations.length = 0;

  __test__.scheduleSceneControlRestore();

  assert.deepEqual(ui.controls.activations, [{ control: __test__.DEFAULT_SCENE_CONTROL }]);
});