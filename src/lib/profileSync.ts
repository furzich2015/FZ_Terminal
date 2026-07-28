const PROFILE_ENTRY_PREFIX = "fz-terminal-";
const PROFILE_SYNC_INTERVAL = 1_500;

let lastSnapshot = "";
let syncTimer: number | undefined;

function collectProfileEntries() {
  const entries: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(PROFILE_ENTRY_PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

async function persistProfileIfChanged() {
  const entries = collectProfileEntries();
  const snapshot = JSON.stringify(entries);
  if (snapshot === lastSnapshot || Object.keys(entries).length === 0) return;
  try {
    await window.fzTerminal.profile.save(entries);
    lastSnapshot = snapshot;
  } catch (error) {
    console.warn("Unable to back up the FZ Terminal profile", error);
  }
}

export async function bootstrapProfile() {
  try {
    const backup = await window.fzTerminal.profile.load();
    for (const [key, value] of Object.entries(backup.entries)) {
      if (
        key.startsWith(PROFILE_ENTRY_PREFIX) &&
        localStorage.getItem(key) === null
      ) {
        localStorage.setItem(key, value);
      }
    }
    await persistProfileIfChanged();
  } catch (error) {
    console.warn("Unable to restore the FZ Terminal profile", error);
  }
}

export function startProfileSync() {
  if (syncTimer !== undefined) return;
  syncTimer = window.setInterval(() => {
    void persistProfileIfChanged();
  }, PROFILE_SYNC_INTERVAL);

  const persist = () => void persistProfileIfChanged();
  window.addEventListener("beforeunload", persist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist();
  });
}
