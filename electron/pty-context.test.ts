import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const ptyContext = require("./pty-context.cjs") as {
  foregroundStateFromLinuxProcStat: (
    value: string,
  ) => { busy: boolean } | undefined;
  foregroundStateFromPsOutput: (
    value: string,
  ) => { busy: boolean } | undefined;
};

describe("PTY foreground process context", () => {
  it("reports the shell as idle when it owns the terminal", () => {
    const stat =
      "123 (bash) S 1 123 123 34816 123 4194304 1 2 3 4 5 6 7";
    expect(ptyContext.foregroundStateFromLinuxProcStat(stat)?.busy).toBe(
      false,
    );
    expect(ptyContext.foregroundStateFromPsOutput("123 123")?.busy).toBe(
      false,
    );
  });

  it("reports a foreground job as busy", () => {
    const stat =
      "123 (login shell) S 1 123 123 34816 456 4194304 1 2 3 4 5 6 7";
    expect(ptyContext.foregroundStateFromLinuxProcStat(stat)?.busy).toBe(
      true,
    );
    expect(ptyContext.foregroundStateFromPsOutput("123 456")?.busy).toBe(
      true,
    );
  });
});
