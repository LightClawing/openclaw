import fs from "node:fs/promises";
import path from "node:path";
import type { ActionHandler } from "./escape-action-types.js";

const ENTRY_FILES = ["main.ts", "main.mts", "main.mjs"];

/**
 * Lazily load a single action from the filesystem.
 *
 * Looks for `<workspaceDir>/<actionsDir>/<name>/main.{ts,mts,mjs}`.
 * Returns the handler and metadata, or undefined if not found.
 */
export async function loadActionFromFs(
  actionName: string,
  workspaceDir: string,
  actionsDir: string,
): Promise<
  { handler: ActionHandler; name: string; description?: string; source: string } | undefined
> {
  const dirPath = path.resolve(workspaceDir, actionsDir, actionName.toLowerCase());

  let entryFile: string | undefined;
  for (const f of ENTRY_FILES) {
    try {
      const s = await fs.stat(path.join(dirPath, f));
      if (s.isFile()) {
        entryFile = f;
        break;
      }
    } catch {
      // not found, try next
    }
  }

  if (!entryFile) {
    return undefined;
  }

  const modulePath = path.join(dirPath, entryFile);
  try {
    const mod = await import(modulePath);
    const handler = extractHandler(mod);
    if (!handler) {
      return undefined;
    }

    return {
      handler,
      name: typeof mod.name === "string" ? mod.name : actionName,
      description: typeof mod.description === "string" ? mod.description : undefined,
      source: modulePath,
    };
  } catch {
    return undefined;
  }
}

/**
 * List all file-based action directories (for `\help`).
 * Does NOT import modules — just checks for entry file existence.
 */
export async function listFileActions(
  workspaceDir: string,
  actionsDir: string,
): Promise<Array<{ name: string }>> {
  const dirPath = path.resolve(workspaceDir, actionsDir);
  const results: Array<{ name: string }> = [];

  try {
    await fs.access(dirPath);
  } catch {
    return results;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      let hasEntry = false;
      for (const f of ENTRY_FILES) {
        try {
          const s = await fs.stat(path.join(dirPath, entry.name, f));
          if (s.isFile()) {
            hasEntry = true;
            break;
          }
        } catch {
          // not found
        }
      }

      if (hasEntry) {
        results.push({ name: entry.name });
      }
    }
  } catch {
    // directory listing failed — return what we have
  }

  return results;
}

function extractHandler(mod: Record<string, unknown>): ActionHandler | undefined {
  if (typeof mod.handler === "function") {
    return mod.handler as ActionHandler;
  }
  if (
    typeof mod.default === "object" &&
    mod.default !== null &&
    typeof (mod.default as Record<string, unknown>).handler === "function"
  ) {
    return (mod.default as Record<string, unknown>).handler as ActionHandler;
  }
  return undefined;
}
