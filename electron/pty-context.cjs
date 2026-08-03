function foregroundStateFromLinuxProcStat(value) {
  if (typeof value !== "string") return undefined;
  const commandEnd = value.lastIndexOf(")");
  if (commandEnd < 0) return undefined;
  const fields = value.slice(commandEnd + 1).trim().split(/\s+/);
  const processGroup = Number(fields[2]);
  const foregroundProcessGroup = Number(fields[5]);
  return foregroundState(processGroup, foregroundProcessGroup);
}

function foregroundStateFromPsOutput(value) {
  if (typeof value !== "string") return undefined;
  const [processGroup, foregroundProcessGroup] = value
    .trim()
    .split(/\s+/)
    .map(Number);
  return foregroundState(processGroup, foregroundProcessGroup);
}

function foregroundState(processGroup, foregroundProcessGroup) {
  if (
    !Number.isInteger(processGroup) ||
    processGroup <= 0 ||
    !Number.isInteger(foregroundProcessGroup) ||
    foregroundProcessGroup <= 0
  ) {
    return undefined;
  }
  return {
    busy: processGroup !== foregroundProcessGroup,
    processGroup,
    foregroundProcessGroup,
  };
}

module.exports = {
  foregroundStateFromLinuxProcStat,
  foregroundStateFromPsOutput,
};
