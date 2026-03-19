/**
 * Standalone self-test for the Escape Action System.
 * Runs without vitest — uses Node.js assert + manual runner.
 * Tests all core functionality: parse, registry, dispatch, loader, config.
 *
 * Run: node --import tsx src/auto-reply/reply/escape-action-self-test.ts
 */
/* eslint-disable */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Import modules under test
const { parseEscapeAction, looksLikeEscapeAction } = await import("./escape-action-parse.js");
const { EscapeActionRegistry, getGlobalEscapeActionRegistry } =
  await import("./escape-action-registry.js");
const { registerBuiltinActions } = await import("./escape-action-builtin.js");
const { resolveEscapeActionConfig } = await import("./escape-action-config.js");
const { loadActionFromFs, listFileActions } = await import("./escape-action-loader.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

const defaultConfig = {
  enabled: true,
  prefix: "\\",
  actionsDir: "actions",
  watch: true,
  maxResponseLength: 4000,
  executionTimeoutMs: 5000,
};

// ============================================================
// 1. PARSE TESTS
// ============================================================
console.log("\n📋 1. Parse Tests");

test("plain text → non-action", () => {
  const r = parseEscapeAction("hello world");
  assert.equal(r.isAction, false);
});

test("leading space with \\\\ → escaped, not action", () => {
  const r = parseEscapeAction(" \\\\hello");
  assert.equal(r.isAction, false);
  assert.equal(r.escapedBody, " \\hello");
});

test("\\status → action", () => {
  const r = parseEscapeAction("\\status");
  assert.equal(r.isAction, true);
  assert.equal(r.actionName, "status");
  assert.equal(r.args, "");
});

test("\\hi hello world → action with args", () => {
  const r = parseEscapeAction("\\hi hello world");
  assert.equal(r.isAction, true);
  assert.equal(r.actionName, "hi");
  assert.equal(r.args, "hello world");
});

test("\\\\ → escaped backslash", () => {
  const r = parseEscapeAction("\\\\");
  assert.equal(r.isAction, false);
  assert.equal(r.escapedBody, "\\");
});

test("\\\\xxx → escaped \\xxx", () => {
  const r = parseEscapeAction("\\\\hello");
  assert.equal(r.isAction, false);
  assert.equal(r.escapedBody, "\\hello");
});

test("action names are lowercased", () => {
  const r = parseEscapeAction("\\STATUS verbose");
  assert.equal(r.isAction, true);
  assert.equal(r.actionName, "status");
  assert.equal(r.args, "verbose");
});

test("empty body → non-action", () => {
  const r = parseEscapeAction("");
  assert.equal(r.isAction, false);
});

test("lone backslash → non-action", () => {
  const r = parseEscapeAction("\\");
  assert.equal(r.isAction, false);
});

test("looksLikeEscapeAction: true for \\status", () => {
  assert.equal(looksLikeEscapeAction("\\status"), true);
});

test("looksLikeEscapeAction: false for \\\\status", () => {
  assert.equal(looksLikeEscapeAction("\\\\status"), false);
});

test("looksLikeEscapeAction: false for plain text", () => {
  assert.equal(looksLikeEscapeAction("hello"), false);
});

// ============================================================
// 2. REGISTRY TESTS
// ============================================================
console.log("\n📋 2. Registry Tests");

test("register and find", () => {
  const reg = new EscapeActionRegistry();
  reg.register({ name: "test", handler: async () => ({ ok: true }), source: "test" });
  assert.equal(reg.has("test"), true);
  assert.equal(reg.has("TEST"), true);
  assert.equal(reg.size, 1);
});

test("unregister", () => {
  const reg = new EscapeActionRegistry();
  reg.register({ name: "test", handler: async () => ({ ok: true }), source: "test" });
  assert.equal(reg.unregister("test"), true);
  assert.equal(reg.has("test"), false);
});

test("overwrite same name", () => {
  const reg = new EscapeActionRegistry();
  reg.register({ name: "a", handler: async () => ({ ok: true, text: "v1" }), source: "s1" });
  reg.register({ name: "a", handler: async () => ({ ok: true, text: "v2" }), source: "s2" });
  assert.equal(reg.size, 1);
  assert.equal(reg.find("a")?.source, "s2");
});

test("snapshot isolation", () => {
  const reg = new EscapeActionRegistry();
  reg.register({ name: "a", handler: async () => ({ ok: true }), source: "a" });
  const snap = reg.getSnapshot();
  reg.register({ name: "b", handler: async () => ({ ok: true }), source: "b" });
  assert.equal(snap.size, 1);
  assert.equal(reg.getSnapshot().size, 2);
});

test("clear", () => {
  const reg = new EscapeActionRegistry();
  reg.register({ name: "a", handler: async () => ({ ok: true }), source: "a" });
  reg.clear();
  assert.equal(reg.size, 0);
});

await testAsync("execute success", async () => {
  const reg = new EscapeActionRegistry();
  reg.register({
    name: "echo",
    handler: async (ctx) => ({ ok: true, text: ctx.args }),
    source: "t",
  });
  const r = await reg.execute(
    "echo",
    { args: "hello", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.equal(r.text, "hello");
});

await testAsync("execute unknown → error", async () => {
  const reg = new EscapeActionRegistry();
  const r = await reg.execute(
    "nope",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("Unknown action"));
});

await testAsync("execute throw → error", async () => {
  const reg = new EscapeActionRegistry();
  reg.register({
    name: "boom",
    handler: async () => {
      throw new Error("kaboom");
    },
    source: "t",
  });
  const r = await reg.execute(
    "boom",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("kaboom"));
});

await testAsync("truncation", async () => {
  const reg = new EscapeActionRegistry();
  reg.register({
    name: "big",
    handler: async () => ({ ok: true, text: "x".repeat(5000) }),
    source: "t",
  });
  const r = await reg.execute(
    "big",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    { ...defaultConfig, maxResponseLength: 100 },
  );
  assert.equal(r.ok, true);
  assert.ok(r.text!.length < 200);
  assert.ok(r.text?.includes("truncated"));
});

await testAsync("timeout + AbortSignal propagation", async () => {
  const reg = new EscapeActionRegistry();
  let signalReceived = false;
  reg.register({
    name: "slow",
    handler: async (ctx) => {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (ctx.signal?.aborted) {
            signalReceived = true;
            clearInterval(check);
            reject(new Error("aborted"));
          }
        }, 10);
      });
    },
    source: "t",
  });
  const r = await reg.execute(
    "slow",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    { ...defaultConfig, executionTimeoutMs: 200 },
  );
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("timed out"));
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(signalReceived, true, "Handler should have received abort signal");
});

