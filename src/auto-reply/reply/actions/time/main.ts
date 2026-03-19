/**
 * Time action — Show current server time.
 */
import type { ActionHandler } from "../escape-action-types.js";

export const handler: ActionHandler = async () => {
  return {
    ok: true,
    text: new Date().toISOString(),
  };
};

export default handler;
