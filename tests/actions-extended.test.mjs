import assert from "node:assert/strict";
import test from "node:test";

const createdMessages = [];
const playedSounds = [];
const socketEvents = [];
const renderedPopouts = [];
const rolledMessages = [];
const documents = new Map();

function getProperty(object, path) {
  return String(path).split(".").reduce((current, part) => current?.[part], object);
}

function setProperty(object, path, value) {
  const parts = String(path).split(".");
  const last = parts.pop();
  const target = parts.reduce((current, part) => (current[part] ??= {}), object);
  target[last] = value;
}

function createEffect(data) {
  return {
    ...data,
    statuses: new Set(data.statuses ?? []),
    updates: [],
    async update(changes) {
      this.updates.push(changes);
      return this;
    },
    getFlag(scope, key) {
      return data.flags?.[scope]?.[key];
    }
  };
}

function createActor(id, system = {}, statuses = []) {
  return {
    id,
    documentName: "Actor",
    system,
    statuses: new Set(statuses),
    effects: [],
    updates: [],
    toggled: [],
    async update(changes) {
      this.updates.push(changes);
      for (const [path, value] of Object.entries(changes)) setProperty(this, path, value);
      return this;
    },
    async toggleStatusEffect(statusId, options) {
      this.toggled.push([statusId, options]);
      this.statuses.add(statusId);
      const effect = createEffect({ statuses: [statusId] });
      this.effects.push(effect);
      return effect;
    },
    async createEmbeddedDocuments(type, data) {
      const created = data.map((entry) => createEffect(entry));
      this.effects.push(...created);
      return created;
    }
  };
}

class FakeRoll {
  static validate(formula) {
    return /^\d*d\d+/.test(formula) || /^\d+$/.test(formula);
  }

  constructor(formula) {
    this.formula = formula;
    this.total = 7;
  }

  async evaluate(options) {
    this.evaluateOptions = options;
    return this;
  }

  async toMessage(messageData, messageOptions) {
    const message = { roll: this, messageData, messageOptions };
    rolledMessages.push(message);
    return message;
  }
}

globalThis.Roll = FakeRoll;
globalThis.CONFIG = {
  statusEffects: [
    { id: "prone", name: "EFFECT.StatusProne" },
    { id: "blinded", name: "EFFECT.StatusBlind" }
  ]
};

globalThis.game = {
  user: { id: "gm-1", isGM: true },
  release: { generation: 13 },
  i18n: {
    localize(key) {
      return key;
    },
    format(key) {
      return key;
    }
  },
  socket: {
    emit(...args) {
      socketEvents.push(args);
    }
  },
  actors: new Map(),
  scenes: new Map()
};

globalThis.ChatMessage = {
  getWhisperRecipients() {
    return [{ id: "gm-1" }, { id: "gm-2" }];
  },
  getSpeaker({ actor } = {}) {
    return { actor: actor?.id ?? null, alias: actor ? "Speaker" : "GM" };
  },
  async create(data) {
    createdMessages.push(data);
    return data;
  }
};

globalThis.fromUuid = async (uuid) => documents.get(uuid) ?? null;

globalThis.foundry = {
  utils: { getProperty },
  audio: {
    AudioHelper: {
      play(data, socketOptions) {
        playedSounds.push({ data, socketOptions });
        return { src: data.src };
      }
    }
  },
  applications: {
    apps: {
      ImagePopout: class {
        constructor(options) {
          this.options = options;
        }

        async render(force) {
          renderedPopouts.push({ options: this.options, force });
          return this;
        }
      }
    }
  }
};

const {
  buildEffectDuration,
  computeResourceChange,
  describeAction,
  executeMatch,
  findStatusEffect,
  getResourceBoundPath,
  getStatusEffectLabel,
  isSafeResourcePath,
  normalizeEffectRounds,
  normalizeVolume,
  parseResourceAmount,
  planAudience,
  prepareEffectCopy,
  renderPlainTemplateString,
  serializeDeferredMatch,
  summarizeActions
} = await import("../scripts/actions.js");

