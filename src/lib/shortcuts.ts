type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export type PrimaryModifier = "ctrl" | "meta";

export function matchesShortcut(
  event: ShortcutKeyboardEvent,
  shortcut: string,
  primaryModifier: PrimaryModifier = defaultPrimaryModifier(),
) {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.at(-1)?.toLowerCase();
  const wantsPrimary = parts.some(
    (part) => part.toLowerCase() === "primary",
  );
  const wantsCtrl = parts.some((part) => part.toLowerCase() === "ctrl");
  const wantsMeta = parts.some((part) =>
    ["meta", "cmd", "command"].includes(part.toLowerCase()),
  );
  const wantsAlt = parts.some((part) => part.toLowerCase() === "alt");
  const wantsShift = parts.some((part) => part.toLowerCase() === "shift");
  const wantsPrimaryCtrl = wantsPrimary && primaryModifier === "ctrl";
  const wantsPrimaryMeta = wantsPrimary && primaryModifier === "meta";

  const keyMatches =
    event.key.toLowerCase() === key ||
    event.code.toLowerCase() === shortcutCodeForKey(key);
  return (
    keyMatches &&
    event.ctrlKey === (wantsCtrl || wantsPrimaryCtrl) &&
    event.metaKey === (wantsMeta || wantsPrimaryMeta) &&
    event.altKey === wantsAlt &&
    event.shiftKey === wantsShift
  );
}

function defaultPrimaryModifier(): PrimaryModifier {
  return typeof navigator !== "undefined" &&
    navigator.platform.includes("Mac")
    ? "meta"
    : "ctrl";
}

export function isPlainCtrlC(event: ShortcutKeyboardEvent) {
  return (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.code.toLowerCase() === "keyc" ||
      event.key.toLowerCase() === "c")
  );
}

export function normalizeShortcut(
  shortcut: string,
  primaryModifier: PrimaryModifier,
) {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const key = parts.at(-1) ?? "";
  const modifiers = new Set(
    parts.slice(0, -1).map((part) => {
      if (part === "primary") return primaryModifier;
      if (["cmd", "command"].includes(part)) return "meta";
      if (part === "control") return "ctrl";
      return part;
    }),
  );
  return ["ctrl", "meta", "alt", "shift"]
    .filter((modifier) => modifiers.has(modifier))
    .concat(key)
    .join("+");
}

export function findShortcutConflicts<T extends string>(
  shortcuts: Record<T, string>,
  primaryModifier: PrimaryModifier,
) {
  const groups = new Map<string, T[]>();
  for (const [action, shortcut] of Object.entries(shortcuts) as [T, string][]) {
    const normalized = normalizeShortcut(shortcut, primaryModifier);
    if (!normalized) continue;
    groups.set(normalized, [...(groups.get(normalized) ?? []), action]);
  }

  const conflicts: Partial<Record<T, T[]>> = {};
  for (const actions of groups.values()) {
    if (actions.length < 2) continue;
    for (const action of actions) {
      conflicts[action] = actions.filter((candidate) => candidate !== action);
    }
  }
  return conflicts;
}

function shortcutCodeForKey(key?: string) {
  if (!key) return "";
  if (/^[a-z]$/.test(key)) return `key${key}`;
  if (/^\d$/.test(key)) return `digit${key}`;
  return key;
}
