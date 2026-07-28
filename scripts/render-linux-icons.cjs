const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(
  projectRoot,
  "assets",
  "branding",
  "fz-terminal.svg",
);
const outputDirectory = path.join(projectRoot, "build", "icons");
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const renderer = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    useContentSize: true,
    transparent: true,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: true,
      sandbox: true,
    },
  });
  const svg = fs.readFileSync(source, "utf8");
  const html = [
    "<!doctype html>",
    '<meta charset="utf-8">',
    "<style>",
    "html,body{width:1024px;height:1024px;margin:0;overflow:hidden;background:transparent}",
    "svg{display:block;width:1024px;height:1024px}",
    "</style>",
    svg,
  ].join("");
  let loaded = false;
  const painted = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out rendering the SVG application icon")),
      5000,
    );
    renderer.webContents.on("paint", (_event, _dirty, image) => {
      if (!loaded || image.isEmpty()) return;
      clearTimeout(timeout);
      resolve(image);
    });
  });
  await renderer.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
  );
  loaded = true;
  renderer.webContents.invalidate();
  const image = await painted;
  fs.mkdirSync(outputDirectory, { recursive: true });

  for (const size of sizes) {
    const png = image
      .resize({ width: size, height: size, quality: "best" })
      .toPNG();
    fs.writeFileSync(path.join(outputDirectory, `${size}x${size}.png`), png);
  }

  fs.copyFileSync(
    path.join(outputDirectory, "512x512.png"),
    path.join(projectRoot, "build", "icon.png"),
  );
  renderer.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on("window-all-closed", () => undefined);