function resetRecords() {
  createdMessages.length = 0;
  playedSounds.length = 0;
  socketEvents.length = 0;
  renderedPopouts.length = 0;
  rolledMessages.length = 0;
}

function createEvent(overrides = {}) {
  return {
    actorId: "actor-1",
    actorName: "Hero",
    userId: "player-1",
    user: { name: "Player" },
    formula: "1d20",
    total: 20,
    rollType: "attack",
    visibility: "public",
    diceResults: [{ faces: 20, value: 20 }],
    targetUuids: [],
    ...overrides
  };
}

function run(actions, event = createEvent(), options = {}) {
  return executeMatch({
    trigger: { id: "trigger-1", name: "Nat 20", visibilityMode: "inherit" },
    event,
    actions,
    executionMode: "automatic"
  }, { allowDeferred: false, ...options });
}

test("renderPlainTemplateString fills placeholders without HTML escaping", () => {
  assert.equal(renderPlainTemplateString("1d{{roll.total}} for {{actor.name}}", { roll: { total: 6 }, actor: { name: "Tom & <Jerry>" } }), "1d6 for Tom & <Jerry>");
  assert.equal(renderPlainTemplateString("{{missing.value}}x", {}), "x");
});

test("planAudience splits local playback, broadcast and socket recipients", () => {
  const context = { selfId: "gm-1", gmIds: ["gm-1", "gm-2"] };
  assert.deepEqual(planAudience("public", {}, {}, context), { local: true, broadcast: true, recipients: [] });
  assert.deepEqual(planAudience("gm", {}, {}, context), { local: true, broadcast: false, recipients: ["gm-2"] });
  assert.deepEqual(planAudience("player", { userId: "player-1" }, {}, context), { local: false, broadcast: false, recipients: ["player-1"] });
  assert.deepEqual(planAudience("player", { userId: "gm-1" }, {}, context), { local: true, broadcast: false, recipients: [] });
  assert.deepEqual(planAudience("player", {}, {}, context), { local: false, broadcast: false, recipients: [] });
  assert.deepEqual(planAudience("custom", {}, { userIds: ["u1", "u1", "gm-1"] }, context), { local: true, broadcast: false, recipients: ["u1"] });
});

test("normalizeVolume and normalizeEffectRounds keep values in their range", () => {
  assert.equal(normalizeVolume(""), 0.8);
  assert.equal(normalizeVolume("abc"), 0.8);
  assert.equal(normalizeVolume(0.25), 0.25);
  assert.equal(normalizeVolume(3), 1);
  assert.equal(normalizeVolume(-1), 0);
  assert.equal(normalizeEffectRounds("3"), 3);
  assert.equal(normalizeEffectRounds(""), null);
  assert.equal(normalizeEffectRounds("1.5"), null);
  assert.equal(normalizeEffectRounds(0), null);
});

test("findStatusEffect works with the v13 array and the v14 array proxy with id keys", () => {
  assert.equal(findStatusEffect("prone").name, "EFFECT.StatusProne");
  assert.equal(findStatusEffect("unknown"), null);
  assert.equal(findStatusEffect(""), null);
  assert.equal(getStatusEffectLabel("prone"), "EFFECT.StatusProne");
  assert.equal(getStatusEffectLabel("custom"), "custom");

  const original = CONFIG.statusEffects;
  const v14 = [{ id: "dead", name: "EFFECT.StatusDead" }];
  v14.dead = v14[0];
  CONFIG.statusEffects = v14;
  assert.equal(findStatusEffect("dead").name, "EFFECT.StatusDead");
  CONFIG.statusEffects = original;
});

test("buildEffectDuration writes the v13 and v14 duration shapes", () => {
  assert.deepEqual(buildEffectDuration(3, 13), { rounds: 3 });
  assert.deepEqual(buildEffectDuration(2, 14), { value: 2, units: "rounds", expiry: "turnStart" });
});

