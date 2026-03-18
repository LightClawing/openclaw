/**
 * Escape action type definitions.
 *
 * Provides the core types for the escape action system, which allows users
 * to invoke special commands via `\actionName` syntax that bypass the LLM
 * pipeline entirely.
 */
export type EscapeActionParseResult =
  | { isAction: true; actionName: string; args: string }
  | { isAction: false; escapedBody: string };

export type ActionContext = {
  actionName: string;
  args: string;
  rawBody: string;
  channel: string;
  to: string;
  accountId?: string;
  sessionId?: string;
  sessionKey?: string;
  workspaceDir: string;
  /** Send a text reply back to the originating channel. */
  deliver: (text: string) => Promise<void>;
};

export type ActionResult = {
  ok: boolean;
  text?: string;
  error?: string;
};

export type ActionHandler = (ctx: ActionContext) => Promise<ActionResult>;

export type ActionRegistration = {
  /** Command name (case-insensitive match). */
  name: string;
  /** Human-readable description shown by \help. */
  description?: string;
  /** The handler function. */
  handler: ActionHandler;
  /** Source identifier for debugging (e.g. file path or "builtin:status"). */
  source: string;
  /** Timestamp when this action was loaded. */
  loadedAt: number;
};

export type EscapeActionConfig = {
  enabled: boolean;
  prefix: string;
  actionsDir: string;
  watch: boolean;
  maxResponseLength: number;
  executionTimeoutMs: number;
};
