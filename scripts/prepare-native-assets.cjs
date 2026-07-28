const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const helpers = ["darwin-x64", "darwin-arm64"].map((architecture) =>
  path.join(
    projectRoot,
    "node_modules",
    "node-pty",
    "prebuilds",
    architecture,
    "spawn-helper",
  ),
);

for (const helper of helpers) {
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}
