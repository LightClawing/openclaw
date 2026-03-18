import fs from "node:fs";
import path from "node:path";
import { logVerbose, shouldLogVerbose } from "../../globals.js";
import { reloadFileActions } from "./escape-action-loader.js";
import type { EscapeActionRegistry } from "./escape-action-registry.js";

/**
 * Watch the actions directory for changes and trigger hot-reload.
 *
 * Uses fs.watch with debouncing to avoid excessive reloads during
 * rapid file changes (e.g., during development).
 */
export type ActionWatcherHandle = {
  /** Stop watching and release resources. */
  close: () => void;
};

export function createActionWatcher(params: {
  registry: EscapeActionRegistry;
  workspaceDir: string;
  actionsDir: string;
  debounceMs?: number;
}): ActionWatcherHandle | null {
  const { registry, workspaceDir, actionsDir } = params;
  const debounceMs = params.debounceMs ?? 2000;
  const dirPath = path.resolve(workspaceDir, actionsDir);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  // Ensure the directory exists before watching
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    if (shouldLogVerbose()) {
      logVerbose(`escape-action-watcher: cannot create actions dir ${dirPath}, watcher disabled`);
    }
    return null;
  }

  let watcher: fs.FSWatcher | undefined;
  try {
    watcher = fs.watch(dirPath, { persistent: false, recursive: true }, (_eventType, filename) => {
      if (closed) {
        return;
      }
      if (
        filename &&
        (filename.startsWith(".") || filename.endsWith("~") || filename.endsWith(".swp"))
      ) {
        return; // Skip editor temp files
      }

      // Debounce
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(async () => {
        if (closed) {
          return;
        }
        try {
          const result = await reloadFileActions(registry, workspaceDir, actionsDir);
          if (shouldLogVerbose()) {
            logVerbose(
              `escape-action-watcher: reloaded (removed=${result.removed}, loaded=${result.loaded}, errors=${result.errors})`,
            );
          }
        } catch (err) {
          if (shouldLogVerbose()) {
            logVerbose(
              `escape-action-watcher: reload failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }, debounceMs);
    });
  } catch {
    if (shouldLogVerbose()) {
      logVerbose(`escape-action-watcher: fs.watch failed on ${dirPath}, watcher disabled`);
    }
    return null;
  }

  return {
    close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      watcher?.close();
    },
  };
}
