import { describe, it, expect, beforeEach } from "vitest";
import { EscapeActionRegistry } from "./escape-action-registry.js";

describe("EscapeActionRegistry", () => {
  let registry: EscapeActionRegistry;

  beforeEach(() => {
    registry = new EscapeActionRegistry();
  });

  it("registers and finds an action", () => {
    registry.register({
      name: "test",
      description: "A test action",
      handler: async () => ({ ok: true, text: "test result" }),
      source: "test",
    });
    expect(registry.has("test")).toBe(true);
    expect(registry.has("TEST")).toBe(true); // case-insensitive
    expect(registry.size).toBe(1);
  });

  it("finds action case-insensitively", () => {
    registry.register({
      name: "MyAction",
      handler: async () => ({ ok: true }),
      source: "test",
    });
    expect(registry.find("myaction")).toBeDefined();
    expect(registry.find("MYACTION")).toBeDefined();
    expect(registry.find("MyAction")).toBeDefined();
  });

  it("overwrites existing action with same name", () => {
    registry.register({
      name: "test",
      handler: async () => ({ ok: true, text: "v1" }),
      source: "test",
    });
    registry.register({
      name: "test",
      handler: async () => ({ ok: true, text: "v2" }),
      source: "test2",
    });
    expect(registry.size).toBe(1);
    expect(registry.find("test")?.source).toBe("test2");
  });

  it("unregisters an action", () => {
    registry.register({
      name: "test",
      handler: async () => ({ ok: true }),
      source: "test",
    });
    expect(registry.unregister("test")).toBe(true);
    expect(registry.has("test")).toBe(false);
  });

  it("returns false when unregistering non-existent action", () => {
    expect(registry.unregister("nonexistent")).toBe(false);
  });

  it("lists all registered actions", () => {
    registry.register({
      name: "a",
      handler: async () => ({ ok: true }),
      source: "a",
    });
    registry.register({
      name: "b",
      handler: async () => ({ ok: true }),
      source: "b",
    });
    expect(registry.list()).toHaveLength(2);
  });

  it("clears all registrations", () => {
    registry.register({
      name: "a",
      handler: async () => ({ ok: true }),
      source: "a",
    });
    registry.register({
      name: "b",
      handler: async () => ({ ok: true }),
      source: "b",
    });
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  it("executes a registered action successfully", async () => {
    registry.register({
      name: "echo",
      handler: async (ctx) => ({ ok: true, text: ctx.args }),
      source: "test",
    });
    const result = await registry.execute(
      "echo",
      {
        args: "hello world",
        channel: "test",
        to: "user",
        workspaceDir: "/tmp",
        deliver: async () => {},
      },
      {
        enabled: true,
        prefix: "\\",
        actionsDir: "actions",
        watch: true,
        maxResponseLength: 4000,
        executionTimeoutMs: 5000,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe("hello world");
  });

  it("returns error for unknown action", async () => {
    const result = await registry.execute(
      "nonexistent",
      { args: "", channel: "test", to: "user", workspaceDir: "/tmp", deliver: async () => {} },
      {
        enabled: true,
        prefix: "\\",
        actionsDir: "actions",
        watch: true,
        maxResponseLength: 4000,
        executionTimeoutMs: 5000,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown action");
  });

  it("returns error when handler throws", async () => {
    registry.register({
      name: "boom",
      handler: async () => {
        throw new Error("kaboom");
      },
      source: "test",
    });
    const result = await registry.execute(
      "boom",
      { args: "", channel: "test", to: "user", workspaceDir: "/tmp", deliver: async () => {} },
      {
        enabled: true,
        prefix: "\\",
        actionsDir: "actions",
        watch: true,
        maxResponseLength: 4000,
        executionTimeoutMs: 5000,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("kaboom");
  });

  it("truncates long response text", async () => {
    registry.register({
      name: "long",
      handler: async () => ({ ok: true, text: "x".repeat(5000) }),
      source: "test",
    });
    const result = await registry.execute(
      "long",
      { args: "", channel: "test", to: "user", workspaceDir: "/tmp", deliver: async () => {} },
      {
        enabled: true,
        prefix: "\\",
        actionsDir: "actions",
        watch: true,
        maxResponseLength: 100,
        executionTimeoutMs: 5000,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.text!.length).toBeLessThan(200);
    expect(result.text).toContain("truncated");
  });

  it("times out slow handlers", async () => {
    registry.register({
      name: "slow",
      handler: async () => {
        await new Promise((r) => setTimeout(r, 10_000));
        return { ok: true };
      },
      source: "test",
    });
    const result = await registry.execute(
      "slow",
      { args: "", channel: "test", to: "user", workspaceDir: "/tmp", deliver: async () => {} },
      {
        enabled: true,
        prefix: "\\",
        actionsDir: "actions",
        watch: true,
        maxResponseLength: 4000,
        executionTimeoutMs: 100,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("snapshot is frozen and safe for concurrent reads", () => {
    registry.register({
      name: "a",
      handler: async () => ({ ok: true }),
      source: "a",
    });
    const snap1 = registry.getSnapshot();
    registry.register({
      name: "b",
      handler: async () => ({ ok: true }),
      source: "b",
    });
    // snap1 should still only have "a" until we get a new snapshot
    expect(snap1.size).toBe(1);
    expect(registry.getSnapshot().size).toBe(2);
  });
});
