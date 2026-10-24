import { createRollEvent } from "./roll-event.js";
import { format, getProfileStore, getSetting, getTriggerStore, localize, MODULE_ID, SETTINGS } from "./settings.js";
import { normalizeTrigger } from "./trigger-manager.js";
import { collectMatches } from "./triggers.js";

// Self-test: the stored triggers and profiles, a test roll through every trigger, the manager window and the texts.
// Meant to be run after every update of Foundry or the system; the GM also gets a notice once when a newer version
// than the verified one is installed.

// The versions the module was verified against.
export const TESTED_VERSIONS = Object.freeze({ core: "14.369", dnd5e: "6.0.6" });

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

  let template = false;
  try {
    template = (await fetch(`modules/${MODULE_ID}/templates/trigger-manager.html`, { method: "HEAD" })).ok;
  } catch (error) {
    console.warn(`${MODULE_ID} | Self-test could not load the manager template`, error);
  }
  check(template, "Template");
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

// Runs the self-test and reports the result as a notification and a whispered chat message.
export async function runSelfTest({ report = true } = {}) {
  const { problems, checks, triggers } = await checkIntegrations();
  const summary = problems.length
    ? format("SelfTest.Problems", { problems: problems.length, checks })
    : format("SelfTest.Passed", { checks, triggers });

  if (problems.length) ui.notifications.warn(summary, { permanent: true });
  else ui.notifications.info(summary);

  if (report) {
    const escape = foundry.utils.escapeHTML;
    let content = `<h3>${escape(localize("SelfTest.Title"))}</h3><p>${escape(summary)}</p><p><small>${escape(versionLine())}</small></p>`;
    if (problems.length) content += `<ul>${problems.map((problem) => `<li>${escape(problem)}</li>`).join("")}</ul>`;
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
