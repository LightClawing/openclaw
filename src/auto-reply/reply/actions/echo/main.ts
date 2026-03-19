/**
 * Echo action — Echo back the provided arguments.
 *
 * A minimal example of a custom escape action.
 * Place this file in your workspace's `actions/echo/main.ts`.
 */
import type { ActionHandler } from "../escape-action-types.js";

export const handler: ActionHandler = async (ctx) => {
  const text = (ctx.args ?? "").trim();
  if (!text) {
    return { ok: true, text: "(empty)" };
  }
  return { ok: true, text };
};

export default handler;
