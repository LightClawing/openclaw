import { resolveAgentWorkspaceDir, DEFAULT_AGENT_WORKSPACE_DIR } from "../../agents/workspace.js";
import type { OpenClawConfig } from "../../config/types.js";
import { logVerbose, shouldLogVerbose } from "../../globals.js";
/**
 * Escape action dispatch — the integration point that forks inbound messages.
 *
 * This module provides the function to call from `dispatchReplyFromConfig`
 * to check if an inbound message is an escape action and, if so, handle it
 * directly without invoking the LLM.
 */
import type { FinalizedMsgContext } from "../templating.js";
import type { DispatchFromConfigResult } from "./dispatch-from-config.js";
import { registerBuiltinActions } from "./escape-action-builtin.js";
import { resolveEscapeActionConfig } from "./escape-action-config.js";
import { scanAndLoadActions } from "./escape-action-loader.js";
import { looksLikeEscapeAction, parseEscapeAction } from "./escape-action-parse.js";
import { getGlobalEscapeActionRegistry } from "./escape-action-registry.js";
import { createActionWatcher, type ActionWatcherHandle } from "./escape-action-watcher.js";
import type { ReplyDispatcher } from "./reply-dispatcher.js";

let initialized = false;
let watcher: ActionWatcherHandle | null = null;

/**
 * Ensure the escape action system is initialized (builtins + file scan + watcher).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function ensureEscapeActionsInitialized(cfg: OpenClawConfig): Promise<void> {
  if (initialized) {
    return;
  }

  const config = resolveEscapeActionConfig(cfg);
  if (!config.enabled) {
    return;
  }

  const registry = getGlobalEscapeActionRegistry();

  // Register builtins (idempotent — won't overwrite file-sourced actions)
  registerBuiltinActions(registry);

  // Scan workspace actions directory
  const workspaceDir =
    resolveAgentWorkspaceDir(undefined, () => process.env.HOME ?? "/root") ??
    DEFAULT_AGENT_WORKSPACE_DIR;
  await scanAndLoadActions(registry, workspaceDir, config.actionsDir);

  // Start file watcher for hot-reload
  if (config.watch && !watcher) {
    watcher = createActionWatcher({
      registry,
      workspaceDir,
      actionsDir: config.actionsDir,
    });
    if (shouldLogVerbose()) {
      logVerbose(
        `escape-action: initialized ${registry.size} actions, watcher=${watcher ? "active" : "disabled"}`,
      );
    }
  }

  initialized = true;
}

/**
 * Try to parse and dispatch an escape action.
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
    // This was `\\` escape — rewrite body and let normal pipeline handle it
    // For now, we don't modify the context (the `\\` is rare enough to pass through)
    return null;
  }

  // We have an action command — handle it
  const registry = getGlobalEscapeActionRegistry();
  const channel = String(ctx.Surface ?? ctx.Provider ?? "unknown");
  const to = ctx.To ?? ctx.From ?? "";

  const result = await registry.execute(
    parsed.actionName,
    {
      rawBody,
      channel,
      to,
      accountId: ctx.AccountId,
      sessionKey: ctx.SessionKey,
      workspaceDir:
        resolveAgentWorkspaceDir(undefined, () => process.env.HOME ?? "/root") ??
        DEFAULT_AGENT_WORKSPACE_DIR,
      deliver: async (text) => {
        dispatcher.sendFinalReply({ text });
      },
    },
    config,
  );

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
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  getGlobalEscapeActionRegistry().clear();
}
