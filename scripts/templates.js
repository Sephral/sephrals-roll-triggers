import { localize } from "./settings.js";

// Handlebars helpers of the module's templates. srtT reads the text through the module's own language choice
// (the setting that can override Foundry's language), so the windows follow it.
export function registerTemplateHelpers() {
  const Handlebars = globalThis.Handlebars;
  if (!Handlebars?.registerHelper) return;
  Handlebars.registerHelper("srtT", (key) => localize(String(key)));
}
