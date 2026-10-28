import { DebugTrace, recentMessages, registerDebugProvider } from "./debug-file.mjs";
import { isActiveGmClient } from "./roll-trigger-service.js";
import { format, localize, MODULE_ID } from "./settings.js";
import { simulateTriggers } from "./triggers.js";

// Roll Triggers' part of the debug file: the roll messages, the roll events read from them, which triggers match them
// now and what the chat processing decided when the message came in.
export const debugTrace = new DebugTrace();

function rollsOf(service, message) {
  return service?.adapter?.getMessageRolls?.(message) ?? message?.rolls ?? [];
}

// A roll event without the documents and raw data the file holds elsewhere (message data, actor, token and item ids).
export function summarizeEvent(event) {
  const { rawMessage, rawRoll, rawRolls, flags, actor, token, item, user, ...rest } = event ?? {};
  return { ...rest, user: user ? { id: user.id ?? null, name: user.name ?? null, isGM: Boolean(user.isGM) } : null };
}

// A trigger report of the test bench, without the trigger and event objects the file already holds elsewhere.
function summarizeReport(report) {
  return {
    triggerId: report.trigger?.id ?? null,
    name: report.trigger?.name ?? "",
    matched: report.matched,
    executionMode: report.match?.executionMode ?? null,
    blockedBy: report.blockedBy,
    failedConditions: report.conditions.filter((condition) => !condition.passed).map(({ index, condition, error }) => ({ index, type: condition?.type ?? null, error })),
    stoppedBy: report.stoppedBy?.id ?? null,
    error: report.error
  };
}

// What Roll Triggers makes of a message now: its roll events, every active trigger checked against each of them like
// the chat processing does, the state the processing kept for the message and the flags it stored.
export function describeMessage(service, message) {
  const description = {
    messageId: message.id,
    activeGmClient: isActiveGmClient(),
    enabled: Boolean(service?.settings?.enabled),
    supported: false,
    events: [],
    processedState: null,
    storedFlags: message.flags?.[MODULE_ID] ?? null,
    error: null
  };
  if (!service) {
    description.error = "Roll Triggers is not ready yet.";
    return description;
  }
  try {
    description.supported = Boolean(service.adapter?.supportsMessage(message));
    const triggers = service.getActiveTriggers();
    const options = { defaultExecutionMode: service.settings.defaultExecutionMode, respectPrivateRolls: service.settings.respectPrivateRolls };
    const events = description.supported ? service.adapter.extractRollEvents(message) : [];
    description.events = events.map((event) => ({ event: summarizeEvent(event), triggers: simulateTriggers(triggers, event, options).map(summarizeReport) }));
    const state = service.processedMessages?.get(`${message.id}:${message.uuid ?? ""}`);
    if (state) description.processedState = { rollCount: state.rollCount, matchedTriggers: Array.from(state.matchedTriggers).map(String), executedActions: state.executedActions };
  } catch (error) {
    description.error = String(error?.stack ?? error);
  }
  return description;
}

function activeTriggers(service) {
  return { activeTriggers: service?.getActiveTriggers() ?? [] };
}

// The latest roll messages, also those that set off nothing.
export function describeRecent(service) {
  const messages = recentMessages(undefined, (message) => rollsOf(service, message).length > 0);
  const details = {};
  for (const message of messages) details[message.id] = describeMessage(service, message);
  return { messages, details: { ...activeTriggers(service), messages: details } };
}

// The service starts in "ready", the provider is registered in "init".
export function registerDebug(getService) {
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => localize("Debug.Entry"),
    notice: (file) => format("Debug.Saved", { file }),
    applies: (message) => rollsOf(getService(), message).length > 0,
    message: (message) => ({ ...activeTriggers(getService()), message: describeMessage(getService(), message) }),
    recent: () => describeRecent(getService()),
    trace: debugTrace
  });
}
