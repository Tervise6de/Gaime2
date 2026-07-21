import { chromium } from "playwright-core";
const exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1520, height: 1140 }, deviceScaleFactor: 2 });
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[error]", e.message));
await page.goto("http://localhost:5188/prototypes/pixi-map/index.html", { waitUntil: "load" });
await page.waitForFunction("window.__mapReady === true", { timeout: 15000 }).catch(() => console.log("no ready flag"));
await page.waitForTimeout(1000);
if (process.argv[3]) {
  await page.evaluate((n) => window.__demo(n), process.argv[3]);
  await page.waitForTimeout(500);
}
const el = await page.$("#app canvas");
await el.screenshot({ path: process.argv[2] || "/tmp/claude-0/-home-user-Gaime2/5cee13a7-495c-546e-82cc-ef1b88cce1e8/scratchpad/map.png" });
await browser.close();
console.log("shot done");
