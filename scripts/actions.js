import { localize, MODULE_ID } from "./settings.js";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#x27;" };

// Marks chat messages that a trigger action posted itself (roll table cards contain a roll).
export const TRIGGER_OUTPUT_FLAG = "triggerOutput";

// foundry.utils.escapeHTML exists in v13 and v14. The fallback uses the same table for unit tests.
export function escapeHtml(value) {
  const text = String(value ?? "");
  const escape = globalThis.foundry?.utils?.escapeHTML;
  if (typeof escape === "function") return escape(text);
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

// The template itself is GM-authored HTML. Only the substituted values (actor, user, trigger names...) are escaped.
export function renderTemplateString(template, context) {
  return String(template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token) => {
    const parts = token.split(".");
    let current = context;
    for (const part of parts) current = current?.[part];
    return current == null ? "" : escapeHtml(current);
  });
}

// Same placeholders without HTML escaping, for plain text targets: roll formulas, resource values and image
// captions (the image popout escapes its caption itself).
export function renderPlainTemplateString(template, context) {
  return String(template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token) => {
    const parts = token.split(".");
    let current = context;
    for (const part of parts) current = current?.[part];
    return current == null ? "" : String(current);
  });
}

export const ACTION_LABEL_KEYS = Object.freeze({
  "chat-message": "Action.ChatMessage",
  "roll-table": "Action.RollTable",
  macro: "Action.Macro",
  "journal-link": "Action.JournalLink",
  "gm-note": "Action.GmNote",
  "play-sound": "Action.PlaySound",
  "apply-effect": "Action.ApplyEffect",
  "change-resource": "Action.ChangeResource",
  "show-image": "Action.ShowImage",
  "roll-formula": "Action.RollFormula"
});

export const ACTION_VISIBILITY_LABEL_KEYS = Object.freeze({
  public: "Visibility.Public",
  gm: "Visibility.Gm",
  player: "Visibility.Player"
});

export const RESOURCE_OPERATIONS = Object.freeze(["add", "subtract", "set"]);
export const EFFECT_TARGETS = Object.freeze(["actor", "targets"]);
export const DEFAULT_SOUND_VOLUME = 0.8;

// Actions without a visibility choice. Every other action shows "(visibility)" in its summary.
const ACTIONS_WITHOUT_VISIBILITY = new Set(["macro", "gm-note", "apply-effect", "change-resource"]);

function buildTemplateContext(event, trigger, extra = {}) {
  return {
    trigger: {
      id: trigger?.id ?? null,
      name: trigger?.name ?? null
    },
    actor: {
      id: event.actorId,
      name: event.actorName
    },
    user: {
      id: event.userId,
      name: event.user?.name ?? null
    },
    roll: {
      formula: event.formula,
      total: event.total,
      type: event.rollType,
      results: event.diceResults?.map((entry) => entry.value).join(", ") ?? ""
    },
    system: {
      id: event.systemId,
      version: event.systemVersion
    },
    ...extra
  };
}

