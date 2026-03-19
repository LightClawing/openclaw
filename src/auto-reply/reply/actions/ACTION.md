# Escape Actions — Developer Guide

## What Are Escape Actions?

Escape actions are special commands that bypass the LLM pipeline entirely. They use backslash syntax (`\command`) and execute handlers directly, providing instant responses without model inference.

**Syntax:**

- `\actionName` — invoke an action with no arguments
- `\actionName some arguments` — invoke with arguments
- `\\text` — escaped literal backslash (passes `\text` through to the LLM)

## How It Works

File-based actions are **resolved lazily on each invocation** — no pre-scan, no file watcher, no gateway restart needed. Just drop a folder in `actions/` and it's live.

Lookup order:

1. **Built-in registry** — `help`, `ping`, `status`, `version`, `echo`, `time`
2. **Filesystem** — `actions/<name>/main.{ts,mts,mjs}` (resolved on demand)

## Built-in Actions

| Command        | Description                              |
| -------------- | ---------------------------------------- |
| `\help`        | List all available escape actions        |
| `\ping`        | Test connectivity (responds immediately) |
| `\status`      | Show system resource usage               |
| `\version`     | Show OpenClaw version info               |
| `\echo <text>` | Echo back the provided arguments         |
| `\time`        | Show current server time                 |

## Creating a Custom Action

### Directory Structure

Each action lives in its own subdirectory under the workspace `actions/` directory:

```
actions/
├── echo/
│   └── main.ts        # minimal echo example
├── my-action/
│   └── main.ts        # your custom action
└── ACTION.md          # this guide
```

### Handler Signature

Each action must export a default `handler` function matching `ActionHandler`:

```typescript
import type { ActionHandler, ActionContext, ActionResult } from "./escape-action-types";

export const handler: ActionHandler = async (ctx: ActionContext): Promise<ActionResult> => {
  // ctx.args         — the text after the command name (may be empty string)
  // ctx.rawBody      — the original message body
  // ctx.channel      — source channel (e.g., "telegram", "discord")
  // ctx.to           — recipient
  // ctx.sessionKey   — current session identifier
  // ctx.workspaceDir — workspace root directory
  // ctx.actionsDir   — directory name for file-based actions
  // ctx.deliver      — function to send a reply to the channel
  // ctx.signal       — AbortSignal if the action times out

  return {
    ok: true,
    text: "Response text",
  };
};

export default handler;
```

### Error Handling

```typescript
return {
  ok: false,
  error: "Something went wrong",
};
```

The system wraps handler execution and catches unhandled errors, so throwing is also safe.

## Hot-Deploy Behavior

**No watcher needed.** Actions are resolved lazily on each invocation:

- Create a new `actions/<name>/main.ts` → immediately available
- Remove an action directory → gone on next invocation
- Modify an action → Node.js `import()` caching may serve the old version until gateway restart (use `import(path + "?t=" + Date.now())` for dev cache-busting if needed)

This approach works reliably in Docker bind-mount environments where `fs.watch` is known to be unreliable.

## Configuration

Escape actions can be configured via OpenClaw config:

```typescript
{
  escapeActions: {
    enabled: true,              // master toggle
    prefix: "\\",               // command prefix
    actionsDir: "actions",      // subdirectory name under workspace
    maxResponseLength: 4000,    // truncate long responses
    executionTimeoutMs: 30000,  // per-action timeout
  }
}
```

> **Note:** The `watch` option is deprecated and no longer used. File-based actions are resolved on demand.

## See Also

- `actions/echo/main.ts` — minimal handler example (shows arg parsing)
- `actions/status/main.ts` — example using Node.js APIs
- `actions/help/main.ts` — example interacting with the registry
