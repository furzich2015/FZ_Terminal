import { describe, expect, it } from "vitest";
import {
  findShortcutConflicts,
  isPlainCtrlC,
  matchesShortcut,
  normalizeShortcut,
} from "./shortcuts";

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
    expect(matchesShortcut(event, "Primary+C", "meta")).toBe(false);
    expect(
      matchesShortcut(
        keyboardEvent({ metaKey: true, code: "KeyC", key: "c" }),
        "Primary+C",
        "meta",
      ),
    ).toBe(true);
  });

  it("recognizes plain Ctrl+C independently of the keyboard layout", () => {
    expect(
      isPlainCtrlC(
        keyboardEvent({ ctrlKey: true, code: "KeyC", key: "с" }),
      ),
    ).toBe(true);
    expect(
      isPlainCtrlC(
        keyboardEvent({
          ctrlKey: true,
          shiftKey: true,
          code: "KeyC",
          key: "C",
        }),
      ),
    ).toBe(false);
  });

  it("normalizes platform primary modifiers and finds duplicates", () => {
    expect(normalizeShortcut("Primary+Shift+C", "ctrl")).toBe(
      "ctrl+shift+c",
    );
    expect(normalizeShortcut("Primary+C", "meta")).toBe("meta+c");
    expect(
      findShortcutConflicts(
        {
          copy: "Primary+C",
          interrupt: "Ctrl+C",
          paste: "Primary+V",
        },
        "ctrl",
      ),
    ).toEqual({ copy: ["interrupt"], interrupt: ["copy"] });
  });
});
