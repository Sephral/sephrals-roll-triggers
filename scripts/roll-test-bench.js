import { describeAction, escapeHtml, executeMatch } from "./actions.js";
import { GenericRollAdapter } from "./adapters/generic-adapter.js";
import { FILTER_VISIBILITY_CHOICES, ROLL_TYPE_CHOICES, SUCCESS_DEGREE_CHOICES } from "./choices.js";
import { exceedsActionLimit, getMatchActionCost, hasNothingToRun } from "./roll-trigger-service.js";
import { addSettingsGear, createSettingsFacade, ensureModuleTranslationsLoaded, format, getThemePreference, localize, MODULE_ID } from "./settings.js";
import { simulateTriggers } from "./triggers.js";

// The bench builds the same roll event as the chat processing (GenericRollAdapter and createRollEvent) and checks it
// with the same trigger matching (simulateTriggers runs matchTrigger). Nothing runs until the GM asks for it.

const MAX_FIXED_DICE = 20;
const BENCH_VISIBILITIES = ["public", "gm-private", "blind", "self"];

// Roll visibility of the bench to the v14 message mode and the v13 roll mode.
const VISIBILITY_MODES = {
  public: { messageMode: "public", rollMode: "publicroll" },
  "gm-private": { messageMode: "gm", rollMode: "gmroll" },
  blind: { messageMode: "blind", rollMode: "blindroll" },
  self: { messageMode: "self", rollMode: "selfroll" }
};

const FILTER_LABEL_KEYS = {
  playerOnly: "TestBench.Filter.PlayerOnly",
  gmOnly: "TestBench.Filter.GmOnly",
  users: "TestBench.Filter.Users",
  actorType: "TestBench.Filter.ActorType",
  rollType: "TestBench.Filter.RollType",
  visibility: "TestBench.Filter.Visibility",
  combatState: "TestBench.Filter.CombatState",
  scene: "TestBench.Filter.Scene",
  actor: "TestBench.Filter.Actor",
  item: "TestBench.Filter.Item",
  diceCount: "TestBench.Filter.DiceCount",
  privateRoll: "TestBench.Filter.PrivateRoll"
};

const MODE_LABEL_KEYS = {
  automatic: "TestBench.Mode.Automatic",
  "confirm-gm": "TestBench.Mode.ConfirmGm",
  "chat-button": "TestBench.Mode.ChatButton",
  "gm-whisper-log": "TestBench.Mode.GmWhisperLog",
  disabled: "TestBench.Mode.Disabled"
};

// Execution modes whose actions count against the per message limit when the message is processed
// (chat buttons run later, disabled triggers never).
const COUNTED_MODES = new Set(["automatic", "confirm-gm", "gm-whisper-log"]);

