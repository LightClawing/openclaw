import { logVerbose, shouldLogVerbose } from "../../globals.js";
import type {
  ActionContext,
  ActionRegistration,
  ActionResult,
  EscapeActionConfig,
} from "./escape-action-types.js";

/**
 * Thread-safe registry for escape actions.
 *
 * Actions are keyed by lowercased name. The registry supports:
 * - Dynamic registration/unregistration
 * - Thread-safe reads via a frozen snapshot pattern
 * - Lookup by name
 */
export class EscapeActionRegistry {
  private registrations = new Map<string, ActionRegistration>();
  private snapshot: ReadonlyMap<string, ActionRegistration> = new Map();
  private snapshotStale = true;

  /** Register an action. Overwrites any existing action with the same name. */
  register(reg: Omit<ActionRegistration, "loadedAt">): void {
    const entry: ActionRegistration = {
      ...reg,
      name: reg.name.toLowerCase(),
      loadedAt: Date.now(),
    };
    this.registrations.set(entry.name, entry);
    this.snapshotStale = true;
  }

  /** Unregister an action by name. */
  unregister(name: string): boolean {
    const key = name.toLowerCase();
    const deleted = this.registrations.delete(key);
    if (deleted) {
      this.snapshotStale = true;
    }
    return deleted;
  }

  /** Get a frozen snapshot of all registrations. Safe for concurrent reads. */
  getSnapshot(): ReadonlyMap<string, ActionRegistration> {
    if (this.snapshotStale) {
      this.snapshot = new Map(this.registrations);
      this.snapshotStale = false;
    }
    return this.snapshot;
  }

  /** Find an action by name (case-insensitive). */
  find(name: string): ActionRegistration | undefined {
    return this.getSnapshot().get(name.toLowerCase());
  }

  /** List all registered actions. */
  list(): ActionRegistration[] {
    return [...this.getSnapshot().values()];
  }

  /** Check if an action with the given name exists. */
  has(name: string): boolean {
    return this.getSnapshot().has(name.toLowerCase());
  }

  /** Get the number of registered actions. */
  get size(): number {
    return this.getSnapshot().size;
  }

  /**
   * Execute an action by name with the given context.
   * Returns an error result if the action is not found or execution fails.
   */
  async execute(
    name: string,
    ctx: Omit<ActionContext, "actionName">,
    config: EscapeActionConfig,
  ): Promise<ActionResult> {
    const action = this.find(name);
    if (!action) {
      return {
        ok: false,
        error: `Unknown action: \\${name}. Type \\help to see available actions.`,
      };
    }

    const fullCtx: ActionContext = {
      ...ctx,
      actionName: name,
    };

    try {
      const controller = new AbortController();
      const result = await withTimeout(
        action.handler({ ...fullCtx, signal: controller.signal }),
        config.executionTimeoutMs,
        `Action \\${name} timed out after ${config.executionTimeoutMs}ms`,
        controller,
      );

      // Truncate response text if needed
      if (result.text && result.text.length > config.maxResponseLength) {
        result.text =
          result.text.slice(0, config.maxResponseLength) +
          `\n\n... (truncated, max ${config.maxResponseLength} chars)`;
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (shouldLogVerbose()) {
        logVerbose(`escape-action: \\${name} failed: ${message}`);
      }
      return {
        ok: false,
        error: `Action \\${name} error: ${message}`,
      };
    }
  }

  /** Clear all registrations. */
  clear(): void {
    this.registrations.clear();
    this.snapshotStale = true;
  }
}

/** Global singleton registry instance. */
const globalRegistry = new EscapeActionRegistry();

export function getGlobalEscapeActionRegistry(): EscapeActionRegistry {
  return globalRegistry;
}

// --- Internal helpers ---

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string,
  controller?: AbortController,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller?.abort();
      reject(new Error(timeoutMessage));
    }, ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
