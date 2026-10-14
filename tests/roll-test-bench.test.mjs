import assert from "node:assert/strict";
import test from "node:test";

class DiceTerm {
  constructor({ number = 1, faces = 6 } = {}) {
    this.number = number;
    this.faces = faces;
    this.results = [];
  }

  // Same contract as Foundry's DiceTerm#roll: ask _roll first, roll randomly when it returns nothing.
  async roll() {
    const result = { result: await this._roll(), active: true };
    if (result.result === undefined) result.result = this.randomFace();
    this.results.push(result);
    return result;
  }

  async _roll() {
    return undefined;
  }

  randomFace() {
    return 1;
  }
}

class FateDie extends DiceTerm {
  static DENOMINATION = "f";
}

globalThis.foundry = { dice: { terms: { DiceTerm } } };
globalThis.game = {
  system: { id: "generic", version: "1.0.0" },
  combat: { started: false },
  user: { id: "gm-1", isGM: true, name: "GM", targets: new Set() },
  users: {
    get(id) {
      return id === "player-1" ? { id, isGM: false, name: "Player" } : id === "gm-1" ? game.user : null;
    }
  },
  settings: {
    get() {
      return "publicroll";
    }
  },
  i18n: {
    localize(key) {
      return key;
    },
    format(key, data) {
      return `${key}:${JSON.stringify(data)}`;
    },
    lang: "en"
  }
};
globalThis.canvas = { scene: { id: "scene-1" } };
globalThis.Roll = class {
  constructor(formula) {
    if (formula === "throw") throw new Error("bad formula");
    this.dice = formula === "2d6+1d20" ? [new DiceTerm({ number: 2, faces: 6 }), new DiceTerm({ number: 1, faces: 20 })] : [];
  }
};

const { __test__ } = await import("../scripts/roll-test-bench.js");
const { GenericRollAdapter } = await import("../scripts/adapters/generic-adapter.js");
const { simulateTriggers } = await import("../scripts/triggers.js");

test("describeFormulaDice lists one slot per die and skips fate and variable dice", () => {
  const dice = [
    new DiceTerm({ number: 2, faces: 6 }),
    new FateDie({ number: 4, faces: 3 }),
    new DiceTerm({ number: Number.NaN, faces: 8 }),
    new DiceTerm({ number: 1, faces: 20 })
  ];

  const { slots, truncated } = __test__.describeFormulaDice(dice);
  assert.deepEqual(slots.map((slot) => [slot.key, slot.faces]), [["0:0", 6], ["0:1", 6], ["3:0", 20]]);
  assert.equal(truncated, false);

  const limited = __test__.describeFormulaDice([new DiceTerm({ number: 30, faces: 6 })]);
  assert.equal(limited.slots.length, __test__.MAX_FIXED_DICE);
  assert.equal(limited.truncated, true);
});

test("parseFixedValue accepts whole faces of the die, empty means random", () => {
  assert.equal(__test__.parseFixedValue("", 6), null);
  assert.equal(__test__.parseFixedValue(" 4 ", 6), 4);
  assert.equal(__test__.parseFixedValue("7", 6), undefined);
  assert.equal(__test__.parseFixedValue("0", 6), undefined);
  assert.equal(__test__.parseFixedValue("2.5", 6), undefined);

  const slots = __test__.describeFormulaDice([new DiceTerm({ number: 2, faces: 6 })]).slots;
  assert.deepEqual(__test__.getInvalidFixedSlots(slots, { "0:0": "3", "0:1": "9" }).map((slot) => slot.key), ["0:1"]);
  assert.deepEqual([...__test__.buildFixedResultMap(slots, { "0:1": "5" }).entries()], [[0, [null, 5]]]);
});

