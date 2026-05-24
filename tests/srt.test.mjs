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
const {
  __test__: triggerManagerTest,
  openTriggerManager,
  SRTTriggerManager
} = await import("../scripts/trigger-manager.js");

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

test("scene control fallback marks the toolbar button in v13 and v14", () => {
  for (const generation of [13, 14]) {
    const listeners = [];
    document.button = {
      dataset: {},
      addEventListener(event, callback) {
        listeners.push({ event, callback });
      }
    };

    game.release.generation = generation;
    __test__.installSceneControlClickFallback();
    __test__.installSceneControlClickFallback();

    assert.equal(document.button.dataset.srtClickFallbackInstalled, "true");
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0].event, "click");
  }

  game.release.generation = 14;
});

test("scene control restore returns to the token toolbar", () => {
  ui.controls.control = { name: "rollTriggers" };
  ui.controls.activations.length = 0;

  __test__.scheduleSceneControlRestore();

  assert.deepEqual(ui.controls.activations, [{ control: __test__.DEFAULT_SCENE_CONTROL }]);
});

test("scene control toggle can reopen while a prior close is still pending", async () => {
  const controls = {};
  for (const callback of hooks.on.get("getSceneControlButtons") ?? []) callback(controls);
  ui.controls.controls.rollTriggers = controls.rollTriggers;

  const originalRender = SRTTriggerManager.prototype.render;
  const originalClose = SRTTriggerManager.prototype.close;
  const originalSetPosition = SRTTriggerManager.prototype.setPosition;
  let renderCount = 0;
  let closeCount = 0;
  let releaseClose = null;

  SRTTriggerManager.prototype.setPosition = function(position) {
    this.position = position;
    return this;
  };

  SRTTriggerManager.prototype.render = function(force, options) {
    renderCount += 1;
    return originalRender.call(this, force, options);
  };

  SRTTriggerManager.prototype.close = function(options) {
    closeCount += 1;
    return new Promise((resolve, reject) => {
      releaseClose = async () => {
        try {
          triggerManagerTest.resetManagerApp();
          resolve(options);
        } catch (error) {
          reject(error);
        }
      };
    });
  };

  try {
    await openTriggerManager();
    assert.equal(renderCount, 1);

    ui.controls.control = { name: "rollTriggers" };
    const pendingClose = __test__.toggleTriggerManagerFromSceneControl();
    await __test__.toggleTriggerManagerFromSceneControl();

    assert.equal(closeCount, 1);
    assert.equal(renderCount, 2);

    await releaseClose?.();
    await pendingClose;
  } finally {
    SRTTriggerManager.prototype.render = originalRender;
    SRTTriggerManager.prototype.close = originalClose;
    SRTTriggerManager.prototype.setPosition = originalSetPosition;
    triggerManagerTest.resetManagerApp();
  }
});