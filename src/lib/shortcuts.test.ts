import { describe, expect, it } from "vitest";
import { matchesShortcut } from "./shortcuts";

function keyboardEvent(
  value: Partial<Parameters<typeof matchesShortcut>[0]>,
): Parameters<typeof matchesShortcut>[0] {
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    ...value,
  };
}

describe("keyboard shortcuts", () => {
  it("matches Ctrl+C by its physical key on a non-Latin layout", () => {
    expect(
      matchesShortcut(
        keyboardEvent({ ctrlKey: true, code: "KeyC", key: "с" }),
        "Ctrl+C",
      ),
    ).toBe(true);
  });

  it("still requires the configured modifiers", () => {
    const event = keyboardEvent({ ctrlKey: true, code: "KeyC", key: "c" });
    expect(matchesShortcut(event, "Ctrl+Shift+C")).toBe(false);
    expect(matchesShortcut(event, "Ctrl+C")).toBe(true);
  });
});