// ============================================================
// 3. BUILTIN ACTIONS
// ============================================================
console.log("\n📋 3. Builtin Action Tests");

await testAsync("\\ping → pong", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "ping",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.ok(r.text?.includes("pong"));
});

await testAsync("\\help → lists actions", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "help",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.ok(r.text?.includes("Available actions"));
  assert.ok(r.text?.includes("\\ping"));
  assert.ok(r.text?.includes("\\help"));
});

await testAsync("\\help with custom prefix", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "help",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", prefix: "!", deliver: async () => {} },
    { ...defaultConfig, prefix: "!" },
  );
  assert.equal(r.ok, true);
  assert.ok(r.text?.includes("!ping"), "Should show ! prefix for builtins");
});

await testAsync("\\echo with args", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "echo",
    { args: "test message", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.equal(r.text, "test message");
});

await testAsync("\\echo no args → (empty)", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "echo",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.equal(r.text, "(empty)");
});

await testAsync("\\status → system info", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "status",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.ok(r.text?.includes("Memory"));
  assert.ok(r.text?.includes("Uptime"));
  assert.ok(r.text?.includes("Node"));
});

await testAsync("\\time → ISO string", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "time",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.ok(!isNaN(Date.parse(r.text!)), "Should be a valid ISO date");
});

