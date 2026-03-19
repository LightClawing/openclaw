/* eslint-disable */
/**
 * Comprehensive self-test covering ALL review fixes (R3 + R4 + R5).
 * Run: node --import tsx src/auto-reply/reply/escape-action-review-test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parseEscapeAction, looksLikeEscapeAction } = await import("./escape-action-parse.js");
const { registerBuiltinActions } = await import("./escape-action-builtin.js");
const { EscapeActionRegistry } = await import("./escape-action-registry.js");

let passed = 0;
let failed = 0;
const failures: { name: string; err: string }[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push({ name, err: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push({ name, err: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

const defaultCfg: any = {
  enabled: true,
  prefix: "\\",
  actionsDir: "actions",
  watch: true,
  maxResponseLength: 4000,
  executionTimeoutMs: 5000,
};
const customCfg = { ...defaultCfg, prefix: "!" };

// ============================================================
console.log("\n📋 A. R3 Fix #1: args undefined/null propagation");
// ============================================================

await testAsync("A1: echo with undefined args → (empty), no crash", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "echo",
    {
      args: undefined,
      channel: "c",
      to: "u",
      workspaceDir: "/tmp",
      deliver: async () => {},
    } as any,
    defaultCfg,
  );
  assert.equal(r.ok, true);
  assert.equal(r.text, "(empty)");
});

await testAsync("A2: echo with null args → (empty)", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "echo",
    { args: null, channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} } as any,
    defaultCfg,
  );
  assert.equal(r.text, "(empty)");
});

await testAsync("A3: echo with empty string → (empty)", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "echo",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultCfg,
  );
  assert.equal(r.text, "(empty)");
});

await testAsync("A4: echo with whitespace-only → (empty)", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "echo",
    { args: "   ", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultCfg,
  );
  assert.equal(r.text, "(empty)");
});

await testAsync("A5: echo with content → echoes back", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "echo",
    { args: "hello world", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultCfg,
  );
  assert.equal(r.text, "hello world");
});

await testAsync("A6: full path \\echo test → parsed.args='test' → echo 'test'", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const parsed = parseEscapeAction("\\echo test");
  assert.equal(parsed.isAction, true);
  assert.equal(parsed.args, "test");
  // Simulate dispatch: pass parsed.args to execute
  const r = await reg.execute(
    parsed.actionName,
    { args: parsed.args, channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultCfg,
  );
  assert.equal(r.text, "test");
});

await testAsync("A7: full path \\echo (no args) → args='' → (empty)", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const parsed = parseEscapeAction("\\echo");
  assert.equal(parsed.isAction, true);
  assert.equal(parsed.args, "");
  const r = await reg.execute(
    parsed.actionName,
    { args: parsed.args, channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultCfg,
  );
  assert.equal(r.text, "(empty)");
});

// ============================================================
console.log("\n📋 B. R4 Fix #1: Custom prefix escape path (parser)");
// ============================================================

test("B1: !!escaped with prefix ! → !escaped", () => {
  const r = parseEscapeAction("!!escaped", "!");
  assert.equal(r.isAction, false);
  assert.equal(r.escapedBody, "!escaped");
});

test("B2: !! with prefix ! → !", () => {
  const r = parseEscapeAction("!!", "!");
  assert.equal(r.escapedBody, "!");
});

test("B3: '  !!hello' with prefix ! → '  !hello'", () => {
  const r = parseEscapeAction("  !!hello", "!");
  assert.equal(r.escapedBody, "  !hello");
});

test("B4: !status with prefix ! → action", () => {
  const r = parseEscapeAction("!status", "!");
  assert.equal(r.isAction, true);
  assert.equal(r.actionName, "status");
});

test("B5: >cmd with prefix > → action", () => {
  const r = parseEscapeAction(">cmd", ">");
  assert.equal(r.isAction, true);
  assert.equal(r.actionName, "cmd");
});

test("B6: >>escaped with prefix > → >escaped", () => {
  const r = parseEscapeAction(">>escaped", ">");
  assert.equal(r.escapedBody, ">escaped");
});

test("B7: default prefix \\\\ still works", () => {
  const r = parseEscapeAction("\\\\hello");
  assert.equal(r.escapedBody, "\\hello");
});

test("B8: looksLikeEscapeAction with prefix !", () => {
  assert.equal(looksLikeEscapeAction("!ping", "!"), true);
  assert.equal(looksLikeEscapeAction("!!ping", "!"), false);
  assert.equal(looksLikeEscapeAction("hello", "!"), false);
});

// ============================================================
console.log("\n📋 C. R5 Fix: Custom prefix in help (builtin + file)");
// ============================================================

await testAsync('C1: builtin help with prefix "!" → shows !echo', async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "help",
    { args: "", prefix: "!", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    customCfg,
  );
  assert.ok(r.text!.includes("!echo"), "Should show !echo");
  assert.ok(!r.text!.includes("\\echo"), "Should NOT show \\echo");
});

await testAsync("C2: builtin help with default prefix → shows \\echo", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "help",
    { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultCfg,
  );
  assert.ok(r.text!.includes("\\echo"));
});

await testAsync("C3: builtin help with undefined prefix → falls back to \\", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const r = await reg.execute(
    "help",
    {
      args: "",
      prefix: undefined,
      channel: "c",
      to: "u",
      workspaceDir: "/tmp",
      deliver: async () => {},
    },
    defaultCfg,
  );
  assert.ok(r.text!.includes("\\echo"), "Should fallback to \\ prefix");
});

await testAsync('C4: builtin help with prefix ">" → shows >echo', async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const cfg = { ...defaultCfg, prefix: ">" };
  const r = await reg.execute(
    "help",
    { args: "", prefix: ">", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    cfg,
  );
  assert.ok(r.text!.includes(">echo"));
});

// ============================================================
console.log("\n📋 D. R3 Fix #2: Actions directory + ACTION.md");
// ============================================================

test("D1: actions/ACTION.md exists", () => {
  const f = path.join(__dirname, "actions", "ACTION.md");
  assert.ok(fs.existsSync(f), "ACTION.md not found");
});

test("D2: all 6 file-based action dirs have main.ts", () => {
  const names = ["echo", "help", "ping", "status", "time", "version"];
  for (const n of names) {
    const f = path.join(__dirname, "actions", n, "main.ts");
    assert.ok(fs.existsSync(f), `Missing: ${f}`);
  }
});

test("D3: ACTION.md contains key references", () => {
  const content = fs.readFileSync(path.join(__dirname, "actions", "ACTION.md"), "utf8");
  assert.ok(content.includes("ActionHandler"), "Missing ActionHandler");
  assert.ok(content.includes("ctx.args"), "Missing ctx.args");
  assert.ok(
    content.toLowerCase().includes("hot-deploy") || content.toLowerCase().includes("hot deploy"),
    "Missing hot-deploy",
  );
  assert.ok(content.includes("ACTION.md"), "Missing self-reference");
});

test("D4: echo/main.ts has (ctx.args ?? '') guard", () => {
  const content = fs.readFileSync(path.join(__dirname, "actions", "echo", "main.ts"), "utf8");
  assert.ok(content.includes("??") || content.includes("||"), "Should have null guard for args");
});

test("D5: help/main.ts uses ctx.prefix", () => {
  const content = fs.readFileSync(path.join(__dirname, "actions", "help", "main.ts"), "utf8");
  assert.ok(content.includes("ctx.prefix"), "Should reference ctx.prefix");
});

// ============================================================
console.log("\n📋 E. R4 Fix #2: Comment accuracy");
// ============================================================

test("E1: builtin.ts comment mentions 'fallback'", () => {
  const content = fs.readFileSync(path.join(__dirname, "escape-action-builtin.ts"), "utf8");
  assert.ok(content.toLowerCase().includes("fallback"), "Should mention fallback behavior");
});

test("E2: dispatch.ts comment does NOT say 'idempotent'", () => {
  const content = fs.readFileSync(path.join(__dirname, "escape-action-dispatch.ts"), "utf8");
  assert.ok(!content.includes("idempotent"), "Should not contain misleading 'idempotent'");
});

// ============================================================
console.log("\n📋 F. Regression: full default prefix end-to-end");
// ============================================================

await testAsync("F1: \\ping → pong", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const parsed = parseEscapeAction("\\ping");
  const r = await reg.execute(
    "ping",
    { args: parsed.args, channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    defaultCfg,
  );
  assert.ok(r.text!.includes("pong"));
});

test("F2: \\\\ → escaped body \\", () => {
  const r = parseEscapeAction("\\\\");
  assert.equal(r.escapedBody, "\\");
});

await testAsync("F3: !ping with custom prefix → pong", async () => {
  const reg = new EscapeActionRegistry();
  registerBuiltinActions(reg);
  const parsed = parseEscapeAction("!ping", "!");
  const r = await reg.execute(
    "ping",
    { args: parsed.args, channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    customCfg,
  );
  assert.ok(r.text!.includes("pong"));
});

await testAsync(
  "F4: all builtins still work (help, ping, status, time, version, echo)",
  async () => {
    const reg = new EscapeActionRegistry();
    registerBuiltinActions(reg);
    for (const name of ["help", "ping", "status", "time", "version", "echo"]) {
      const r = await reg.execute(
        name,
        { args: "", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
        defaultCfg,
      );
      assert.equal(r.ok, true, `\\${name} should succeed`);
    }
  },
);

await testAsync("F5: ActionContext has prefix field", async () => {
  const reg = new EscapeActionRegistry();
  let receivedPrefix: string | undefined;
  reg.register({
    name: "checkprefix",
    handler: async (ctx) => {
      receivedPrefix = ctx.prefix;
      return { ok: true, text: String(ctx.prefix) };
    },
    source: "test",
  });
  await reg.execute(
    "checkprefix",
    { args: "", prefix: "!", channel: "c", to: "u", workspaceDir: "/tmp", deliver: async () => {} },
    customCfg,
  );
  assert.equal(receivedPrefix, "!");
});

// ============================================================
console.log("\n" + "=".repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log("\n❌ Failures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.err}`));
}
console.log("=".repeat(50));
process.exit(failed > 0 ? 1 : 0);
