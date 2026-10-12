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
        messageOptions: getTableMessageOptions(whisper)
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

// RollTable#toMessage applies the creating client's current roll mode unless one is given, and a public mode
// clears the whisper list. v14 reads messageMode (rollMode logs a deprecation there), v13 reads rollMode.
// The private modes keep a non-empty whisper list, so "player" and "custom" recipients survive.
function getTableMessageOptions(whisper) {
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

export function summarizeActions(actions) {
  return (actions ?? []).map((action) => {
    if (action.type === "chat-message") return "Chat message";
    if (action.type === "roll-table") return "Roll table";
    if (action.type === "macro") return "Macro";
    if (action.type === "journal-link") return "Journal link";
    if (action.type === "gm-note") return "GM note";
    return action.type;
  });
}

export async function confirmExecution(match) {
  if (!game.user?.isGM) return false;
  if (typeof Dialog?.confirm !== "function") return true;

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

  return Dialog.confirm({
    title: localize("Dialog.ConfirmTitle"),
    content,
    yes: () => true,
    no: () => false,
    defaultYes: true
  });
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
    if (action.type === "chat-message") {
      results.push(await executeChatAction(match.event, match.trigger, action));
      continue;
    }
    if (action.type === "roll-table") {
      results.push(await executeRollTableAction(match.event, match.trigger, action));
      continue;
    }
    if (action.type === "macro") {
      results.push(await executeMacroAction(match.event, match.trigger, action));
      continue;
    }
    if (action.type === "journal-link") {
      results.push(await executeJournalLinkAction(match.event, match.trigger, action));
      continue;
    }
    if (action.type === "gm-note") {
      results.push(await executeGmNoteAction(match.event, match.trigger, action));
    }
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