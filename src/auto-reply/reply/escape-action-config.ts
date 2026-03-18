import type { OpenClawConfig } from "../../config/types.js";
import type { EscapeActionConfig } from "./escape-action-types.js";

const DEFAULT_ESCAPE_ACTION_CONFIG: EscapeActionConfig = {
  enabled: true,
  prefix: "\\",
  actionsDir: "actions",
  watch: true,
  maxResponseLength: 4000,
  executionTimeoutMs: 30_000,
};

/**
 * Resolve escape action configuration from the OpenClaw config.
 * Falls back to defaults for any missing fields.
 */
export function resolveEscapeActionConfig(cfg?: OpenClawConfig): EscapeActionConfig {
  if (!cfg) {
    return { ...DEFAULT_ESCAPE_ACTION_CONFIG };
  }

  const raw = (cfg as Record<string, unknown>).escapeActions as
    | Partial<EscapeActionConfig>
    | undefined;

  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_ESCAPE_ACTION_CONFIG };
  }

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_ESCAPE_ACTION_CONFIG.enabled,
    prefix: typeof raw.prefix === "string" ? raw.prefix : DEFAULT_ESCAPE_ACTION_CONFIG.prefix,
    actionsDir:
      typeof raw.actionsDir === "string" ? raw.actionsDir : DEFAULT_ESCAPE_ACTION_CONFIG.actionsDir,
    watch: typeof raw.watch === "boolean" ? raw.watch : DEFAULT_ESCAPE_ACTION_CONFIG.watch,
    maxResponseLength:
      typeof raw.maxResponseLength === "number"
        ? raw.maxResponseLength
        : DEFAULT_ESCAPE_ACTION_CONFIG.maxResponseLength,
    executionTimeoutMs:
      typeof raw.executionTimeoutMs === "number"
        ? raw.executionTimeoutMs
        : DEFAULT_ESCAPE_ACTION_CONFIG.executionTimeoutMs,
  };
}
