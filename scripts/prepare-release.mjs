import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releaseDirectory = path.join(projectDirectory, "release");
const packageJson = JSON.parse(
  readFileSync(path.join(projectDirectory, "package.json"), "utf8"),
);
const version = packageJson.version;
const releaseFiles = [
  `FZ-Terminal-${version}-x86_64.AppImage`,
  `FZ-Terminal-${version}-amd64.deb`,
  `FZ-Terminal-${version}-x64.exe`,
  `FZ-Terminal-${version}-x64.zip`,
  `FZ-Terminal-${version}-arm64.zip`,
  "Install-FZ-Terminal.sh",
];

for (const name of releaseFiles) {
  if (!existsSync(path.join(releaseDirectory, name))) {
    throw new Error(`Release artifact is missing: ${name}`);
  }
}

const checksums = releaseFiles.map((name) => {
  const checksum = createHash("sha256")
    .update(readFileSync(path.join(releaseDirectory, name)))
    .digest("hex");
  return `${checksum}  ${name}`;
});
writeFileSync(
  path.join(releaseDirectory, "SHA256SUMS"),
  `${checksums.join("\n")}\n`,
  "utf8",
);
console.log(`Prepared FZ Terminal ${version} checksums for ${releaseFiles.length} artifacts.`);
