// After the draft: PLAY BALL (protect 4 bench players) → shuffle → random date in the decade →
// play-by-play innings 1–6 (NEXT / SKIP) → 7th inning stretch → late innings → final.
// Click any player in a box score to see his real game that day.
import { myId, updateRoom } from "./firebase.js";
import { studioFooter } from "./rules.js";
import { playGame, shuffleTeams, teamFromPicks, derbyHomers, RULES, POSITIONS, BENCH } from "./score.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const prettyDate = (d) => `${MONTHS[Math.floor(d / 100) % 100 - 1]} ${d % 100}, ${Math.floor(d / 10000)}`;
const FULL_MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const ledDate = (d) => `${FULL_MONTHS[Math.floor(d / 100) % 100 - 1]} ${d % 100} · ${Math.floor(d / 10000)}`;
const shortDate = (d) => `${Math.floor(d / 100) % 100}/${d % 100}`;
const ip = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
const CREDIT = "The information used here was obtained free of charge from and is copyrighted by Retrosheet. " +
  "Interested parties may contact Retrosheet at www.retrosheet.org.";

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) if (c != null) e.append(c);
  return e;
}

const cache = {};
function getJSON(url) {
  cache[url] ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error("Couldn't load " + url);
    return r.json();
  }).catch((e) => { delete cache[url]; throw e; });
  return cache[url];
}

// Random regular-season date inside the room's decade.
async function randomDate(decade) {
  const { years } = await getJSON("/data/index.json");
  const start = parseInt(decade, 10);
  let all = Object.entries(years).filter(([y]) => +y >= start && +y <= start + 9).flatMap(([, d]) => d);
  if (!all.length) all = Object.values(years).flat();
  return Number(all[Math.floor(Math.random() * all.length)]);
}

function hitLine(r) {
  if (!r) return "did not play";
  const bits = [`${r[1]}-${r[0]}`];
  const add = (n, label) => { if (n) bits.push(n > 1 ? `${n} ${label}` : label); };
  add(r[2], "2B"); add(r[3], "3B"); add(r[4], "HR"); add(r[5], "BB"); add(r[6], "HBP"); add(r[7], "SB");
  return bits.join(", ");
}

function diamond(runners) {
  const lit = (i) => (runners > i ? "#ff3b30" : "#2a2a2a");
  return el("span", {
    className: "diamond",
    innerHTML: `<svg viewBox="0 0 60 44" width="60" height="44" aria-label="${runners} on base">
      <rect x="40" y="17" width="10" height="10" transform="rotate(45 45 22)" fill="${lit(0)}"/>
      <rect x="25" y="3" width="10" height="10" transform="rotate(45 30 8)" fill="${lit(1)}"/>
      <rect x="10" y="17" width="10" height="10" transform="rotate(45 15 22)" fill="${lit(2)}"/>
      <rect x="25" y="31" width="10" height="10" transform="rotate(45 30 36)" fill="#555"/></svg>`,
  });
}

// ---------- pop-up card with a player's real game ----------
const modal = el("div", { className: "modal", hidden: true });
modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };
document.body.append(modal);
function openCard(...children) {
  modal.replaceChildren(el("div", { className: "modal-box" }, ...children,
    el("button", { className: "btn secondary", onclick: () => (modal.hidden = true) }, "CLOSE")));
  modal.hidden = false;
}
function statTable(heads, vals) {
  return el("table", { className: "stat-table small" },
    el("thead", {}, el("tr", {}, ...heads.map((h) => el("th", {}, h)))),
    el("tbody", {}, el("tr", {}, ...vals.map((v) => el("td", { className: "num" }, String(v))))));
}
function hitterCard(h, date, bases) {
  const who = h.used ?? h.starter;
  const r = h.line;
  const parts = [el("h2", {}, who?.name ?? "—"), el("p", { className: "hint" }, `${h.pos} · ${prettyDate(date)}`)];
  if (!r) {
    parts.push(el("p", {}, `${h.starter?.name ?? "The starter"} didn't play that day` +
      (h.backup ? `, and neither did his backup ${h.backup.name}.` : ".") + " This spot scored 0."));
  } else {
    if (h.used !== h.starter) parts.push(el("p", { className: "lead" }, `Came off the bench — ${h.starter?.name ?? "the starter"} didn't play that day.`));
    parts.push(el("p", {}, r[10] ? `Real game: played for ${r[10]} against ${r[11]}` : "Real game that day:"));
    parts.push(statTable(["AB", "H", "2B", "3B", "HR", "BB", "HBP", "SB", "CS", "K"], r.slice(0, 10)));
    parts.push(el("p", { className: "lead" }, `Bases for your team: +${Math.round(bases)}`));
  }
  openCard(...parts);
}
function pitcherCard(p, date) {
  const parts = [el("h2", {}, p.p?.name ?? "—"), el("p", { className: "hint" }, `${p.role.label} (${p.role.slot}) · game day ${prettyDate(date)}`)];
  if (!p.row) {
    parts.push(el("p", {}, `He didn't pitch within ${RULES.PITCH_WINDOW_DAYS} days of the game date, so his innings were empty.`));
  } else {
    const r = p.row;
    if (p.sub) parts.push(el("p", { className: "lead" }, "Your SPARE filled in for this role."));
    parts.push(el("p", {}, `Real game: ${prettyDate(r[0])}` + (r[10] ? ` for ${r[10]} against ${r[11]}` : "")));
    parts.push(statTable(["IP", "H", "HR", "BB", "HBP", "K", "WP", "BK", "START"],
      [ip(r[1]), r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9] ? "yes" : "no"]));
    parts.push(el("p", { className: "lead" },
      `Used for ${ip(p.fullOuts)} of his ${ip(p.role.outs)} innings` + (p.fullOuts < r[1] ? " — his real stats were scaled down to fit." : ".")));
  }
  openCard(...parts);
}

