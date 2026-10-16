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

  // Data saved under an older config.js: new config values win, admin changes made since then persist.
  const adminValues = async () => {
    await page.keyboard.press("Shift+KeyA");
    const v = { odds: await page.inputValue("#setOdds"), timer: await page.inputValue("#setTimer"), stock: await page.textContent("#admStock") };
    await page.keyboard.press("Escape");
    return v;
  };
  await page.evaluate(() => {
    const now = new Date().toISOString();
    localStorage.setItem("spinTheGlobe.v1", JSON.stringify({
      stock: 7, settings: { jackpotOdds: 0.05, timerSeconds: 30, sfx: true, hints: true }, bags: {},
      log: [{ n: 1, started: now, finished: now, turns: [], jackpot: "grand", correct: 0, tier: "grand" }],
    }));
  });
  await page.reload();
  let v = await adminValues();
  check("old saved odds give way to config.js", v.odds === "2" && v.stock === "4", JSON.stringify(v));
  await page.keyboard.press("Shift+KeyA");
  await page.fill("#setOdds", "3");
  await page.dispatchEvent("#setOdds", "change");
  await page.keyboard.press("Escape");
  await page.reload();
  v = await adminValues();
  check("admin odds survive a reload", v.odds === "3" && v.stock === "4", JSON.stringify(v));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(300);

  // Answers the flag on screen right or wrong. The flag file name gives the answer.
  const answerFlag = async (right) => {
    const key = await page.evaluate((right) => {
      const code = document.getElementById("flagImg").src.split("/").pop().replace(".svg", "");
      const name = window.DATA.countries[code].name;
      const opts = [...document.querySelectorAll("#options .opt")];
      const i = opts.findIndex((o) => o.children[1].firstChild.textContent === name);
      return "ABCD"[right ? i : (i + 1) % 4];
    }, right);
    await page.keyboard.press("Key" + key);
    await page.keyboard.press("Space");
  };
  const flagTurn = async (right) => {
    await page.keyboard.press("Digit3");
    await sleep(150);
    await answerFlag(right);
  };
  const tier = () => page.textContent("#resultTier");

  // Player 1: flag, map, then three flags. Four right answers earn silver.
  check("title screen shows 5 turns", (await page.textContent("#priceLine")).includes("5 turns"));
  check("title screen shows the version", /^v\d+\.\d+\.\d+ · build [0-9a-f]{7}$/.test(await page.textContent("#buildTag")),
    await page.textContent("#buildTag"));
  check("wheel says National Anthem", (await page.textContent("#scr-attract .wheel-svg")).includes("Anthem"));
  await page.keyboard.press("Space");
  check("Space starts turn 1", (await screen()) === "scr-turn");
  check("turn title counts to 5", (await page.textContent("#turnTitle")).includes("Turn 1 of 5"));
  check("header shows 5 turn pips", (await page.locator("#turnInfo .pip").count()) === 5);
  check("segment card says National Anthem", (await page.textContent('.seg-card[data-seg="song"]')).includes("National Anthem"));
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
  await answerFlag(true);
  await page.keyboard.press("Digit2");
  await sleep(300);
  const mapVisible = (await page.isVisible("#mapFrame")) || (await page.isVisible("#shapeFrame"));
  check("key 2 opens a map clue", mapVisible);
  await shot("05-map");
  await page.keyboard.press("KeyN");
  await page.keyboard.press("Space");
  for (let i = 0; i < 3; i++) await flagTurn(true);
  check("five turns end on result screen", (await screen()) === "scr-result");
  check("result lists 5 turns", (await page.locator("#resultTurns span").count()) === 5);
  check("4 correct gives silver", (await tier()).includes("SILVER"), await tier());
  check("result screen leaves the prize to staff", !(await page.textContent("#scr-result")).includes("HAND OVER"));
  await shot("06-result");

  // Player 2: two right answers earn bronze. Player 3: one right answer earns the consolation prize.
  await page.keyboard.press("Space");
  for (const right of [true, true, false, false, false]) await flagTurn(right);
  check("2 correct gives bronze", (await tier()).includes("BRONZE"), await tier());
  await page.keyboard.press("Space");
  for (const right of [true, false, false, false, false]) await flagTurn(right);
  check("1 correct gives the consolation prize", !/BRONZE|SILVER|GRAND/.test(await tier()), await tier());

  // Player 4: anthem (audio), jackpot, a second jackpot (re-spin), language, then two flags.
  await page.keyboard.press("Space");
  await page.keyboard.press("Digit1");
  await sleep(2500);
  const audioState = await page.evaluate(() => {
    const a = document.getElementById("clip");
    return { t: a.currentTime, paused: a.paused, src: a.src.split("/").slice(-2).join("/"), err: a.error && a.error.code };
  });
  check("anthem clip plays", audioState.t > 0.5 && !audioState.paused, JSON.stringify(audioState));
  check("anthem clue chip says National Anthem", (await page.textContent("#segChip")).includes("National Anthem"));
  await shot("07-anthem");
  await page.keyboard.press("KeyD");
  await page.keyboard.press("Space");
  const before = await stockText();
  check("pool starts at 5 grand prizes", before.includes("5"), before.trim());
  await page.keyboard.press("Digit5");
  await sleep(600);
  check("key 5 shows jackpot", (await screen()) === "scr-jackpot");
  await shot("08-jackpot");
  check("jackpot takes one grand prize", (await stockText()) !== before, `${before.trim()} → ${(await stockText()).trim()}`);
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
  await flagTurn(false);
  await flagTurn(false);
  check("player 4 finishes after 5 turns", (await screen()) === "scr-result");
  check("jackpot gives the grand prize", (await tier()).includes("GRAND"));
  await shot("09b-result-jackpot");

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
  check("log has 4 players", stored.log.length === 4, `log=${stored.log.length}`);
  check("stock and log survive reload", reloaded.stock === stored.stock && reloaded.log.length === 4,
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
  check("CSV has header + 4 rows", csv.length === 5, `${csv.length} lines`);
  check("CSV has columns for 5 turns", csv[0].includes("t5_segment"));
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
