import { getGlobalEscapeActionRegistry } from "../escape-action-registry.js";
/**
 * Help action — List all available escape actions.
 */
import type { ActionHandler } from "../escape-action-types.js";

export const handler: ActionHandler = async () => {
  const registry = getGlobalEscapeActionRegistry();
  const actions = registry.list();
  if (actions.length === 0) {
    return { ok: true, text: "No actions registered." };
  }
  const lines = actions.map((a) => {
    const desc = a.description ? ` — ${a.description}` : "";
    return `  ${ctx.prefix ?? "\\"}${a.name}${desc}`;
  });
  return {
    ok: true,
    text: `Available actions:\n${lines.join("\n")}`,
  };
};

export default handler;