function cloneJsonSafe(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

async function resolveDocumentReference(reference, collections = []) {
  const ref = String(reference ?? "").trim();
  if (!ref) return null;

  if (typeof fromUuid === "function" && ref.includes(".")) {
    const document = await fromUuid(ref);
    if (document) return document;
  }

  for (const collection of collections) {
    if (!collection) continue;
    const direct = collection.get?.(ref);
    if (direct) return direct;
    const byName = collection.find?.((candidate) => candidate?.name === ref);
    if (byName) return byName;
  }

  return null;
}

function serializeEventForDeferred(event) {
  return {
    adapterId: event.adapterId ?? null,
    systemId: event.systemId ?? null,
    systemVersion: event.systemVersion ?? null,
    messageId: event.messageId ?? null,
    messageUuid: event.messageUuid ?? null,
    rollIndex: event.rollIndex ?? null,
    rollType: event.rollType ?? "any",
    successDegree: event.successDegree ?? null,
    actorId: event.actorId ?? null,
    actorName: event.actorName ?? null,
    actorType: event.actorType ?? "none",
    itemId: event.itemId ?? null,
    itemName: event.itemName ?? null,
    tokenId: event.tokenId ?? null,
    targetUuids: Array.isArray(event.targetUuids) ? [...event.targetUuids] : [],
    userId: event.userId ?? null,
    visibility: event.visibility ?? "public",
    rollMode: event.rollMode ?? "publicroll",
    isCombat: Boolean(event.isCombat),
    sceneId: event.sceneId ?? null,
    formula: event.formula ?? "",
    total: event.total ?? null,
    diceTerms: cloneJsonSafe(event.diceTerms ?? []),
    diceResults: cloneJsonSafe(event.diceResults ?? []),
    flags: cloneJsonSafe(event.flags ?? {})
  };
}

function serializeTriggerForDeferred(trigger) {
  return {
    id: trigger?.id ?? null,
    name: trigger?.name ?? null,
    description: trigger?.description ?? "",
    category: trigger?.category ?? "house-rule",
    enabled: trigger?.enabled !== false,
    priority: Number(trigger?.priority ?? 0),
    oncePerMessage: trigger?.oncePerMessage !== false,
    allowMultipleMatches: Boolean(trigger?.allowMultipleMatches),
    stopLowerPriority: Boolean(trigger?.stopLowerPriority),
    executionMode: trigger?.executionMode ?? "chat-button",
    visibilityMode: trigger?.visibilityMode ?? "inherit",
    source: trigger?.source ?? "user"
  };
}

export function serializeDeferredMatch(match) {
  return {
    triggerId: match.trigger.id,
    triggerName: match.trigger.name,
    rollIndex: match.event.rollIndex,
    executionMode: match.executionMode,
    actions: cloneJsonSafe(match.actions ?? []),
    trigger: serializeTriggerForDeferred(match.trigger),
    event: serializeEventForDeferred(match.event),
    executed: false
  };
}

export function hydrateDeferredMatch(entry) {
  if (!entry?.trigger || !entry?.event) return null;

  return {
    trigger: cloneJsonSafe(entry.trigger),
    event: cloneJsonSafe(entry.event),
    actions: cloneJsonSafe(entry.actions ?? []),
    executionMode: entry.executionMode ?? entry.trigger.executionMode ?? "chat-button"
  };
}

function buildWhisperRecipients(mode, event, action) {
  if (mode === "public") return [];
  if (mode === "gm") return ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
  if (mode === "player" && event.userId) return [event.userId];
  if (mode === "custom") return Array.isArray(action.userIds) ? action.userIds : [];
  return [];
}

async function executeChatAction(event, trigger, action) {
  const content = renderTemplateString(action.template || action.message || "", buildTemplateContext(event, trigger));
  if (!content.trim()) return null;

  return ChatMessage.create({
    content,
    whisper: buildWhisperRecipients(action.visibility ?? "public", event, action)
  });
}

async function executeRollTableAction(event, trigger, action) {
  const tableRefs = Array.isArray(action.tables) && action.tables.length ? action.tables : action.table ? [action.table] : [];
  const tableCollection = game.tables ?? game.rollTables;
  const results = [];

  for (const tableRef of tableRefs) {
    let table = null;
    if (typeof fromUuid === "function" && typeof tableRef === "string" && tableRef.includes(".")) {
      table = await fromUuid(tableRef);
    }
    if (!table && tableCollection && typeof tableRef === "string") {
      table = tableCollection.get?.(tableRef) ?? tableCollection.find?.((candidate) => candidate?.name === tableRef) ?? null;
    }
    if (!table) continue;

    const draw = await table.draw({ displayChat: false });
    results.push({ table, draw });

    // Post Foundry's own result card (drawn text, image and roll) with the action's whisper recipients.
    // The card carries the table roll, so it is flagged as trigger output and not matched again.
    if (action.postResult !== false && draw?.results?.length) {
      const whisper = buildWhisperRecipients(action.visibility ?? "gm", event, action);
      await table.toMessage(draw.results, {
        roll: draw.roll,
        messageData: {
          whisper,
          flavor: buildRollTableFlavor(trigger, table, draw.results.length),
          flags: { [MODULE_ID]: { [TRIGGER_OUTPUT_FLAG]: { triggerId: trigger?.id ?? null } } }
        },
        messageOptions: getMessageModeOptions(whisper)
      });
    }
  }

  return results;
}

function buildRollTableFlavor(trigger, table, resultCount) {
  const tableName = escapeHtml(table.name);
  const drawFlavor = game.i18n?.format?.(`TABLE.DrawFlavor${resultCount > 1 ? "Plural" : ""}`, { number: resultCount, name: tableName }) ?? tableName;
  return `${escapeHtml(localize("Chat.TriggerReference"))} <strong>${escapeHtml(trigger?.name ?? "")}</strong>: ${drawFlavor}`;
}

// RollTable#toMessage and Roll#toMessage apply the creating client's current roll mode unless one is given, and a
// public mode clears the whisper list. v14 reads messageMode (rollMode logs a deprecation there), v13 reads rollMode.
// The private modes keep a non-empty whisper list, so "player" and "custom" recipients survive.
function getMessageModeOptions(whisper) {
  const isPrivate = whisper.length > 0;
  if (globalThis.CONFIG?.ChatMessage?.modes) return { messageMode: isPrivate ? "gm" : "public" };
  return { rollMode: isPrivate ? "gmroll" : "publicroll" };
}

async function executeMacroAction(event, trigger, action) {
  const macro = await resolveDocumentReference(action.macro, [game.macros]);
  if (!macro || typeof macro.execute !== "function") return null;

  return macro.execute({
    event: cloneJsonSafe(event),
    trigger: cloneJsonSafe(trigger),
    action: cloneJsonSafe(action),
    templateContext: buildTemplateContext(event, trigger, { action: cloneJsonSafe(action) })
  });
}

async function executeJournalLinkAction(event, trigger, action) {
  const document = await resolveDocumentReference(action.journal, [game.journal ?? game.journalEntries]);
  if (!document) return null;

  // The trigger editor saves an empty template when the field is left blank, which also means the default card.
  const content = renderTemplateString(
    String(action.template ?? "").trim() || `<div><strong>{{trigger.name}}</strong></div><div>@UUID[${document.uuid}]{${escapeHtml(document.name)}}</div>`,
    buildTemplateContext(event, trigger, {
      action: cloneJsonSafe(action),
      journal: {
        id: document.id ?? null,
        name: document.name ?? null,
        uuid: document.uuid ?? null
      }
    })
  );
  if (!content.trim()) return null;

  return ChatMessage.create({
    content,
    whisper: buildWhisperRecipients(action.visibility ?? "public", event, action)
  });
}

async function executeGmNoteAction(event, trigger, action) {
  const content = renderTemplateString(action.template || action.message || "", buildTemplateContext(event, trigger));
  if (!content.trim()) return null;

  return ChatMessage.create({
    content,
    whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id)
  });
}

