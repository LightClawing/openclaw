import os from "node:os";
import { listFileActions } from "./escape-action-loader.js";
import type { EscapeActionRegistry } from "./escape-action-registry.js";

/**
 * Register built-in escape actions that ship with OpenClaw.
 *
 * File-based actions in `<workspace>/actions/` are resolved lazily at
 * execute time (no pre-scan, no file watcher). Builtins serve as fallbacks;
 * file-based versions take precedence when present in the actions directory.
 */
export function registerBuiltinActions(registry: EscapeActionRegistry): void {
  registry.register({
    name: "help",
    description: "List all available escape actions",
    source: "builtin:help",
    handler: async (_ctx) => {
      const pfx = _ctx.prefix ?? "\\";
      const lines: string[] = ["Available actions:"];

      // Builtins from registry
      for (const a of registry.list()) {
        const desc = a.description ? ` — ${a.description}` : "";
        lines.push(`  ${pfx}${a.name}${desc}`);
      }

      // File-based actions (lazy scan)
      const fileActions = await listFileActions(_ctx.workspaceDir, _ctx.actionsDir ?? "actions");
      for (const fa of fileActions) {
        // Skip if already shown as a builtin
        if (!registry.has(fa.name)) {
          lines.push(`  ${pfx}${fa.name} — file-based action`);
        }
      }

      return { ok: true, text: lines.join("\n") };
    },
  });

  registry.register({
    name: "ping",
    description: "Test connectivity (responds immediately)",
    source: "builtin:ping",
    handler: async () => {
      return { ok: true, text: "pong 🏓" };
    },
  });

  registry.register({
    name: "status",
    description: "Show system resource usage",
    source: "builtin:status",
    handler: async () => {
      const mem = process.memoryUsage();
      const uptime = process.uptime();
      const cpus = os.cpus();
      const loadAvg = os.loadavg();

      const usedMb = Math.round(mem.heapUsed / 1024 / 1024);
      const totalMb = Math.round(mem.heapTotal / 1024 / 1024);
      const rssMb = Math.round(mem.rss / 1024 / 1024);

      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);

      return {
        ok: true,
        text: [
          "📊 **System Status**",
          "",
          `Memory: ${usedMb}MB / ${totalMb}MB heap, ${rssMb}MB RSS`,
          `Uptime: ${hours}h ${minutes}m`,
          `CPU: ${cpus.length} cores, load avg: ${loadAvg.map((l) => l.toFixed(2)).join(" / ")}`,
          `Node: ${process.version}`,
          `PID: ${process.pid}`,
        ].join("\n"),
      };
    },
  });

  registry.register({
    name: "version",
    description: "Show OpenClaw version info",
    source: "builtin:version",
    handler: async () => {
      const { VERSION } = await import("../../version.js").catch(() => ({
        VERSION: "unknown" as string | null,
      }));
      return {
        ok: true,
        text: `OpenClaw v${VERSION ?? "unknown"} — Node ${process.version}`,
      };
    },
  });

  registry.register({
    name: "echo",
    description: "Echo back the provided arguments",
    source: "builtin:echo",
    handler: async (ctx) => {
      const text = (ctx.args ?? "").trim();
      if (!text) {
        return { ok: true, text: "(empty)" };
      }
      return { ok: true, text };
    },
  });

  registry.register({
    name: "time",
    description: "Show current server time",
    source: "builtin:time",
    handler: async () => {
      return {
        ok: true,
        text: new Date().toISOString(),
      };
    },
  });
}
