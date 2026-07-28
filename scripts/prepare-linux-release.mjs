import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
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
const installerName = "Install-FZ-Terminal.sh";
const installerPath = path.join(releaseDirectory, installerName);

copyFileSync(
  path.join(projectDirectory, "install-linux.sh"),
  installerPath,
);
chmodSync(installerPath, 0o755);

const releaseFiles = readdirSync(releaseDirectory)
  .filter(
    (name) =>
      name === installerName ||
      (name.includes(`-${packageJson.version}-`) &&
        (name.endsWith(".deb") || name.endsWith(".AppImage"))),
  )
  .sort();

if (!releaseFiles.some((name) => name.endsWith(".deb"))) {
  throw new Error(`Linux DEB ${packageJson.version} was not generated`);
}
if (!releaseFiles.some((name) => name.endsWith(".AppImage"))) {
  throw new Error(`Linux AppImage ${packageJson.version} was not generated`);
}

const checksums = releaseFiles.map((name) => {
  const contents = readFileSync(path.join(releaseDirectory, name));
  const checksum = createHash("sha256").update(contents).digest("hex");
  return `${checksum}  release/${name}`;
});

writeFileSync(
  path.join(releaseDirectory, "SHA256SUMS"),
  `${checksums.join("\n")}\n`,
  "utf8",
);

console.log(
  `Prepared Linux ${packageJson.version}: ${releaseFiles.join(", ")}`,
);
