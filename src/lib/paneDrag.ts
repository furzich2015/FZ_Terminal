import type { TabKind } from "../types";

export const PANE_DRAG_MIME = "application/x-fz-pane";

export interface PaneDragPayload {
  workspaceId: string;
  tabId: string;
  paneId: string;
  kind: TabKind;
}

export function parsePaneDrag(value: string): PaneDragPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<PaneDragPayload>;
    if (
      typeof parsed.workspaceId === "string" &&
      typeof parsed.tabId === "string" &&
      typeof parsed.paneId === "string" &&
      (parsed.kind === "terminal" ||
        parsed.kind === "browser" ||
        parsed.kind === "files" ||
        parsed.kind === "note")
    ) {
      return parsed as PaneDragPayload;
    }
  } catch {
    // Ignore unrelated native drag payloads.
  }
  return null;
}
