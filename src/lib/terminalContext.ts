import type {
  DetectedRemoteConnection,
  PtyContext,
  RemoteConnection,
} from "../types";

function normalizeHost(value: string) {
  return value.trim().replace(/^\[(.*)\]$/, "$1").toLowerCase();
}

function normalizeUser(value?: string) {
  return value?.trim().toLowerCase() || "";
}

export function connectionsMatch(
  expected: RemoteConnection,
  actual?: DetectedRemoteConnection,
) {
  if (!actual) return false;
  return (
    normalizeHost(expected.host) === normalizeHost(actual.host) &&
    (expected.port || 22) === (actual.port || 22) &&
    normalizeUser(expected.user) === normalizeUser(actual.user)
  );
}

export function selectFileTerminalCandidate<T extends { context: PtyContext }>(
  candidates: T[],
  expectedConnection?: RemoteConnection,
) {
  if (expectedConnection) {
    const matchingRemote = candidates.find(
      ({ context }) =>
        context.remote &&
        context.verified !== false &&
        connectionsMatch(expectedConnection, context.connection),
    );
    if (matchingRemote) return matchingRemote;
  }
  return candidates.find(({ context }) => !context.remote);
}

function cleanDirectory(value: string) {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+[-—|]\s+(?:bash|zsh|fish|sh|ssh).*$/i, "")
    .trim();
}

function directoryFromPrompt(value: string) {
  const line = value.trim();
  if (!line) return "";

  const hostPrompt = line.match(
    /(?:^|\s)[^@\s:]+@[^:\s]+:((?:~|\/).*?)(?=[#$%>]\s|[#$%>]$)/,
  );
  if (hostPrompt?.[1]) return cleanDirectory(hostPrompt[1]);

  const bracketPrompt = line.match(
    /\[[^\]]*?\s((?:~|\/).*?)\](?=[#$%>]\s|[#$%>]$)/,
  );
  if (bracketPrompt?.[1]) return cleanDirectory(bracketPrompt[1]);

  const simplePrompt = line.match(
    /(?:^|\s)((?:~|\/)[^#$%>]*?)(?=[#$%>]\s|[#$%>]$)/,
  );
  return simplePrompt?.[1] ? cleanDirectory(simplePrompt[1]) : "";
}

function directoryFromTitle(value: string) {
  const title = value.trim();
  if (!title) return "";
  const hostTitle = title.match(/^[^@\s:]+@[^:\s]+:\s*((?:~|\/).+)$/);
  if (hostTitle?.[1]) return cleanDirectory(hostTitle[1]);
  if (title.startsWith("/") || title.startsWith("~")) {
    return cleanDirectory(title);
  }
  return "";
}

export function detectTerminalDirectory(lines: string[], title = "") {
  for (const line of lines) {
    const directory = directoryFromPrompt(line);
    if (directory) return directory;
  }
  return directoryFromTitle(title);
}
