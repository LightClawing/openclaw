import type { EscapeActionParseResult } from "./escape-action-types.js";

/**
 * Parse an inbound message body for escape action syntax.
 *
 * Rules:
 * - `\xxx`     → action command (actionName="xxx", args=rest)
 * - `\\`       → escaped literal backslash
 * - `\\xxx`    → escaped literal `\xxx`
 * - anything else → pass through unchanged
 *
 * The prefix `\` must be at the very start of the trimmed body.
 */
export function parseEscapeAction(rawBody: string, prefix = "\\"): EscapeActionParseResult {
  const trimmed = rawBody.trimStart();
  if (!trimmed.startsWith(prefix)) {
    return { isAction: false, escapedBody: rawBody };
  }

  const afterPrefix = trimmed.slice(prefix.length);

  // `\\` → escaped backslash (possibly followed by more text)
  if (afterPrefix.startsWith(prefix)) {
    // Consume the second backslash; the rest is the literal body
    const literalRest = afterPrefix.slice(prefix.length);
    // Reconstruct with original leading whitespace + single `\`
    const leadingWhitespace = rawBody.slice(0, rawBody.length - trimmed.length);
    return {
      isAction: false,
      escapedBody: `${leadingWhitespace}\\${literalRest}`,
    };
  }

  // `\xxx ...` → action command
  // Extract the action name (first word) and the rest as args
  const actionMatch = afterPrefix.match(/^(\S+)(?:\s([\s\S]*))?$/);
  if (!actionMatch || !actionMatch[1]) {
    return { isAction: false, escapedBody: rawBody };
  }

  const actionName = actionMatch[1].toLowerCase();
  const args = actionMatch[2] ?? "";

  return { isAction: true, actionName, args };
}

/**
 * Check whether a raw body looks like it could be an escape action
 * (starts with `\` and is not `\\`). This is a fast pre-check that
 * avoids full parsing when unnecessary.
 */
export function looksLikeEscapeAction(rawBody: string, prefix = "\\"): boolean {
  const trimmed = rawBody.trimStart();
  if (!trimmed.startsWith(prefix)) {
    return false;
  }
  // If the next char is also `\`, it's an escape, not an action
  return !trimmed.startsWith(prefix + prefix);
}