test("applyFixedResults answers DiceTerm#_roll with the fixed faces and restores the term afterwards", async () => {
  const twoD6 = new DiceTerm({ number: 3, faces: 6 });
  const d20 = new DiceTerm({ number: 1, faces: 20 });
  const restore = __test__.applyFixedResults([twoD6, d20], new Map([[0, [6, null, 2]], [1, [null]]]));

  assert.equal(Object.prototype.hasOwnProperty.call(twoD6, "_roll"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(d20, "_roll"), false);
  for (let index = 0; index < 4; index += 1) await twoD6.roll();
  await d20.roll();
  restore();

  // Fixed, random (1 from randomFace), fixed, then random again for an extra die such as an explosion.
  assert.deepEqual(twoD6.results.map((result) => result.result), [6, 1, 2, 1]);
  assert.deepEqual(d20.results.map((result) => result.result), [1]);
  assert.equal(Object.prototype.hasOwnProperty.call(twoD6, "_roll"), false);
});

test("getMessageModeOption maps the roll visibility to v13 roll modes and v14 message modes", () => {
  assert.deepEqual(__test__.getMessageModeOption("blind", 13), { rollMode: "blindroll" });
  assert.deepEqual(__test__.getMessageModeOption("gm-private", 14), { messageMode: "gm" });
  assert.deepEqual(__test__.getMessageModeOption("self", 14), { messageMode: "self" });
  assert.deepEqual(__test__.getMessageModeOption("unknown", 13), { rollMode: "publicroll" });
});

test("roll options and event overrides carry the bench choices", () => {
  assert.deepEqual(__test__.getRollOptions({ rollType: "any", degree: "" }), {});
  assert.deepEqual(__test__.getRollOptions({ rollType: "attack", degree: "critical-success" }), { rollType: "attack", degreeOfSuccess: "critical-success" });
  assert.deepEqual(__test__.getEventOverrides({ rollType: "", degree: "", visibility: "weird", inCombat: 1 }, ["Actor.a"]), {
    rollType: "any",
    successDegree: undefined,
    visibility: "public",
    isCombat: true,
    targetUuids: ["Actor.a"]
  });
});

function evaluatedRoll(values) {
  const term = new DiceTerm({ number: values.length, faces: 6 });
  term.results = values.map((result) => ({ result, active: true }));
  return { formula: `${values.length}d6`, total: values.reduce((sum, value) => sum + value, 0), options: {}, terms: [term] };
}

function createTrigger(overrides = {}) {
  return {
    id: "doubles",
    name: "Doubles",
    enabled: true,
    priority: 100,
    executionMode: "automatic",
    filters: {},
    match: { type: "all-same", faces: 6 },
    actions: [{ type: "chat-message", template: "Doubles!", visibility: "public" }],
    ...overrides
  };
}

test("a bench roll runs through the real event builder and trigger matching", () => {
  const roll = evaluatedRoll([4, 4]);
  const message = __test__.buildBenchMessage({ roll, speaker: { scene: "scene-1" }, userId: "player-1", visibility: "blind" });
  const [event] = new GenericRollAdapter().extractRollEvents(message, __test__.getEventOverrides({
    rollType: "damage",
    degree: "",
    visibility: "blind",
    inCombat: true
  }));

  assert.equal(event.userId, "player-1");
  assert.equal(event.visibility, "blind");
  assert.equal(event.rollType, "damage");
  assert.equal(event.isCombat, true);
  assert.deepEqual(event.diceResults, [{ faces: 6, value: 4 }, { faces: 6, value: 4 }]);

  const triggers = [
    createTrigger(),
    createTrigger({ id: "attacks", name: "Attacks only", filters: { rollType: ["attack"] } }),
    createTrigger({ id: "gm", name: "GM only", filters: { gmOnly: true } }),
    createTrigger({ id: "off", name: "Off", enabled: false })
  ];
  const reports = simulateTriggers(triggers, event);
  const views = reports.map((report) => __test__.describeReport(report, { describeCondition: (condition) => `cond:${condition.type}` }));

  assert.deepEqual(views.map((view) => [view.id, view.status]), [["doubles", "match"], ["attacks", "miss"], ["gm", "miss"], ["off", "off"]]);
  assert.deepEqual(views[0].actions, ["SRT.Action.ChatMessage (SRT.Visibility.Public)"]);
  assert.equal(views[0].mode, "SRT.TestBench.Mode.Automatic");
  assert.equal(views[0].runnable, true);
  assert.deepEqual(views[0].conditions, [{ passed: true, label: "cond:all-same", error: null }]);
  assert.deepEqual(views[1].reasons, ['SRT.TestBench.ReasonFilter:{"filter":"SRT.TestBench.Filter.RollType"}']);
  assert.deepEqual(views[2].reasons, ['SRT.TestBench.ReasonFilter:{"filter":"SRT.TestBench.Filter.GmOnly"}']);
  assert.deepEqual(views[3].reasons, ["SRT.TestBench.ReasonDisabled"]);
});

test("describeReport explains stopped, failing and erroring triggers", () => {
  const event = {
    diceResults: [{ faces: 6, value: 2 }, { faces: 6, value: 6 }],
    total: 7,
    rollType: "any",
    visibility: "public",
    user: { isGM: true },
    flags: {}
  };
  const reports = simulateTriggers([
    createTrigger({ id: "stopper", name: "Stopper", priority: 150, match: { type: "die-max", faces: 6 }, stopLowerPriority: true, executionMode: "chat-button" }),
    createTrigger({ id: "lower", name: "Lower", priority: 10, match: { type: "die-max", faces: 6 } }),
    createTrigger({ id: "broken", name: "Broken", priority: 200, match: { type: "custom-js", expression: "event.a.b" } }),
    createTrigger({ id: "miss", name: "Miss", priority: 250 })
  ], event);
  const views = reports.map((report) => __test__.describeReport(report));

  assert.deepEqual(views.map((view) => [view.id, view.status]), [["miss", "miss"], ["broken", "miss"], ["stopper", "match"], ["lower", "stopped"]]);
  assert.equal(views[2].mode, "SRT.TestBench.Mode.ChatButton");
  assert.deepEqual(views[0].conditions.map((condition) => [condition.label, condition.passed]), [["all-same", false]]);
  assert.match(views[1].reasons[0], /^SRT\.TestBench\.ReasonError/);
  // The error of the condition and of the whole match is the same one: listed once.
  assert.equal(views[1].reasons.length, 1);
  assert.deepEqual(views[3].reasons, ['SRT.TestBench.ReasonStopped:{"name":"Stopper"}']);
});

test("markActionLimit charges matches like the chat processing", () => {
  const report = (id, executionMode, actionCount) => ({
    id,
    matched: true,
    match: { executionMode, actions: Array.from({ length: actionCount }, () => ({ type: "gm-note" })) }
  });
  const reports = [
    report("auto", "automatic", 2),
    report("button", "chat-button", 5),
    report("disabled", "disabled", 1),
    report("confirm", "confirm-gm", 2),
    { id: "miss", matched: false, match: null },
    report("small", "gm-whisper-log", 1)
  ];

  const overLimit = __test__.markActionLimit(reports, 3);
  assert.deepEqual(reports.filter((entry) => overLimit.has(entry)).map((entry) => entry.id), ["confirm"]);

  const view = __test__.describeReport({
    trigger: { id: "confirm", name: "Confirm" },
    enabled: true,
    blockedBy: [],
    conditions: [],
    matched: true,
    match: reports[3].match,
    stoppedBy: null
  }, { overLimit: true, maxActions: 3 });
  assert.deepEqual(view.reasons, ['SRT.TestBench.OverLimit:{"max":3}']);
  assert.equal(view.runnable, false);
});

test("renderBenchResults escapes names and reasons and disables Run actions without runnable matches", () => {
  const html = __test__.renderBenchResults({
    formula: "1d20",
    total: 20,
    diceText: "d20: 20",
    views: [{
      id: "x",
      name: "<script>Nat</script>",
      status: "miss",
      reasons: ["<b>blocked</b>"],
      conditions: [{ passed: false, label: "<i>cond</i>", error: null }],
      mode: null,
      actions: []
    }]
  });

  assert.match(html, /&lt;script&gt;Nat&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;blocked&lt;\/b&gt;/);
  assert.match(html, /&lt;i&gt;cond&lt;\/i&gt;/);
  assert.doesNotMatch(html, /<script>|<b>blocked/);
  assert.match(html, /data-action="runActions" disabled/);
  assert.match(html, /SRT\.TestBench\.Status\.Miss/);

  assert.match(__test__.renderBenchResults(null), /SRT\.TestBench\.Empty/);
  assert.match(__test__.renderBenchResults({ error: "<oops>" }), /&lt;oops&gt;/);
  assert.match(__test__.renderBenchResults({ formula: "1d6", total: 1, diceText: "", views: [] }), /SRT\.TestBench\.NoTriggers/);
});

test("the bench form renders one input per die and the roll options", () => {
  const dice = __test__.renderDiceInputs("2d6+1d20", { "0:1": "5" });
  assert.equal((dice.match(/data-srt-bench-die=/g) ?? []).length, 3);
  assert.match(dice, /data-srt-bench-die="0:1" data-faces="6" value="5"/);
  assert.match(dice, /max="20"/);
  assert.match(__test__.renderDiceInputs("5", {}), /SRT\.TestBench\.DiceNone/);
  assert.match(__test__.renderDiceInputs("throw", {}), /SRT\.TestBench\.InvalidFormula/);

  const form = __test__.renderBenchForm(
    { ...__test__.getDefaultBenchState(), formula: "2d6+1d20", rollType: "attack", actorId: "a1", degree: "success", inCombat: true },
    { actors: { "": "None", a1: "Hero <1>" }, users: { "gm-1": "GM" }, targetCount: 2, moduleEnabled: false }
  );
  assert.match(form, /<option value="attack" selected>SRT\.RollType\.Attack<\/option>/);
  assert.match(form, /<option value="a1" selected>Hero &lt;1&gt;<\/option>/);
  assert.match(form, /<option value="success" selected>SRT\.Degree\.Success<\/option>/);
  assert.match(form, /name="inCombat" checked/);
  assert.match(form, /SRT\.TestBench\.ModuleDisabled/);
  assert.match(form, /SRT\.TestBench\.Targets:\{&quot;count&quot;:2\}/);
  assert.match(form, /data-action="simulate"/);
  assert.match(form, /data-action="rollToChat"/);
});

test("the bench class constructs against an ApplicationV2 whose state, title and element are getters", async () => {
  // Mirrors the read-only members of ApplicationV2 in v13.351 and v14.361. Assigning one of them throws in strict mode.
  class StubApplicationV2 {
    #options;

    constructor(options = {}) {
      this.#options = Object.freeze({ ...options });
    }

    get options() {
      return this.#options;
    }

    get state() {
      return 0;
    }

    get rendered() {
      return false;
    }

    get element() {
      return null;
    }

    get window() {
      return {};
    }

    get id() {
      return "stub";
    }

    get title() {
      return "";
    }
  }

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = { ...originalFoundry, applications: { api: { ApplicationV2: StubApplicationV2, DialogV2: {} } } };
  __test__.resetTestBenchClass();

  try {
    const BenchClass = __test__.getTestBenchClass();
    const describeCondition = () => "x";
    const bench = new BenchClass({ describeCondition });

    assert.equal(bench.state, 0);
    assert.equal(bench.benchState.formula, "1d20");
    assert.equal(bench.describeCondition, describeCondition);
    assert.equal(bench.lastRun, null);
    assert.equal(bench.title, "SRT.TestBench.Title");
    assert.equal(typeof BenchClass.DEFAULT_OPTIONS.actions.simulate, "function");

    // No own field may shadow an ApplicationV2 member.
    const reserved = ["state", "options", "element", "window", "position", "title", "id", "rendered", "form", "tabGroups", "parts", "hasFrame", "minimized"];
    assert.deepEqual(Object.keys(bench).filter((key) => reserved.includes(key)), []);
  } finally {
    globalThis.foundry = originalFoundry;
    __test__.resetTestBenchClass();
  }
});

test("a matching trigger without actions is explained and not counted against the limit", () => {
  const event = { diceResults: [{ faces: 6, value: 6 }, { faces: 6, value: 6 }], total: 12, rollType: "any", visibility: "public", user: { isGM: true }, flags: {} };
  const reports = simulateTriggers([
    createTrigger({ id: "empty", name: "Empty", priority: 200, actions: [] }),
    createTrigger({ id: "full", name: "Full", priority: 100 })
  ], event);
  const overLimit = __test__.markActionLimit(reports, 1);
  const views = reports.map((report) => __test__.describeReport(report, { overLimit: overLimit.has(report), maxActions: 1 }));

  assert.equal(overLimit.size, 0);
  assert.deepEqual(views.map((view) => [view.id, view.status, view.runnable]), [["empty", "match", false], ["full", "match", true]]);
  assert.deepEqual(views[0].reasons, ["SRT.TestBench.NoActions"]);
});