test("prepareEffectCopy drops ids and start data, sets the duration and marks the source", () => {
  const copy = prepareEffectCopy({
    _id: "abc",
    name: "Bless",
    disabled: true,
    transfer: true,
    start: { round: 2 },
    duration: { rounds: 10, startRound: 2, startTurn: 1, startTime: 50, combat: "c1" }
  }, { rounds: 2, generation: 13, sourceUuid: "Item.i1.ActiveEffect.abc" });

  assert.equal("_id" in copy, false);
  assert.equal("start" in copy, false);
  assert.equal(copy.disabled, false);
  assert.equal(copy.transfer, false);
  assert.deepEqual(copy.duration, { rounds: 2 });
  assert.equal(copy.origin, "Item.i1.ActiveEffect.abc");
  assert.deepEqual(copy.flags["sephrals-roll-triggers"], { sourceEffect: "Item.i1.ActiveEffect.abc" });

  const withoutRounds = prepareEffectCopy({ duration: { rounds: 4, startRound: 1 } }, { generation: 13 });
  assert.deepEqual(withoutRounds.duration, { rounds: 4 });
});

test("isSafeResourcePath and getResourceBoundPath only accept system data", () => {
  assert.equal(isSafeResourcePath("system.attributes.inspiration"), true);
  assert.equal(isSafeResourcePath("system.bennies.value"), true);
  assert.equal(isSafeResourcePath("system.resources.heroism.value"), true);
  assert.equal(isSafeResourcePath("name"), false);
  assert.equal(isSafeResourcePath("system"), false);
  assert.equal(isSafeResourcePath("flags.core.x"), false);
  assert.equal(isSafeResourcePath("system.__proto__.polluted"), false);
  assert.equal(isSafeResourcePath("system.a..b"), false);
  assert.equal(getResourceBoundPath("system.bennies.value", "max"), "system.bennies.max");
  assert.equal(getResourceBoundPath("system.attributes.inspiration", "max"), null);
});

test("computeResourceChange adds, subtracts and sets with clamping to the bounds", () => {
  assert.equal(computeResourceChange(2, "add", 1), 3);
  assert.equal(computeResourceChange(2, "subtract", 5), -3);
  assert.equal(computeResourceChange(2, "set", 9), 9);
  assert.equal(computeResourceChange(2, "add", 5, { max: 5 }), 5);
  assert.equal(computeResourceChange(2, "subtract", 5, { max: 5 }), 0);
  assert.equal(computeResourceChange(2, "subtract", 5, { max: 5, min: -2 }), -2);
  assert.equal(computeResourceChange("3", "add", 1), 4);
  assert.equal(computeResourceChange(undefined, "add", 1), null);
  assert.equal(computeResourceChange({}, "add", 1), null);
  assert.equal(computeResourceChange(1, "multiply", 2), null);
  assert.equal(computeResourceChange(1, "add", Number.NaN), null);
});

test("computeResourceChange switches yes or no fields such as dnd5e inspiration", () => {
  assert.equal(computeResourceChange(false, "add", 1), true);
  assert.equal(computeResourceChange(true, "subtract", 1), false);
  assert.equal(computeResourceChange(true, "set", 0), false);
  assert.equal(computeResourceChange(false, "set", 1), true);
  assert.equal(computeResourceChange(true, "add", 0), true);
});

test("parseResourceAmount accepts numbers and placeholders", () => {
  assert.equal(parseResourceAmount("2", {}), 2);
  assert.equal(parseResourceAmount("{{roll.total}}", { roll: { total: 17 } }), 17);
  assert.equal(Number.isNaN(parseResourceAmount("", {})), true);
  assert.equal(Number.isNaN(parseResourceAmount("lots", {})), true);
});

