import { useEffect, useState } from "react";
import type { UpdateStatus } from "../types";

const initialStatus: UpdateStatus = {
  state: "idle",
  currentVersion: "0.0.0",
  message: "Ready to check for updates.",
};

export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>(initialStatus);

  useEffect(() => {
    let active = true;
    void window.fzTerminal.updates.getStatus().then((value) => {
      if (active) setStatus(value);
    });
    const unsubscribe = window.fzTerminal.updates.onStatus((value) => {
      if (active) setStatus(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return status;
}
