// Hosted-version checks: offline cache, audio with no network, and touch-only play.
// Usage: NODE_PATH=<dir with playwright> node e2e_online.js <base url> <screenshot dir> [webkit|chromium ...]

const path = require("path");
const fs = require("fs");
const { webkit, chromium } = require("playwright");

const BASE = process.argv[2];
const OUT = process.argv[3];
const ENGINES = process.argv.slice(4).length ? process.argv.slice(4) : ["webkit", "chromium"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function clipState(page) {
  return page.evaluate(() => {
    const a = document.getElementById("clip");
    return { t: +a.currentTime.toFixed(2), paused: a.paused, src: a.src.split("/").pop(), err: a.error && a.error.code };
  });
}

async function offlineRun(engineName) {
  const engine = engineName === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(BASE);
  let status = "";
  for (let i = 0; i < 60 && !status.includes("Offline ready"); i++) {
    await sleep(1000);
    status = await page.textContent("#hints");
  }
  check(`${engineName}: offline copy finishes`, status.includes("Offline ready"), status.trim().slice(-40));

  await context.setOffline(true);
  await page.reload();
  await sleep(800);
  check(`${engineName}: page reloads with no network`, (await page.isVisible("#scr-attract")) && (await page.textContent("h1")).includes("SPIN"));

  await page.keyboard.press("Space");
  await page.keyboard.press("Digit1");
  await sleep(2500);
  const song = await clipState(page);
  check(`${engineName}: anthem plays offline`, song.t > 0.5 && !song.paused, JSON.stringify(song));
  await page.keyboard.press("KeyA");
  await page.keyboard.press("Space");
  await page.keyboard.press("Digit4");
  await sleep(2000);
  const lang = await clipState(page);
  check(`${engineName}: language clip plays offline`, lang.t > 0.3 && !lang.paused, JSON.stringify(lang));
  await page.keyboard.press("KeyB");
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  await page.keyboard.press("Digit3");
  await sleep(500);
  const flagOk = await page.evaluate(() => { const i = document.getElementById("flagImg"); return i.complete && i.naturalWidth > 0; });
  check(`${engineName}: flag image loads offline`, flagOk);
  check(`${engineName}: no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
}

async function touchRun(engineName, w, h) {
  const engine = engineName === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const page = await context.newPage();
  const tag = `${engineName}-${w}x${h}`;
  const shot = async (name) => { await sleep(400); await page.screenshot({ path: path.join(OUT, `touch-${tag}-${name}.png`) }); };
  const screen = () => page.evaluate(() => (document.querySelector(".screen.on") || {}).id);

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await shot("1-attract");
  await page.tap('[data-tap="start"]');
  check(`${tag}: Start button begins a player`, (await screen()) === "scr-turn");
  await shot("2-turn");
  await page.tap('.seg-card[data-seg="map"]');
  await sleep(300);
  await shot("3-clue");
  await page.tap("#options .opt >> nth=0");
  await shot("4-reveal");
  await page.tap('#reveal [data-tap="next"]');
  check(`${tag}: Next button moves to turn 2`, (await screen()) === "scr-turn");
  await page.tap('.seg-card[data-seg="jackpot"]');
  await sleep(300);
  await shot("5-jackpot");
  await page.tap('#scr-jackpot [data-tap="next"]');
  check(`${tag}: game ends on result screen`, (await screen()) === "scr-result");
  await shot("6-result");
  await page.tap('#scr-result [data-tap="next"]');
  check(`${tag}: Next player starts a new game`, (await screen()) === "scr-turn");
  await page.tap("#cancelBtn");
  await page.tap("#cancelBtn");
  check(`${tag}: ✕ twice cancels the player`, (await screen()) === "scr-attract");

  const overflow = await page.evaluate(() => {
    document.querySelector(".confetti").innerHTML = "";
    const bad = [];
    document.querySelectorAll(".screen").forEach((s) => {
      s.classList.add("on");
      if (s.scrollHeight > s.clientHeight + 2 || s.scrollWidth > s.clientWidth + 2) bad.push(s.id);
      s.classList.remove("on");
    });
    return bad;
  });
  check(`${tag}: no screen overflows`, overflow.length === 0, overflow.join(", "));
  await browser.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const e of ENGINES) await offlineRun(e);
  for (const e of ENGINES) {
    await touchRun(e, 390, 844);
    await touchRun(e, 1024, 768);
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})();
