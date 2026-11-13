// After the draft: PLAY BALL (protect 4 bench players) → shuffle → LINEUP CARD (start a backup?) →
// innings 1–5, the starters (SKIP → top of the 6th) → the 6th, relievers in → 7th inning stretch →
// 7th & 8th relievers, 9th closers → final.  NEXT steps through; SKIP jumps to the next part.
// Click any player in a box score to see his real game that day.
import { myId, updateRoom } from "./firebase.js";
import { studioFooter } from "./rules.js";
import { isPhone, makePad } from "./phone.js";
import { playGame, shuffleTeams, applyLineup, applyStaff, teamFromPicks, derbyHomers, RULES, POSITIONS, BENCH, PITCH_SLOTS, DH_FROM } from "./score.js";

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
  let lineupChoice = null; // positions where this player starts his backup (lineup card)
  let staffOrder = null;   // lineup card: drafted pitching slots in their new roles (SP, RP1, RP2, CL, SPARE)
  let staffPick = null;    // the role tapped first when swapping two pitchers
  let dhChoice = null;     // lineup card: the bench outfield spot ("LF BN"…) named DH, or "" for none
  let stage = "pbp1";      // pbp1 (1–5) → pen6 (6th) → stretch → pbp2 (7–9) → final  (each player steps at his own pace)
  let step = 0;
  const atFirstPitch = () => stage === "pbp1" && step === 0;
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
  // "Charge!" fanfare in the game's square-wave beeps: da-da-da-DAAA, da-DAAAAA!
  function chargeFanfare() {
    const notes = [[392, 0, 0.12], [523, 150, 0.12], [659, 300, 0.12], [784, 450, 0.32], [659, 800, 0.14], [784, 950, 0.6]];
    notes.forEach(([f, at, len]) => setTimeout(() => beep(f, len), at));
  }
  let chargedStart = false; // the game-starting Charge plays once per game
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
      ariaPressed: String(soundOn), onclick: () => {
        soundOn = !soundOn;
        if (soundOn && atFirstPitch() && !chargedStart) { chargedStart = true; chargeFanfare(); } else beep(580);
        drawSoundLabels();
      } },
      speakerIcon());
  }

  const left = el("section", { className: "team" });
  const right = el("section", { className: "team" });
  const middle = el("section", { className: "screen middle" });
  document.body.classList.add("drafting");
  const grid = el("div", { className: "draft" }, left, middle, right);
  middle.dataset.pane = "game";
  container.replaceChildren(grid);
  // Phone: GAME · AWAY · HOME screen buttons (NEXT / SKIP / SOUND stay on the handheld itself).
  const pad = isPhone() ? makePad(grid, [
    { key: "game", label: "GAME", look: "plain" },
    { key: "away", label: "AWAY", look: "away" },
    { key: "home", label: "HOME", look: "home" },
  ], "game") : null;
  if (pad) pad.sound = () => soundOn;

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
        ...(team.DH ? [el("li", { className: "filled" }, el("span", { className: "slot" }, "DH"), el("span", { className: "who" }, team.DH.name))] : []),
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

  // Saved as "LF,C" (Firebase drops empty arrays, so a string is safer).
  const swapsOf = (lu) => String(lu?.swaps || "").split(",").filter((p) => POSITIONS.includes(p));
  const staffOf = (lu) => String(lu?.staff || "").split(",").filter(Boolean);
  // A team after its manager's lineup card: hitters swapped, then pitchers in their chosen roles.
  const carded = (team, swaps, staff, dh) => applyStaff(applyLineup(team, swaps, dh), staff);
  const dhOf = (lu) => (DH_FROM.includes(lu?.dh) ? lu.dh : null);

  // The post-shuffle teams (same result on both screens: the coin flips are seeded by room + date).
  function shuffleFor(s) {
    const [uA, uB] = s.uids;                  // A = home (started the game), B = visitors
    const shuffled = shuffleTeams({ A: s.drafted[uA], B: s.drafted[uB] },
      { A: s.ready[uA].keep, B: s.ready[uB].keep }, code + "|" + room.gameDate);
    return { uA, uB, shuffled };
  }

  // ---------- LINEUP CARD: after the shuffle, start your backup instead of your starter? ----------
  // No stats from game day are shown here: they're revealed once the game starts.
  function lineupScreen(s, lineups) {
    const { uA, shuffled } = shuffleFor(s);
    const key = s.me === uA ? "A" : "B";
    const team = shuffled[key];
    const oppName = room.players[s.other]?.name ?? "Opponent";
    const myName = room.players[s.me]?.name ?? "You";
    const kept = s.ready[s.me]?.keep || [];
    const tag = (slot, pick) => !pick ? null
      : shuffled.moved.has(pick.pid) ? el("small", { className: "moved" }, ` ↔ from ${oppName}`)
      : kept.includes(slot) ? el("small", {}, " 🔒") : null;

    // Their panel shows their post-shuffle roster, not their lineup choices (those stay secret too).
    rosterPanel(right, oppName, shuffled[key === "A" ? "B" : "A"], null,
      lineups[s.other]?.done ? "Lineup set ✔" : "Filling out the lineup card...");

    if (lineups[s.me]?.done) {
      rosterPanel(left, myName + " (you)", carded(team, swapsOf(lineups[s.me]), staffOf(lineups[s.me]), dhOf(lineups[s.me])), null, "Lineup set ✔");
      middle.replaceChildren(header(), el("div", { className: "led small" }, "LINEUP SET"),
        el("p", { className: "hint" }, `Waiting for ${oppName} to hand in the lineup card...`), leaveBtn(), credit());
      return;
    }

    lineupChoice ??= [];
    const both = POSITIONS.filter((pos) => team[pos] && team[pos + " BN"]);
    const rows = both.map((pos) => {
      const starts = lineupChoice.includes(pos) ? "BN" : "ST";
      const choice = (which) => {
        const pick = which === "BN" ? team[pos + " BN"] : team[pos];
        const slot = which === "BN" ? pos + " BN" : pos;
        return el("button", {
          type: "button", className: "chip lineup-pick" + (starts === which ? " on" : ""),
          ariaPressed: String(starts === which),
          onclick: () => {
            lineupChoice = which === "BN" ? [...new Set([...lineupChoice, pos])] : lineupChoice.filter((x) => x !== pos);
            lineupScreen(info(), room.lineup || {});
          },
        }, pick.name, tag(slot, pick));
      };
      return el("div", { className: "lineup-row" },
        el("span", { className: "slot" }, pos), choice("ST"), choice("BN"));
    });
    // Pitching staff: tap one pitcher, then another, to swap their roles. Names only — no stats.
    staffOrder ??= [...PITCH_SLOTS];
    const ROLE_NOTE = { SP: "starts · innings 1–5", RP1: "6th–7th", RP2: "8th", CL: "closes · 9th", SPARE: "fills in if one didn't pitch" };
    // Each row: the role stays put on the left; the pitcher (name + ☰ grip) can be dragged to another role,
    // or tapped and then another tapped to swap. Dragging moves him and slides the others up or down.
    const slots = [];
    const staffRows = PITCH_SLOTS.map((role, i) => {
      const pick = team[staffOrder[i]];
      const nameBtn = el("button", {
        type: "button", className: "chip lineup-pick" + (staffPick === i ? " on" : ""), disabled: !pick,
        ariaPressed: String(staffPick === i),
        onclick: () => {
          if (staffPick == null) staffPick = i;
          else { if (staffPick !== i) [staffOrder[staffPick], staffOrder[i]] = [staffOrder[i], staffOrder[staffPick]]; staffPick = null; }
          lineupScreen(info(), room.lineup || {});
        },
      }, pick?.name ?? "—", el("small", {}, ROLE_NOTE[role]));
      const grip = el("button", { type: "button", className: "drag-grip", ariaLabel: `Drag ${pick?.name ?? "pitcher"} to another role`,
        title: "Drag to change his role" }, "☰");
      grip.addEventListener("pointerdown", (e) => startDrag(e, i));
      // Keyboard: arrow keys move him up or down one role.
      grip.addEventListener("keydown", (e) => {
        const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
        if (to == null || to < 0 || to >= PITCH_SLOTS.length) return;
        e.preventDefault(); moveStaff(i, to);
        middle.querySelectorAll(".drag-grip")[to]?.focus();
      });
      const slot = el("div", { className: "staff-slot" }, nameBtn, grip);
      slots.push(slot);
      return el("div", { className: "lineup-row staff-row" }, el("span", { className: "slot" }, role), slot);
    });
    function moveStaff(from, to) {
      const [who] = staffOrder.splice(from, 1);
      staffOrder.splice(to, 0, who);
      staffPick = null;
      lineupScreen(info(), room.lineup || {});
    }
    function startDrag(e, from) {
      e.preventDefault();
      const grip = e.currentTarget;
      try { grip.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
      const tops = slots.map((sl) => sl.getBoundingClientRect().top);
      const step = tops.length > 1 ? tops[1] - tops[0] : 56;
      const y0 = e.clientY;
      let to = from;
      slots[from].classList.add("dragging");
      const move = (ev) => {
        const dy = ev.clientY - y0;
        slots[from].style.transform = `translateY(${dy}px)`;
        to = Math.max(0, Math.min(slots.length - 1, from + Math.round(dy / step)));
        slots.forEach((sl, k) => {
          if (k === from) return;
          const shift = from < to && k > from && k <= to ? -step : from > to && k < from && k >= to ? step : 0;
          sl.style.transform = shift ? `translateY(${shift}px)` : "";
        });
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        if (to !== from) moveStaff(from, to);
        else { slots.forEach((sl) => (sl.style.transform = "")); slots[from].classList.remove("dragging"); }
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    }
    // Designated hitter: one of the bench outfielders (after the starter/backup swaps above), names only.
    const swapped = applyLineup(team, lineupChoice);
    const dhOptions = DH_FROM.filter((slot) => swapped[slot]);
    if (dhChoice == null || (dhChoice && !dhOptions.includes(dhChoice))) dhChoice = dhOptions[0] ?? "";
    const dhChip = (slot, label) => el("button", {
      type: "button", className: "chip lineup-pick" + (dhChoice === slot ? " on" : ""), ariaPressed: String(dhChoice === slot),
      onclick: () => { dhChoice = slot; lineupScreen(info(), room.lineup || {}); },
    }, label);
    const dhRow = el("div", { className: "lineup-card dh-card" },
      ...dhOptions.map((slot) => dhChip(slot, el("span", {}, swapped[slot].name, el("small", {}, slot.replace(" BN", " bench"))))),
      dhChip("", el("span", {}, "No DH")));
    const lockBtn = el("button", { className: "btn" }, "LOCK IN LINEUP");
    const status = el("p", { className: "hint" });
    lockBtn.onclick = async () => {
      lockBtn.disabled = true;
      try { await updateRoom(code, { [`lineup/${s.me}`]: { done: true, swaps: lineupChoice.join(","), staff: staffOrder.join(","), dh: dhChoice || "" } }); }
      catch (e) { status.textContent = "Couldn't save: " + e.message; lockBtn.disabled = false; }
    };

    rosterPanel(left, myName + " (you)", carded(team, lineupChoice, staffOrder, dhChoice), null, "After the shuffle");
    middle.replaceChildren(header(),
      el("div", { className: "led small" }, "LINEUP CARD"),
      el("p", { className: "hint" },
        "Tap who starts at each spot. If both men played that day, the one you start is the one who counts — " +
        "and the one on the bench swings in the Home Run Derby if the game ends tied. " +
        "If the man you start didn't play, the other one fills in. Game day stats stay secret until the first pitch."),
      both.length ? el("div", { className: "lineup-card" }, ...rows)
        : el("p", { className: "hint" }, "You don't have a starter and a backup at any position — nothing to change."),
      el("div", { className: "led small" }, "DESIGNATED HITTER"),
      el("p", { className: "hint" }, dhOptions.length
        ? "Pick a bench outfielder to bat as your DH. He bats if his starter plays that day — but then he can't swing in the Home Run Derby."
        : "You don't have a bench outfielder to DH."),
      dhRow,
      el("div", { className: "led small" }, "PITCHING STAFF"),
      el("p", { className: "hint" }, staffPick == null ? "Drag a pitcher by the ☰ to change his role — or tap one, then another, to swap them."
        : `Now tap the pitcher to trade roles with ${team[staffOrder[staffPick]]?.name ?? "him"} (or tap him again to cancel).`),
      el("div", { className: "lineup-card staff-card" }, ...staffRows),
      status, lockBtn, leaveBtn(), credit());
  }

  // ---------- room updates ----------
  async function update(r) {
    room = r;
    const s = info();
    // Phone panes: the player who started the game (seat 1) is HOME; left = me, right = them.
    const iAmHome = s.me === s.uids[0];
    left.dataset.pane = iAmHome ? "home" : "away";
    right.dataset.pane = iAmHome ? "away" : "home";
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
    // LINEUP CARD: both managers hand one in before the first pitch. The computer sticks with its starters.
    const lineups = r.lineup || {};
    if (cpu && !lineups[cpu] && r.host === s.me) {
      const { uA, shuffled } = shuffleFor(s);
      const cpuTeam = shuffled[cpu === uA ? "A" : "B"];
      updateRoom(code, { [`lineup/${cpu}`]: { done: true, swaps: "", dh: DH_FROM.find((slot) => cpuTeam[slot]) || "" } }).catch(() => {});
    }
    if (!s.uids.every((u) => lineups[u]?.done)) {
      shownFor = null; cancelClock(); middle.classList.remove("handheld", "time-travel");
      return lineupScreen(s, lineups);
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
    const { shuffled } = shuffleFor(s);
    // Lineup cards: where a manager started his backup, the two trade places (starter → bench spot).
    const swaps = { A: swapsOf(room.lineup?.[uA]), B: swapsOf(room.lineup?.[uB]) };
    const teams = { A: carded(shuffled.A, swaps.A, staffOf(room.lineup?.[uA]), dhOf(room.lineup?.[uA])),
      B: carded(shuffled.B, swaps.B, staffOf(room.lineup?.[uB]), dhOf(room.lineup?.[uB])) };
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
        const benchedByManager = swaps[key].includes(slot.replace(" BN", "")); // the starter he sat on the lineup card
        const protectedPick = !benchedByManager && !!pick && original === key && s.ready[s.uids[key === "A" ? 0 : 1]]?.keep?.includes(slot);
        const moved = !!pick && original && original !== key;
        const record = pick && day.b?.[pick.pid];
        const desc = benchedByManager ? "SAT BY MANAGER" : protectedPick ? "PROTECTED" : moved ? `TRADED FROM ${name[original].toUpperCase()}` : "REMAINED";
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

    // Build the play-by-play, following the pitching changes:
    //   part1 = innings 1–5 (the starters) → part6 = the 6th (relievers in) → 7th inning stretch →
    //   part2 = 7th, 8th, 9th (reliever, reliever, closer).  SKIP jumps to the start of the next part.
    // Visitors bat first, like a real game.
    const thru5 = playGame(teams, day, pitching, date, seed, 5, week);
    const byInning = { 5: thru5, 6: mid, 7: playGame(teams, day, pitching, date, seed, 7, week),
      8: playGame(teams, day, pitching, date, seed, 8, week), 9: full };
    const ORD = { 6: "6TH", 7: "7TH", 8: "8TH", 9: "9TH" };
    const PEN = { 6: 1, 7: 1, 8: 2, 9: 3 }; // which pitcher covers that inning: RP1, RP1, RP2, CL

    const part1 = [], part6 = [], part2 = [];
    for (const k of ["B", "A"]) {
      thru5[k].hitters.forEach((h, i) => part1.push({
        team: k, delta: h.bases, hitter: i,
        text: `${h.pitcherBat ? "P" : h.pos} ${(h.used?.name ?? h.starter?.name ?? "—").toUpperCase()} · ${h.line ? hitLine(h.line).toUpperCase() : "DID NOT PLAY"} · +${Math.round(h.bases)}`,
      }));
      const sp = thru5[opp(k)].pitchers[0];
      part1.push({
        team: k, delta: pitchNet(thru5[k]), pitch: true,
        text: sp.row
          ? `${name[opp(k)].toUpperCase()}'S STARTER ${sp.p.name.toUpperCase()} THROUGH 5: GAVE UP +${Math.round(thru5[k].parts.allowed)}, STRUCK OUT ${Math.round(thru5[k].parts.ks)}`
          : `${name[opp(k)].toUpperCase()} HAD NO STARTER THAT WEEK — 5 EMPTY INNINGS`,
      });
    }
    // Announces the pitcher by full name: RP1 comes in for the 6th and stays for the 7th, RP2 the 8th, the closer the 9th.
    // (The SPARE takes a role whose pitcher didn't pitch that week.)
    function comingIn(k, inn) {
      const p = full[k].pitchers[PEN[inn]];
      const team = name[k].toUpperCase();
      if (!p.row) return `NOBODY IS AVAILABLE TO PITCH THE ${ORD[inn]} FOR ${team} — AN EMPTY INNING.`;
      const who = p.p.name.toUpperCase();
      if (inn === 7) return `${who} STAYS IN TO PITCH THE 7TH FOR ${team}.`;
      if (p.sub) return `${who}, THE SPARE, IS COMING IN TO PITCH THE ${ORD[inn]} FOR ${team}.`;
      return `${inn === 9 ? "CLOSER " : ""}${who} IS COMING IN TO PITCH THE ${ORD[inn]} FOR ${team}.`;
    }
    // One step per half-inning in the bullpen innings: that team's bats + what the pitcher on the mound gave up.
    for (const inn of [6, 7, 8, 9]) {
      for (const k of ["B", "A"]) {
        const prev = byInning[inn - 1][k], cur = byInning[inn][k];
        const bats = cur.parts.hit - prev.parts.hit;
        const arms = pitchNet(cur) - pitchNet(prev);
        (inn === 6 ? part6 : part2).push({ team: k, delta: bats + arms, pitch: true,
          text: `${k === "B" ? "TOP" : "BOTTOM"} ${ORD[inn]} · ${comingIn(opp(k), inn)} ` +
            `${name[k].toUpperCase()} BATS +${Math.round(bats)} · HE GAVE UP +${Math.round(cur.parts.allowed - prev.parts.allowed)}, ${Math.round(cur.parts.ks - prev.parts.ks)} K` });
      }
    }
    const SECTIONS = {
      pbp1: { steps: part1, before: [], official: thru5, panel: thru5, late: false,
        caption: "INNINGS 1–5 · THE STARTERS", start: `PLAY BALL! ${name.B.toUpperCase()} BATS FIRST.` },
      pen6: { steps: part6, before: [part1], official: mid, panel: mid, late: "HITTERS (through 6)",
        caption: "6TH INNING · HERE COME THE RELIEVERS", start: "TOP OF THE 6TH — THE STARTERS ARE DONE. HERE COME THE BULLPENS!" },
      pbp2: { steps: part2, before: [part1, part6], official: full, panel: full, late: true,
        caption: "INNINGS 7–9 · RELIEVERS, THEN THE CLOSERS", start: "LATE INNINGS — THE 7TH, 8TH AND 9TH." },
    };
    const NEXT_STAGE = { pbp1: "pen6", pen6: "stretch", pbp2: () => (tieSteps.length ? "tiebreak" : "final") };
    const nextStage = (st) => (typeof NEXT_STAGE[st] === "function" ? NEXT_STAGE[st]() : NEXT_STAGE[st]);

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
      push(`TIED ${full.A.runs}–${full.B.runs} AFTER 9! WE'RE GOING TO EXTRA INNINGS!`, "END OF 9 · EXTRA INNINGS");
      push("TOP OF THE 10TH: IT'S A HOME RUN DERBY! BENCH SLUGGERS WHO SAT, STEP UP.", "10TH INNING · HOME RUN DERBY · ROUND 1: BENCH SLUGGERS WHO SAT", "B", { charge: true });
      // Round 1: bench players who sat because their starter played — their real homers that week.
      for (const k of ["B", "A"]) {
        const sat = full[k].hitters.map((h) => [h, derbyHomers(h, week?.length ? week : [day])]).filter(([, hr]) => hr != null);
        if (!sat.length) push(`${UP(k)}'S BENCH: NOBODY ELIGIBLE — 0 HOMERS`, "10TH INNING · ROUND 1: BENCH SLUGGERS", k);
        for (const [h, hr] of sat) {
          tally[k] += hr;
          push(`${UP(k)} · ${h.pos} ${h.backup.name.toUpperCase()} · ${hr ? hr + (hr > 1 ? " HOMERS" : " HOMER") + " THIS WEEK!" : "NO HOMERS THIS WEEK"}`,
            "10TH INNING · ROUND 1: BENCH SLUGGERS · SCOREBOARD = DERBY HOMERS", k, { homer: hr > 0 });
        }
      }
      tally.A = full.A.derby; tally.B = full.B.derby; // the official count
      if (full.decidedBy === "derby") {
        push(`${UP(winner)} WINS IT IN THE 10TH! HOME RUN DERBY, ${full[winner].derby}–${full[loser].derby}!`, "FINAL/10", winner);
      } else {
        push(`DERBY TIED ${full.A.derby}–${full.B.derby}! ROUND 2: STARTERS' HOMERS`, "10TH INNING · ROUND 2: STARTERS' HOMERS");
        // Round 2: homers by each lineup that day.
        for (const k of ["B", "A"]) {
          const hitters = full[k].hitters.filter((h) => h.line && h.line[4]);
          tally[k] = full[k].starterHR;
          push(`${UP(k)}'S LINEUP: ${full[k].starterHR} HOMER${full[k].starterHR === 1 ? "" : "S"}` +
            (hitters.length ? ` (${hitters.map((h) => h.used.name.split(" ").pop().toUpperCase()).join(", ")})` : ""),
            "10TH INNING · ROUND 2: STARTERS' HOMERS · SCOREBOARD = HOMERS", k);
        }
        if (full.decidedBy === "starterHR") {
          push(`${UP(winner)} WINS IT IN THE 10TH ON STARTERS' HOMERS, ${full[winner].starterHR}–${full[loser].starterHR}!`, "FINAL/10", winner);
        } else {
          push("STILL TIED! FLIPPING A COIN...", "10TH INNING · ROUND 3: COIN FLIP", "B", { coin: true });
          push(`THE COIN LANDS FOR ${UP(winner)}! THEY WIN IT IN THE 10TH!`, "FINAL/10", winner);
        }
      }
    }

    const draw = () => {
      if (stage === "tiebreak") {
        const st = tieSteps[Math.min(step, tieSteps.length - 1)];
        if (st.fx.homer) homerSound();
        if (st.fx.coin) drumroll();
        if (st.fx.charge) chargeFanfare();
        middle.replaceChildren(...handheldView(st.tally, name, st.text,
          `${st.caption} · ${Math.min(step, tieSteps.length - 1) + 1} OF ${tieSteps.length}`,
          [el("button", { className: "handheld-button blue", onclick: () => { beep(340); step = tieSteps.length - 1; draw(); } }, "SKIP"),
           el("button", { className: "handheld-button orange next-button", onclick: () => {
             beep(580); step++;
             if (step >= tieSteps.length) { stage = "final"; step = 0; }
             draw();
           } }, step >= tieSteps.length - 1 ? "FINAL ▸" : "NEXT ▸")],
          st.active, { banner: "EXTRA INNINGS · 10TH", ...st.fx }));
        livePanel(left, mine, full, part2, part2.length, true);
        livePanel(right, theirs, full, part2, part2.length, true);
      } else if (SECTIONS[stage]) {
        const sec = SECTIONS[stage];
        const steps = sec.steps;
        const base = { A: 0, B: 0 };
        for (const list of sec.before) { const c = sumSteps(list, list.length); base.A += c.A; base.B += c.B; }
        const cum = sumSteps(steps, step);
        // Last step of each part shows the official score (avoids rounding drift).
        const shown = step >= steps.length ? { A: sec.official.A, B: sec.official.B } : scoreFrom({ A: base.A + cum.A, B: base.B + cum.B });
        const last = steps[step - 1];
        middle.replaceChildren(...handheldView(shown, name,
          last ? last.text : sec.start,
          `DRAFTED FROM THE ${room.decade} · ${sec.caption} · ${step} OF ${steps.length}`,
          // SKIP: straight to the start of the next part (from innings 1–5 that's the top of the 6th).
          [el("button", { className: "handheld-button blue", onclick: () => { beep(340); enterStage(nextStage(stage)); } }, "SKIP"),
           el("button", { className: "handheld-button orange next-button", onclick: () => {
             // First pitch of the game: the Charge fanfare instead of the usual beep.
             if (atFirstPitch() && !chargedStart) { chargedStart = true; chargeFanfare(); } else beep(580);
             step++; advance();
           } }, "NEXT ▸")],
          last?.team ?? "B"));
        livePanel(left, mine, sec.panel, steps, step, sec.late);
        livePanel(right, theirs, sec.panel, steps, step, sec.late);
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
    // Moving into a new part of the game. The top of the 6th (bullpens in) gets the Charge fanfare
    // some of the time — a coin flip, so it's a surprise.
    const enterStage = (next) => {
      stage = next; step = 0;
      if (next === "pen6" && Math.random() < 0.5) setTimeout(chargeFanfare, 120);
      draw();
    };
    const advance = () => {
      if (SECTIONS[stage] && step > SECTIONS[stage].steps.length) return enterStage(nextStage(stage));
      draw();
    };

    // Side panel while stepping: hitters light up as their turn is revealed.
    function livePanel(target, key, res, steps, upto, late) {
      const seen = new Set(steps.slice(0, upto).filter((st) => st.team === key && st.hitter != null).map((st) => st.hitter));
      const rows = [el("li", { className: "group" }, typeof late === "string" ? late : late ? "HITTERS (full game)" : "HITTERS")];
      res[key].hitters.forEach((h, i) => {
        const open = late || seen.has(i);
        rows.push(el("li", { className: open ? "filled" : "" },
          el("span", { className: "slot" }, h.pitcherBat ? "P" : h.pos),
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
          fx.homer ? "GONE! HOME RUN!" : fx.coin ? "HEADS OR TAILS..." : fx.banner ? "EXTRA INNINGS" : `${runners} RUNNER${runners === 1 ? "" : "S"} ON BASE`)));
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
        if (h.pitcherBat) notes.push(`With no DH available, pitcher ${h.used.name} grabbed a bat for ${name[key]}!`);
        else if (h.used && h.used !== h.starter) notes.push(`${h.starter?.name ?? "The starter"} sat out — ${h.used.name} came off ${name[key]}'s bench.`);
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
      derby: `Tied ${res.A.runs}-${res.B.runs} after 9 — won in the 10th inning Home Run Derby (bench homers ${res[res.winner].derby} to ${res[other].derby}).`,
      starterHR: `Tied ${res.A.runs}-${res.B.runs} after 9 and the 10th inning derby tied too — won on starters' homers.`,
      coin: `Tied ${res.A.runs}-${res.B.runs} after 10 innings with no homers to break it — won the coin flip!`,
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
      const subbed = h.used && h.used !== h.starter && !h.pitcherBat;
      rows.push(el("li", { className: (h.used ? "filled" : "") + " clickable", title: "See his real game", onclick: () => hitterCard(h, date, h.bases) },
        el("span", { className: "slot" }, h.pitcherBat ? "P" : h.pos),
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
    destroy() { destroyed = true; cancelClock(); audioCtx?.close().catch(() => {}); document.body.classList.remove("drafting"); modal.hidden = true; pad?.destroy(); },
  };
}
