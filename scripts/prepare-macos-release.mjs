import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import blockmapModule from "app-builder-lib/out/targets/blockmap/blockmap.js";

const { buildBlockMap } = blockmapModule;
const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releaseDirectory = path.join(projectDirectory, "release");
const packageJson = JSON.parse(
  readFileSync(path.join(projectDirectory, "package.json"), "utf8"),
);

const targets = [
  { directory: "mac", architecture: "x64" },
  { directory: "mac-arm64", architecture: "arm64" },
];
const files = [];

for (const target of targets) {
  const appDirectory = path.join(releaseDirectory, target.directory);
  const artifactName = `FZ-Terminal-${packageJson.version}-${target.architecture}.zip`;
  const artifactPath = path.join(releaseDirectory, artifactName);
  const temporaryPath = path.join(releaseDirectory, `.${artifactName}`);
  rmSync(temporaryPath, { force: true });
  const result = spawnSync(
    "zip",
    ["-q", "-9", "-r", "-y", temporaryPath, "FZ Terminal.app"],
    { cwd: appDirectory, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`zip failed for macOS ${target.architecture}`);
  }
  renameSync(temporaryPath, artifactPath);

  const blockMapPath = `${artifactPath}.blockmap`;
  const updateInfo = await buildBlockMap(artifactPath, "gzip", blockMapPath);
  files.push({
    url: artifactName,
    sha512: updateInfo.sha512,
    size: updateInfo.size,
  });
}

const primary = files.find((file) => file.url.endsWith("-x64.zip"));
const releaseDate = new Date().toISOString();
const yaml = [
  `version: ${packageJson.version}`,
  "files:",
  ...files.flatMap((file) => [
    `  - url: ${file.url}`,
    `    sha512: ${file.sha512}`,
    `    size: ${file.size}`,
  ]),
  `path: ${primary.url}`,
  `sha512: ${primary.sha512}`,
  `releaseDate: '${releaseDate}'`,
  "",
].join("\n");
writeFileSync(path.join(releaseDirectory, "latest-mac.yml"), yaml, "utf8");

for (const file of files) {
  const digest = createHash("sha256")
    .update(readFileSync(path.join(releaseDirectory, file.url)))
    .digest("hex");
  console.log(
    `Prepared macOS ${file.url} (${statSync(path.join(releaseDirectory, file.url)).size} bytes, sha256 ${digest})`,
  );
}
