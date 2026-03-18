import fs from "node:fs/promises";
import path from "node:path";
import { logVerbose, shouldLogVerbose } from "../../globals.js";
import type { EscapeActionRegistry } from "./escape-action-registry.js";
import type { ActionHandler } from "./escape-action-types.js";

/**
 * Scan the actions directory and dynamically load action modules.
 *
 * Each action is expected at `<actionsDir>/<name>/main.ts` (or `.mts`/`.mjs`).
 * The module must export:
 *   - `name: string`       (optional, inferred from directory name)
 *   - `description: string` (optional)
 *   - `handler: ActionHandler` (required)
 */
export async function scanAndLoadActions(
  registry: EscapeActionRegistry,
  workspaceDir: string,
  actionsDir: string,
): Promise<{ loaded: number; errors: number }> {
  const dirPath = path.resolve(workspaceDir, actionsDir);
  let loaded = 0;
  let errors = 0;

  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return { loaded: 0, errors: 0 };
    }
  } catch {
    // Actions directory does not exist — that's fine
    if (shouldLogVerbose()) {
      logVerbose(`escape-action-loader: actions dir not found: ${dirPath}`);
    }
    return { loaded: 0, errors: 0 };
  }

  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return { loaded: 0, errors: 0 };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const actionName = entry.name;
    const actionDir = path.join(dirPath, actionName);

    // Try multiple entry point extensions
    const entryFiles = ["main.ts", "main.mts", "main.mjs"];
    let entryFile: string | undefined;
    for (const f of entryFiles) {
      try {
        const s = await fs.stat(path.join(actionDir, f));
        if (s.isFile()) {
          entryFile = f;
          break;
        }
      } catch {
        // not found, try next
      }
    }

    if (!entryFile) {
      if (shouldLogVerbose()) {
        logVerbose(`escape-action-loader: no main entry in ${actionDir}, skipping`);
      }
      continue;
    }

    try {
      const modulePath = path.join(actionDir, entryFile);
      // Dynamic import — uses Node.js ESM loader
      const mod = await import(modulePath);

      const handler = extractHandler(mod);
      if (!handler) {
        if (shouldLogVerbose()) {
          logVerbose(`escape-action-loader: ${modulePath} has no handler export, skipping`);
        }
        errors++;
        continue;
      }

      const name = typeof mod.name === "string" ? mod.name : actionName;
      const description = typeof mod.description === "string" ? mod.description : undefined;

      registry.register({
        name,
        description,
        handler,
        source: modulePath,
      });

      loaded++;
      if (shouldLogVerbose()) {
        logVerbose(`escape-action-loader: loaded \\${name} from ${modulePath}`);
      }
    } catch (err) {
      errors++;
      if (shouldLogVerbose()) {
        logVerbose(
          `escape-action-loader: failed to load ${actionName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { loaded, errors };
}

/**
 * Reload all file-sourced actions (not builtins).
 * Removes actions whose source matches the workspace actions dir,
 * then re-scans.
 */
export async function reloadFileActions(
  registry: EscapeActionRegistry,
  workspaceDir: string,
  actionsDir: string,
): Promise<{ loaded: number; errors: number; removed: number }> {
  const absDir = path.resolve(workspaceDir, actionsDir);
  let removed = 0;

  // Remove all actions sourced from this directory
  for (const reg of registry.list()) {
    if (reg.source.startsWith(absDir)) {
      registry.unregister(reg.name);
      removed++;
    }
  }

  const result = await scanAndLoadActions(registry, workspaceDir, actionsDir);
  return { ...result, removed };
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
