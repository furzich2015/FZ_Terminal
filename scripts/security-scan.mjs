import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ignoredDirectories = new Set([
  ".git",
  ".idea",
  ".tooling",
  ".vite",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
  "release",
  "target",
]);

function listPublishableFiles(directory, relativeDirectory = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) return [];
      return listPublishableFiles(
        path.join(directory, entry.name),
        relativePath,
      );
    }
    if (
      entry.name.endsWith(".log") ||
      entry.name === ".DS_Store" ||
      entry.name === "Thumbs.db" ||
      entry.name.endsWith(".code-workspace")
    ) {
      return [];
    }
    return [relativePath];
  });
}

const fileNames = listPublishableFiles(projectDirectory);

const sensitiveFileName =
  /(^|\/)(\.env(?:\.|$)|id_(?:rsa|ed25519)|profile\.json$)|\.(?:pem|key|p12|pfx|jks|keystore|mobileprovision)$/i;
const rules = [
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  {
    name: "GitHub token",
    pattern: /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/,
  },
  {
    name: "cloud API credential",
    pattern:
      /\b(?:AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/,
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    name: "credential in URL",
    pattern: /https?:\/\/[^\s/:]+:[^\s@/]+@/i,
  },
  {
    name: "npm authentication token",
    pattern: /(?:^|\n)\s*\/\/[^:\s]+\/:_authToken\s*=\s*\S+/i,
  },
  {
    name: "hard-coded local home path",
    pattern: /(?:\/home\/|\/Users\/)[A-Za-z0-9._-]+\//,
  },
];

const findings = [];
for (const fileName of fileNames) {
  if (fileName === path.join("scripts", "security-scan.mjs")) continue;
  if (sensitiveFileName.test(fileName)) {
    findings.push({ fileName, rule: "sensitive file name" });
    continue;
  }

  const absolutePath = path.join(projectDirectory, fileName);
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    continue;
  }
  if (!stats.isFile() || stats.size > 5 * 1024 * 1024) continue;

  const contents = readFileSync(absolutePath);
  if (contents.includes(0)) continue;
  const text = contents.toString("utf8");
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      findings.push({ fileName, rule: rule.name });
    }
  }
}

if (findings.length > 0) {
  console.error("Potential confidential data found:");
  for (const finding of findings) {
    console.error(`- ${finding.fileName}: ${finding.rule}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Security scan passed: ${fileNames.length} publishable files checked.`,
  );
}
