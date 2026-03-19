/**
 * Status action — Show system resource usage.
 */
import os from "node:os";
import type { ActionHandler } from "../escape-action-types.js";

export const handler: ActionHandler = async () => {
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
};

export default handler;
