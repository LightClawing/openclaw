import { DEFAULT_AGENT_WORKSPACE_DIR } from "../../agents/workspace.js";
import type { OpenClawConfig } from "../../config/types.js";
import { logVerbose, shouldLogVerbose } from "../../globals.js";
import type { FinalizedMsgContext } from "../templating.js";
import type { DispatchFromConfigResult } from "./dispatch-from-config.js";
import { registerBuiltinActions } from "./escape-action-builtin.js";
import { resolveEscapeActionConfig } from "./escape-action-config.js";
import { loadActionFromFs } from "./escape-action-loader.js";
import { looksLikeEscapeAction, parseEscapeAction } from "./escape-action-parse.js";
import { getGlobalEscapeActionRegistry } from "./escape-action-registry.js";
import type { ReplyDispatcher } from "./reply-dispatcher.js";

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Ensure the escape action system is initialized (builtins only).
 * Safe to call multiple times — concurrent calls share the same init promise.
 *
 * File-based actions are resolved lazily on each invocation (no pre-scan,
 * no file watcher). This avoids `fs.watch` issues with Docker bind mounts.
 */
export async function ensureEscapeActionsInitialized(cfg: OpenClawConfig): Promise<void> {
  if (initialized) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = doInit(cfg);
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

async function doInit(cfg: OpenClawConfig): Promise<void> {
  const config = resolveEscapeActionConfig(cfg);
  if (!config.enabled) {
    initialized = true;
    return;
  }

  const registry = getGlobalEscapeActionRegistry();

  // Register builtins — file-based actions are resolved lazily at execute time
  registerBuiltinActions(registry);

  if (shouldLogVerbose()) {
    logVerbose(
      `escape-action: initialized ${registry.size} builtin actions (file-based actions resolved on demand)`,
    );
  }

  initialized = true;
}

/**
 * Try to parse and dispatch an escape action.
 *
 * Lookup order:
 * 1. Registry (builtins)
 * 2. Filesystem — `actions/<name>/main.{ts,mts,mjs}` (lazy import)
 *
 * Returns a `DispatchFromConfigResult` if the message was an escape action
 * (handled or error), or `null` if the message should continue through
 * the normal LLM pipeline.
 */
export async function tryDispatchEscapeAction(params: {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  recordProcessed: (outcome: string, opts?: { reason?: string; error?: string }) => void;
  markIdle: (reason: string) => void;
}): Promise<DispatchFromConfigResult | null> {
  const { ctx, cfg, dispatcher, recordProcessed, markIdle } = params;

  const config = resolveEscapeActionConfig(cfg);
  if (!config.enabled) {
    return null;
  }

  // Fast check — is this even an escape action?
  const rawBody = ctx.BodyForCommands ?? ctx.CommandBody ?? ctx.BodyForAgent ?? ctx.Body ?? "";
  if (!looksLikeEscapeAction(rawBody, config.prefix)) {
    return null;
  }

  // Ensure initialized
  await ensureEscapeActionsInitialized(cfg);

  const parsed = parseEscapeAction(rawBody, config.prefix);

  if (!parsed.isAction) {
    // This was `\\` escape — rewrite body so LLM sees the unescaped text
    if (parsed.escapedBody !== undefined) {
      if ("BodyForCommands" in ctx) {
        ctx.BodyForCommands = parsed.escapedBody;
      }
      if ("CommandBody" in ctx) {
        ctx.CommandBody = parsed.escapedBody;
      }
      if ("BodyForAgent" in ctx) {
        ctx.BodyForAgent = parsed.escapedBody;
      }
      if ("Body" in ctx) {
        ctx.Body = parsed.escapedBody;
      }
    }
    return null;
  }

  // We have an action command — handle it
  const registry = getGlobalEscapeActionRegistry();
  const channel = String(ctx.Surface ?? ctx.Provider ?? "unknown");
  const to = ctx.To ?? ctx.From ?? "";

  const actionCtx = {
    args: parsed.args,
    prefix: config.prefix,
    rawBody,
    channel,
    to,
    accountId: ctx.AccountId,
    sessionKey: ctx.SessionKey,
    workspaceDir: DEFAULT_AGENT_WORKSPACE_DIR,
    actionsDir: config.actionsDir,
    deliver: async (text: string) => {
      dispatcher.sendFinalReply({ text });
    },
  };

  // Execute via registry (builtins), or lazy-load from filesystem
  let result;
  if (registry.has(parsed.actionName)) {
    result = await registry.execute(parsed.actionName, actionCtx, config);
  } else {
    // Lazy resolution: try to load from filesystem
    const loaded = await loadActionFromFs(
      parsed.actionName,
      DEFAULT_AGENT_WORKSPACE_DIR,
      config.actionsDir,
    );

    if (!loaded) {
      result = {
        ok: false,
        error: `Unknown action: \\${parsed.actionName}. Type \\help to see available actions.`,
      };
    } else {
      // Execute the lazily loaded action
      const controller = new AbortController();
      const fullCtx = {
        ...actionCtx,
        actionName: parsed.actionName,
        signal: controller.signal,
      };
      try {
        const handlerResult = await Promise.race([
          loaded.handler(fullCtx),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              controller.abort();
              reject(
                new Error(
                  `Action \\${parsed.actionName} timed out after ${config.executionTimeoutMs}ms`,
                ),
              );
            }, config.executionTimeoutMs).unref?.(),
          ),
        ]);
        result = handlerResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { ok: false, error: `Action \\${parsed.actionName} error: ${message}` };
      }
    }
  }

  const replyText = result.text ?? result.error ?? "Action completed.";
  dispatcher.sendFinalReply({ text: replyText });

  recordProcessed(result.ok ? "completed" : "error", {
    reason: `escape_action:${parsed.actionName}`,
    error: result.error,
  });
  markIdle("escape_action_completed");

  return { queuedFinal: true, counts: dispatcher.getQueuedCounts() };
}

/**
 * For testing: reset the initialization state.
 */
export function resetEscapeActionState(): void {
  initialized = false;
  initPromise = null;
  getGlobalEscapeActionRegistry().clear();
}