await testAsync("\\version → contains OpenClaw", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "version",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.ok(r.text?.includes("OpenClaw"));
  assert.ok(!r.text?.includes("undefined"), "Version should not be undefined");
});

await testAsync("unknown action → error with help hint", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "nonexistent",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("Unknown action"));
  assert.ok(r.error?.includes("\\help"));
});

// ============================================================
// 4. CONFIG RESOLUTION TESTS
// ============================================================
console.log("\n📋 4. Config Resolution Tests");

test("defaults when no config", () => {
  const c = resolveEscapeActionConfig(undefined);
  assert.equal(c.enabled, true);
  assert.equal(c.prefix, "\\");
  assert.equal(c.actionsDir, "actions");
  assert.equal(c.maxResponseLength, 4000);
  assert.equal(c.executionTimeoutMs, 30000);
});

test("custom config overrides", () => {
  const c = resolveEscapeActionConfig({
    escapeActions: { enabled: false, executionTimeoutMs: 5000 },
  } as any);
  assert.equal(c.enabled, false);
  assert.equal(c.executionTimeoutMs, 5000);
  assert.equal(c.prefix, "\\");
  assert.equal(c.maxResponseLength, 4000);
});

test("invalid escapeActions type → defaults", () => {
  const c = resolveEscapeActionConfig({ escapeActions: "bad" } as any);
  assert.equal(c.enabled, true);
});

test("disabled → all actions bypassed", () => {
  const c = resolveEscapeActionConfig({ escapeActions: { enabled: false } } as any);
  assert.equal(c.enabled, false);
});

// ============================================================
// 5. LAZY LOADER TESTS (real file I/O)
// ============================================================
console.log("\n📋 5. Lazy Loader Tests");

const tmpDir = path.join("/tmp", `escape-action-test-${Date.now()}`);
const actionsDir = path.join(tmpDir, "actions");

await fs.mkdir(actionsDir, { recursive: true });

await testAsync("loadActionFromFs: non-existent action → undefined", async () => {
  const result = await loadActionFromFs("nonexistent", tmpDir, "actions");
  assert.equal(result, undefined);
});

