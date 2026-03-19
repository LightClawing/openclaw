/**
 * Ping action — Test connectivity (responds immediately).
 */
import type { ActionHandler } from "../escape-action-types.js";

export const handler: ActionHandler = async () => {
  return { ok: true, text: "pong 🏓" };
};

export default handler;
