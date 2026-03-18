import { describe, it, expect } from "vitest";
import { parseEscapeAction, looksLikeEscapeAction } from "./escape-action-parse.js";

describe("parseEscapeAction", () => {
  it("returns non-action for plain text", () => {
    const result = parseEscapeAction("hello world");
    expect(result.isAction).toBe(false);
    expect(result.escapedBody).toBe("hello world");
  });

  it("returns non-action for text starting with space then backslash", () => {
    const result = parseEscapeAction(" \\hello");
    expect(result.isAction).toBe(false);
  });

  it("parses \\command as action", () => {
    const result = parseEscapeAction("\\status");
    expect(result.isAction).toBe(true);
    expect(result.actionName).toBe("status");
    expect(result.args).toBe("");
  });

  it("parses \\command with args", () => {
    const result = parseEscapeAction("\\hi hello world");
    expect(result.isAction).toBe(true);
    expect(result.actionName).toBe("hi");
    expect(result.args).toBe("hello world");
  });

  it("treats \\\\ as escaped backslash", () => {
    const result = parseEscapeAction("\\\\");
    expect(result.isAction).toBe(false);
    expect(result.escapedBody).toBe("\\");
  });

  it("treats \\\\xxx as escaped backslash + text", () => {
    const result = parseEscapeAction("\\\\hello");
    expect(result.isAction).toBe(false);
    expect(result.escapedBody).toBe("\\hello");
  });

  it("action names are lowercased", () => {
    const result = parseEscapeAction("\\STATUS verbose");
    expect(result.isAction).toBe(true);
    expect(result.actionName).toBe("status");
    expect(result.args).toBe("verbose");
  });

  it("handles empty body", () => {
    const result = parseEscapeAction("");
    expect(result.isAction).toBe(false);
  });

  it("handles lone backslash as non-action (no command name)", () => {
    const result = parseEscapeAction("\\");
    expect(result.isAction).toBe(false);
  });

  it("handles body with leading whitespace preserved", () => {
    const result = parseEscapeAction("  \\hello");
    expect(result.isAction).toBe(false);
  });

  it("handles body with leading whitespace for action", () => {
    // trimmed body starts with \, so this should be detected
    // Wait — we use trimStart, so leading spaces are consumed
    // Actually looking at the implementation: `const trimmed = rawBody.trimStart();`
    // So "  \\hello" → trimmed = "\\hello" → escaped
    // And for the escaped case we reconstruct: `leadingWhitespace + "\\" + literalRest`
    const result = parseEscapeAction("  \\\\hello");
    expect(result.isAction).toBe(false);
    expect(result.escapedBody).toBe("  \\hello");
  });
});

describe("looksLikeEscapeAction", () => {
  it("returns true for \\status", () => {
    expect(looksLikeEscapeAction("\\status")).toBe(true);
  });

  it("returns false for \\\\status", () => {
    expect(looksLikeEscapeAction("\\\\status")).toBe(false);
  });

  it("returns false for hello", () => {
    expect(looksLikeEscapeAction("hello")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(looksLikeEscapeAction("")).toBe(false);
  });

  it("returns true with custom prefix", () => {
    expect(looksLikeEscapeAction("!status", "!")).toBe(true);
  });

  it("returns false for double custom prefix", () => {
    expect(looksLikeEscapeAction("!!status", "!")).toBe(false);
  });
});
