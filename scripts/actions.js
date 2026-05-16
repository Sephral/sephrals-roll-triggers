import { localize, MODULE_ID } from "./settings.js";

function renderTemplateString(template, context) {
  return String(template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token) => {
    const parts = token.split(".");
    let current = context;
    for (const part of parts) current = current?.[part];
    return current == null ? "" : String(current);
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
  const content = renderTemplateString(action.template ?? action.message ?? "", buildTemplateContext(event, trigger));
  if (!content.trim()) return null;

  return ChatMessage.create({
    content,
    whisper: buildWhisperRecipients(action.visibility ?? "public", event, action)
  });
}

async function executeRollTableAction(event, trigger, action) {
  const tableRefs = Array.isArray(action.tables) ? action.tables : action.table ? [action.table] : [];
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

    if (action.postResult !== false) {
      const content = `<div class="srt-roll-table-result"><strong>${trigger.name}</strong><div>${table.name}</div></div>`;
      await ChatMessage.create({
        content,
        whisper: buildWhisperRecipients(action.visibility ?? "gm", event, action)
      });
    }
  }

  return results;
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

  const content = renderTemplateString(
    action.template ?? `<div><strong>{{trigger.name}}</strong></div><div>@UUID[${document.uuid}]{${document.name}}</div>`,
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
  const content = renderTemplateString(action.template ?? action.message ?? "", buildTemplateContext(event, trigger));
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

  const actionList = summarizeActions(match.actions).map((entry) => `<li>${entry}</li>`).join("");
  const content = `
    <div>
      <p><strong>${localize("Dialog.Trigger")}</strong>: ${match.trigger.name}</p>
      <p><strong>${localize("Dialog.Actor")}</strong>: ${match.event.actorName ?? "-"}</p>
      <p><strong>${localize("Dialog.Roll")}</strong>: ${match.event.formula} = ${match.event.total ?? "-"}</p>
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
      content: `<div><strong>${match.trigger.name}</strong>: ${match.event.formula} = ${match.event.total ?? "-"}</div>`
    });
    return { skipped: false, mode };
  }
  if (mode === "chat-button" && options.allowDeferred !== false) return { deferred: true, mode };

  const results = [];
  for (const action of match.actions ?? []) {
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