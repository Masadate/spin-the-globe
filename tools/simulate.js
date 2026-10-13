// Monte Carlo check of the prize rules and grand-prize depletion.
// Usage: node simulate.js [jackpot odds] [win rate per question] [grand-prize stock]

const odds = parseFloat(process.argv[2] || "0.05");
const winRate = parseFloat(process.argv[3] || "0.55");
const stock0 = parseInt(process.argv[4] || "8", 10);
const DAYS = 1000;
const PLAYERS = 90;

const RANK = { consolation: 0, bronze: 1, silver: 2, grand: 3 };
const LADDER = ["consolation", "bronze", "silver"];

const tiers = { consolation: 0, bronze: 0, silver: 0, grand: 0 };
let hits = 0;
const soldOutAt = [];

for (let d = 0; d < DAYS; d++) {
  let stock = stock0;
  let soldOut = null;
  for (let p = 1; p <= PLAYERS; p++) {
    let jackpot = "";
    let correct = 0;
    let turns = 0;
    while (turns < 2) {
      if (Math.random() < odds) {
        if (jackpot) continue; // second jackpot: spin again
        jackpot = stock > 0 ? "grand" : "silver";
        if (stock > 0 && --stock === 0) soldOut = p;
      } else if (Math.random() < winRate) {
        correct++;
      }
      turns++;
    }
    let tier = LADDER[Math.min(correct, 2)];
    if (jackpot && RANK[jackpot] > RANK[tier]) tier = jackpot;
    tiers[tier]++;
    if (jackpot) hits++;
  }
  soldOutAt.push(soldOut || Infinity);
}

const n = DAYS * PLAYERS;
const pct = (x) => (100 * x / n).toFixed(1) + "%";
soldOutAt.sort((a, b) => a - b);
const median = soldOutAt[Math.floor(DAYS / 2)];
const lastAll = soldOutAt.filter((x) => x === Infinity).length;

console.log(`odds ${odds} · win rate ${winRate} · stock ${stock0} · ${PLAYERS} players/day × ${DAYS} days`);
console.log(`players hitting a jackpot: ${pct(hits)} (theory ${(100 * (1 - (1 - odds) ** 2)).toFixed(1)}%)`);
console.log(`tiers: consolation ${pct(tiers.consolation)} · bronze ${pct(tiers.bronze)} · silver ${pct(tiers.silver)} · grand ${pct(tiers.grand)}`);
console.log(`grand prizes sell out at player #${median === Infinity ? "never (median)" : median} (median); stock lasts the whole day in ${(100 * lastAll / DAYS).toFixed(0)}% of days`);