test("describeAction summarizes old and new actions", () => {
  assert.equal(describeAction({ type: "chat-message", visibility: "player" }), "SRT.Action.ChatMessage (SRT.Visibility.Player)");
  assert.equal(describeAction({ type: "macro" }), "SRT.Action.Macro");
  assert.equal(describeAction({ type: "play-sound", sound: "a.ogg", visibility: "gm" }), "SRT.Action.PlaySound (SRT.Visibility.Gm)");
  assert.equal(describeAction({ type: "apply-effect", status: "prone", target: "targets" }), "SRT.Action.ApplyEffect: EFFECT.StatusProne (SRT.EffectTarget.Targets)");
  assert.equal(describeAction({ type: "apply-effect", effectUuid: "Item.x.ActiveEffect.y" }), "SRT.Action.ApplyEffect: Item.x.ActiveEffect.y (SRT.EffectTarget.Actor)");
  assert.equal(describeAction({ type: "change-resource", path: "system.bennies.value", operation: "subtract", value: "1" }), "SRT.Action.ChangeResource: system.bennies.value -1");
  assert.equal(describeAction({ type: "change-resource", path: "system.x", operation: "set", value: "0" }), "SRT.Action.ChangeResource: system.x =0");
  assert.equal(describeAction({ type: "show-image", image: "a.webp" }), "SRT.Action.ShowImage (SRT.Visibility.Public)");
  assert.equal(describeAction({ type: "roll-formula", formula: "1d10", visibility: "gm" }), "SRT.Action.RollFormula: 1d10 (SRT.Visibility.Gm)");
  assert.deepEqual(summarizeActions([{ type: "gm-note" }, { type: "custom" }]), ["SRT.Action.GmNote", "custom"]);
});

test("serializeDeferredMatch keeps the speaker token and the targets for later actions", () => {
  const serialized = serializeDeferredMatch({
    trigger: { id: "t", name: "T" },
    event: createEvent({ tokenId: "token-1", sceneId: "scene-1", targetUuids: ["Actor.a"] }),
    actions: [],
    executionMode: "chat-button"
  });
  assert.equal(serialized.event.tokenId, "token-1");
  assert.deepEqual(serialized.event.targetUuids, ["Actor.a"]);
});

test("play sound broadcasts public sounds and sends private ones to the named users only", async () => {
  resetRecords();
  await run([
    { type: "play-sound", sound: "sounds/crit.ogg", volume: 0.5, visibility: "public" },
    { type: "play-sound", sound: "sounds/gm.ogg", visibility: "gm" },
    { type: "play-sound", sound: "sounds/player.ogg", visibility: "player" },
    { type: "play-sound", sound: "  ", visibility: "public" }
  ]);

  assert.deepEqual(playedSounds.map((entry) => [entry.data.src, entry.socketOptions]), [
    ["sounds/crit.ogg", true],
    ["sounds/gm.ogg", false]
  ]);
  assert.equal(playedSounds[0].data.volume, 0.5);
  assert.equal(playedSounds[1].data.volume, 0.8);
  assert.equal(playedSounds[0].data.autoplay, true);
  assert.deepEqual(socketEvents.map(([name, data, options]) => [name, data.src, options]), [
    ["playAudio", "sounds/gm.ogg", { recipients: ["gm-2"] }],
    ["playAudio", "sounds/player.ogg", { recipients: ["player-1"] }]
  ]);
});

test("a public sound of a private roll plays for the GMs only with respect private rolls", async () => {
  resetRecords();
  await run([{ type: "play-sound", sound: "sounds/crit.ogg", visibility: "public" }], createEvent({ visibility: "blind" }), { respectPrivateRolls: true });
  assert.equal(playedSounds[0].socketOptions, false);
  assert.deepEqual(socketEvents[0][2], { recipients: ["gm-2"] });
});

