// End-to-end run of the app over file:// in WebKit (Safari's engine) and Chromium.
// Usage: NODE_PATH=<dir with playwright> node e2e.js <screenshot dir> [webkit|chromium ...]

const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { webkit, chromium } = require("playwright");

const APP = pathToFileURL(path.resolve(__dirname, "..", "app", "index.html")).href;
const OUT = process.argv[2];
const ENGINES = process.argv.slice(3).length ? process.argv.slice(3) : ["webkit", "chromium"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function run(engineName) {
  console.log(`\n=== ${engineName} ===`);
  const engine = engineName === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|Not allowed to load local resource/.test(m.text()) && errors.push(m.text()));

  // The Mongolian clip is missing on purpose until a recording exists; any other missing file is an error.
  page.on("requestfailed", (r) => {
    const why = (r.failure() || {}).errorText || "";
    if (r.url().endsWith("/mn.mp3") || /ABORTED|cancel/i.test(why)) return;
    errors.push(`failed ${r.url().split("/app/")[1]} (${why})`);
  });
  const shot = async (name) => { await sleep(400); await page.screenshot({ path: path.join(OUT, `${engineName}-${name}.png`) }); };
  const screen = () => page.evaluate(() => (document.querySelector(".screen.on") || {}).id);
  const stockText = () => page.textContent("#stockInfo");

  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(500);
  await shot("01-attract");
  check("attract screen shows", (await screen()) === "scr-attract");

  // Player 1: flag then map.
  await page.keyboard.press("Space");
  check("Space starts turn 1", (await screen()) === "scr-turn");
  await shot("02-turn");
  await page.keyboard.press("Digit3");
  await sleep(300);
  check("key 3 opens a flag clue", (await page.isVisible("#flagFrame")) && (await page.locator("#options .opt").count()) === 4);
  await shot("03-flag");
  await page.keyboard.press("KeyA");
  await sleep(1000);
  check("answer reveals result", await page.isVisible("#reveal.on"));
  await shot("04-reveal");
  await page.keyboard.press("Backspace");
  check("delete undoes the answer", !(await page.isVisible("#reveal.on")));
  await page.keyboard.press("KeyB");
  await page.keyboard.press("Space");
  await page.keyboard.press("Digit2");
  await sleep(300);
  const mapVisible = (await page.isVisible("#mapFrame")) || (await page.isVisible("#shapeFrame"));
  check("key 2 opens a map clue", mapVisible);
  await shot("05-map");
  await page.keyboard.press("KeyC");
  await page.keyboard.press("Space");
  check("two turns end on result screen", (await screen()) === "scr-result");
  await shot("06-result");

  // Player 2: song (audio), then jackpot, then a second jackpot (re-spin), then language.
  await page.keyboard.press("Space");
  await page.keyboard.press("Digit1");
  await sleep(2500);
  const audioState = await page.evaluate(() => {
    const a = document.getElementById("clip");
    return { t: a.currentTime, paused: a.paused, src: a.src.split("/").slice(-2).join("/"), err: a.error && a.error.code };
  });
  check("song clip plays", audioState.t > 0.5 && !audioState.paused, JSON.stringify(audioState));
  await shot("07-song");
  await page.keyboard.press("KeyD");
  await page.keyboard.press("Space");
  const before = await stockText();
  await page.keyboard.press("Digit5");
  await sleep(600);
  check("key 5 shows jackpot", (await screen()) === "scr-jackpot");
  await shot("08-jackpot");
  check("jackpot takes one grand prize", (await stockText()) !== before, `${before.trim()} → ${(await stockText()).trim()}`);
  await page.keyboard.press("Space");
  check("player 2 finishes after 2 turns", (await screen()) === "scr-result");
  check("jackpot gives the grand prize", (await page.textContent("#resultTier")).includes("GRAND"));

  // Player 3: jackpot twice → re-spin, then language.
  await page.keyboard.press("Space");
  await page.keyboard.press("Digit5");
  await page.keyboard.press("Space");
  await page.keyboard.press("Digit5");
  await sleep(300);
  check("second jackpot asks for a re-spin", (await screen()) === "scr-turn" && (await page.isVisible("#toast.show")));
  await page.keyboard.press("Digit4");
  await sleep(2000);
  const lang = await page.evaluate(() => {
    const a = document.getElementById("clip");
    return { t: a.currentTime, paused: a.paused, src: a.src.split("/").slice(-1)[0] };
  });
  check("language clip plays", lang.t > 0.3, JSON.stringify(lang));
  await shot("09-language");
  await page.keyboard.press("KeyA");
  await page.keyboard.press("Space");

  // Player 4: on-screen spin.
  await page.keyboard.press("Space");
  await page.keyboard.press("KeyW");
  await sleep(1500);
  await shot("10-spinning");
  await sleep(4000);
  const afterSpin = await screen();
  check("on-screen spin lands on a segment", afterSpin === "scr-clue" || afterSpin === "scr-jackpot", afterSpin);
  await shot("11-after-spin");

  // Cancel with Esc twice: nothing logged.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  check("Esc twice cancels the player", (await screen()) === "scr-attract");

  // Persistence across reload.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("spinTheGlobe.v1")));
  await page.reload();
  await sleep(500);
  const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem("spinTheGlobe.v1")));
  check("log has 3 players", stored.log.length === 3, `log=${stored.log.length}`);
  check("stock and log survive reload", reloaded.stock === stored.stock && reloaded.log.length === 3,
    `stock ${stored.stock}→${reloaded.stock}`);
  check("header shows stock after reload", (await stockText()).includes(String(reloaded.stock)));

  // Admin, asset check, CSV.
  await sleep(9000);
  await page.keyboard.press("Shift+KeyA");
  await sleep(300);
  check("Shift+A opens admin", await page.isVisible("#admin"));
  const assets = await page.textContent("#assetCheck");
  check("asset check flags missing Mongolian clip", assets.includes("lang-mn"), assets);
  await shot("12-admin");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('button[data-act="csv"]')]);
  const csvPath = path.join(OUT, `${engineName}-log.csv`);
  await download.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, "utf8").trim().split("\n");
  check("CSV has header + 3 rows", csv.length === 4, `${csv.length} lines`);
  await page.keyboard.press("Escape");

  // Render every map, silhouette, and zoomed flag once to catch broken data.
  const broken = await page.evaluate(() => {
    const bad = [];
    for (const code in window.MAPVIEW) if (!document.querySelector('#mapFrame [data-c="' + code + '"]')) bad.push("map:" + code);
    for (const code in window.SHAPES) if (!window.SHAPES[code].d || window.SHAPES[code].d.length < 50) bad.push("shape:" + code);
    return bad;
  });
  check("every map country has a path", broken.length === 0, broken.join(", "));

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const e of ENGINES) await run(e);
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})();