function getGeneration() {
  const generation = Number(game.release?.generation ?? NaN);
  if (Number.isFinite(generation)) return generation;
  const parsed = Number.parseInt(String(game.version ?? "").split(".")[0] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getGmUserIds() {
  return ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
}

// Who sees or hears a sound or image. "public" plays on every client (the executing GM included), the other
// visibilities name users: the executing client shows it itself, everyone else gets it over the socket.
export function planAudience(visibility, event, action = {}, { selfId = null, gmIds = [] } = {}) {
  if (visibility === "public") return { local: true, broadcast: true, recipients: [] };

  let ids = [];
  if (visibility === "gm") ids = gmIds;
  else if (visibility === "player") ids = event?.userId ? [event.userId] : [];
  else if (visibility === "custom") ids = Array.isArray(action.userIds) ? action.userIds : [];

  const unique = [...new Set(ids.filter(Boolean))];
  return { local: unique.includes(selfId), broadcast: false, recipients: unique.filter((id) => id !== selfId) };
}

// The editor stores the volume as 0..1 (AudioHelper's scale). Missing or invalid values use the default.
export function normalizeVolume(value) {
  if (value === "" || value == null) return DEFAULT_SOUND_VOLUME;
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SOUND_VOLUME;
  return Math.min(Math.max(number, 0), 1);
}

async function executePlaySoundAction(event, trigger, action) {
  const src = String(action.sound ?? "").trim();
  if (!src) return null;

  const plan = planAudience(action.visibility ?? "public", event, action, { selfId: game.user?.id ?? null, gmIds: getGmUserIds() });
  const audioData = { src, volume: normalizeVolume(action.volume), autoplay: true, loop: false, channel: "interface" };
  const AudioHelper = foundry.audio.AudioHelper;

  // AudioHelper.play(data, true) plays here and on every other client. Named recipients get the core
  // "playAudio" socket event directly, so the executing GM does not hear a sound meant only for the roller.
  // The local playback is not awaited: it waits for the first user gesture while the browser audio is locked
  // (for example right after a reload) and would hold back every later action and trigger of the message.
  if (plan.recipients.length) game.socket.emit("playAudio", audioData, { recipients: plan.recipients });
  if (!plan.broadcast && !plan.local) return { played: false };
  const playback = AudioHelper.play(audioData, plan.broadcast);
  Promise.resolve(playback).catch((error) => console.warn(`[SRT] Sound "${src}" could not be played`, error));
  return { played: true };
}

async function executeShowImageAction(event, trigger, action) {
  const image = String(action.image ?? "").trim();
  if (!image) return null;

  const caption = renderPlainTemplateString(action.caption ?? "", buildTemplateContext(event, trigger)).trim();
  const title = String(trigger?.name ?? "");
  const plan = planAudience(action.visibility ?? "public", event, action, { selfId: game.user?.id ?? null, gmIds: getGmUserIds() });

  // Same payload as ImagePopout#shareImage. Without "users" the server sends it to every other client.
  // ImagePopout#shareImage is not called because it shows a "shown to all players" notice on every trigger.
  const shareConfig = { image, title, caption, uuid: null, showTitle: true };
  if (plan.broadcast) game.socket.emit("shareImage", shareConfig);
  else if (plan.recipients.length) game.socket.emit("shareImage", { ...shareConfig, users: plan.recipients });

  if (!plan.local) return null;
  const popout = new foundry.applications.apps.ImagePopout({ src: image, caption, showTitle: true, window: { title } });
  await popout.render(true);
  return popout;
}

// CONFIG.statusEffects is an array in v13. In v14 it is an array proxy that also has the ids as keys. find works in both.
export function findStatusEffect(statusId) {
  const id = String(statusId ?? "").trim();
  if (!id) return null;
  const statuses = globalThis.CONFIG?.statusEffects;
  if (!statuses || typeof statuses.find !== "function") return null;
  return statuses.find((status) => status?.id === id) ?? null;
}

export function getStatusEffectLabel(statusId) {
  const status = findStatusEffect(statusId);
  const label = status?.name ?? status?.label;
  return label ? String(game.i18n?.localize?.(label) ?? label) : String(statusId ?? "");
}

export function normalizeEffectRounds(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// v13 stores the duration as {rounds}, v14 as {value, units, expiry}. Foundry fills in the start round itself.
export function buildEffectDuration(rounds, generation = getGeneration()) {
  if (generation >= 14) return { value: rounds, units: "rounds", expiry: "turnStart" };
  return { rounds };
}

// Copy of an existing Active Effect for another actor: new id, no old start data, optional duration in rounds.
// The flag marks the copy, so the same source effect is not added twice.
export function prepareEffectCopy(data, { rounds = null, generation = getGeneration(), sourceUuid = null } = {}) {
  const copy = cloneJsonSafe(data ?? {});
  delete copy._id;
  delete copy.start;
  copy.disabled = false;
  copy.transfer = false;
  if (copy.duration && typeof copy.duration === "object") {
    for (const key of ["startTime", "startRound", "startTurn", "combat", "expired"]) delete copy.duration[key];
  }
  if (rounds) copy.duration = buildEffectDuration(rounds, generation);
  if (sourceUuid) {
    copy.origin ??= sourceUuid;
    copy.flags ??= {};
    copy.flags[MODULE_ID] = { ...(copy.flags[MODULE_ID] ?? {}), sourceEffect: sourceUuid };
  }
  return copy;
}

// Deferred matches store ids only, so the actor is looked up again: the speaker token first (unlinked tokens have
// their own synthetic actor), then the world actor.
async function resolveEventActor(event) {
  if (event?.actor && typeof event.actor.update === "function") return event.actor;
  const token = event?.sceneId && event?.tokenId ? game.scenes?.get?.(event.sceneId)?.tokens?.get?.(event.tokenId) : null;
  if (token?.actor) return token.actor;
  return event?.actorId ? game.actors?.get?.(event.actorId) ?? null : null;
}

async function resolveTargetActors(event) {
  const actors = [];
  for (const uuid of Array.isArray(event?.targetUuids) ? event.targetUuids : []) {
    const document = typeof fromUuid === "function" ? await fromUuid(uuid) : null;
    const actor = document?.documentName === "Actor" ? document : document?.actor ?? null;
    if (actor && !actors.includes(actor)) actors.push(actor);
  }
  return actors;
}

async function applyStatusToActor(actor, statusId, rounds) {
  // An actor that already has the status keeps it unchanged (toggleStatusEffect would remove it).
  if (actor.statuses?.has?.(statusId)) return null;
  const created = await actor.toggleStatusEffect(statusId, { active: true });
  if (!rounds) return created;

  const effect = typeof created?.update === "function"
    ? created
    : actor.effects?.find?.((candidate) => candidate?.statuses?.has?.(statusId)) ?? null;
  await effect?.update?.({ duration: buildEffectDuration(rounds) });
  return effect ?? created;
}

async function applyEffectCopyToActor(actor, source, rounds) {
  const alreadyApplied = actor.effects?.some?.((effect) => effect?.getFlag?.(MODULE_ID, "sourceEffect") === source.uuid);
  if (alreadyApplied) return null;
  const data = prepareEffectCopy(source.toObject(), { rounds, sourceUuid: source.uuid });
  const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return created ?? null;
}

async function executeApplyEffectAction(event, trigger, action) {
  const statusId = String(action.status ?? "").trim();
  const effectUuid = String(action.effectUuid ?? "").trim();
  const rounds = normalizeEffectRounds(action.rounds);
  if (statusId && !findStatusEffect(statusId)) return null;

  let source = null;
  if (!statusId) {
    source = effectUuid && typeof fromUuid === "function" ? await fromUuid(effectUuid) : null;
    if (source?.documentName !== "ActiveEffect") return null;
  }

  const actors = action.target === "targets"
    ? await resolveTargetActors(event)
    : [await resolveEventActor(event)].filter(Boolean);

  const results = [];
  for (const actor of actors) {
    results.push(statusId ? await applyStatusToActor(actor, statusId, rounds) : await applyEffectCopyToActor(actor, source, rounds));
  }
  return results;
}

const UNSAFE_PATH_PARTS = new Set(["__proto__", "prototype", "constructor"]);

// Only system data may be changed, never names, ownership or flags of other modules.
export function isSafeResourcePath(path) {
  const text = String(path ?? "").trim();
  if (!/^system(\.[A-Za-z0-9_-]+)+$/.test(text)) return false;
  return text.split(".").every((part) => !UNSAFE_PATH_PARTS.has(part));
}

// "system.resources.heroism.value" has its bounds next to it: ".max" and ".min".
export function getResourceBoundPath(path, bound) {
  const text = String(path ?? "").trim();
  if (!text.endsWith(".value")) return null;
  return `${text.slice(0, -".value".length)}.${bound}`;
}

// The new value of a resource, or null when the current value is neither a number nor a yes/no field.
// With a maximum the result stays between the minimum (0 when there is none) and the maximum.
// Yes/no fields such as dnd5e inspiration: add or set turns them on, subtract or set to 0 turns them off.
export function computeResourceChange(current, operation, amount, { min = null, max = null } = {}) {
  if (!RESOURCE_OPERATIONS.includes(operation) || !Number.isFinite(amount)) return null;

  if (typeof current === "boolean") {
    if (operation === "set") return amount !== 0;
    if (amount === 0) return current;
    return operation === "add" ? amount > 0 : amount < 0;
  }

  const base = typeof current === "number"
    ? current
    : typeof current === "string" && current.trim() !== "" ? Number(current) : NaN;
  if (!Number.isFinite(base)) return null;

  let next = operation === "set" ? amount : operation === "add" ? base + amount : base - amount;
  const upper = Number(max);
  if (max != null && max !== "" && Number.isFinite(upper)) {
    const lower = min != null && min !== "" && Number.isFinite(Number(min)) ? Number(min) : 0;
    next = Math.min(Math.max(next, lower), upper);
  }
  return next;
}

// The value may use placeholders, for example {{roll.total}}.
export function parseResourceAmount(value, context = {}) {
  const text = renderPlainTemplateString(value ?? "", context).trim();
  if (!text) return NaN;
  return Number(text);
}

async function executeChangeResourceAction(event, trigger, action) {
  const path = String(action.path ?? "").trim();
  if (!isSafeResourcePath(path)) return null;
  const actor = await resolveEventActor(event);
  if (!actor) return null;

  const getProperty = foundry.utils.getProperty;
  const amount = parseResourceAmount(action.value, buildTemplateContext(event, trigger));
  const minPath = getResourceBoundPath(path, "min");
  const maxPath = getResourceBoundPath(path, "max");
  const next = computeResourceChange(getProperty(actor, path), action.operation, amount, {
    min: minPath ? getProperty(actor, minPath) : null,
    max: maxPath ? getProperty(actor, maxPath) : null
  });
  if (next === null) return null;

  return actor.update({ [path]: next });
}

async function executeRollFormulaAction(event, trigger, action) {
  const context = buildTemplateContext(event, trigger);
  const formula = renderPlainTemplateString(action.formula ?? "", context).trim();
  if (!formula || !Roll.validate(formula)) return null;

  // Automatic rolls never wait for manual dice entry on the GM client.
  const roll = await new Roll(formula).evaluate({ allowInteractive: false });
  const actor = await resolveEventActor(event);
  const whisper = buildWhisperRecipients(action.visibility ?? "public", event, action);
  const flavor = renderTemplateString(action.flavor ?? "", context).trim()
    || `${escapeHtml(localize("Chat.TriggerReference"))} <strong>${escapeHtml(trigger?.name ?? "")}</strong>`;

  // The trigger output flag keeps this roll from firing triggers again. Without an actor the message has no
  // speaker, like the other trigger messages (getSpeaker() would pick a token the GM happens to control).
  return roll.toMessage({
    ...(actor ? { speaker: ChatMessage.getSpeaker({ actor }) } : {}),
    flavor,
    whisper,
    flags: { [MODULE_ID]: { [TRIGGER_OUTPUT_FLAG]: { triggerId: trigger?.id ?? null } } }
  }, getMessageModeOptions(whisper));
}

function getResourceOperationSign(operation) {
  if (operation === "subtract") return "-";
  if (operation === "set") return "=";
  return "+";
}

// One localized line per action for the manager cards, the confirm dialog and the test bench.
export function describeAction(action) {
  const type = action?.type;
  const labelKey = ACTION_LABEL_KEYS[type];
  if (!labelKey) return String(type ?? "");

  const label = localize(labelKey);
  const visibility = localize(ACTION_VISIBILITY_LABEL_KEYS[action.visibility] ?? "Visibility.Public");

  if (type === "apply-effect") {
    const subject = action.status ? getStatusEffectLabel(action.status) : String(action.effectUuid ?? "");
    const target = localize(action.target === "targets" ? "EffectTarget.Targets" : "EffectTarget.Actor");
    return `${label}: ${subject} (${target})`;
  }
  if (type === "change-resource") {
    return `${label}: ${action.path ?? ""} ${getResourceOperationSign(action.operation)}${action.value ?? ""}`;
  }
  if (type === "roll-formula") return `${label}: ${action.formula ?? ""} (${visibility})`;
  if (ACTIONS_WITHOUT_VISIBILITY.has(type)) return label;
  return `${label} (${visibility})`;
}

export function summarizeActions(actions) {
  return (actions ?? []).map((action) => describeAction(action));
}

// DialogV2 in v13 and v14 (the V1 Dialog logs a deprecation warning). Closing the dialog counts as no.
async function confirmDialog(title, content) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.confirm === "function") {
    const confirmed = await DialogV2.confirm({ window: { title }, content, yes: { default: true }, rejectClose: false });
    return confirmed === true;
  }
  if (typeof globalThis.Dialog?.confirm !== "function") return true;
  return Boolean(await globalThis.Dialog.confirm({ title, content, yes: () => true, no: () => false, defaultYes: true }));
}

export async function confirmExecution(match) {
  if (!game.user?.isGM) return false;

  const actionList = summarizeActions(match.actions).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
  const content = `
    <div>
      <p><strong>${localize("Dialog.Trigger")}</strong>: ${escapeHtml(match.trigger.name)}</p>
      <p><strong>${localize("Dialog.Actor")}</strong>: ${escapeHtml(match.event.actorName ?? "-")}</p>
      <p><strong>${localize("Dialog.Roll")}</strong>: ${escapeHtml(match.event.formula)} = ${escapeHtml(match.event.total ?? "-")}</p>
      <p><strong>${localize("Dialog.Actions")}</strong></p>
      <ul>${actionList}</ul>
    </div>
  `;

  return confirmDialog(localize("Dialog.ConfirmTitle"), content);
}

// visibilityMode "inherit" (the trigger default) keeps follow-up output of private, self and blind rolls private
// while "Respect private rolls" is on. Any other mode, for example "action", uses the action's own visibility.
export function resolveActionVisibility(visibility, match, options = {}) {
  if (!options.respectPrivateRolls) return visibility;
  if ((match?.trigger?.visibilityMode ?? "inherit") !== "inherit") return visibility;

  const rollVisibility = match?.event?.visibility ?? "public";
  if (rollVisibility === "public") return visibility;
  if (visibility === "public") return "gm";
  // Players must not learn the outcome of a blind roll, not even by whisper.
  if (rollVisibility === "blind") return "gm";
  return visibility;
}

function applyActionVisibility(action, match, options) {
  const visibility = action.visibility ?? (action.type === "roll-table" ? "gm" : "public");
  const resolved = resolveActionVisibility(visibility, match, options);
  return resolved === action.visibility ? action : { ...action, visibility: resolved };
}

const ACTION_EXECUTORS = {
  "chat-message": executeChatAction,
  "roll-table": executeRollTableAction,
  macro: executeMacroAction,
  "journal-link": executeJournalLinkAction,
  "gm-note": executeGmNoteAction,
  "play-sound": executePlaySoundAction,
  "apply-effect": executeApplyEffectAction,
  "change-resource": executeChangeResourceAction,
  "show-image": executeShowImageAction,
  "roll-formula": executeRollFormulaAction
};

export async function executeMatch(match, options = {}) {
  const mode = options.forceExecutionMode ?? match.executionMode;
  if (mode === "disabled") return { skipped: true, reason: "disabled" };
  if (mode === "confirm-gm") {
    const confirmed = await confirmExecution(match);
    if (!confirmed) return { skipped: true, reason: "cancelled" };
  }
  if (mode === "gm-whisper-log") {
    await ChatMessage.create({
      whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id),
      content: `<div><strong>${escapeHtml(match.trigger.name)}</strong>: ${escapeHtml(match.event.formula)} = ${escapeHtml(match.event.total ?? "-")}</div>`
    });
    return { skipped: false, mode };
  }
  if (mode === "chat-button" && options.allowDeferred !== false) return { deferred: true, mode };

  const results = [];
  for (const configuredAction of match.actions ?? []) {
    const action = applyActionVisibility(configuredAction, match, options);
    const executor = ACTION_EXECUTORS[action.type];
    if (!executor) continue;
    results.push(await executor(match.event, match.trigger, action));
  }

  return { skipped: false, mode, results, storedOnMessage: options.storeTriggeredInChat === true };
}

export async function storeDeferredMatches(message, matches) {
  const payload = matches.map((match) => serializeDeferredMatch(match));

  await message.setFlag(MODULE_ID, "deferredMatches", payload);
}

export async function markDeferredMatchExecuted(message, triggerId) {
  const deferredMatches = cloneJsonSafe(message.getFlag?.(MODULE_ID, "deferredMatches") ?? []);
  let changed = false;

  for (const entry of deferredMatches) {
    if (entry?.triggerId !== triggerId || entry.executed) continue;
    entry.executed = true;
    changed = true;
    break;
  }

  if (changed) await message.setFlag(MODULE_ID, "deferredMatches", deferredMatches);
  return changed;
}