test("show image shares the popout with the chosen users and opens it locally when the GM is one of them", async () => {
  resetRecords();
  await run([
    { type: "show-image", image: "worlds/x/fumble.webp", caption: "Oops {{actor.name}} & co", visibility: "public" },
    { type: "show-image", image: "worlds/x/secret.webp", visibility: "player" }
  ], createEvent({ actorName: "<Hero>" }));

  assert.deepEqual(socketEvents[0], ["shareImage", { image: "worlds/x/fumble.webp", title: "Nat 20", caption: "Oops <Hero> & co", uuid: null, showTitle: true }]);
  assert.deepEqual(socketEvents[1][1].users, ["player-1"]);
  assert.equal(renderedPopouts.length, 1);
  assert.equal(renderedPopouts[0].options.src, "worlds/x/fumble.webp");
  assert.equal(renderedPopouts[0].options.caption, "Oops <Hero> & co");
  assert.deepEqual(renderedPopouts[0].options.window, { title: "Nat 20" });
});

test("apply effect toggles a status on the rolling actor and sets the duration", async () => {
  resetRecords();
  const actor = createActor("actor-1");
  const already = createActor("actor-2", {}, ["prone"]);

  await run([{ type: "apply-effect", status: "prone", rounds: 2, target: "actor" }], createEvent({ actor }));
  assert.deepEqual(actor.toggled, [["prone", { active: true }]]);
  assert.deepEqual(actor.effects[0].updates, [{ duration: { rounds: 2 } }]);

  // An actor that already has the status keeps it (toggling would remove it).
  await run([{ type: "apply-effect", status: "prone", target: "actor" }], createEvent({ actor: already }));
  assert.deepEqual(already.toggled, []);

  // Unknown statuses do nothing.
  const other = createActor("actor-3");
  await run([{ type: "apply-effect", status: "flying", target: "actor" }], createEvent({ actor: other }));
  assert.deepEqual(other.toggled, []);
});

test("apply effect reaches the targeted tokens and copies effects once", async () => {
  resetRecords();
  const targetA = createActor("target-a");
  const targetB = createActor("target-b");
  documents.set("Actor.target-a", targetA);
  documents.set("Scene.s.Token.t", { documentName: "Token", actor: targetB });
  documents.set("Item.i.ActiveEffect.e", {
    documentName: "ActiveEffect",
    uuid: "Item.i.ActiveEffect.e",
    toObject() {
      return { _id: "e", name: "Bless", duration: { rounds: 10 } };
    }
  });

  const event = createEvent({ targetUuids: ["Actor.target-a", "Scene.s.Token.t", "Actor.missing"] });
  await run([{ type: "apply-effect", status: "blinded", target: "targets" }], event);
  assert.deepEqual(targetA.toggled.map(([id]) => id), ["blinded"]);
  assert.deepEqual(targetB.toggled.map(([id]) => id), ["blinded"]);

  await run([{ type: "apply-effect", effectUuid: "Item.i.ActiveEffect.e", target: "targets" }], event);
  await run([{ type: "apply-effect", effectUuid: "Item.i.ActiveEffect.e", target: "targets" }], event);
  const copies = targetA.effects.filter((effect) => effect.name === "Bless");
  assert.equal(copies.length, 1);
  assert.equal(copies[0].flags["sephrals-roll-triggers"].sourceEffect, "Item.i.ActiveEffect.e");
});

test("change resource updates the rolling actor and stays within the maximum", async () => {
  resetRecords();
  const actor = createActor("actor-1", { bennies: { value: 2, max: 3 }, attributes: { inspiration: false } });

  await run([
    { type: "change-resource", path: "system.bennies.value", operation: "add", value: "5" },
    { type: "change-resource", path: "system.attributes.inspiration", operation: "add", value: "1" },
    { type: "change-resource", path: "name", operation: "set", value: "1" }
  ], createEvent({ actor }));

  assert.deepEqual(actor.updates, [{ "system.bennies.value": 3 }, { "system.attributes.inspiration": true }]);
});