export function createGameDay(container, code, onLeave) {
  let room = null;
  let rolling = false;
  let shownFor = null;     // gameDate already drawn
  let keepChoice = null;   // bench slots this player is protecting
  let stage = "pbp1";      // pbp1 → stretch → pbp2 → final  (each player steps at his own pace)
  let step = 0;
  let soundOn = false;
  let audioCtx = null;
  let clockTimer = null;
  let clockResolve = null;
  let destroyed = false;
  let lastFieldRuns = { A: 0, B: 0 };
  const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function beep(frequency = 460, duration = 0.055) {
    if (!soundOn) return;
    try {
      audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.025, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch { /* Audio is optional; gameplay never depends on it. */ }
  }

  // Tiebreaker sounds (only play when SOUND is on, like every other beep).
  function homerSound() {
    [520, 660, 780, 1040].forEach((f, i) => setTimeout(() => beep(f, 0.09), i * 90));
  }
  function drumroll() {
    for (let i = 0; i < 14; i++) setTimeout(() => beep(150 + (i % 2) * 20, 0.03), i * 55);
    setTimeout(() => beep(880, 0.25), 14 * 55 + 80);
  }

  function cancelClock() {
    if (clockTimer != null) { clearTimeout(clockTimer); clockTimer = null; }
    if (clockResolve) { const done = clockResolve; clockResolve = null; done(); }
  }

  // Accessible speaker symbol. Uses inline SVG so it also works offline.
  function speakerIcon() {
    const paths = soundOn
      ? '<path d="M11 5L6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'
      : '<path d="M11 5L6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>';
    return el("span", { className: "speaker-icon", innerHTML:
      `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>` });
  }
  function drawSoundLabels() {
    middle.querySelectorAll(".sound-button").forEach((b) => {
      b.replaceChildren(speakerIcon());
      b.setAttribute("aria-pressed", String(soundOn));
      b.setAttribute("aria-label", soundOn ? "Mute sound" : "Turn sound on");
      b.setAttribute("title", soundOn ? "Sound on" : "Sound off");
    });
  }
  function soundButton() {
    return el("button", { className: "handheld-button blue sound-button", type: "button",
      title: soundOn ? "Sound on" : "Sound off",
      ariaLabel: soundOn ? "Mute sound" : "Turn sound on",
      ariaPressed: String(soundOn), onclick: () => { soundOn = !soundOn; beep(580); drawSoundLabels(); } },
      speakerIcon());
  }

  const left = el("section", { className: "team" });
  const right = el("section", { className: "team" });
  const middle = el("section", { className: "screen middle" });
  document.body.classList.add("drafting");
  container.replaceChildren(el("div", { className: "draft" }, left, middle, right));

  const header = () => el("div", {},
    el("h1", { className: "title small" }, "TIME MACHINE BASEBALL"),
    el("p", { className: "roomcode" }, `ROOM ${code} · THE ${(room?.decade || "1990s").toUpperCase()}`));
  const leaveBtn = () => el("button", { className: "btn secondary", onclick: onLeave }, "LEAVE");
  const credit = () => el("div", {}, el("p", { className: "credit" }, CREDIT), studioFooter());

  function info() {
    const me = myId(room);
    const uids = Object.keys(room.players).sort((a, b) => room.players[a].seat - room.players[b].seat);
    const picks = Object.values(room.picks || {});
    const drafted = {};
    for (const u of uids) drafted[u] = teamFromPicks(picks.filter((p) => p.by === u));
    const other = uids.find((u) => u !== me);
    return { me, other, uids, drafted, ready: room.ready || {} };
  }

  function message(text) {
    middle.replaceChildren(header(), el("div", { className: "led small" }, "GAME DAY"),
      el("p", { className: "hint" }, text), leaveBtn());
  }

  function rosterPanel(target, name, team, kept, note) {
    const row = (slot) => el("li", { className: team[slot] ? "filled" : "" },
      el("span", { className: "slot" }, slot.replace(" BN", "")),
      el("span", { className: "who" }, team[slot]?.name ?? "—",
        kept?.includes(slot) || slot === "SP" ? el("small", {}, " 🔒") : null));
    target.replaceChildren(
      el("h2", {}, name),
      ...(note ? [el("p", { className: "hint" }, note)] : []),
      el("ul", { className: "slots" },
        el("li", { className: "group" }, "LINEUP"), ...POSITIONS.map(row),
        el("li", { className: "group" }, "BENCH"), ...BENCH.map(row),
        el("li", { className: "group" }, "PITCHERS"), ...["SP", "RP1", "RP2", "CL", "SPARE"].map(row)));
  }

  // ---------- PLAY BALL: protect bench players, then ready ----------
  function readyScreen(s) {
    const mine = s.drafted[s.me];
    const oppName = room.players[s.other]?.name ?? "Opponent";
    const myName = room.players[s.me]?.name ?? "You";
    rosterPanel(right, oppName, s.drafted[s.other] || {}, s.ready[s.other]?.keep,
      s.ready[s.other] ? "Ready! ✔" : "Still choosing...");

    if (s.ready[s.me]) {
      rosterPanel(left, myName + " (you)", mine, s.ready[s.me].keep, "Ready! ✔");
      middle.replaceChildren(header(), el("div", { className: "led small" }, "READY"),
        el("p", { className: "hint" }, `Waiting for ${oppName} to click PLAY BALL...`), leaveBtn(), credit());
      return;
    }
    keepChoice ??= [];
    const status = el("p", { className: "hint" });
    const playBtn = el("button", { className: "btn" }, "PLAY BALL!");
    const boxes = BENCH.filter((slot) => mine[slot]).map((slot) => {
      const cb = el("input", { type: "checkbox", checked: keepChoice.includes(slot) });
      cb.onchange = () => {
        if (cb.checked && keepChoice.length >= RULES.BENCH_KEEP) { cb.checked = false; return; }
        keepChoice = cb.checked ? [...keepChoice, slot] : keepChoice.filter((x) => x !== slot);
        refresh();
      };
      return el("label", { className: "keep" }, cb,
        el("span", { className: "slot" }, slot.replace(" BN", "")), el("span", {}, mine[slot].name));
    });
    function refresh() {
      const left = RULES.BENCH_KEEP - keepChoice.length;
      status.textContent = left > 0 ? `Pick ${left} more to protect.` : "All set — click PLAY BALL!";
      playBtn.disabled = left > 0;
    }
    playBtn.onclick = async () => {
      playBtn.disabled = true;
      try { await updateRoom(code, { [`ready/${s.me}`]: { keep: keepChoice } }); }
      catch (e) { status.textContent = "Couldn't save: " + e.message; playBtn.disabled = false; }
    };
    refresh();
    rosterPanel(left, myName + " (you)", mine, keepChoice, null);
    middle.replaceChildren(header(),
      el("div", { className: "led small" }, "SHUFFLE TIME"),
      el("p", { className: "hint" },
        `Your starting pitcher (${mine.SP?.name ?? "—"}) stays with you. Choose ${RULES.BENCH_KEEP} bench players to keep. ` +
        "Every other player drafted gets a coin flip — he might end up on the other team!"),
      el("div", { className: "keeps" }, ...boxes),
      status, playBtn, leaveBtn(), credit());
  }

  // ---------- room updates ----------
  async function update(r) {
    room = r;
    const s = info();
    // 1-player mode: the computer protects the first 4 bench players it drafted, and is ready at once.
    const cpu = s.uids.find((u) => room.players[u].cpu);
    if (cpu && !s.ready[cpu] && r.host === s.me) {
      const bench = Object.values(room.picks || {}).filter((p) => p.by === cpu && BENCH.includes(p.slot))
        .sort((a, b) => a.n - b.n).slice(0, RULES.BENCH_KEEP).map((p) => p.slot);
      updateRoom(code, { [`ready/${cpu}`]: { keep: bench } }).catch(() => {});
    }
    const bothReady = s.uids.length === 2 && s.uids.every((u) => s.ready[u]);
    if (!bothReady) { shownFor = null; cancelClock(); middle.classList.remove("handheld", "time-travel"); return readyScreen(s); }

    if (!r.gameDate) {
      message("Spinning the time machine...");
      if (r.host === s.me && !rolling) {
        rolling = true;
        try { await updateRoom(code, { gameDate: await randomDate(r.decade || "1990s") }); }
        catch (e) { message("Couldn't pick a date: " + e.message); }
        rolling = false;
      }
      return;
    }
    if (shownFor === r.gameDate) return;
    shownFor = r.gameDate;
    // The flip clock already showed this date before the draft, so play starts right away.
    message("Loading " + prettyDate(r.gameDate) + "...");
    try {
      const year = String(r.gameDate).slice(0, 4);
      const [day, pitching, week] = await Promise.all([
        getJSON(`/data/${year}/days/${r.gameDate}.json`),
        getJSON(`/data/${year}/pitching.json`),
        derbyWeek(r.gameDate),
      ]);
      if (!destroyed && shownFor === r.gameDate) {
        middle.classList.remove("time-travel");
        play(s, day, pitching, week);
      }
    } catch (e) {
      cancelClock();
      shownFor = null;
      message(e.message);
    }
  }

  // ---------- the game ----------
  // Day files for the Home Run Derby week (game day ± DERBY_WINDOW_DAYS), only dates that had games.
  async function derbyWeek(date) {
    const { years } = await getJSON("/data/index.json");
    const base = new Date(Math.floor(date / 10000), Math.floor(date / 100) % 100 - 1, date % 100);
    const wanted = [];
    for (let i = -RULES.DERBY_WINDOW_DAYS; i <= RULES.DERBY_WINDOW_DAYS; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      if (years[d.getFullYear()]?.includes(key)) wanted.push(`/data/${d.getFullYear()}/days/${key}.json`);
    }
    return Promise.all(wanted.map(getJSON));
  }

  function play(s, day, pitching, week) {
    middle.classList.add("handheld");
    lastFieldRuns = { A: 0, B: 0 };
    const [uA, uB] = s.uids;                  // A = home (started the game), B = visitors
    const date = room.gameDate;
    const seed = code + "|" + date;
    const shuffled = shuffleTeams({ A: s.drafted[uA], B: s.drafted[uB] },
      { A: s.ready[uA].keep, B: s.ready[uB].keep }, seed);
    const teams = { A: shuffled.A, B: shuffled.B };
    const name = { A: room.players[uA].name, B: room.players[uB].name };
    const mine = s.me === uB ? "B" : "A";
    const theirs = mine === "A" ? "B" : "A";
    const opp = (k) => (k === "A" ? "B" : "A");
    const fromOther = (key, pick) => (pick && shuffled.moved.has(pick.pid) ? name[opp(key)] : null);

    // The two benches reflect the ACTUAL post-shuffle rosters, not the draft order.
    // Original ownership is recovered from the saved picks for accurate swap labels.
    const originalOwner = new Map();
    for (const uid of s.uids) {
      for (const pick of Object.values(s.drafted[uid])) {
        if (pick?.pid != null) originalOwner.set(String(pick.pid), uid === uA ? "A" : "B");
      }
    }
    function openBench(key) {
      const rows = BENCH.map((slot) => {
        const pick = teams[key][slot];
        const original = pick ? originalOwner.get(String(pick.pid)) : null;
        const protectedPick = !!pick && original === key && s.ready[s.uids[key === "A" ? 0 : 1]]?.keep?.includes(slot);
        const moved = !!pick && original && original !== key;
        const record = pick && day.b?.[pick.pid];
        const desc = protectedPick ? "PROTECTED" : moved ? `TRADED FROM ${name[original].toUpperCase()}` : "REMAINED";
        const detail = record ? hitLine(record) : "Did not play on game day";
        const showStats = () => {
          if (!pick) return;
          const details = [el("h2", {}, pick.name),
            el("p", { className: "hint" }, `${slot.replace(" BN", "")} · ${prettyDate(date)}`),
            el("p", {}, `Current bench: ${name[key]} · ${desc.toLowerCase()}`)];
          if (record) {
            details.push(el("p", {}, "Stats from this date"),
              statTable(["AB", "H", "2B", "3B", "HR", "BB", "HBP", "SB", "CS", "K"], record.slice(0, 10)));
          } else details.push(el("p", {}, "No recorded batting appearance on this date."));
          openCard(...details);
        };
        return el("li", { className: "bench-entry" },
          el("span", { className: "bench-pos" }, slot.replace(" BN", "")),
          el("button", { className: "bench-player", type: "button", disabled: !pick,
            onclick: showStats, title: pick ? "See game-day statistics" : "Empty slot" }, pick?.name ?? "—"),
          el("span", { className: "bench-status" + (protectedPick ? " is-protected" : moved ? " was-moved" : "") },
            protectedPick ? "🔒 " : moved ? "↔ " : "", desc),
          el("small", { className: "bench-stat" }, detail));
      });
      openCard(el("div", { className: "bench-modal-content" },
        el("h2", {}, `${name[key].toUpperCase()}'S BENCH`),
        el("p", { className: "bench-subtitle" }, `${key === "A" ? "HOME" : "VISITORS"} · POST-SHUFFLE ROSTER`),
        el("ul", { className: "bench-list" }, ...rows),
        el("p", { className: "bench-footnote" }, "🔒 Protected · ↔ Moved during shuffle · Select a player for his actual game-day stats.")));
    }
    function addBenchButton(target, key) {
      target.append(el("button", { className: "bench-view-button", type: "button",
        onclick: () => openBench(key), ariaLabel: `View ${name[key]}'s bench` }, "BENCH"));
    }

    const mid = playGame(teams, day, pitching, date, seed, 6, week);
    const full = playGame(teams, day, pitching, date, seed, 9, week);
    const pitchNet = (side) => side.parts.allowed - side.parts.ks - side.parts.cs;
    const names = (list) => list.filter((p) => p.p && p.outs).map((p) => p.p.name.split(" ").pop()).join(", ") || "nobody";

    // Build the play-by-play steps. Visitors bat first, like a real game.
    const part1 = [], part2 = [];
    for (const k of ["B", "A"]) {
      mid[k].hitters.forEach((h, i) => part1.push({
        team: k, delta: h.bases, hitter: i,
        text: `${h.pos} ${(h.used?.name ?? h.starter?.name ?? "—").toUpperCase()} · ${h.line ? hitLine(h.line).toUpperCase() : "DID NOT PLAY"} · +${Math.round(h.bases)}`,
      }));
      const o = mid[opp(k)];
      part1.push({
        team: k, delta: pitchNet(mid[k]), pitch: true,
        text: `${name[opp(k)].toUpperCase()}'S ARMS (${names(o.pitchers).toUpperCase()}) THROUGH 6: ` +
          `GAVE UP +${Math.round(mid[k].parts.allowed)}, STRUCK OUT ${Math.round(mid[k].parts.ks)}`,
      });
    }
    for (const k of ["B", "A"]) {
      const late = full[k].parts.hit - mid[k].parts.hit;
      const best = full[k].hitters.filter((h) => h.line).sort((a, b) => b.bases - a.bases)[0];
      part2.push({ team: k, delta: late,
        text: `${name[k].toUpperCase()} LATE-INNING BATS: +${Math.round(late)}` + (best ? ` · ${best.used.name.toUpperCase()} STAYS HOT` : "") });
      const lateArms = full[opp(k)].pitchers.filter((p) => p.role.slot !== "SP");
      part2.push({ team: k, delta: pitchNet(full[k]) - pitchNet(mid[k]), pitch: true,
        text: `${name[opp(k)].toUpperCase()}'S BULLPEN (${names(lateArms).toUpperCase()}): ` +
          `GAVE UP +${Math.round(full[k].parts.allowed - mid[k].parts.allowed)}, STRUCK OUT ${Math.round(full[k].parts.ks - mid[k].parts.ks)}` });
    }

    const scoreFrom = (cum) => {
      const out = {};
      for (const k of ["A", "B"]) { const b = Math.max(0, Math.round(cum[k])); out[k] = { runs: Math.floor(b / RULES.BASES_PER_RUN), stranded: b % RULES.BASES_PER_RUN }; }
      return out;
    };
    const sumSteps = (list, upto) => {
      const cum = { A: 0, B: 0 };
      list.slice(0, upto).forEach((st) => (cum[st.team] += st.delta));
      return cum;
    };

    // ---------- tiebreaker: played out step by step instead of jumping to FINAL ----------
    const tieSteps = [];
    if (full.decidedBy !== "runs") {
      const UP = (k) => name[k].toUpperCase();
      const winner = full.winner, loser = opp(full.winner);
      const tally = { A: 0, B: 0 };
      const push = (text, caption, active = "B", fx = {}) =>
        tieSteps.push({ text, caption, active, fx, tally: { A: { runs: tally.A, stranded: 0 }, B: { runs: tally.B, stranded: 0 } } });
      push(`TIED ${full.A.runs}–${full.B.runs} AFTER 9! IT'S A HOME RUN DERBY!`, "TIEBREAKER · ROUND 1: BENCH SLUGGERS WHO SAT");
      // Round 1: bench players who sat because their starter played — their real homers that week.
      for (const k of ["B", "A"]) {
        const sat = full[k].hitters.map((h) => [h, derbyHomers(h, week?.length ? week : [day])]).filter(([, hr]) => hr != null);
        if (!sat.length) push(`${UP(k)}'S BENCH: NOBODY ELIGIBLE — 0 HOMERS`, "ROUND 1: BENCH SLUGGERS", k);
        for (const [h, hr] of sat) {
          tally[k] += hr;
          push(`${UP(k)} · ${h.pos} ${h.backup.name.toUpperCase()} · ${hr ? hr + (hr > 1 ? " HOMERS" : " HOMER") + " THIS WEEK!" : "NO HOMERS THIS WEEK"}`,
            "ROUND 1: BENCH SLUGGERS · SCOREBOARD = DERBY HOMERS", k, { homer: hr > 0 });
        }
      }
      tally.A = full.A.derby; tally.B = full.B.derby; // the official count
      if (full.decidedBy === "derby") {
        push(`${UP(winner)} WINS THE HOME RUN DERBY, ${full[winner].derby}–${full[loser].derby}!`, "TIEBREAKER DECIDED", winner);
      } else {
        push(`DERBY TIED ${full.A.derby}–${full.B.derby}! ROUND 2: STARTERS' HOMERS`, "TIEBREAKER · ROUND 2: STARTERS' HOMERS");
        // Round 2: homers by each lineup that day.
        for (const k of ["B", "A"]) {
          const hitters = full[k].hitters.filter((h) => h.line && h.line[4]);
          tally[k] = full[k].starterHR;
          push(`${UP(k)}'S LINEUP: ${full[k].starterHR} HOMER${full[k].starterHR === 1 ? "" : "S"}` +
            (hitters.length ? ` (${hitters.map((h) => h.used.name.split(" ").pop().toUpperCase()).join(", ")})` : ""),
            "ROUND 2: STARTERS' HOMERS · SCOREBOARD = HOMERS", k);
        }
        if (full.decidedBy === "starterHR") {
          push(`${UP(winner)} WINS ON STARTERS' HOMERS, ${full[winner].starterHR}–${full[loser].starterHR}!`, "TIEBREAKER DECIDED", winner);
        } else {
          push("STILL TIED! FLIPPING A COIN...", "TIEBREAKER · ROUND 3: COIN FLIP", "B", { coin: true });
          push(`THE COIN LANDS FOR ${UP(winner)}!`, "TIEBREAKER DECIDED", winner);
        }
      }
    }

    const draw = () => {
      if (stage === "tiebreak") {
        const st = tieSteps[Math.min(step, tieSteps.length - 1)];
        if (st.fx.homer) homerSound();
        if (st.fx.coin) drumroll();
        middle.replaceChildren(...handheldView(st.tally, name, st.text,
          `${st.caption} · ${Math.min(step, tieSteps.length - 1) + 1} OF ${tieSteps.length}`,
          [el("button", { className: "handheld-button blue", onclick: () => { beep(340); step = tieSteps.length - 1; draw(); } }, "SKIP"),
           el("button", { className: "handheld-button orange next-button", onclick: () => {
             beep(580); step++;
             if (step >= tieSteps.length) { stage = "final"; step = 0; }
             draw();
           } }, step >= tieSteps.length - 1 ? "FINAL ▸" : "NEXT ▸")],
          st.active, { banner: "HOME RUN DERBY", ...st.fx }));
        livePanel(left, mine, full, part2, part2.length, true);
        livePanel(right, theirs, full, part2, part2.length, true);
      } else if (stage === "pbp1" || stage === "pbp2") {
        const steps = stage === "pbp1" ? part1 : part2;
        const base = stage === "pbp1" ? { A: 0, B: 0 } : sumSteps(part1, part1.length);
        const cum = sumSteps(steps, step);
        // Last step of each half shows the official score (avoids rounding drift).
        const official = stage === "pbp1" ? mid : full;
        const shown = step >= steps.length ? { A: official.A, B: official.B } : scoreFrom({ A: base.A + cum.A, B: base.B + cum.B });
        const last = steps[step - 1];
        middle.replaceChildren(...handheldView(shown, name,
          last ? last.text : stage === "pbp1" ? `PLAY BALL! ${name.B.toUpperCase()} BATS FIRST.` : "LATE INNINGS — HERE COME THE BULLPENS",
          `DRAFTED FROM THE ${room.decade} · ${stage === "pbp1" ? "INNINGS 1–6" : "INNINGS 7–9"} · ${step} OF ${steps.length}`,
          [el("button", { className: "handheld-button blue", onclick: () => { beep(340); step = steps.length; advance(); } }, "SKIP"),
           el("button", { className: "handheld-button orange next-button", onclick: () => { beep(580); step++; advance(); } }, "NEXT ▸")],
          last?.team ?? "B"));
        livePanel(left, mine, stage === "pbp1" ? mid : full, steps, step, stage === "pbp2");
        livePanel(right, theirs, stage === "pbp1" ? mid : full, steps, step, stage === "pbp2");
      } else if (stage === "stretch") {
        stretch(mid, name, () => { stage = "pbp2"; step = 0; draw(); });
        box(left, name[mine], mid[mine], false, (p) => fromOther(mine, p), true);
        box(right, name[theirs], mid[theirs], false, (p) => fromOther(theirs, p), true);
        addBenchButton(left, mine);
        addBenchButton(right, theirs);
      } else {
        final(full, name, mine);
        box(left, name[mine], full[mine], mine === full.winner, (p) => fromOther(mine, p), false);
        box(right, name[theirs], full[theirs], theirs === full.winner, (p) => fromOther(theirs, p), false);
        addBenchButton(left, mine);
        addBenchButton(right, theirs);
      }
    };
    const advance = () => {
      const steps = stage === "pbp1" ? part1 : part2;
      if (step > steps.length) {
        stage = stage === "pbp1" ? "stretch" : tieSteps.length ? "tiebreak" : "final";
        step = 0;
      }
      draw();
    };

    // Side panel while stepping: hitters light up as their turn is revealed.
    function livePanel(target, key, res, steps, upto, late) {
      const seen = new Set(steps.slice(0, upto).filter((st) => st.team === key && st.hitter != null).map((st) => st.hitter));
      const rows = [el("li", { className: "group" }, late ? "HITTERS (full game)" : "HITTERS")];
      res[key].hitters.forEach((h, i) => {
        const open = late || seen.has(i);
        rows.push(el("li", { className: open ? "filled" : "" },
          el("span", { className: "slot" }, h.pos),
          el("span", { className: "who" }, h.used?.name ?? h.starter?.name ?? "—",
            open ? el("small", { className: "line" }, hitLine(h.line)) : null),
          el("span", { className: "pts" }, open ? "+" + Math.round(h.bases) : "")));
      });
      rows.push(el("li", { className: "group" }, "PITCHERS"));
      for (const p of res[key].pitchers) rows.push(el("li", { className: p.outs ? "filled" : "" },
        el("span", { className: "slot" }, p.role.slot), el("span", { className: "who" }, p.p?.name ?? "—")));
      target.replaceChildren(el("h2", {}, `${name[key]}${key === "A" ? " (HOME)" : " (VISITORS)"}`),
        el("ul", { className: "slots box" }, ...rows));
      addBenchButton(target, key);
    }

    draw();
  }

  function renderField(runners, scored = false, fx = {}) {
    const lights = [runners >= 1, runners >= 2, runners >= 3];
    const dot = (cx, cy, on) => on ? `<circle cx="${cx}" cy="${cy}" r="5.5" fill="#ff3932" stroke="#fff1d6" stroke-width="1.5" class="base-lit"/>` : "";
    return el("div", { className: "field-window" + (scored && !reduceMotion() ? " field-scored" : "") },
      el("div", { className: "field-rim" },
        el("div", { className: "field-svg", innerHTML: `<svg viewBox="0 0 360 270" role="img" aria-label="Baseball field with ${runners} runners on base">
          <path d="M18 222 Q180 -14 342 222 L180 257 Z" fill="#41b968" opacity=".5"/>
          <path d="M180 58 L285 164 L180 251 L75 164 Z" fill="#be864e"/>
          <path d="M180 74 L270 164 L180 237 L90 164 Z" fill="#44ba70"/>
          <path d="M180 58 L180 251 M75 164 L285 164" stroke="#b5a27e" stroke-width="2" opacity=".28"/>
          <!-- Foul lines extend from home plate through the exact centers of third and first base. -->
          <path d="M0 102 L180 251 L360 102" stroke="#f9f8de" stroke-width="3" fill="none"/>
          <circle cx="180" cy="164" r="15" fill="#be864e"/><circle cx="180" cy="164" r="5" fill="#6f4a26"/>
          <rect x="174" y="52" width="12" height="12" transform="rotate(45 180 58)" fill="#f8fff4"/>
          <rect x="279" y="158" width="12" height="12" transform="rotate(45 285 164)" fill="#f8fff4"/>
          <rect x="69" y="158" width="12" height="12" transform="rotate(45 75 164)" fill="#f8fff4"/>
          <path d="M171 247 L180 256 L189 247 L180 239 Z" fill="#fcfff4"/>
          ${dot(285,164,lights[0])}${dot(180,58,lights[1])}${dot(75,164,lights[2])}
          ${fx.homer ? '<g class="hr-ball"><circle cx="180" cy="240" r="7" fill="#fffef6" stroke="#ff3932" stroke-width="2"/></g>' : ""}
          ${fx.coin ? '<g class="flip-coin"><circle cx="180" cy="150" r="30" fill="#e8b84a" stroke="#9c6b1e" stroke-width="4"/><text x="180" y="160" text-anchor="middle" font-size="26" font-weight="900" fill="#8a5a14" font-family="Arial">TMB</text></g>' : ""}
          </svg>` }),
        el("div", { className: "field-legend" + (fx.homer ? " legend-homer" : "") },
          fx.homer ? "GONE! HOME RUN!" : fx.coin ? "HEADS OR TAILS..." : fx.banner ? "TIEBREAKER" : `${runners} RUNNER${runners === 1 ? "" : "S"} ON BASE`)));
  }

  function handheldView(lines, name, tickerText, caption, buttons, activeKey = "B", fx = {}) {
    const score = lines[activeKey];
    const scored = lines.A.runs > lastFieldRuns.A || lines.B.runs > lastFieldRuns.B;
    lastFieldRuns = { A: lines.A.runs, B: lines.B.runs };
    return [header(),
      el("div", { className: "handheld-score-window" + (fx.banner ? " derby" : "") },
        fx.banner ? el("div", { className: "derby-banner" }, fx.banner) : null,
        el("div", { className: "handheld-date" }, ledDate(room.gameDate)),
        scoreboard(lines, name),
        el("div", { className: "ticker", role: "status", ariaLive: "polite" }, tickerText)),
      renderField(fx.banner ? 0 : score.stranded, scored || !!fx.homer, fx),
      el("div", { className: "pbp-buttons" }, ...buttons, soundButton()),
      el("div", { className: "speaker-grille", ariaHidden: "true" }),
      el("p", { className: "handheld-caption" }, caption),
      leaveBtn(), credit()];
  }

  function scoreboard(lines, name) {
    const row = (key, label) => el("div", { className: "score-row" },
      el("span", { className: "score-name" }, el("small", {}, label + " "), name[key]), diamond(lines[key].stranded),
      el("span", { className: "score-runs" }, String(lines[key].runs)));
    return el("div", { className: "scoreboard" }, row("B", "VISITORS"), row("A", "HOME"));
  }

  // ---------- 7th inning stretch ----------
  function stretch(mid, name, onFinish) {
    const notes = [];
    for (const key of ["B", "A"]) {
      const side = mid[key];
      const sp = side.pitchers[0];
      if (sp.p && sp.row) notes.push(`${sp.p.name} (${name[key]}) went ${ip(sp.outs)} innings with ${Math.round(sp.k)} strikeouts.`);
      else if (sp.p) notes.push(`${sp.p.name} (${name[key]}) didn't pitch that week — ${name[key]}'s starter spot was empty!`);
      const big = side.hitters.filter((h) => h.line).sort((a, b) => b.bases - a.bases)[0];
      if (big && big.line[1]) notes.push(`${big.used.name} is ${name[key]}'s best bat so far: ${hitLine(big.line)}.`);
      for (const h of side.hitters) {
        if (h.line && h.line[4]) notes.push(`${h.used.name} homered for ${name[key]}!`);
        if (h.used && h.used !== h.starter) notes.push(`${h.starter?.name ?? "The starter"} sat out — ${h.used.name} came off ${name[key]}'s bench.`);
        if (!h.used) notes.push(`Nobody played ${h.pos} for ${name[key]} that day.`);
      }
    }
    const a = mid.A.runs, b = mid.B.runs;
    const lead = a === b ? `All tied ${a}-${b}!` : `${a > b ? name.A : name.B} leads ${Math.max(a, b)}-${Math.min(a, b)}.`;
    middle.replaceChildren(header(),
      el("p", { className: "hint" }, prettyDate(room.gameDate)),
      el("div", { className: "led small" }, "7TH INNING STRETCH"),
      scoreboard({ A: mid.A, B: mid.B }, name),
      renderField(mid.B.stranded),
      el("p", { className: "lead" }, "After 6 innings: " + lead),
      el("ul", { className: "notes" }, ...notes.slice(0, 10).map((n) => el("li", {}, n))),
      el("p", { className: "hint" }, "Tip: click any player in the box scores to see his real game."),
      el("button", { className: "btn", onclick: onFinish }, "PLAY THE LATE INNINGS ▸"),
      leaveBtn(), credit());
  }

  // ---------- final ----------
  function final(res, name, mine) {
    const other = res.winner === "A" ? "B" : "A";
    const why = {
      runs: "",
      derby: `Tied ${res.A.runs}-${res.B.runs}! Won the Home Run Derby (bench homers ${res[res.winner].derby} to ${res[other].derby}).`,
      starterHR: `Tied ${res.A.runs}-${res.B.runs}! Derby tied too — won on starters' homers.`,
      coin: `Tied ${res.A.runs}-${res.B.runs} with no homers to break it — won the coin flip!`,
    }[res.decidedBy];
    middle.replaceChildren(header(),
      el("p", { className: "hint" }, "FINAL"),
      el("div", { className: "led small" }, prettyDate(room.gameDate)),
      scoreboard({ A: res.A, B: res.B }, name),
      renderField(res.B.stranded),
      el("div", { className: "led small winner" }, res.winner === mine ? "YOU WIN!" : name[res.winner].toUpperCase() + " WINS"),
      ...(why ? [el("p", { className: "hint" }, why)] : []),
      el("p", { className: "hint" }, "Every 4 bases = 1 run. Leftover bases are runners left on base. Click any player for his real game."),
      leaveBtn(), credit());
  }

  // ---------- box score (click a name for the deep box score) ----------
  function box(target, name, s, won, movedFrom, partial) {
    const date = room.gameDate;
    const rows = [el("li", { className: "group" }, partial ? "HITTERS (through 6)" : "HITTERS")];
    const tag = (pick) => { const f = movedFrom(pick); return f ? el("small", { className: "moved" }, ` ↔ from ${f}`) : null; };
    for (const h of s.hitters) {
      const subbed = h.used && h.used !== h.starter;
      rows.push(el("li", { className: (h.used ? "filled" : "") + " clickable", title: "See his real game", onclick: () => hitterCard(h, date, h.bases) },
        el("span", { className: "slot" }, h.pos),
        el("span", { className: "who" },
          h.used ? h.used.name : (h.starter?.name ?? "—"), tag(h.used ?? h.starter),
          subbed ? el("small", {}, ` (for ${h.starter?.name ?? "—"})`) : null,
          el("small", { className: "line" }, hitLine(h.line))),
        el("span", { className: "pts" }, "+" + Math.round(h.bases))));
    }
    rows.push(el("li", { className: "group" }, "PITCHERS"));
    for (const p of s.pitchers) {
      let text = `${p.role.label}: no game that week`;
      if (p.row) {
        const [, , hh, hr, bb, , k] = p.row;
        text = `${p.role.label} · ${ip(partial ? p.outs : p.fullOuts)} of ${ip(p.role.outs)} inn (${shortDate(p.row[0])})` +
          (p.sub ? " · SPARE filled in" : "") + ` · real game: ${ip(p.row[1])} IP, ${hh} H, ${bb} BB, ${k} K` + (hr ? `, ${hr} HR` : "");
      }
      rows.push(el("li", { className: (p.row ? "filled" : "") + " clickable", title: "See his real game", onclick: () => pitcherCard(p, date) },
        el("span", { className: "slot" }, p.role.slot),
        el("span", { className: "who" }, p.p?.name ?? "—", tag(p.p), el("small", { className: "line" }, text))));
    }
    rows.push(el("li", { className: "group" }, "BASES"));
    const part = (label, v) => el("li", { className: "filled" },
      el("span", { className: "who" }, label), el("span", { className: "pts" }, v));
    rows.push(part("Hitters", "+" + Math.round(s.parts.hit)));
    rows.push(part("Off their pitchers", "+" + Math.round(s.parts.allowed)));
    rows.push(part("Their strikeouts", "−" + Math.round(s.parts.ks)));
    if (s.parts.cs) rows.push(part("Caught stealing", "−" + Math.round(s.parts.cs)));
    rows.push(part("TOTAL", `${s.bases} = ${s.runs} R + ${s.stranded} LOB`));
    target.replaceChildren(
      el("h2", { className: won ? "on-clock" : "" }, name + (won ? " ★" : "")),
      el("ul", { className: "slots box" }, ...rows));
  }

  return {
    update,
    destroy() { destroyed = true; cancelClock(); audioCtx?.close().catch(() => {}); document.body.classList.remove("drafting"); modal.hidden = true; },
  };
}
