type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export function matchesShortcut(
  event: ShortcutKeyboardEvent,
  shortcut: string,
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

  const keyMatches =
    event.key.toLowerCase() === key ||
    event.code.toLowerCase() === shortcutCodeForKey(key);
  return (
    keyMatches &&
    (!wantsPrimary || event.ctrlKey || event.metaKey) &&
    (!wantsCtrl || event.ctrlKey) &&
    (!wantsMeta || event.metaKey) &&
    event.altKey === wantsAlt &&
    event.shiftKey === wantsShift
  );
}

function shortcutCodeForKey(key?: string) {
  if (!key) return "";
  if (/^[a-z]$/.test(key)) return `key${key}`;
  if (/^\d$/.test(key)) return `digit${key}`;
  return key;
}
