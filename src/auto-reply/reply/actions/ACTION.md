# Escape Actions — Developer Guide

## What Are Escape Actions?

Escape actions are special commands that bypass the LLM pipeline entirely. They use backslash syntax (`\command`) and execute registered handlers directly, providing instant responses without model inference.

**Syntax:**

- `\actionName` — invoke an action with no arguments
- `\actionName some arguments` — invoke with arguments
- `\\text` — escaped literal backslash (passes `\text` through to the LLM)

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
  // ctx.args       — the text after the command name (may be empty string)
  // ctx.rawBody    — the original message body
  // ctx.channel    — source channel (e.g., "telegram", "discord")
  // ctx.to         — recipient
  // ctx.sessionKey — current session identifier
  // ctx.workspaceDir — workspace root directory
  // ctx.deliver    — function to send a reply to the channel
  // ctx.signal     — AbortSignal if the action times out

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

When file watching is enabled (default), the system automatically:

1. **Detects** new action directories added to `actions/`
2. **Registers** them without requiring a gateway restart
3. **Detects** removed action directories and unregisters them
4. **Logs** registration/unregistration events

No restart is needed — just drop a folder in `actions/` and it's live.

## Configuration

Escape actions can be configured via OpenClaw config:

```typescript
{
  escapeActions: {
    enabled: true,              // master toggle
    prefix: "\\",               // command prefix
    actionsDir: "actions",      // subdirectory name under workspace
    watch: true,                // enable file watcher for hot-reload
    maxResponseLength: 4000,    // truncate long responses
    executionTimeoutMs: 30000,  // per-action timeout
  }
}
```

## See Also

- `actions/echo/main.ts` — minimal handler example (shows arg parsing)
- `actions/status/main.ts` — example using Node.js APIs
- `actions/help/main.ts` — example interacting with the registry
