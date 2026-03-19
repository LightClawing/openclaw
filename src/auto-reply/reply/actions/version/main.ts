/**
 * Version action — Show OpenClaw version info.
 */
import type { ActionHandler } from "../escape-action-types.js";

export const handler: ActionHandler = async () => {
  const { VERSION } = await import("../../../version.js").catch(() => ({
    VERSION: "unknown" as string | null,
  }));
  return {
    ok: true,
    text: `OpenClaw v${VERSION ?? "unknown"} — Node ${process.version}`,
  };
};

export default handler;