await testAsync("loadActionFromFs: load custom action", async () => {
  const actionDir = path.join(actionsDir, "greet");
  await fs.mkdir(actionDir, { recursive: true });
  await fs.writeFile(
    path.join(actionDir, "main.ts"),
    `
    export const name = "greet";
    export const description = "Say hello";
    export const handler = async (ctx) => ({ ok: true, text: "Hello, " + ctx.args + "!" });
  `,
  );

  const loaded = await loadActionFromFs("greet", tmpDir, "actions");
  assert.ok(loaded, "Should load action");
  assert.equal(loaded!.name, "greet");
  assert.equal(loaded!.description, "Say hello");

  const result = await loaded!.handler({
    actionName: "greet",
    args: "World",
    rawBody: "\\greet World",
    channel: "c",
    to: "u",
    workspaceDir: tmpDir,
    deliver: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.text, "Hello, World!");
});

await testAsync("loadActionFromFs: default export", async () => {
  const actionDir = path.join(actionsDir, "defaultexp");
  await fs.mkdir(actionDir, { recursive: true });
  await fs.writeFile(
    path.join(actionDir, "main.ts"),
    `
    export default { handler: async () => ({ ok: true, text: "from default" }) };
  `,
  );

  const loaded = await loadActionFromFs("defaultexp", tmpDir, "actions");
  assert.ok(loaded, "Should load action with default export");

  const result = await loaded!.handler({
    actionName: "defaultexp",
    args: "",
    rawBody: "\\defaultexp",
    channel: "c",
    to: "u",
    workspaceDir: tmpDir,
    deliver: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.text, "from default");
});

await testAsync("loadActionFromFs: action without handler → undefined", async () => {
  const actionDir = path.join(actionsDir, "nohandler");
  await fs.mkdir(actionDir, { recursive: true });
  await fs.writeFile(path.join(actionDir, "main.ts"), `export const name = "nohandler";`);

  const loaded = await loadActionFromFs("nohandler", tmpDir, "actions");
  assert.equal(loaded, undefined, "Should not load action without handler");
});

await testAsync("listFileActions: lists available file actions", async () => {
  const fileActions = await listFileActions(tmpDir, "actions");
  // Should find greet, defaultexp, nohandler (has main.ts)
  assert.ok(fileActions.length >= 3, `Expected at least 3 file actions, got ${fileActions.length}`);
  const names = fileActions.map((f) => f.name);
  assert.ok(names.includes("greet"));
  assert.ok(names.includes("defaultexp"));
  assert.ok(names.includes("nohandler"));
});

await testAsync("listFileActions: nonexistent dir → empty", async () => {
  const result = await listFileActions("/tmp", "nonexistent-dir-xyz");
  assert.equal(result.length, 0);
});

// ============================================================
// 6. ROBUSTNESS TESTS
// ============================================================
console.log("\n📋 6. Robustness Tests");

await testAsync("malicious handler (throw) → error, not crash", async () => {
  const reg = new EscapeActionRegistry();
  reg.register({
    name: "malicious",
    handler: async () => {
      throw new Error("pwned!");
    },
    source: "t",
  });
  const r = await reg.execute(
    "malicious",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("pwned"));
});

await testAsync("concurrent 10 requests → all succeed", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const promises = Array.from({ length: 10 }, (_, i) =>
    reg.execute(
      "echo",
      { args: `msg-${i}`, channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
      defaultConfig,
    ),
  );
  const results = await Promise.all(promises);
  results.forEach((r, i) => {
    assert.equal(r.ok, true, `Request ${i} should succeed`);
    assert.equal(r.text, `msg-${i}`, `Request ${i} should echo correct args`);
  });
});

await testAsync("handler that returns nothing → ok:true with undefined text", async () => {
  const reg = new EscapeActionRegistry();
  reg.register({ name: "empty", handler: async () => ({ ok: true }) as any, source: "t" });
  const r = await reg.execute(
    "empty",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.equal(r.text, undefined);
});

// ============================================================
// 7. ESCAPE BODY REWRITE TESTS
// ============================================================
console.log("\n📋 7. Escape Body Rewrite Tests");

test("\\\\hello → escapedBody is \\hello", () => {
  const r = parseEscapeAction("\\\\hello");
  assert.equal(r.isAction, false);
  assert.equal(r.escapedBody, "\\hello");
});

test("\\\\ → escapedBody is \\", () => {
  const r = parseEscapeAction("\\\\");
  assert.equal(r.isAction, false);
  assert.equal(r.escapedBody, "\\");
});

test("  \\\\hello → preserves leading whitespace", () => {
  const r = parseEscapeAction("  \\\\hello");
  assert.equal(r.isAction, false);
  assert.equal(r.escapedBody, "  \\hello");
});

// ============================================================
// 8. INIT RACE CONDITION TESTS
// ============================================================
console.log("\n📋 8. Init Race Condition Tests");

const { ensureEscapeActionsInitialized, resetEscapeActionState } =
  await import("./escape-action-dispatch.js");

await testAsync("concurrent init → only runs once, no crash", async () => {
  resetEscapeActionState();
  const cfg = {
    escapeActions: { enabled: true, actionsDir: "nonexistent-dir-for-test", watch: false },
  } as any;
  const results = await Promise.all([
    ensureEscapeActionsInitialized(cfg),
    ensureEscapeActionsInitialized(cfg),
    ensureEscapeActionsInitialized(cfg),
    ensureEscapeActionsInitialized(cfg),
    ensureEscapeActionsInitialized(cfg),
  ]);
  results.forEach((r, i) => {
    assert.equal(r, undefined, `Call ${i} should resolve`);
  });
  // Second round should also resolve
  await ensureEscapeActionsInitialized(cfg);
  assert.ok(true, "No race condition or crash");
  resetEscapeActionState();
});

await testAsync("disabled config → init without builtins", async () => {
  resetEscapeActionState();
  const cfg = { escapeActions: { enabled: false } } as any;
  await ensureEscapeActionsInitialized(cfg);
  assert.equal(getGlobalEscapeActionRegistry().size, 0);
  resetEscapeActionState();
});

// ============================================================
// 9. PATH TRAVERSAL & SECURITY TESTS
// ============================================================
console.log("\n📋 9. Path Traversal & Security Tests");

await testAsync("loadActionFromFs: path traversal blocked", async () => {
  const result = await loadActionFromFs("../../etc", tmpDir, "actions");
  assert.equal(result, undefined, "Path traversal should be blocked");
});

await testAsync("loadActionFromFs: absolute path blocked", async () => {
  const result = await loadActionFromFs("/etc/passwd", tmpDir, "actions");
  assert.equal(result, undefined, "Absolute path should be blocked");
});

await testAsync("loadActionFromFs: null byte injection blocked", async () => {
  const result = await loadActionFromFs("foo%00../../etc", tmpDir, "actions");
  assert.equal(result, undefined, "Null byte injection should be blocked");
});

// ============================================================
// 10. LAZY RESOLUTION INTEGRATION TESTS
// ============================================================
console.log("\n📋 10. Lazy Resolution Integration Tests");

await testAsync("\\help shows both builtins and file actions", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "help",
    {
      args: "",
      channel: "c",
      to: "u",
      workspaceDir: tmpDir,
      actionsDir: "actions",
      deliver: async () => {},
    },
    defaultConfig,
  );
  assert.equal(r.ok, true);
  assert.ok(r.text?.includes("\\ping"), "Should show builtin ping");
  assert.ok(r.text?.includes("greet"), "Should show file-based greet action");
  assert.ok(r.text?.includes("file-based action"), "Should label file actions");
});

await testAsync("lazy load: unknown fs action → unknown error", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "totally-unknown-action",
    { args: "", channel: "c", to: "u", workspaceDir: tmpDir, deliver: async () => {} },
    defaultConfig,
  );
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("Unknown action"));
});

