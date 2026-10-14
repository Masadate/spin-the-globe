// Spin the Globe — booth quiz app. Runs offline from index.html (file://).

(function () {
  "use strict";

  var CFG = window.CONFIG;
  var DATA = window.DATA;
  var COUNTRIES = DATA.countries;
  var CLUES = DATA.clues;
  var CLUE_BY_ID = {};
  CLUES.forEach(function (c) { CLUE_BY_ID[c.id] = c; });

  var SEG_ORDER = ["song", "map", "flag", "lang", "jackpot"];
  var QUIZ_SEGS = ["song", "map", "flag", "lang"];
  var WHEEL_ORDER = ["song", "map", "jackpot", "flag", "lang"];
  var LADDER = ["consolation", "bronze", "silver"];
  var TIER_RANK = { consolation: 0, bronze: 1, silver: 2, grand: 3 };
  var MEDAL = { consolation: "🍬", bronze: "🥉", silver: "🥈", grand: "🏆" };
  var STORE_KEY = "spinTheGlobe.v1";
  var SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------------------------------------------------------------------------
  // Persistent state (localStorage). The app keeps working in memory if storage fails.

  var storageOK = true;
  var saved = load();

  function freshState() {
    return {
      stock: CFG.grandPrizeStock,
      settings: { jackpotOdds: CFG.jackpotOdds, timerSeconds: CFG.timerSeconds, sfx: true, hints: true },
      bags: {},
      log: [],
    };
  }

  function load() {
    var fresh = freshState();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return fresh;
      var s = JSON.parse(raw);
      fresh.stock = typeof s.stock === "number" ? s.stock : fresh.stock;
      fresh.bags = s.bags || {};
      fresh.log = s.log || [];
      for (var k in s.settings) fresh.settings[k] = s.settings[k];
      return fresh;
    } catch (e) {
      storageOK = false;
      return fresh;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
      storageOK = true;
    } catch (e) {
      storageOK = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Clue selection. Each segment draws from a shuffled bag that persists across players.

  var missing = {};

  function usableIds(seg) {
    return CLUES.filter(function (c) { return c.seg === seg && !missing[c.id]; }).map(function (c) { return c.id; });
  }

  function drawClue(seg, avoidCountries) {
    var usable = usableIds(seg);
    var bag = (saved.bags[seg] || []).filter(function (id) { return usable.indexOf(id) >= 0; });
    if (!bag.length) {
      bag = shuffle(usable.slice());
      var last = saved.bags[seg + ":last"];
      if (bag.length > 1 && bag[bag.length - 1] === last) bag.unshift(bag.pop());
    }

    // Skip a country this player has already seen, if the bag has an alternative.
    for (var i = bag.length - 1; i >= 0; i--) {
      if (avoidCountries.indexOf(CLUE_BY_ID[bag[i]].c) < 0) {
        bag.push(bag.splice(i, 1)[0]);
        break;
      }
    }

    var id = bag.pop();
    saved.bags[seg] = bag;
    saved.bags[seg + ":last"] = id;
    save();
    return CLUE_BY_ID[id];
  }

  function groupOf(groups, key) {
    var out = {};
    out[key] = true;
    groups.forEach(function (g) {
      if (g.indexOf(key) >= 0) g.forEach(function (x) { out[x] = true; });
    });
    return out;
  }

  function weightedPick(list) {
    var weights = list.map(function (c) { return COUNTRIES[c].tier === 1 ? 3 : 1; });
    var r = Math.random() * weights.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r < 0) return list[i];
    }
    return list[list.length - 1];
  }

  // Three wrong options, chosen so exactly one option can be right.
  function buildOptions(clue) {
    var ans = clue.c;
    var A = COUNTRIES[ans];
    var pool = Object.keys(COUNTRIES).filter(function (c) { return c !== ans; });

    if (clue.seg === "lang") {
      var sameLang = groupOf(DATA.similarLangs, clue.lang);
      pool = pool.filter(function (c) { return !COUNTRIES[c].langs.some(function (l) { return sameLang[l]; }); });
    } else if (clue.seg === "flag") {
      var alike = groupOf(DATA.flagLookalikes, ans);
      pool = pool.filter(function (c) { return !alike[c]; });
    } else if (clue.seg === "song") {
      pool = pool.filter(function (c) { return COUNTRIES[c].cont !== A.cont; });
    }

    var picks = [];
    if (clue.seg === "map") {
      var near = pool.filter(function (c) { return COUNTRIES[c].cont === A.cont; });
      if (near.length) picks.push(weightedPick(near));
    }
    while (picks.length < 3) {
      var cand = pool.filter(function (c) {
        if (picks.indexOf(c) >= 0) return false;
        if (clue.seg === "flag") return !picks.some(function (p) { return groupOf(DATA.flagLookalikes, p)[c]; });
        return true;
      });
      picks.push(weightedPick(cand));
    }
    return shuffle([ans].concat(picks));
  }

  // ---------------------------------------------------------------------------
  // Sound effects (Web Audio, no files).

  var actx = null;

  function ensureAudioContext() {
    if (!actx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) actx = new C();
    }
    if (actx && actx.state === "suspended") actx.resume();
  }

  function tone(freq, t0, dur, type, vol) {
    var o = actx.createOscillator();
    var g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function sfx(name) {
    if (!saved.settings.sfx || !actx) return;
    var t = actx.currentTime;
    if (name === "tick") tone(1500, t, 0.03, "square", 0.04);
    if (name === "select") tone(880, t, 0.15, "triangle", 0.2);
    if (name === "correct") [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.09, 0.35, "triangle", 0.22); });
    if (name === "wrong") { tone(233, t, 0.3, "sawtooth", 0.07); tone(175, t + 0.2, 0.45, "sawtooth", 0.07); }
    if (name === "jackpot") {
      [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, t + i * 0.11, 0.4, "square", 0.06); });
    }
  }

  // ---------------------------------------------------------------------------
  // Clip playback. One <audio> element is unlocked on the first key press, so
  // later programmatic play() calls are allowed by Safari's autoplay policy.

  var audio = $("#clip");
  var unlocked = false;
  var clip = null;
  var clipRAF = 0;

  function unlock() {
    ensureAudioContext();
    if (unlocked) return;
    unlocked = true;
    audio.src = SILENT_WAV;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }

  function clipWindow() {
    var end = clip.dur ? clip.start + clip.dur : Infinity;
    if (isFinite(audio.duration)) end = Math.min(end, audio.duration);
    return { start: clip.start, end: end };
  }

  function playClip(c) {
    clip = { src: c.src, start: c.start || 0, dur: c.dur || 0 };
    audio.src = c.src + (clip.start ? "#t=" + clip.start : "");
    startPlayback();
  }

  function startPlayback() {
    var frame = $("#audioFrame");
    frame.classList.remove("blocked");
    var p = audio.play();
    if (p && p.catch) p.catch(function () { frame.classList.add("blocked"); });
    cancelAnimationFrame(clipRAF);
    clipRAF = requestAnimationFrame(watchClip);
  }

  function replay() {
    if (!clip) return;
    try { audio.currentTime = clip.start; } catch (e) { /* metadata not loaded yet */ }
    startPlayback();
  }

  function watchClip() {
    if (!clip) return;
    var w = clipWindow();
    var pos = audio.currentTime;
    if (pos >= w.end - 0.05) audio.pause();
    var span = isFinite(w.end) ? w.end - w.start : 1;
    $("#audioBar div").style.width = Math.max(0, Math.min(1, (pos - w.start) / span)) * 100 + "%";
    $("#audioFrame").classList.toggle("playing", !audio.paused);
    if (!audio.paused) clipRAF = requestAnimationFrame(watchClip);
  }

  function stopClip() {
    clip = null;
    cancelAnimationFrame(clipRAF);
    audio.pause();
    $("#audioFrame").classList.remove("playing");
  }

  audio.addEventListener("play", function () {
    cancelAnimationFrame(clipRAF);
    clipRAF = requestAnimationFrame(watchClip);
  });

  // ---------------------------------------------------------------------------
  // Wheel drawing and on-screen spin.

  function wedges() {
    var jp = Math.max(0, Math.min(0.5, saved.settings.jackpotOdds)) * 360;
    var q = (360 - jp) / 4;
    var a = 0;
    return WHEEL_ORDER.map(function (seg) {
      var span = seg === "jackpot" ? jp : q;
      var w = { seg: seg, a0: a, a1: a + span };
      a += span;
      return w;
    });
  }

  function polar(deg, r) {
    var t = (deg - 90) * Math.PI / 180;
    return [(r * Math.cos(t)).toFixed(2), (r * Math.sin(t)).toFixed(2)];
  }

  function wheelSVG() {
    var R = 200;
    var out = '<circle r="208" fill="#d82115" stroke="#fff" stroke-width="3"/>';
    wedges().forEach(function (w) {
      var span = w.a1 - w.a0;
      if (span <= 0) return;
      var s = CFG.segments[w.seg];
      var p0 = polar(w.a0, R), p1 = polar(w.a1, R);
      var large = span > 180 ? 1 : 0;
      out += '<path d="M0 0L' + p0[0] + " " + p0[1] + "A" + R + " " + R + " 0 " + large + " 1 " + p1[0] + " " + p1[1] +
        'Z" fill="' + s.color + '" stroke="#fff" stroke-width="3"/>';
      var mid = (w.a0 + w.a1) / 2;
      if (span < 40) {
        var ic = polar(mid, 178);
        out += '<g transform="translate(' + ic[0] + " " + ic[1] + ") rotate(" + mid + ')"><text text-anchor="middle" dominant-baseline="central" font-size="22">' + s.icon + "</text></g>";
        var tx = polar(mid, 108);
        out += '<g transform="translate(' + tx[0] + " " + tx[1] + ") rotate(" + (mid - 90) + ')"><text text-anchor="middle" dominant-baseline="central" font-size="17">' + s.en + "</text></g>";
      } else {
        var c = polar(mid, 122);
        out += '<g transform="translate(' + c[0] + " " + c[1] + ") rotate(" + mid + ')">' +
          '<text text-anchor="middle" dominant-baseline="central" font-size="44">' + s.icon + "</text>" +
          '<text y="44" text-anchor="middle" dominant-baseline="central" font-size="24">' + s.en + "</text></g>";
      }
    });
    for (var b = 0; b < 24; b++) {
      var bulb = polar(b * 15 + 7.5, 204);
      out += '<circle cx="' + bulb[0] + '" cy="' + bulb[1] + '" r="2.6" fill="#fff"/>';
    }
    out += '<circle r="26" fill="#fff" stroke="#d82115" stroke-width="4"/><circle r="11" fill="#d82115"/>';
    return out;
  }

  function drawWheels() {
    $("#wheel").innerHTML = wheelSVG();
    $(".attract-wheel svg").innerHTML = wheelSVG();
  }

  var wheelRot = 0;

  function spinWheel() {
    game.spinning = true;
    var odds = saved.settings.jackpotOdds;
    var r = Math.random();
    var seg = r < odds ? "jackpot" : QUIZ_SEGS[Math.min(3, Math.floor((r - odds) / (1 - odds) * 4))];
    var w = wedges().filter(function (x) { return x.seg === seg; })[0];
    var target = w.a0 + (w.a1 - w.a0) * (0.15 + 0.7 * Math.random());

    // A wheel angle θ sits under the top pointer when the rotation ≡ −θ (mod 360).
    var rot = wheelRot + 360 * 6;
    rot += (((-target - rot) % 360) + 360) % 360;
    wheelRot = rot;
    $("#wheel").style.transform = "rotate(" + rot + "deg)";

    var total = 4400;
    for (var i = 1; i <= 44; i++) {
      setTimeout(function () { sfx("tick"); }, total * (1 - Math.pow(1 - i / 44, 1 / 3)));
    }
    setTimeout(function () {
      game.spinning = false;
      if (game.screen === "turn") pickSegment(seg, "screen");
    }, total + 250);
  }

  // ---------------------------------------------------------------------------
  // Game flow.

  var game = {
    screen: "attract",
    play: null,
    turn: 0,
    clue: null,
    options: null,
    via: "",
    spinning: false,
    timerStart: 0,
    timerRAF: 0,
    escAt: 0,
    idle: 0,
  };

  function show(name) {
    game.screen = name;
    var section = name === "reveal" ? "clue" : name;
    $$(".screen").forEach(function (s) { s.classList.toggle("on", s.id === "scr-" + section); });
    $("#scr-clue").classList.toggle("revealed", name === "reveal");
    document.body.classList.toggle("in-play", !!game.play && name !== "attract" && name !== "result");
    renderHeader();
    renderHints();
  }

  var toastTimer = 0;
  function toast(html) {
    var t = $("#toast");
    t.innerHTML = html;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  function newPlay() {
    clearTimeout(game.idle);
    stopClip();
    game.play = { started: new Date(), turns: [], jackpot: "", stockTaken: false, done: false };
    game.turn = 0;
    showTurn();
  }

  function showTurn() {
    $("#turnTitle").innerHTML = "Turn " + (game.turn + 1) + " of " + CFG.turnsPerPlayer +
      " — spin the wheel! <small>ルーレットを回して！</small>";
    $$(".seg-card").forEach(function (c) { c.classList.remove("picked"); });
    show("turn");
  }

  function pickSegment(seg, via) {
    if (game.screen !== "turn") return;
    var card = $('.seg-card[data-seg="' + seg + '"]');
    if (card) card.classList.add("picked");
    sfx("select");
    if (seg === "jackpot") return hitJackpot(via);

    if (!usableIds(seg).length) {
      toast("No " + CFG.segments[seg].en + " questions are available. Spin again.");
      setTimeout(function () { $$(".seg-card").forEach(function (c) { c.classList.remove("picked"); }); }, 600);
      return;
    }
    var seen = game.play.turns.map(function (t) { return t.answer; });
    var clue = drawClue(seg, seen);
    renderClue(clue, buildOptions(clue), via);
  }

  function renderClue(clue, options, via) {
    game.clue = clue;
    game.options = options;
    game.via = via;
    var s = CFG.segments[clue.seg];
    $("#scr-clue").style.setProperty("--seg", s.color);

    var chip = $("#segChip");
    chip.style.setProperty("--seg", s.color);
    chip.innerHTML = s.icon + " " + s.en + " <small>" + s.ja + "</small>";
    var shape = clue.mode === "shape";
    $("#prompt").innerHTML = shape
      ? "Which country has this shape? <small>この形の国は？</small>"
      : s.prompt + " <small>" + s.promptJa + "</small>";

    $$(".panel-item").forEach(function (p) { p.classList.remove("on"); });
    if (clue.seg === "flag") renderFlag(clue);
    else if (clue.seg === "map") (shape ? renderShape : renderLocate)(clue);
    else renderAudio(clue);

    $("#options").innerHTML = options.map(function (c, i) {
      return '<div class="opt" data-i="' + i + '"><span class="letter">' + "ABCD"[i] + "</span><span>" +
        COUNTRIES[c].name + "<small>" + COUNTRIES[c].ja + "</small></span></div>";
    }).join("");
    $$("#options .opt").forEach(function (b) {
      b.addEventListener("click", function () { if (game.screen === "clue") answer(+b.dataset.i); });
    });

    var r = $("#reveal");
    r.className = "";
    r.innerHTML = "";
    show("clue");
    startTimer();
  }

  function renderFlag(clue) {
    var img = $("#flagImg");
    img.style.transition = "none";
    img.src = clue.src;
    if (clue.crop) {
      img.style.transformOrigin = clue.crop[0] + "% " + clue.crop[1] + "%";
      img.style.transform = "scale(" + clue.crop[2] + ")";
    } else {
      img.style.transform = "none";
    }
    $("#flagFrame").classList.add("on");
  }

  function buildWorld() {
    var W = window.WORLD;
    var s = '<svg viewBox="0 0 ' + W.w + " " + W.h + '" preserveAspectRatio="xMidYMid slice"><path class="land" d="' + W.d.rest + '"/>';
    for (var code in W.d) {
      if (code !== "rest") s += '<path class="land" data-c="' + code + '" d="' + W.d[code] + '"/>';
    }
    s += '<circle class="marker" r="0"/></svg>';
    $("#mapFrame").innerHTML = s;
  }

  function renderLocate(clue) {
    var svg = $("#mapFrame svg");
    var v = window.MAPVIEW[clue.c];
    var vw = v[2], vh = vw * 9 / 16;
    svg.setAttribute("viewBox", (v[0] - vw / 2) + " " + (v[1] - vh / 2) + " " + vw + " " + vh);
    $$("#mapFrame .target").forEach(function (p) { p.classList.remove("target"); });
    var target = svg.querySelector('[data-c="' + clue.c + '"]');
    var marker = svg.querySelector(".marker");
    target.classList.add("target");
    svg.insertBefore(target, marker);
    marker.setAttribute("cx", v[0]);
    marker.setAttribute("cy", v[1]);
    marker.setAttribute("r", v[3]);
    $("#mapFrame").classList.add("on");
  }

  function renderShape(clue) {
    var s = window.SHAPES[clue.c];
    $("#shapeSvg").setAttribute("viewBox", s.vb);
    $("#shapeSvg path").setAttribute("d", s.d);
    $("#shapeFrame").classList.add("on");
  }

  function renderAudio(clue) {
    var frame = $("#audioFrame");
    frame.classList.add("on");
    frame.classList.remove("blocked", "playing");
    $("#audioBar div").style.width = "0";
    $("#audioLabel").innerHTML = clue.seg === "song"
      ? "Listen to the anthem! <span>国歌を聴いて！</span>"
      : "Listen! <span>聴いて！</span>";
    playClip(clue);
  }

  function startTimer() {
    cancelAnimationFrame(game.timerRAF);
    game.timerStart = performance.now();
    var total = saved.settings.timerSeconds * 1000;
    var bar = $("#timer div");
    $("#timer").classList.remove("late");
    function tick() {
      var left = Math.max(0, 1 - (performance.now() - game.timerStart) / total);
      bar.style.transform = "scaleX(" + left + ")";
      $("#timer").classList.toggle("late", left < 0.25);
      if (left > 0 && game.screen === "clue") game.timerRAF = requestAnimationFrame(tick);
    }
    tick();
  }

  function answer(i) {
    var chosen = i === null ? null : game.options[i];
    var ans = game.clue.c;
    var correct = chosen === ans;
    game.play.turns[game.turn] = {
      seg: game.clue.seg, clue: game.clue.id, answer: ans, chosen: chosen || "", correct: correct, via: game.via,
    };
    cancelAnimationFrame(game.timerRAF);

    $$("#options .opt").forEach(function (b, k) {
      var c = game.options[k];
      b.classList.toggle("right", c === ans);
      b.classList.toggle("wrong", k === i && !correct);
      b.classList.toggle("dim", c !== ans && k !== i);
    });

    if (game.clue.seg === "flag") {
      var img = $("#flagImg");
      img.style.transition = "transform 0.9s ease-in-out";
      img.style.transform = "none";
    }

    var A = COUNTRIES[ans];
    var r = $("#reveal");
    r.className = "on " + (correct ? "good" : "bad");
    r.innerHTML = '<div class="rv-text">' + (correct
      ? "<b>⭕ CORRECT! 正解！</b>" + A.name + "（" + A.ja + "）"
      : "<b>❌ So close! 残念！</b>The answer is " + A.name + "（" + A.ja + "）") +
      '<span class="fact">' + A.fact + "</span></div>" +
      '<button class="big-btn" data-tap="next">Next ▶ <span>次へ</span></button>';
    sfx(correct ? "correct" : "wrong");
    show("reveal");
  }

  function undoAnswer() {
    game.play.turns.length = game.turn;
    var options = game.options;
    var clue = game.clue;
    if (clue.seg === "song" || clue.seg === "lang") stopClip();
    renderClue(clue, options, game.via);
  }

  function hitJackpot(via) {
    if (game.play.jackpot) {
      toast("🎰 Lucky again! Spin once more! <small>もう一度回して！</small>");
      setTimeout(function () { $$(".seg-card").forEach(function (c) { c.classList.remove("picked"); }); }, 600);
      return;
    }
    var tier = "silver";
    if (saved.stock > 0) {
      saved.stock -= 1;
      tier = "grand";
      game.play.stockTaken = true;
      save();
    }
    game.play.jackpot = tier;
    game.play.turns[game.turn] = { seg: "jackpot", clue: "", answer: "", chosen: "", correct: null, via: via };

    $("#jpBody").innerHTML = tier === "grand"
      ? 'You win the <span class="big">' + CFG.prizes.grand.en + "</span>!<br>" + CFG.prizes.grand.ja + "ゲット！"
      : 'Grand prizes are gone, so you win a <span class="big">BIG PRIZE</span>!<br>特賞は終了 — ' + CFG.prizes.silver.ja + "ゲット！";
    confetti();
    sfx("jackpot");
    show("jackpot");
  }

  function confetti() {
    var colors = ["#ffd54f", "#f39700", "#3b82f6", "#10b981", "#a855f7", "#ffffff"];
    var html = "";
    for (var i = 0; i < 90; i++) {
      html += '<i style="left:' + (Math.random() * 100).toFixed(1) + "%;background:" + colors[i % colors.length] +
        ";animation-duration:" + (2 + Math.random() * 2.5).toFixed(2) + "s;animation-delay:-" + (Math.random() * 3).toFixed(2) + 's"></i>';
    }
    $(".confetti").innerHTML = html;
  }

  function nextTurn() {
    stopClip();
    game.turn += 1;
    if (game.turn >= CFG.turnsPerPlayer) finishPlay();
    else showTurn();
  }

  function finishPlay() {
    var p = game.play;
    var correct = p.turns.filter(function (t) { return t.correct; }).length;
    var tier = LADDER[Math.min(correct, 2)];
    if (p.jackpot && TIER_RANK[p.jackpot] > TIER_RANK[tier]) tier = p.jackpot;
    var rec = {
      n: saved.log.length + 1,
      started: p.started.toISOString(),
      finished: new Date().toISOString(),
      turns: p.turns,
      jackpot: p.jackpot,
      correct: correct,
      tier: tier,
    };
    saved.log.push(rec);
    save();
    p.done = true;
    renderResult(rec);
  }

  function renderResult(rec) {
    var P = CFG.prizes[rec.tier];
    $("#scr-result").style.setProperty("--tier", P.color);
    $("#resultMedal").textContent = MEDAL[rec.tier];
    $("#resultTier").innerHTML = P.en + "<small>" + P.ja + "</small>";
    $("#resultTurns").innerHTML = rec.turns.map(function (t) {
      var s = CFG.segments[t.seg];
      var mark = t.seg === "jackpot" ? "🎰" : t.correct ? "⭕" : "❌";
      return "<span>" + s.icon + " " + s.en + " " + mark + "</span>";
    }).join("");
    $("#resultGive").innerHTML = "<small>STAFF · HAND OVER</small>" + P.give;
    sfx(rec.tier === "consolation" ? "select" : "correct");
    show("result");
    clearTimeout(game.idle);
    game.idle = setTimeout(function () {
      if (game.screen === "result") {
        game.play = null;
        show("attract");
      }
    }, CFG.resultIdleSeconds * 1000);
  }

  function cancelPlay() {
    if (game.play && game.play.stockTaken && !game.play.done) {
      saved.stock += 1;
      save();
    }
    stopClip();
    game.play = null;
    show("attract");
    toast("Player cancelled. Nothing was logged. <small>キャンセルしました</small>");
  }

  function escPressed() {
    if (game.screen === "attract") return;
    if (game.screen === "result") {
      game.play = null;
      show("attract");
      return;
    }
    if (game.spinning) return;
    if (Date.now() - game.escAt < 2500) {
      game.escAt = 0;
      cancelPlay();
    } else {
      game.escAt = Date.now();
      toast("Press <kbd>Esc</kbd> or ✕ again to cancel this player");
    }
  }

  // ---------------------------------------------------------------------------
  // Header, hints, segment cards.

  function renderHeader() {
    var info = $("#turnInfo");
    if (!game.play || game.screen === "attract") {
      info.innerHTML = "";
    } else {
      var pips = "";
      for (var i = 0; i < CFG.turnsPerPlayer; i++) {
        var t = game.play.turns[i];
        var icon = !t ? String(i + 1) : t.seg === "jackpot" ? "🎰" : t.correct ? "⭕" : "❌";
        var now = i === game.turn && !game.play.done ? " now" : "";
        pips += '<span class="pip' + now + '">' + icon + "</span>";
      }
      info.innerHTML = "TURN " + pips;
    }
    var stock = $("#stockInfo");
    stock.innerHTML = saved.stock > 0
      ? '🎁 <span class="lbl">Grand prizes left <small>特賞残り</small></span> ' + saved.stock
      : '🎁 <span class="lbl">Grand prizes: </span>all gone <small>特賞終了</small>';
    stock.classList.toggle("out", saved.stock <= 0);
  }

  var HINTS = {
    attract: [["Space", "new player"], ["Shift+A", "admin"], ["H", "hide hints"]],
    turn: [["1–5", "segment the wheel landed on"], ["W", "spin on screen"], ["Esc ×2", "cancel player"]],
    clue: [["A B C D", "player's answer"], ["N", "no answer"], ["R", "replay audio"], ["Esc ×2", "cancel player"]],
    reveal: [["Space", "next"], ["delete ⌫", "undo answer"], ["R", "replay audio"]],
    jackpot: [["Space", "next"]],
    result: [["Space", "next player"], ["Esc", "title screen"], ["Shift+A", "admin"]],
  };

  function renderHints() {
    var el = $("#hints");
    el.classList.toggle("off", !saved.settings.hints);
    el.innerHTML = (HINTS[game.screen] || []).map(function (h) {
      return "<span><kbd>" + h[0] + "</kbd>" + h[1] + "</span>";
    }).join("");
    var status = offlineText();
    if (status && (game.screen === "attract" || game.screen === "result")) {
      el.innerHTML += '<span class="offline' + (offline.cached >= offline.total ? " ok" : "") + '">' + status + "</span>";
    }
  }

  function buildSegments() {
    $("#segCards").innerHTML = SEG_ORDER.map(function (k) {
      var s = CFG.segments[k];
      return '<div class="seg-card" data-seg="' + k + '" style="--seg:' + s.color + '"><kbd>' + s.key +
        '</kbd><span class="ic">' + s.icon + "</span><span>" + s.en + "<small>" + s.ja + "</small></span></div>";
    }).join("");
    $$(".seg-card").forEach(function (card) {
      card.addEventListener("click", function () {
        if (!game.spinning) pickSegment(card.dataset.seg, "physical");
      });
    });
    $("#attractSegs").innerHTML = SEG_ORDER.map(function (k) {
      var s = CFG.segments[k];
      return '<span class="chip" style="--seg:' + s.color + '">' + s.icon + " " + s.en + " <small>" + s.ja + "</small></span>";
    }).join("");
  }

  // ---------------------------------------------------------------------------
  // Admin panel.

  var assetStatus = { checked: 0, total: 0, bad: [], unverified: 0 };

  function adminOpen() { return !$("#admin").hidden; }

  function toggleAdmin(open) {
    if (open === undefined) open = !adminOpen();
    $("#admin").hidden = !open;
    if (open) renderAdmin();
  }

  function fmtDuration(sec) {
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function renderAdmin() {
    var log = saved.log;
    var n = log.length;
    var tiers = { consolation: 0, bronze: 0, silver: 0, grand: 0 };
    var segs = {};
    QUIZ_SEGS.forEach(function (s) { segs[s] = [0, 0]; });
    var secs = 0, jackpots = 0;
    log.forEach(function (r) {
      tiers[r.tier] += 1;
      if (r.jackpot) jackpots += 1;
      secs += (new Date(r.finished) - new Date(r.started)) / 1000;
      r.turns.forEach(function (t) {
        if (segs[t.seg]) {
          segs[t.seg][1] += 1;
          if (t.correct) segs[t.seg][0] += 1;
        }
      });
    });
    var rows = [
      ["Players", n],
      ["Expected cash", "¥" + (n * CFG.price).toLocaleString()],
      ["Consolation · Bronze · Silver · Grand", tiers.consolation + " · " + tiers.bronze + " · " + tiers.silver + " · " + tiers.grand],
      ["Players who hit JACKPOT", jackpots],
      ["Average play time", n ? fmtDuration(secs / n) : "—"],
    ];
    QUIZ_SEGS.forEach(function (s) {
      var x = segs[s];
      rows.push([CFG.segments[s].en + " correct", x[1] ? x[0] + "/" + x[1] + " (" + Math.round(100 * x[0] / x[1]) + "%)" : "—"]);
    });
    rows.push(["Last player", n ? new Date(log[n - 1].finished).toLocaleTimeString() : "—"]);
    $("#stats").innerHTML = rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("");

    $("#admStock").textContent = saved.stock;
    $("#setOdds").value = +(saved.settings.jackpotOdds * 100).toFixed(1);
    $("#setTimer").value = saved.settings.timerSeconds;
    $("#setSfx").checked = saved.settings.sfx;
    $("#setHints").checked = saved.settings.hints;

    var a = assetStatus;
    var text = "Assets checked: " + a.checked + "/" + a.total;
    if (a.bad.length) text += " · missing (skipped in game): " + a.bad.join(", ");
    if (a.unverified) text += " · " + a.unverified + " not verified";
    $("#assetCheck").textContent = text;
    $("#storageCheck").textContent = storageOK
      ? "Storage OK: data survives reloads."
      : "⚠ Storage unavailable: export the CSV before closing the browser.";
    $("#offlineCheck").textContent = offline.supported
      ? (offline.cached >= offline.total ? "Offline copy ready: works without Wi-Fi." : "Offline copy: " + offline.cached + "/" + offline.total + " files saved. Keep this page open on Wi-Fi.")
      : "Offline copy: not used (page opened from disk, which is already offline).";
  }

  function adminMessage(text) {
    $("#admMsg").textContent = text;
  }

  function localStamp(iso) {
    var d = new Date(iso);
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function exportCSV() {
    var head = ["player", "started", "finished", "seconds"];
    for (var i = 1; i <= CFG.turnsPerPlayer; i++) {
      head.push("t" + i + "_segment", "t" + i + "_clue", "t" + i + "_answer", "t" + i + "_chosen", "t" + i + "_correct", "t" + i + "_via");
    }
    head.push("jackpot", "correct_count", "prize_tier");
    var rows = saved.log.map(function (r) {
      var row = [r.n, localStamp(r.started), localStamp(r.finished), Math.round((new Date(r.finished) - new Date(r.started)) / 1000)];
      for (var i = 0; i < CFG.turnsPerPlayer; i++) {
        var t = r.turns[i] || {};
        row.push(t.seg || "", t.clue || "", t.answer || "", t.chosen || "", t.correct === true ? 1 : t.correct === false ? 0 : "", t.via || "");
      }
      row.push(r.jackpot || "", r.correct, r.tier);
      return row;
    });
    var csv = [head].concat(rows).map(function (r) {
      return r.map(function (v) {
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(",");
    }).join("\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "spin-the-globe-" + localStamp(new Date().toISOString()).replace(/[: ]/g, "-") + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    adminMessage("CSV exported (" + saved.log.length + " players). Check the Downloads folder.");
  }

  var resetArmed = 0;

  function adminAction(act, btn) {
    if (act === "close") return toggleAdmin(false);
    if (act === "stock-" && saved.stock > 0) saved.stock -= 1;
    if (act === "stock+") saved.stock += 1;
    if (act === "csv") return exportCSV();
    if (act === "undo") {
      var rec = saved.log.pop();
      if (!rec) return adminMessage("No players to undo.");
      if (rec.jackpot === "grand") saved.stock += 1;
      adminMessage("Removed player #" + rec.n + (rec.jackpot === "grand" ? " and returned 1 grand prize." : "."));
    }
    if (act === "reset") {
      if (Date.now() - resetArmed > 3000) {
        resetArmed = Date.now();
        btn.classList.add("armed");
        btn.textContent = "Click again to erase everything";
        setTimeout(function () { btn.classList.remove("armed"); btn.textContent = "Reset all data"; }, 3000);
        return;
      }
      var settings = saved.settings;
      saved = freshState();
      saved.settings = settings;
      resetArmed = 0;
      btn.classList.remove("armed");
      btn.textContent = "Reset all data";
      adminMessage("All players erased. Grand prizes reset to " + saved.stock + ".");
    }
    save();
    renderAdmin();
    renderHeader();
  }

  function bindAdmin() {
    $("#gear").addEventListener("click", function () { this.blur(); toggleAdmin(true); });
    $$("#admin button[data-act]").forEach(function (b) {
      b.addEventListener("click", function () { adminAction(b.dataset.act, b); });
    });
    $("#admin").addEventListener("click", function (e) { if (e.target === this) toggleAdmin(false); });
    $("#setOdds").addEventListener("change", function () {
      var v = parseFloat(this.value);
      if (!(v >= 0 && v <= 50)) return renderAdmin();
      saved.settings.jackpotOdds = v / 100;
      save();
      drawWheels();
    });
    $("#setTimer").addEventListener("change", function () {
      var v = parseInt(this.value, 10);
      if (v >= 5 && v <= 120) { saved.settings.timerSeconds = v; save(); }
      renderAdmin();
    });
    $("#setSfx").addEventListener("change", function () { saved.settings.sfx = this.checked; save(); });
    $("#setHints").addEventListener("change", function () { saved.settings.hints = this.checked; save(); renderHints(); });
  }

  // ---------------------------------------------------------------------------
  // Startup check: clues whose file fails to load are skipped in the game.

  function checkAssets() {
    var list = CLUES.filter(function (c) { return c.src; });
    var queue = list.slice();
    assetStatus.total = list.length;

    function settle(c, state) {
      if (c.settled) return;
      c.settled = true;
      assetStatus.checked += 1;
      if (state === "bad") {
        missing[c.id] = true;
        assetStatus.bad.push(c.id);
      }
      if (state === "unknown") assetStatus.unverified += 1;
      if (adminOpen()) renderAdmin();
      next();
    }

    function next() {
      var c = queue.shift();
      if (!c) return;
      var probe;
      if (/\.svg$/.test(c.src)) {
        probe = new Image();
        probe.onload = function () { settle(c, "ok"); };
        probe.onerror = function () { settle(c, "bad"); };
        probe.src = c.src;
      } else {
        probe = new Audio();
        probe.preload = "metadata";
        probe.addEventListener("loadedmetadata", function () { settle(c, "ok"); });
        probe.addEventListener("error", function () { settle(c, "bad"); });
        probe.src = c.src;
      }
      setTimeout(function () { settle(c, "unknown"); }, 8000);
    }

    for (var i = 0; i < 4; i++) next();
  }

  // ---------------------------------------------------------------------------
  // Keyboard. Uses physical key codes so a Japanese input mode doesn't interfere.

  function segForKey(code) {
    for (var i = 0; i < SEG_ORDER.length; i++) {
      var k = CFG.segments[SEG_ORDER[i]].key;
      if (code === "Digit" + k || code === "Numpad" + k) return SEG_ORDER[i];
    }
    return null;
  }

  function onKey(e) {
    unlock();
    if (e.repeat) return;
    var code = e.code;

    if (code === "KeyA" && e.shiftKey) {
      e.preventDefault();
      return toggleAdmin();
    }
    if (adminOpen()) {
      if (code === "Escape") toggleAdmin(false);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (code === "Space" || code === "Enter" || code === "Backspace") e.preventDefault();
    if (code === "KeyH") {
      saved.settings.hints = !saved.settings.hints;
      save();
      return renderHints();
    }
    if (code === "Escape") return escPressed();

    var go = code === "Space" || code === "Enter";
    switch (game.screen) {
      case "attract":
        if (go) newPlay();
        break;
      case "turn":
        if (game.spinning) break;
        var seg = segForKey(code);
        if (seg) pickSegment(seg, "physical");
        else if (code === "KeyW") spinWheel();
        break;
      case "clue":
        var i = ["KeyA", "KeyB", "KeyC", "KeyD"].indexOf(code);
        if (i >= 0) answer(i);
        else if (code === "KeyN") answer(null);
        else if (code === "KeyR") replay();
        break;
      case "reveal":
        if (go) nextTurn();
        else if (code === "Backspace") undoAnswer();
        else if (code === "KeyR") replay();
        break;
      case "jackpot":
        if (go) nextTurn();
        break;
      case "result":
        if (go) newPlay();
        break;
    }
  }

  // ---------------------------------------------------------------------------

  // On-screen buttons for touch screens and trackpads.
  function onTap(e) {
    var b = e.target.closest ? e.target.closest("[data-tap]") : null;
    if (!b) return;
    b.blur();
    var act = b.dataset.tap;
    if (act === "start" && game.screen === "attract") newPlay();
    else if (act === "replay") replay();
    else if (act === "cancel") escPressed();
    else if (act === "next") {
      if (game.screen === "reveal" || game.screen === "jackpot") nextTurn();
      else if (game.screen === "result") newPlay();
    }
  }

  // ---------------------------------------------------------------------------
  // Offline copy. Over http(s) a service worker caches every file, so the page
  // keeps working without a network. Opening index.html from disk skips this.

  var offline = { supported: false, cached: 0, total: (window.BUILD || {}).files || 0 };

  function offlineText() {
    if (!offline.supported) return "";
    if (offline.cached >= offline.total) return "✓ Offline ready";
    return "Saving offline copy… " + offline.cached + "/" + offline.total;
  }

  function pollOffline() {
    var name = "stg-" + window.BUILD.version;
    caches.has(name).then(function (has) {
      return has ? caches.open(name).then(function (c) { return c.keys(); }) : [];
    }).then(function (keys) {
      offline.cached = keys.length;
      renderHints();
      if (adminOpen()) renderAdmin();
      if (offline.cached < offline.total) setTimeout(pollOffline, 1500);
    }).catch(function () { /* Cache API unavailable */ });
  }

  function setupOffline() {
    if (!window.BUILD || !("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    offline.supported = true;
    navigator.serviceWorker.register("sw.js").then(pollOffline).catch(function () { offline.supported = false; });
  }

  function init() {
    buildSegments();
    drawWheels();
    buildWorld();
    bindAdmin();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("click", onTap);
    setupOffline();
    $(".wheel-wrap").addEventListener("click", function () {
      if (game.screen === "turn" && !game.spinning) spinWheel();
    });
    checkAssets();
    show("attract");
  }

  init();
})();