function getGeneration() {
  const generation = Number(game.release?.generation ?? NaN);
  if (Number.isFinite(generation)) return generation;
  const parsed = Number.parseInt(String(game.version ?? "").split(".")[0] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDefaultBenchState() {
  return {
    formula: "1d20",
    fixed: {},
    rollType: "any",
    actorId: "",
    userId: game.user?.id ?? "",
    visibility: "public",
    degree: "",
    inCombat: Boolean(game.combat?.started)
  };
}

// One input per die of the formula, in the order Foundry rolls them. Fate dice (results -1 to 1) and dice with
// a variable count or size are rolled randomly.
export function describeFormulaDice(dice, limit = MAX_FIXED_DICE) {
  const slots = [];
  let truncated = false;

  (dice ?? []).forEach((term, termIndex) => {
    const faces = Number(term?.faces);
    const number = Number(term?.number);
    if (term?.constructor?.DENOMINATION === "f") return;
    if (!Number.isInteger(faces) || faces < 1 || !Number.isInteger(number) || number < 1) return;

    for (let dieIndex = 0; dieIndex < number; dieIndex += 1) {
      if (slots.length >= limit) {
        truncated = true;
        return;
      }
      slots.push({ key: `${termIndex}:${dieIndex}`, termIndex, dieIndex, faces });
    }
  });

  return { slots, truncated };
}

// A fixed face is a whole number from 1 to the die size. Empty means random. Anything else is invalid (undefined).
export function parseFixedValue(raw, faces) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= 1 && number <= faces ? number : undefined;
}

export function getInvalidFixedSlots(slots, fixed = {}) {
  return slots.filter((slot) => parseFixedValue(fixed[slot.key], slot.faces) === undefined);
}

// termIndex -> fixed results per die (null = random).
export function buildFixedResultMap(slots, fixed = {}) {
  const map = new Map();
  for (const slot of slots) {
    const values = map.get(slot.termIndex) ?? [];
    values[slot.dieIndex] = parseFixedValue(fixed[slot.key], slot.faces) ?? null;
    map.set(slot.termIndex, values);
  }
  return map;
}

// DiceTerm#roll asks DiceTerm#_roll for a result and rolls randomly when it gets none. The bench answers _roll
// with the fixed faces first, so keep, drop, reroll and explode modifiers still work on the fixed dice.
// The returned function removes the patch again.
export function applyFixedResults(dice, fixedByTerm) {
  const restores = [];

  (dice ?? []).forEach((term, termIndex) => {
    const queue = [...(fixedByTerm.get(termIndex) ?? [])];
    if (!queue.some((value) => value != null)) return;

    const hadOwn = Object.prototype.hasOwnProperty.call(term, "_roll");
    const original = term._roll;
    term._roll = async function rollFixedFace(options) {
      if (queue.length) {
        const value = queue.shift();
        if (value != null) return value;
      }
      return original.call(this, options);
    };
    restores.push(() => {
      if (hadOwn) term._roll = original;
      else delete term._roll;
    });
  });

  return () => restores.forEach((restore) => restore());
}

export function getMessageModeOption(visibility, generation = getGeneration()) {
  const mode = VISIBILITY_MODES[visibility] ?? VISIBILITY_MODES.public;
  return generation >= 14 ? { messageMode: mode.messageMode } : { rollMode: mode.rollMode };
}

// A speaker that never falls back to the GM's controlled token: the chosen actor, or just the user's name.
function buildSpeaker(actor, user) {
  if (actor) return ChatMessage.getSpeaker({ actor });
  return { scene: globalThis.canvas?.scene?.id ?? null, actor: null, token: null, alias: user?.name ?? "" };
}

// A stand-in for the chat message the roll would create. It carries only what createRollEvent reads.
export function buildBenchMessage({ roll, actor = null, speaker = {}, userId = null, visibility = "public" }) {
  return {
    id: null,
    uuid: null,
    rolls: [roll],
    speaker,
    flags: {},
    whisper: [],
    blind: visibility === "blind",
    _source: { author: userId },
    speakerActor: actor
  };
}

export function getRollOptions(state) {
  const options = {};
  if (state.rollType && state.rollType !== "any") options.rollType = state.rollType;
  if (state.degree) options.degreeOfSuccess = state.degree;
  return options;
}

export function getEventOverrides(state, targetUuids = []) {
  return {
    rollType: state.rollType || "any",
    successDegree: state.degree || undefined,
    visibility: BENCH_VISIBILITIES.includes(state.visibility) ? state.visibility : "public",
    isCombat: Boolean(state.inCombat),
    targetUuids
  };
}

function getCurrentTargetUuids() {
  return Array.from(game.user?.targets ?? [])
    .map((token) => token?.document?.uuid ?? null)
    .filter(Boolean);
}

function resolveBenchActor(actorId) {
  return actorId ? game.actors?.get?.(actorId) ?? null : null;
}

async function evaluateBenchRoll(state) {
  const actor = resolveBenchActor(state.actorId);
  const roll = new Roll(state.formula, actor?.getRollData?.() ?? {}, getRollOptions(state));
  const { slots } = describeFormulaDice(roll.dice);
  const restore = applyFixedResults(roll.dice, buildFixedResultMap(slots, state.fixed));
  try {
    // The bench never waits for manual dice entry.
    await roll.evaluate({ allowInteractive: false });
  } finally {
    restore();
  }
  return roll;
}

// The view of one trigger report: status, reasons and what would happen.
export function describeReport(report, { describeCondition = (condition) => String(condition?.type ?? ""), overLimit = false, maxActions = 0 } = {}) {
  const trigger = report.trigger ?? {};
  const view = {
    id: String(trigger.id ?? ""),
    name: String(trigger.name ?? trigger.id ?? ""),
    priority: Number(trigger.priority ?? 0),
    status: "miss",
    reasons: [],
    conditions: report.conditions.map((entry) => ({
      passed: entry.passed,
      label: describeCondition(entry.condition),
      error: entry.error
    })),
    mode: null,
    actions: []
  };

  if (!report.enabled) {
    view.status = "off";
    view.reasons.push(localize("TestBench.ReasonDisabled"));
    return view;
  }
  if (report.stoppedBy) {
    view.status = "stopped";
    view.reasons.push(format("TestBench.ReasonStopped", { name: report.stoppedBy.name ?? report.stoppedBy.id ?? "" }));
    return view;
  }

  for (const key of report.blockedBy) {
    view.reasons.push(format("TestBench.ReasonFilter", { filter: localize(FILTER_LABEL_KEYS[key] ?? key) }));
  }
  // A throwing condition shows up in its own entry and as the error of the whole match: name it once.
  const errors = new Set([...report.conditions.map((entry) => entry.error), report.error].filter(Boolean));
  for (const error of errors) view.reasons.push(format("TestBench.ReasonError", { error }));
  if (!report.matched) return view;

  const match = report.match;
  view.status = "match";
  view.mode = localize(MODE_LABEL_KEYS[match.executionMode] ?? "TestBench.Mode.Automatic");
  if (hasNothingToRun(match)) view.reasons.push(localize("TestBench.NoActions"));
  else if (overLimit) view.reasons.push(format("TestBench.OverLimit", { max: maxActions }));
  view.actions = (match.actions ?? []).map((action) => describeAction(action));
  view.runnable = match.executionMode !== "disabled" && !overLimit && view.actions.length > 0;
  return view;
}

// Same limit rule as the chat processing: matches are charged in priority order, a chat button costs nothing.
export function markActionLimit(reports, maxActions) {
  const overLimit = new Set();
  let executed = 0;
  for (const report of reports) {
    if (!report.matched || hasNothingToRun(report.match)) continue;
    if (exceedsActionLimit(report.match, executed, maxActions)) {
      overLimit.add(report);
      continue;
    }
    if (COUNTED_MODES.has(report.match.executionMode)) executed += getMatchActionCost(report.match);
  }
  return overLimit;
}

function renderOptions(choices, selected) {
  return Object.entries(choices)
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function localizeChoices(choices) {
  return Object.fromEntries(Object.entries(choices).map(([value, key]) => [value, localize(key)]));
}

function getSortedChoices(collection, emptyLabel) {
  const entries = Array.from(collection ?? [])
    .filter((entry) => entry?.id)
    .map((entry) => [String(entry.id), String(entry.name ?? entry.id)])
    .sort(([, left], [, right]) => left.localeCompare(right, game.i18n?.lang));
  return emptyLabel == null ? Object.fromEntries(entries) : { "": emptyLabel, ...Object.fromEntries(entries) };
}

export function renderDiceInputs(formula, fixed = {}) {
  let dice = [];
  try {
    dice = new Roll(formula).dice;
  } catch (_error) {
    return `<p class="srt-bench-note is-warning">${escapeHtml(format("TestBench.InvalidFormula", { formula }))}</p>`;
  }

  const { slots, truncated } = describeFormulaDice(dice);
  if (!slots.length) return `<p class="srt-bench-note">${escapeHtml(localize("TestBench.DiceNone"))}</p>`;

  const random = escapeHtml(localize("TestBench.Random"));
  const inputs = slots.map((slot) => `
        <label class="srt-bench-die">
          <span class="srt-bench-die__label">d${slot.faces}</span>
          <input type="number" min="1" max="${slot.faces}" step="1" data-srt-bench-die="${escapeHtml(slot.key)}" data-faces="${slot.faces}" value="${escapeHtml(fixed[slot.key] ?? "")}" placeholder="${random}">
        </label>`).join("");
  const limit = truncated ? `<p class="srt-bench-note">${escapeHtml(format("TestBench.DiceLimit", { count: MAX_FIXED_DICE }))}</p>` : "";
  return `<div class="srt-bench-dice">${inputs}</div>${limit}`;
}

export function renderBenchForm(state, { actors = {}, users = {}, targetCount = 0, moduleEnabled = true } = {}) {
  const field = (labelKey, control, extraClass = "") => `
      <div class="form-group${extraClass}">
        <label>${escapeHtml(localize(labelKey))}</label>
        ${control}
      </div>`;
  const visibilityChoices = Object.fromEntries(BENCH_VISIBILITIES.map((value) => [value, localize(FILTER_VISIBILITY_CHOICES[value])]));
  const degreeChoices = { "": localize("TestBench.DegreeNone"), ...localizeChoices(SUCCESS_DEGREE_CHOICES) };

  return `
    <section class="srt-panel srt-bench-form">
      <p class="srt-panel-hint">${escapeHtml(localize("TestBench.Intro"))}</p>
      ${moduleEnabled ? "" : `<p class="srt-bench-note is-warning">${escapeHtml(localize("TestBench.ModuleDisabled"))}</p>`}
      ${field("TestBench.Formula", `<input type="text" name="formula" value="${escapeHtml(state.formula)}" spellcheck="false">`)}
      <div class="form-group srt-dialog-field--stacked">
        <label title="${escapeHtml(localize("TestBench.DiceHint"))}">${escapeHtml(localize("TestBench.Dice"))}</label>
        <div data-srt-bench-dice>${renderDiceInputs(state.formula, state.fixed)}</div>
      </div>
      <div class="srt-bench-grid">
        ${field("TestBench.RollType", `<select name="rollType">${renderOptions(localizeChoices(ROLL_TYPE_CHOICES), state.rollType)}</select>`)}
        ${field("TestBench.Visibility", `<select name="visibility">${renderOptions(visibilityChoices, state.visibility)}</select>`)}
        ${field("TestBench.Actor", `<select name="actorId">${renderOptions(actors, state.actorId)}</select>`)}
        ${field("TestBench.User", `<select name="userId">${renderOptions(users, state.userId)}</select>`)}
        ${field("TestBench.Degree", `<select name="degree">${renderOptions(degreeChoices, state.degree)}</select>`)}
        ${field("TestBench.InCombat", `<input type="checkbox" name="inCombat"${state.inCombat ? " checked" : ""}>`, " srt-bench-check")}
      </div>
      <p class="srt-bench-note">${escapeHtml(format("TestBench.Targets", { count: targetCount }))}</p>
      <div class="srt-toolbar srt-bench-toolbar">
        <button type="button" class="srt-inline-action" data-action="rollToChat" title="${escapeHtml(localize("TestBench.RollToChatHint"))}">
          <i class="fa-solid fa-comment-dots" aria-hidden="true"></i>
          <span>${escapeHtml(localize("TestBench.RollToChat"))}</span>
        </button>
        <button type="button" class="srt-inline-action is-primary" data-action="simulate">
          <i class="fa-solid fa-flask" aria-hidden="true"></i>
          <span>${escapeHtml(localize("TestBench.Simulate"))}</span>
        </button>
      </div>
    </section>`;
}

const STATUS_LABEL_KEYS = {
  match: "TestBench.Status.Match",
  miss: "TestBench.Status.Miss",
  off: "TestBench.Status.Off",
  stopped: "TestBench.Status.Stopped"
};

export function renderBenchResults(run) {
  if (!run) {
    return `<section class="srt-panel srt-bench-results"><p class="srt-empty-copy">${escapeHtml(localize("TestBench.Empty"))}</p></section>`;
  }
  if (run.error) {
    return `<section class="srt-panel srt-bench-results"><p class="srt-bench-note is-warning">${escapeHtml(run.error)}</p></section>`;
  }

  const summary = `
      <div class="srt-bench-summary">
        <span><strong>${escapeHtml(localize("TestBench.RollLabel"))}:</strong> ${escapeHtml(run.formula)} = ${escapeHtml(run.total ?? "-")}</span>
        <span><strong>${escapeHtml(localize("TestBench.DiceLabel"))}:</strong> ${escapeHtml(run.diceText || "-")}</span>
      </div>`;

  const cards = run.views.map((view) => {
    const badgeClass = view.status === "match" ? "srt-badge--enabled" : view.status === "miss" ? "srt-badge--disabled" : "";
    const conditions = view.conditions.map((condition) => `
          <li class="${condition.passed ? "is-passed" : "is-failed"}">
            <i class="fa-solid ${condition.passed ? "fa-check" : "fa-xmark"}" aria-hidden="true"></i>
            <span>${escapeHtml(condition.label)}</span>
          </li>`).join("");
    const reasons = view.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
    const meta = view.status === "match" ? `
          <div class="srt-card-meta"><span class="srt-card-meta-label">${escapeHtml(localize("Manager.Execution"))}</span><span class="srt-card-meta-separator">:</span> ${escapeHtml(view.mode)}</div>
          <div class="srt-card-meta"><span class="srt-card-meta-label">${escapeHtml(localize("Manager.ActionLabel"))}</span><span class="srt-card-meta-separator">:</span> ${escapeHtml(view.actions.join(" + ") || localize("Action.None"))}</div>` : "";

    return `
        <article class="srt-card srt-bench-card is-${view.status}">
          <div class="srt-card-header">
            <div class="srt-card-head"><h3>${escapeHtml(view.name)}</h3></div>
            <span class="srt-badge ${badgeClass}">${escapeHtml(localize(STATUS_LABEL_KEYS[view.status]))}</span>
          </div>
          ${conditions ? `<ul class="srt-bench-conditions">${conditions}</ul>` : ""}
          ${reasons ? `<ul class="srt-bench-reasons">${reasons}</ul>` : ""}
          ${meta}
        </article>`;
  }).join("");

  const runnable = run.views.filter((view) => view.runnable).length;
  const footer = `
      <div class="srt-bench-run">
        <p class="srt-bench-note">${escapeHtml(localize("TestBench.RunActionsHint"))}</p>
        <button type="button" class="srt-inline-action is-danger" data-action="runActions"${runnable ? "" : " disabled"}>
          <i class="fa-solid fa-bolt" aria-hidden="true"></i>
          <span>${escapeHtml(localize("TestBench.RunActions"))}</span>
        </button>
      </div>`;

  const list = run.views.length
    ? `<div class="srt-card-list">${cards}</div>`
    : `<p class="srt-empty-copy">${escapeHtml(localize("TestBench.NoTriggers"))}</p>`;

  return `<section class="srt-panel srt-bench-results">${summary}${list}${footer}</section>`;
}

let benchClass = null;
let benchApp = null;

// The class is built on first use: foundry.applications.api only exists in the browser, the unit tests load this file in Node.
function getTestBenchClass() {
  if (benchClass) return benchClass;
  const { ApplicationV2, DialogV2 } = foundry.applications.api;

  benchClass = class SRTTestBench extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-test-bench`,
      classes: ["srt-window", "srt-bench-window"],
      window: { icon: "fa-solid fa-flask", resizable: true },
      position: { width: 640, height: 760 },
      actions: {
        simulate: SRTTestBench.#onSimulate,
        runActions: SRTTestBench.#onRunActions,
        rollToChat: SRTTestBench.#onRollToChat
      }
    };

    constructor(options = {}) {
      super(options);
      this.describeCondition = typeof options.describeCondition === "function" ? options.describeCondition : undefined;
      this.benchState = getDefaultBenchState();
      this.lastRun = null;
    }

    get title() {
      return localize("TestBench.Title");
    }

    async _renderFrame(options) {
      const frame = await super._renderFrame(options);
      addSettingsGear(frame);
      return frame;
    }

    async _prepareContext() {
      const settings = createSettingsFacade();
      return {
        state: this.benchState,
        run: this.lastRun?.view ?? null,
        actors: getSortedChoices(game.actors, localize("TestBench.ActorNone")),
        users: getSortedChoices(game.users, null),
        targetCount: getCurrentTargetUuids().length,
        moduleEnabled: settings.enabled
      };
    }

    async _renderHTML(context) {
      return `
        <div class="srt-app srt-bench" data-ui-theme="${escapeHtml(getThemePreference())}">
          ${renderBenchForm(context.state, context)}
          <div data-srt-bench-results>${renderBenchResults(context.run)}</div>
        </div>`;
    }

    _replaceHTML(result, content) {
      content.innerHTML = result;
      const element = this.element;
      const theme = getThemePreference();
      element.dataset.uiTheme = theme;
      element.classList.toggle("is-theme-foundry", theme === "foundry");
      element.classList.toggle("is-theme-signature", theme !== "foundry");

      const formula = content.querySelector('input[name="formula"]');
      formula?.addEventListener("change", () => {
        this.readForm();
        const container = content.querySelector("[data-srt-bench-dice]");
        if (container) container.innerHTML = renderDiceInputs(this.benchState.formula, this.benchState.fixed);
      });
    }

    readForm() {
      const root = this.element;
      const value = (name) => String(root.querySelector(`[name="${name}"]`)?.value ?? "");
      const fixed = {};
      for (const input of root.querySelectorAll("[data-srt-bench-die]")) {
        if (String(input.value ?? "").trim()) fixed[input.dataset.srtBenchDie] = String(input.value).trim();
      }

      this.benchState = {
        formula: value("formula").trim() || "1d20",
        fixed,
        rollType: value("rollType") || "any",
        actorId: value("actorId"),
        userId: value("userId") || game.user?.id || "",
        visibility: value("visibility") || "public",
        degree: value("degree"),
        inCombat: Boolean(root.querySelector('[name="inCombat"]')?.checked)
      };
      return this.benchState;
    }

    getStateKey() {
      return JSON.stringify(this.benchState);
    }

    // Builds the roll with the fixed dice, the roll event and the trigger reports. Nothing is executed.
    async simulate() {
      const state = this.readForm();
      const key = this.getStateKey();

      if (!Roll.validate(state.formula)) {
        this.lastRun = { key, view: { error: format("TestBench.InvalidFormula", { formula: state.formula }) } };
        return this.showResults();
      }
      const { slots } = describeFormulaDice(new Roll(state.formula).dice);
      const invalid = getInvalidFixedSlots(slots, state.fixed);
      if (invalid.length) {
        this.lastRun = { key, view: { error: format("TestBench.InvalidDie", { faces: invalid[0].faces }) } };
        return this.showResults();
      }

      const actor = resolveBenchActor(state.actorId);
      const user = game.users?.get?.(state.userId) ?? game.user;
      const roll = await evaluateBenchRoll(state);
      const speaker = buildSpeaker(actor, user);
      const message = buildBenchMessage({
        roll,
        // An unlinked token on the scene speaks with its own synthetic actor, like in a real message.
        actor: actor ? ChatMessage.getSpeakerActor(speaker) ?? actor : null,
        speaker,
        userId: user?.id ?? null,
        visibility: state.visibility
      });

      const [event] = new GenericRollAdapter().extractRollEvents(message, getEventOverrides(state, getCurrentTargetUuids()));
      const settings = createSettingsFacade();
      const reports = simulateTriggers(settings.getTriggers(), event, {
        defaultExecutionMode: settings.defaultExecutionMode,
        respectPrivateRolls: settings.respectPrivateRolls
      });
      const maxActions = settings.maxActionsPerMessage;
      const overLimit = markActionLimit(reports, maxActions);
      const views = reports.map((report) => describeReport(report, {
        describeCondition: this.describeCondition,
        overLimit: overLimit.has(report),
        maxActions
      }));

      this.lastRun = {
        key,
        roll,
        event,
        reports,
        views,
        view: {
          formula: roll.formula,
          total: roll.total,
          diceText: event.diceResults.map((entry) => `d${entry.faces}: ${entry.value}`).join(", "),
          views
        }
      };
      return this.showResults();
    }

    showResults() {
      const container = this.element?.querySelector("[data-srt-bench-results]");
      if (container) container.innerHTML = renderBenchResults(this.lastRun?.view ?? null);
      return this.lastRun;
    }

    async ensureCurrentRun() {
      this.readForm();
      if (!this.lastRun?.roll || this.lastRun.key !== this.getStateKey()) await this.simulate();
      return this.lastRun?.roll ? this.lastRun : null;
    }

    static async #onSimulate() {
      try {
        await this.simulate();
      } catch (error) {
        console.error(`${MODULE_ID} | Test bench simulation failed`, error);
        ui.notifications?.error(String(error?.message ?? error));
      }
    }

    // Runs the actions of the matching triggers for real, after a confirmation. Disabled triggers and triggers over
    // the action limit are left out, every other execution mode runs right away.
    static async #onRunActions() {
      const run = await this.ensureCurrentRun();
      if (!run) return;
      const runnable = run.reports.filter((report, index) => run.views[index]?.runnable);
      if (!runnable.length) return;

      const confirmed = await DialogV2.confirm({
        window: { title: localize("TestBench.RunConfirmTitle") },
        content: `<p>${escapeHtml(format("TestBench.RunConfirmContent", { count: runnable.length }))}</p>`
      });
      if (!confirmed) return;

      const settings = createSettingsFacade();
      let ran = 0;
      for (const report of runnable) {
        try {
          await executeMatch(report.match, {
            allowDeferred: false,
            forceExecutionMode: "automatic",
            storeTriggeredInChat: false,
            respectPrivateRolls: settings.respectPrivateRolls
          });
          ran += 1;
        } catch (error) {
          console.error(`${MODULE_ID} | Test bench action failed`, error, report.match);
        }
      }
      ui.notifications?.info(format("TestBench.Ran", { count: ran }));
    }

    // Posts a real roll with the bench dice, so the whole chat pipeline runs. The roll type and success degree
    // travel as roll options, visibility as the message mode. Combat state and roller are the real ones.
    static async #onRollToChat() {
      const run = await this.ensureCurrentRun();
      if (!run) return;

      const actor = resolveBenchActor(this.benchState.actorId);
      await run.roll.toMessage({
        speaker: buildSpeaker(actor, game.user),
        flavor: escapeHtml(localize("TestBench.ChatFlavor"))
      }, getMessageModeOption(this.benchState.visibility));
      ui.notifications?.info(localize("TestBench.RollPosted"));
    }

    async close(options = {}) {
      if (benchApp === this) benchApp = null;
      return super.close(options);
    }
  };

  return benchClass;
}

export async function openTestBench(options = {}) {
  if (!game.user?.isGM) return null;
  await ensureModuleTranslationsLoaded();
  if (benchApp?.rendered) {
    benchApp.bringToFront?.();
    return benchApp;
  }
  const BenchClass = getTestBenchClass();
  benchApp = new BenchClass(options);
  await benchApp.render({ force: true });
  return benchApp;
}

export const __test__ = {
  MAX_FIXED_DICE,
  BENCH_VISIBILITIES,
  FILTER_LABEL_KEYS,
  MODE_LABEL_KEYS,
  getDefaultBenchState,
  describeFormulaDice,
  parseFixedValue,
  getInvalidFixedSlots,
  buildFixedResultMap,
  applyFixedResults,
  getMessageModeOption,
  buildBenchMessage,
  getRollOptions,
  getEventOverrides,
  describeReport,
  markActionLimit,
  renderDiceInputs,
  renderBenchForm,
  renderBenchResults,
  getTestBenchClass,
  resetTestBenchClass() {
    benchClass = null;
    benchApp = null;
  }
};
