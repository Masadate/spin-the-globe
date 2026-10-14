// Static checks on the generated data and the option rules.
// Usage: node validate.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = path.resolve(__dirname, "..", "app");
const sandbox = { window: {} };
for (const f of ["js/config.js", "js/maps.js", "js/data.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(APP, f), "utf8"), sandbox);
}
const { DATA, MAPVIEW, SHAPES, WORLD } = sandbox.window;
const C = DATA.countries;

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

// Every clue points at a real country and a real file.
const missingFiles = DATA.clues.filter((c) => c.src && !fs.existsSync(path.join(APP, c.src))).map((c) => c.id);
check("every clue file exists (mn.mp3 waits for a recording)", missingFiles.every((id) => id === "lang-mn"), missingFiles.join(", "));
check("every clue names a known country", DATA.clues.every((c) => C[c.c]));
check("every map clue has map data", DATA.clues.filter((c) => c.seg === "map").every((c) => (c.mode === "shape" ? SHAPES[c.c] : MAPVIEW[c.c] && WORLD.d[c.c])));

// Enough clues per segment that a day's players rarely see repeats.
const perSeg = {};
DATA.clues.forEach((c) => { if (!missingFiles.includes(c.id)) perSeg[c.seg] = (perSeg[c.seg] || 0) + 1; });
for (const seg of ["song", "map", "flag", "lang"]) check(`${seg}: at least 25 usable clues`, perSeg[seg] >= 25, String(perSeg[seg]));

// Rebuild the app's option logic outside the browser and stress it.
const appSrc = fs.readFileSync(path.join(APP, "js", "app.js"), "utf8").replace(/\r\n/g, "\n");
const grab = (name) => appSrc.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n  }\\n`))[0];
const optionCode = ["shuffle", "groupOf", "weightedPick", "buildOptions"].map(grab).join("\n");
const opt = vm.runInNewContext(`var COUNTRIES = DATA.countries; ${optionCode}; buildOptions`, { DATA, Math });

const sameLang = (lang) => new Set([lang, ...DATA.similarLangs.filter((g) => g.includes(lang)).flat()]);
const lookalike = (a, b) => DATA.flagLookalikes.some((g) => g.includes(a) && g.includes(b));
const problems = [];
for (const clue of DATA.clues) {
  for (let k = 0; k < 50; k++) {
    const o = opt(clue);
    const wrong = o.filter((c) => c !== clue.c);
    if (o.length !== 4 || new Set(o).size !== 4 || !o.includes(clue.c)) problems.push(`${clue.id}: bad option set ${o}`);
    if (clue.seg === "lang") {
      const bad = wrong.filter((c) => C[c].langs.some((l) => sameLang(clue.lang).has(l)));
      if (bad.length) problems.push(`${clue.id}: ${bad} shares the language`);
    }
    if (clue.seg === "flag") {
      for (const a of o) for (const b of o) if (a < b && lookalike(a, b)) problems.push(`${clue.id}: ${a}/${b} look alike`);
    }
    if (clue.seg === "song" && wrong.some((c) => C[c].cont === C[clue.c].cont)) problems.push(`${clue.id}: same-continent option`);
  }
}
check("option rules hold over 50 draws per clue", problems.length === 0, [...new Set(problems)].slice(0, 5).join("; "));

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
