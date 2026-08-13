import { describe, expect, it } from "vitest";
import { sanitizeNoteText } from "./noteText";

describe("sanitizeNoteText", () => {
  it("removes invisible formatting and control characters from code", () => {
    expect(
      sanitizeNoteText(
        "const\u200b value\u2060 =\u00a0'clean';\u202e\u0000\r\nnext\tline",
      ),
    ).toBe("const value = 'clean';\nnext\tline");
  });

  it("preserves visible Unicode and normal line breaks", () => {
    expect(sanitizeNoteText("Привіт 👋\nключ=value")).toBe(
      "Привіт 👋\nключ=value",
    );
  });
});
