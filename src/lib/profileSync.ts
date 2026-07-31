const PROFILE_ENTRY_PREFIX = "fz-terminal-";
const PROFILE_SYNC_INTERVAL = 5_000;

let lastFingerprint = "";
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

function fingerprintProfileEntries(entries: Record<string, string>) {
  let hash = 2_166_136_261;
  let size = 0;
  let count = 0;
  const update = (value: string) => {
    size += value.length;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
  };
  for (const key of Object.keys(entries).sort()) {
    count += 1;
    update(key);
    update(entries[key]);
  }
  return `${count}:${size}:${hash >>> 0}`;
}

async function persistProfileIfChanged() {
  const entries = collectProfileEntries();
  const fingerprint = fingerprintProfileEntries(entries);
  if (
    fingerprint === lastFingerprint ||
    Object.keys(entries).length === 0
  ) {
    return;
  }
  try {
    await window.fzTerminal.profile.save(entries);
    lastFingerprint = fingerprint;
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
