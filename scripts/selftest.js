import { createRollEvent } from "./roll-event.js";
import { format, getProfileStore, getSetting, getTriggerStore, localize, MODULE_ID, SETTINGS } from "./settings.js";
import { normalizeTrigger } from "./trigger-data.js";
import { collectMatches } from "./triggers.js";
import { GALLERY_RULES, getRuleTitle } from "./rule-gallery.js";
import { deriveTurnChangeEvents } from "./combat-events.js";
import { EDITOR_PARTIALS } from "./trigger-editor.js";
import { GALLERY_TEMPLATE } from "./gallery-window.js";

// Self-test: the stored triggers and profiles, a test roll through every trigger, the manager window and the texts.
// Meant to be run after every update of Foundry or the system; the GM also gets a notice once when a newer version
// than the verified one is installed.

// The versions the module was verified against.
export const TESTED_VERSIONS = Object.freeze({ core: "14.370", dnd5e: "6.1.0" });

async function checkIntegrations() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if (!ok) problems.push(format(`SelfTest.${key}`, data));
  };

  check(game.i18n.has("SRT.Manager.Title"), "Texts");
  const triggers = getTriggerStore();
  check(Array.isArray(triggers) && Array.isArray(getProfileStore()), "Stores");

  let matched = false;
  try {
    const roll = await new Roll("1d20").evaluate();
    const message = { id: "srt-self-test", rolls: [roll], speaker: {}, author: game.user, flags: {} };
    const event = createRollEvent(message, roll, 0, "generic", { visibility: "public" });
    collectMatches((Array.isArray(triggers) ? triggers : []).map((trigger) => normalizeTrigger(trigger)), event);
    matched = true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Self-test could not check a test roll`, error);
  }
  check(matched, "TestRoll");

  // Every template of the windows must be there.
  const templates = [`modules/${MODULE_ID}/templates/trigger-manager.html`, GALLERY_TEMPLATE, ...EDITOR_PARTIALS,
    ...["tabs", "general", "match", "filters", "actions", "footer"].map((name) => `modules/${MODULE_ID}/templates/editor/${name}.html`)];
  let template = false;
  try {
    const answers = await Promise.all(templates.map((path) => fetch(path, { method: "HEAD" })));
    template = answers.every((answer) => answer.ok);
  } catch (error) {
    console.warn(`${MODULE_ID} | Self-test could not load the window templates`, error);
  }
  check(template, "Template");

  // The gallery has a title for every rule, and a turn change makes the events combat triggers wait for.
  check(GALLERY_RULES.every((rule) => game.i18n.has(`SRT.Gallery.Rule.${rule.id}.Title`) && getRuleTitle(rule)), "Gallery");
  const events = deriveTurnChangeEvents({ round: 1, turn: 0, combatantId: "a" }, { round: 1, turn: 1, combatantId: "b" });
  check(events.map((event) => event.type).join() === "turn-end,turn-start", "CombatEvents");
  if (!getSetting(SETTINGS.ENABLED)) problems.push(localize("SelfTest.Disabled"));
  return { problems, checks, triggers: Array.isArray(triggers) ? triggers.length : 0 };
}

// The installed versions next to the tested ones.
function versionLine() {
  const current = { core: game.version, [game.system.id]: game.system.version };
  return Object.entries(TESTED_VERSIONS)
    .filter(([id]) => id in current)
    .map(([id, tested]) => format("SelfTest.Version", { id, current: current[id] ?? "–", tested }))
    .join(", ");
}

// The whispered card of the self-test.
export function buildReportContent(summary, problems = []) {
  const escape = foundry.utils.escapeHTML;
  let content = `<h3>${escape(localize("SelfTest.Title"))}</h3><p>${escape(summary)}</p><p><small>${escape(versionLine())}</small></p>`;
  if (problems.length) content += `<ul>${problems.map((problem) => `<li>${escape(problem)}</li>`).join("")}</ul>`;
  return content;
}

// Runs the self-test and reports the result as a notification and a whispered chat message.
export async function runSelfTest({ report = true } = {}) {
  const { problems, checks, triggers } = await checkIntegrations();
  const summary = problems.length
    ? format("SelfTest.Problems", { problems: problems.length, checks })
    : format("SelfTest.Passed", { checks, triggers });

  if (problems.length) ui.notifications.warn(summary, { permanent: true });
  else ui.notifications.info(summary);

  if (report) {
    const content = buildReportContent(summary, problems);
    await ChatMessage.implementation.create({ content, whisper: [game.user.id], speaker: { alias: game.modules.get(MODULE_ID)?.title } });
  }
  return { problems, checks };
}

// Tells the GM once when Foundry or the system is newer than the versions the module was verified against.
export function noticeNewVersions() {
  if (!game.user?.isGM) return;
  const current = { core: game.version, [game.system.id]: game.system.version };
  const newer = Object.entries(current)
    .filter(([id, version]) => version && TESTED_VERSIONS[id] && foundry.utils.isNewerVersion(version, TESTED_VERSIONS[id]))
    .map(([id, version]) => `${id} ${version}`);
  if (!newer.length) return;
  const signature = newer.join(",");
  if (getSetting(SETTINGS.ACKNOWLEDGED_VERSIONS) === signature) return;
  void game.settings.set(MODULE_ID, SETTINGS.ACKNOWLEDGED_VERSIONS, signature);
  ui.notifications.info(format("SelfTest.NewVersions", { versions: newer.join(", ") }), { permanent: true });
}