test("change resource of a deferred match finds the token actor again", async () => {
  resetRecords();
  const tokenActor = createActor("actor-1", { resources: { heroism: { value: 1, max: 6 } } });
  game.scenes = new Map([["scene-1", { tokens: new Map([["token-1", { actor: tokenActor }]]) }]]);

  await run(
    [{ type: "change-resource", path: "system.resources.heroism.value", operation: "add", value: "{{roll.total}}" }],
    createEvent({ actor: undefined, sceneId: "scene-1", tokenId: "token-1", total: 4 })
  );
  assert.deepEqual(tokenActor.updates, [{ "system.resources.heroism.value": 5 }]);
  game.scenes = new Map();
});

test("roll formula posts a flagged roll with the action's privacy and flavor", async () => {
  resetRecords();
  const actor = createActor("actor-1");

  await run([
    { type: "roll-formula", formula: "1d{{roll.total}}", flavor: "<b>Fumble</b> for {{actor.name}}", visibility: "gm" },
    { type: "roll-formula", formula: "1d6", visibility: "public" },
    { type: "roll-formula", formula: "not a formula", visibility: "public" }
  ], createEvent({ actor, actorName: "<Hero>", total: 10 }));

  assert.equal(rolledMessages.length, 2);
  assert.equal(rolledMessages[0].roll.formula, "1d10");
  assert.deepEqual(rolledMessages[0].roll.evaluateOptions, { allowInteractive: false });
  assert.equal(rolledMessages[0].messageData.flavor, "<b>Fumble</b> for &lt;Hero&gt;");
  assert.deepEqual(rolledMessages[0].messageData.whisper, ["gm-1", "gm-2"]);
  assert.deepEqual(rolledMessages[0].messageData.speaker, { actor: "actor-1", alias: "Speaker" });
  assert.deepEqual(rolledMessages[0].messageData.flags, { "sephrals-roll-triggers": { triggerOutput: { triggerId: "trigger-1" } } });
  assert.deepEqual(rolledMessages[0].messageOptions, { rollMode: "gmroll" });
  assert.deepEqual(rolledMessages[1].messageData.whisper, []);
  assert.deepEqual(rolledMessages[1].messageOptions, { rollMode: "publicroll" });
  assert.equal(rolledMessages[1].messageData.flavor, "SRT.Chat.TriggerReference <strong>Nat 20</strong>");

  // Without an actor the roll has no speaker instead of a token the GM happens to control.
  rolledMessages.length = 0;
  await run([{ type: "roll-formula", formula: "1d4", visibility: "public" }], createEvent({ actorId: null }));
  assert.equal("speaker" in rolledMessages[0].messageData, false);
});

test("new actions follow the execution modes like the existing actions", async () => {
  resetRecords();
  const match = {
    trigger: { id: "t", name: "T" },
    event: createEvent(),
    actions: [{ type: "play-sound", sound: "sounds/crit.ogg", visibility: "public" }]
  };

  assert.deepEqual(await executeMatch({ ...match, executionMode: "disabled" }), { skipped: true, reason: "disabled" });
  assert.deepEqual(await executeMatch({ ...match, executionMode: "chat-button" }), { deferred: true, mode: "chat-button" });
  await executeMatch({ ...match, executionMode: "gm-whisper-log" });
  assert.equal(playedSounds.length, 0);

  await executeMatch({ ...match, executionMode: "chat-button" }, { allowDeferred: false, forceExecutionMode: "automatic" });
  assert.equal(playedSounds.length, 1);
});

test("a sound that waits for the audio unlock does not hold back the next action", async () => {
  resetRecords();
  const helper = globalThis.foundry.audio.AudioHelper;
  const originalPlay = helper.play;
  helper.play = (data, socketOptions) => {
    playedSounds.push({ data, socketOptions });
    return new Promise(() => {});
  };
  try {
    const finished = await Promise.race([
      run([
        { type: "play-sound", sound: "sounds/locked.ogg", visibility: "public" },
        { type: "chat-message", template: "after the sound", visibility: "public" }
      ]).then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 500))
    ]);
    assert.equal(finished, true);
    assert.equal(playedSounds.length, 1);
    assert.equal(createdMessages.at(-1)?.content, "after the sound");
  } finally {
    helper.play = originalPlay;
  }
});