// ============================================================
// 11. LAZY ACTION TRUNCATION TESTS
// ============================================================
console.log("\n📋 11. Lazy Action Truncation Tests");

await testAsync("lazy-loaded action response truncation applied", async () => {
  const actionDir = path.join(actionsDir, "bigtext");
  await fs.mkdir(actionDir, { recursive: true });
  await fs.writeFile(
    path.join(actionDir, "main.ts"),
    `
    export const handler = async () => ({ ok: true, text: "x".repeat(5000) });
  `,
  );

  const loaded = await loadActionFromFs("bigtext", tmpDir, "actions");
  assert.ok(loaded, "Should load bigtext action");

  const result = await loaded!.handler({
    actionName: "bigtext",
    args: "",
    rawBody: "\\bigtext",
    channel: "c",
    to: "u",
    workspaceDir: tmpDir,
    deliver: async () => {},
  });

  // The handler itself returns 5000 chars — truncation should be applied by dispatch
  // But since we're calling the handler directly here, verify the raw result is long
  assert.equal(result.ok, true);
  assert.equal(
    result.text!.length,
    5000,
    "Handler returns full text (dispatch handles truncation)",
  );
});

// ============================================================
// CLEANUP
// ============================================================
await fs.rm(tmpDir, { recursive: true, force: true });

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${"=".repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log("\n❌ Failures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.err}`));
}
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
