const path = require("node:path");
const os = require("node:os");

const SSH_OPTIONS_WITH_VALUE = new Set([
  "-b",
  "-c",
  "-D",
  "-E",
  "-e",
  "-F",
  "-I",
  "-i",
  "-J",
  "-L",
  "-l",
  "-m",
  "-O",
  "-o",
  "-p",
  "-Q",
  "-R",
  "-S",
  "-W",
  "-w",
]);

function resolveDetectedIdentityFile(value, workingDirectory) {
  const requested = String(value || "").trim();
  if (!requested || requested.includes("\0")) return undefined;
  if (requested === "~") return os.homedir();
  if (requested.startsWith("~/")) {
    return path.join(os.homedir(), requested.slice(2));
  }
  return path.isAbsolute(requested)
    ? requested
    : path.resolve(workingDirectory || os.homedir(), requested);
}

function parseSshOption(value, state, workingDirectory) {
  const separator = value.indexOf("=");
  const key = (separator >= 0 ? value.slice(0, separator) : value)
    .trim()
    .toLowerCase();
  const optionValue = (separator >= 0 ? value.slice(separator + 1) : "").trim();
  if (key === "identityfile" && optionValue) {
    state.identityFile = resolveDetectedIdentityFile(
      optionValue,
      workingDirectory,
    );
  } else if (key === "user" && optionValue) {
    state.user = optionValue;
  } else if (key === "port" && /^\d+$/.test(optionValue)) {
    state.port = Number(optionValue);
  }
}

function parseSshConnection(args, workingDirectory) {
  let user;
  let port = 22;
  let target = "";
  let identityFile;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      target = args[index + 1] || "";
      break;
    }
    if (argument === "-l" && args[index + 1]) {
      user = args[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("-l") && argument.length > 2) {
      user = argument.slice(2);
      continue;
    }
    if (argument === "-p" && /^\d+$/.test(args[index + 1] || "")) {
      port = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (/^-p\d+$/.test(argument)) {
      port = Number(argument.slice(2));
      continue;
    }
    if (argument === "-i" && args[index + 1]) {
      identityFile = resolveDetectedIdentityFile(
        args[index + 1],
        workingDirectory,
      );
      index += 1;
      continue;
    }
    if (argument.startsWith("-i") && argument.length > 2) {
      identityFile = resolveDetectedIdentityFile(
        argument.slice(2),
        workingDirectory,
      );
      continue;
    }
    if (argument === "-o" && args[index + 1]) {
      const state = { user, port, identityFile };
      parseSshOption(args[index + 1], state, workingDirectory);
      ({ user, port, identityFile } = state);
      index += 1;
      continue;
    }
    if (argument.startsWith("-o") && argument.length > 2) {
      const state = { user, port, identityFile };
      parseSshOption(argument.slice(2), state, workingDirectory);
      ({ user, port, identityFile } = state);
      continue;
    }
    if (SSH_OPTIONS_WITH_VALUE.has(argument)) {
      index += 1;
      continue;
    }
    if (!argument.startsWith("-")) {
      target = argument;
      break;
    }
  }
  if (!target) return undefined;
  const at = target.lastIndexOf("@");
  const host = at >= 0 ? target.slice(at + 1) : target;
  if (at >= 0) user = target.slice(0, at);
  if (!host || /[\s\0]/.test(host)) return undefined;
  return {
    host,
    ...(user ? { user } : {}),
    port: Math.min(65535, Math.max(1, port || 22)),
    ...(identityFile ? { identityFile } : {}),
  };
}

function tokenizeShellCommand(value) {
  const tokens = [];
  let token = "";
  let quote = "";
  let escaped = false;
  const push = () => {
    if (token) tokens.push(token);
    token = "";
  };
  for (const character of String(value || "")) {
    if (escaped) {
      token += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = "";
      else token += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      push();
    } else {
      token += character;
    }
  }
  if (escaped) token += "\\";
  push();
  return tokens;
}

function analyzeSshCommand(command, workingDirectory) {
  const tokens = tokenizeShellCommand(command);
  const sshIndex = tokens.findIndex((token) =>
    /^(?:ssh|ssh\.exe)$/i.test(path.basename(token)),
  );
  if (sshIndex < 0) return undefined;
  const connection = parseSshConnection(
    tokens.slice(sshIndex),
    workingDirectory,
  );
  return connection ? { connection } : undefined;
}

function resolveRemoteCompletionDirectory(currentDirectory, requestedDirectory) {
  const current = String(currentDirectory || "").trim();
  const requested = String(requestedDirectory || "").trim();
  const cwd =
    current.startsWith("/") || current === "~" || current.startsWith("~/")
      ? current
      : "~";
  if (!requested) return cwd;
  if (
    requested.startsWith("/") ||
    requested === "~" ||
    requested.startsWith("~/")
  ) {
    return path.posix.normalize(requested);
  }
  return path.posix.normalize(`${cwd.replace(/\/$/, "")}/${requested}`);
}

module.exports = {
  analyzeSshCommand,
  parseSshConnection,
  resolveRemoteCompletionDirectory,
};
