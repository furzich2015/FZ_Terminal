import { describe, expect, it } from "vitest";
import type { SplitNode } from "../types";
import { collectSessionIds, removePane, splitNode } from "./appStore";

const pane = (id: string): SplitNode => ({
  type: "pane",
  id,
  sessionId: `session-${id}`,
});

describe("split tree", () => {
  it("adds a second pane without replacing the first session", () => {
    const next = pane("two") as SplitNode & { type: "pane" };
    const root = splitNode(pane("one"), "one", "horizontal", next);

    expect(collectSessionIds(root)).toEqual(["session-one", "session-two"]);
  });

  it("collapses the parent when a pane is closed", () => {
    const next = pane("two") as SplitNode & { type: "pane" };
    const root = splitNode(pane("one"), "one", "vertical", next);

    expect(removePane(root, "one")).toEqual(next);
  });
});
