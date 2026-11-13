// Draft screen for Time Machine Baseball.
// Snake draft (1-2, 2-1, 1-2...). Each team fills: 8 starters, a backup at each position,
// and pitchers by role: SP (5 inn), RP1 (2), RP2 (1), CL (1), plus a SPARE who fills in.
import { myId, makePick, updateRoom } from "./firebase.js";
import { POSITIONS, BENCH, PITCH_SLOTS, ALL_SLOTS, teamFromPicks } from "./score.js";
import { studioFooter } from "./rules.js";
import { isPhone, makePad, padButton } from "./phone.js";

const OUTFIELD = ["LF", "CF", "RF"];
const MIN_GAMES = 10; // games at a position (in the 1990s) to be allowed to play it

export const SLOTS = ALL_SLOTS;
const TOTAL_PICKS = SLOTS.length * 2;
const FILTERS = ["ALL", "C", "1B", "2B", "3B", "SS", "OF", "P"];
const SHOW_MAX = 100;

// Who picks at pick number n (0-based)? Snake order.
function seatForPick(n) {
  const round = Math.floor(n / 2);
  const firstInRound = n % 2 === 0;
  return (round % 2 === 0) === firstInRound ? 1 : 2;
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function eligible(p) {
  const e = new Set();
  for (const [pos, g] of Object.entries(p.pos)) if (g >= MIN_GAMES && pos !== "DH") e.add(pos);
  const ofGames = OUTFIELD.reduce((s, k) => s + (p.pos[k] || 0), 0);
  if (ofGames >= MIN_GAMES) OUTFIELD.forEach((k) => e.add(k));
  if (e.size === 0) {
    const top = Object.keys(p.pos)[0];
    e.add(top === "DH" ? "1B" : top); // DH-only players can play 1B
  }
  return e;
}

const pools = {};
function loadPool(decade) {
  pools[decade] ??= fetch(`/data/players-${decade}.json`)
    .then((r) => { if (!r.ok) throw new Error(`Couldn't load the ${decade} player list.`); return r.json(); })
    .then((list) => { list.forEach((p) => (p.elig = eligible(p))); return list; })
    .catch((e) => { delete pools[decade]; throw e; }); // try again next time instead of staying broken
  return pools[decade];
}

// The game year's 15 best starters (by strikeouts that season), for the computer's and AUTODRAFT's SP pick,
// so the same decade aces don't start every game. Built from <year>/pitching.json (every real outing).
const seasons = {};
function loadSeasonAces(year) {
  seasons[year] ??= fetch(`/data/${year}/pitching.json`)
    .then((r) => { if (!r.ok) throw new Error("no season file"); return r.json(); })
    .then((rows) => {
      const list = [];
      for (const [id, games] of Object.entries(rows)) {
        let k = 0, gs = 0;
        for (const g of games) { k += g[6] || 0; gs += g[9] || 0; } // [date, outs, H, HR, BB, HBP, K, WP, BK, GS]
        if (gs >= 10) list.push({ id, k, gs });
      }
      return list.sort((a, b) => b.k - a.k).map((x) => x.id); // best first; callers take the top 15 still available
    })
    .catch(() => { delete seasons[year]; return null; });
  return seasons[year];
}

// ---------- sortable stat table ----------
const f3 = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));
const f2 = (v) => (v == null ? "—" : v.toFixed(2));
const f0 = (v) => (v == null ? "—" : String(v));
const HIT_COLS = [
  { key: "G", get: (p) => p.g, fmt: f0 },
  { key: "AVG", get: (p) => p.hit?.avg, fmt: f3 },
  { key: "OBP", get: (p) => p.hit?.obp, fmt: f3 },
  { key: "SLG", get: (p) => p.hit?.slg, fmt: f3 },
  { key: "HR", get: (p) => p.hit?.hr, fmt: f0 },
  { key: "RBI", get: (p) => p.hit?.rbi, fmt: f0 },
  { key: "SB", get: (p) => p.hit?.sb, fmt: f0 },
  { key: "BB", get: (p) => p.hit?.bb, fmt: f0 },
  { key: "K", get: (p) => p.hit?.k, fmt: f0, low: true },
  { key: "BASES", get: (p) => p.hit?.bases, fmt: f0 },
];
const PIT_COLS = [
  { key: "G", get: (p) => p.g, fmt: f0 },
  { key: "GS", get: (p) => p.pit?.gs, fmt: f0 },
  { key: "W", get: (p) => p.pit?.w, fmt: f0 },
  { key: "L", get: (p) => p.pit?.l, fmt: f0, low: true },
  { key: "SV", get: (p) => p.pit?.sv, fmt: f0 },
  { key: "ERA", get: (p) => p.pit?.era, fmt: f2, low: true },
  { key: "WHIP", get: (p) => p.pit?.whip, fmt: f2, low: true },
  { key: "K", get: (p) => p.pit?.k, fmt: f0 },
  { key: "BB", get: (p) => p.pit?.bb, fmt: f0, low: true },
  { key: "IP", get: (p) => p.pit?.ip, fmt: f0 },
];

export function createDraft(container, code, onLeave) {
  let room = null;
  let pool = [];
  let filter = "ALL";
  let query = "";
  let busy = false;
  let message = "";
  let auto = false; // AUTO-DRAFT: picks the best player for your next open spot when it's your turn
  let sort = { key: "BASES", dir: -1 }; // clicked column in the stat table
  let poolLoading = false;
  // Phones: one pane at a time + handheld buttons. Tap a player, tap a spot, press DRAFT.
  const phone = isPhone();
  let selPid = null, selSlot = null;
  let destroyed = false; // after the draft screen closes, no leftover timer may make a pick
  let seasonAces = null;  // ids of the game year's starters, most strikeouts first (see loadSeasonAces)

  // ----- build the layout once -----
  const mineBox = el("section", { className: "team" });
  const theirsBox = el("section", { className: "team" });
  const clock = el("div", { className: "led small" }, "LOADING");
  const status = el("p", { className: "hint" });
  const msgBox = el("p", { className: "error" });
  const search = el("input", { className: "field", placeholder: "Search a name..." });
  const filterRow = el("div", { className: "filters" });
  const list = el("div", { className: "pool" });
  const decadeTag = el("p", { className: "roomcode" });
  const leaveBtn = el("button", { className: "btn secondary", onclick: onLeave }, "LEAVE");
  const autoBtn = el("button", { className: "chip auto" });
  autoBtn.onclick = () => { auto = !auto; render(); };
  const sortSel = el("select", { className: "field sort-select", ariaLabel: "Sort players by" });
  sortSel.onchange = () => {
    const cols = filter === "P" ? PIT_COLS : HIT_COLS;
    const c = cols.find((x) => x.key === sortSel.value);
    if (c) sort = { key: c.key, dir: c.low ? 1 : -1 };
    renderList();
  };

  search.addEventListener("input", () => { query = search.value.trim().toLowerCase(); renderList(); });
  for (const f of FILTERS) {
    filterRow.append(el("button", {
      className: "chip", textContent: f,
      onclick: () => {
        const wasP = filter === "P";
        filter = f;
        if ((f === "P") !== wasP) sort = f === "P" ? { key: "K", dir: -1 } : { key: "BASES", dir: -1 };
        renderFilters(); renderList();
      },
    }));
  }

  document.body.classList.add("drafting");
  const middle = el("section", { className: "screen middle" },
    el("h1", { className: "title small" }, "TIME MACHINE BASEBALL"),
    el("p", { className: "roomcode" }, "ROOM " + code), decadeTag,
    clock, status, autoBtn, msgBox, filterRow, phone ? sortSel : null, search, list, leaveBtn,
    el("p", { className: "credit" },
      "The information used here was obtained free of charge from and is copyrighted by Retrosheet. " +
      "Interested parties may contact Retrosheet at www.retrosheet.org."),
    studioFooter(),
  );
  middle.dataset.pane = "list";
  const grid = el("div", { className: "draft" }, mineBox, middle, theirsBox);
  container.replaceChildren(grid);
  // Phone: FREE AGENTS (the list) · AWAY · HOME screen buttons, AUTODRAFT + DRAFT below.
  const pad = phone ? makePad(grid, [
    { key: "list", label: "FREE\nAGENTS", look: "free" },
    { key: "away", label: "AWAY", look: "away" },
    { key: "home", label: "HOME", look: "home" },
  ], "list") : null;
  renderFilters();
  function ensurePool() {
    if (pool.length || poolLoading || !room) return;
    poolLoading = true;
    const decade = room.decade || "1990s";
    decadeTag.textContent = "DRAFTING FROM THE " + decade.toUpperCase();
    if (room.gameDate) {
      const d = room.gameDate;
      const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      decadeTag.append(el("br"), el("span", { className: "draft-gamedate" },
        `GAME DAY: ${MON[Math.floor(d / 100) % 100 - 1]} ${d % 100}, ${Math.floor(d / 10000)}`));
    }
    if (room.gameDate) loadSeasonAces(Math.floor(room.gameDate / 10000)).then((ids) => { seasonAces = ids; });
    loadPool(decade).then((p) => { pool = p; poolLoading = false; render(); })
      .catch((e) => { poolLoading = false; message = e.message; render(); });
  }

  // ----- figure out the current state from the room -----
  function state() {
    const me = myId(room);
    const players = room?.players || {};
    const uidBySeat = {};
    for (const [uid, p] of Object.entries(players)) uidBySeat[p.seat] = uid;
    const picks = Object.values(room?.picks || {}).sort((a, b) => a.n - b.n);
    const taken = new Set(picks.map((p) => p.pid));
    const teams = {};
    for (const uid of Object.keys(players)) teams[uid] = teamFromPicks(picks.filter((p) => p.by === uid));
    const n = picks.length;
    const done = n >= TOTAL_PICKS;
    const onClock = done ? null : uidBySeat[seatForPick(n)];
    const other = Object.keys(players).find((u) => u !== me);
    return { me, other, players, uidBySeat, picks, taken, teams, n, done, onClock };
  }

  // Open slots on my team this player could fill.
  function openSlots(p, myTeam) {
    const slots = [];
    if (p.elig.has("P")) {
      for (const s of PITCH_SLOTS) if (!myTeam[s]) slots.push(s); // any pitcher can fill any role
    }
    for (const pos of POSITIONS) {
      if (!p.elig.has(pos)) continue;
      if (!myTeam[pos]) slots.push(pos);
      if (!myTeam[pos + " BN"]) slots.push(pos + " BN");
    }
    return slots;
  }

  // ----- drawing -----
  function renderFilters() {
    for (const b of filterRow.children) b.classList.toggle("on", b.textContent === filter);
  }

  function renderTeam(box, uid, s) {
    const team = s.teams[uid] || {};
    const name = s.players[uid]?.name ?? "Waiting...";
    const section = (title, slots) => [
      el("li", { className: "group" }, title),
      ...slots.map((slot) => el("li", { className: team[slot] ? "filled" : "" },
        el("span", { className: "slot" }, slot.replace(" BN", "")),
        el("span", {}, team[slot]?.name ?? "—"))),
    ];
    box.replaceChildren(
      el("h2", { className: uid === s.onClock ? "on-clock" : "" }, name + (uid === s.me ? " (you)" : "")),
      el("ul", { className: "slots" },
        ...section("LINEUP", POSITIONS),
        ...section("BENCH", BENCH),
        ...section("PITCHERS", PITCH_SLOTS)),
    );
  }

  function renderList() {
    if (!room) return;
    const s = state();
    const myTurn = !s.done && s.onClock === s.me && !busy;
    const myTeam = s.teams[s.me] || {};
    const cols = filter === "P" ? PIT_COLS : HIT_COLS;

    let rows = pool.filter((p) => !s.taken.has(p.id));
    if (filter === "OF") rows = rows.filter((p) => OUTFIELD.some((k) => p.elig.has(k)));
    else if (filter !== "ALL") rows = rows.filter((p) => p.elig.has(filter));
    if (query) rows = rows.filter((p) => p.name.toLowerCase().includes(query));
    const col = cols.find((c) => c.key === sort.key) || cols[cols.length - 1];
    rows.sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;           // players without that stat go to the bottom
      if (vb == null) return -1;
      return (va - vb) * sort.dir;
    });

    if (phone) return renderCards(rows, cols, col, s, myTeam);

    const th = (c) => el("th", {
      className: "sortable" + (c.key === col.key ? " sorted" : ""),
      title: "Sort by " + c.key,
      onclick: () => { sort = { key: c.key, dir: c.key === sort.key ? -sort.dir : (c.low ? 1 : -1) }; renderList(); },
    }, c.key + (c.key === col.key ? (sort.dir < 0 ? " ▼" : " ▲") : ""));

    const body = rows.slice(0, SHOW_MAX).map((p) => {
      const slots = openSlots(p, myTeam);
      return el("tr", {},
        el("td", { className: "pcell" },
          el("div", { className: "pname" }, p.name),
          el("div", { className: "pinfo" },
            `${p.y[0]}–${p.y[1]} · ${Object.keys(p.pos).slice(0, 3).join("/")}` + (p.team ? " · " + p.team.join("/") : ""))),
        ...cols.map((c) => el("td", { className: "num" + (c.key === col.key ? " sorted" : "") }, c.fmt(c.get(p)))),
        el("td", { className: "pick-cell" },
          myTurn && slots.length
            ? el("div", { className: "pick-row" }, ...slots.map((slot) =>
                el("button", { className: "chip pick", textContent: "→ " + slot, onclick: () => pick(p, slot) })))
            : null));
    });
    list.replaceChildren(
      el("p", { className: "stats-note" }, `STATS: ${decadeYears()} DECADE TOTALS`),
      el("table", { className: "stat-table" },
        el("thead", {}, el("tr", {}, el("th", {}, "PLAYER"), ...cols.map(th), el("th", {}, myTurn ? "DRAFT" : ""))),
        el("tbody", {}, ...body)),
      rows.length ? el("p", { className: "hint" }, rows.length > SHOW_MAX ? `Showing top ${SHOW_MAX} of ${rows.length} — search a name to find anyone.` : "") 
                  : el("p", { className: "hint" }, pool.length ? "No players match." : "Loading players..."));
  }

  // ----- phone: the free agents as tap-to-select cards -----
  function renderCards(rows, cols, col, s, myTeam) {
    // Sort menu: every stat the desktop table can sort by.
    if (sortSel.dataset.for !== (filter === "P" ? "P" : "H")) {
      sortSel.dataset.for = filter === "P" ? "P" : "H";
      sortSel.replaceChildren(...cols.map((c) => el("option", { value: c.key }, "SORT: " + c.key)));
    }
    sortSel.value = col.key;
    if (selPid && s.taken.has(selPid)) { selPid = null; selSlot = null; }
    const statLine = (p) => filter === "P"
      ? (p.pit ? `${p.pit.gs ?? 0} GS · ${p.pit.w ?? 0} W · ${p.pit.sv ?? 0} SV · ${f2(p.pit.era)} ERA · ${p.pit.k ?? 0} K` : `${p.g} G`)
      : (p.hit ? `${f3(p.hit.avg)} · ${p.hit.hr} HR · ${p.hit.sb} SB · ${p.hit.bases} BASES` : `${p.g} G`);
    const cards = rows.slice(0, SHOW_MAX).map((p) => {
      const on = p.id === selPid;
      return el("button", {
        type: "button", className: "pcard" + (on ? " sel" : ""), ariaPressed: String(on),
        onclick: () => {
          selPid = on ? null : p.id; selSlot = null;
          renderList(); renderPad(state());
        },
      },
        el("span", { className: "pc-main" },
          el("span", { className: "pc-name" }, p.name),
          el("span", { className: "pc-info" }, `${p.y[0]}–${p.y[1]} · ${Object.keys(p.pos).slice(0, 3).join("/")}`),
          el("span", { className: "pc-stats" }, statLine(p))),
        el("span", { className: "pc-big" }, el("b", {}, col.fmt(col.get(p))), el("small", {}, col.key)));
    });
    list.replaceChildren(
      el("p", { className: "stats-note" }, `STATS: ${decadeYears()} DECADE TOTALS`),
      el("div", { className: "pcards" }, ...cards),
      rows.length ? el("p", { className: "hint" }, rows.length > SHOW_MAX ? `Showing top ${SHOW_MAX} of ${rows.length} — search a name to find anyone.` : "")
                  : el("p", { className: "hint" }, pool.length ? "No players match." : "Loading players..."));
  }

  // ----- phone: the tray (pick a spot) and the AUTODRAFT / DRAFT buttons -----
  function renderPad(s) {
    if (!pad) return;
    if (s.done) { pad.setTray(); pad.setActions(); return; }
    const myTurn = s.onClock === s.me && !busy;
    const p = selPid ? pool.find((x) => x.id === selPid) : null;
    const slots = p ? openSlots(p, s.teams[s.me] || {}) : [];
    if (selSlot && !slots.includes(selSlot)) selSlot = null;
    pad.setTray(p ? el("div", { className: "tray-box" },
      el("div", { className: "tray-title" }, `${p.name.toUpperCase()} → PICK A SPOT`),
      slots.length
        ? el("div", { className: "tray-slots" }, ...slots.map((slot) => el("button", {
            type: "button", className: "chip pick" + (slot === selSlot ? " on" : ""),
            onclick: () => { selSlot = slot; renderPad(state()); },
          }, slot.replace(" BN", " bench"))))
        : el("div", { className: "hint" }, "No open spot for him on your team.")) : null);
    pad.setActions(
      padButton(auto ? "AUTODRAFT: ON" : "AUTODRAFT", "red", () => { auto = !auto; render(); }, { grow: 1 }),
      padButton("DRAFT", "go", () => {
        if (!(myTurn && p && selSlot)) return;
        pick(p, selSlot);
      }, { ready: !!(myTurn && p && selSlot), grow: 1.5 }));
  }

  // "1990s" → "1990–1999": the stats in the draft are totals for the whole decade, not the game-day season.
  const decadeYears = () => { const y = parseInt(room?.decade || "1990s", 10); return `${y}–${y + 9}`; };

  function render() {
    if (!room) return;
    ensurePool();
    const s = state();
    renderTeam(mineBox, s.me, s);
    renderTeam(theirsBox, s.other, s);
    // Phone panes: the player who started the game is HOME.
    const iAmHome = s.me === s.uidBySeat[1];
    mineBox.dataset.pane = iAmHome ? "home" : "away";
    theirsBox.dataset.pane = iAmHome ? "away" : "home";
    if (s.done) {
      clock.textContent = "DRAFT DONE";
      status.textContent = "Game day is next.";
    } else {
      clock.textContent = s.onClock === s.me ? "YOUR PICK" : "THEIR PICK";
      status.textContent = `Pick ${s.n + 1} of ${TOTAL_PICKS}` +
        (s.onClock === s.me ? " — choose a player and a spot." : ` — waiting on ${s.players[s.onClock]?.name ?? "opponent"}...`);
    }
    msgBox.textContent = message;
    autoBtn.textContent = auto ? "AUTO-DRAFT: ON" : "AUTO-DRAFT: OFF";
    autoBtn.classList.toggle("on", auto);
    autoBtn.style.display = s.done ? "none" : "";
    if (auto && !s.done && s.onClock === s.me && !busy && pool.length) setTimeout(autoPick, 400);
    // 1-player mode: the host's screen makes the computer's picks.
    if (!s.done && s.players[s.onClock]?.cpu && room.host === s.me && !busy && pool.length) setTimeout(cpuPick, 900);
    const showPool = !s.done;
    for (const e of [filterRow, search, list, sortSel]) e.style.display = showPool ? "" : "none";
    renderList();
    renderPad(s);
  }

  // How good is this player for this spot? (used by AUTO-DRAFT and the computer)
  function value(p, slot) {
    if (slot === "CL") return (p.pit?.sv ?? 0) * 3 + (p.pit?.k ?? 0) / 10;
    if (PITCH_SLOTS.includes(slot)) return p.pit?.k ?? 0;
    return p.hit?.bases ?? 0;
  }
  function fits(p, slot) {
    return PITCH_SLOTS.includes(slot) ? p.elig.has("P") : p.elig.has(slot.replace(" BN", ""));
  }
  // Prefer players who were in the majors in the game's year (the date is known before the draft),
  // so auto-picks don't go 0-for on game day. Falls back to everyone if nobody fits.
  function activeInGameYear(p) {
    const yr = room?.gameDate ? Math.floor(room.gameDate / 10000) : null;
    return !yr || !p.y || (p.y[0] <= yr && yr <= p.y[1]);
  }
  // SP for the computer and AUTODRAFT: a random one of the 15 best starters still available from the game's season.
  function seasonStarter(s) {
    if (!seasonAces) return null;
    const byId = new Map(pool.map((p) => [p.id, p]));
    const top = [];
    for (const id of seasonAces) {
      const p = byId.get(id);
      if (p && !s.taken.has(p.id) && p.elig.has("P")) top.push(p);
      if (top.length === 15) break;
    }
    return top.length ? top[Math.floor(Math.random() * top.length)] : null;
  }
  function bestFor(slot, s, choices = 1) {
    if (slot === "SP") { const ace = seasonStarter(s); if (ace) return ace; }
    let options = pool.filter((p) => !s.taken.has(p.id) && fits(p, slot));
    const active = options.filter(activeInGameYear);
    if (active.length) options = active;
    const top = options.sort((a, b) => value(b, slot) - value(a, slot)).slice(0, choices);
    return top[Math.floor(Math.random() * top.length)];
  }

  // AUTO-DRAFT: best available for starters; one of the top 5 for bench spots and backup
  // pitchers, so the same names don't land on the bench every game.
  function autoPick() {
    if (destroyed) return;
    const s = state();
    if (!auto || busy || s.done || s.onClock !== s.me) return;
    const myTeam = s.teams[s.me] || {};
    const slot = SLOTS.find((x) => !myTeam[x]);
    if (!slot) return;
    const deep = slot.endsWith(" BN") || slot === "RP2" || slot === "SPARE";
    const best = bestFor(slot, s, deep ? 5 : 1);
    if (best) pick(best, slot);
  }

  // The computer manager: fills spots in a sensible order. For variety it picks one of the top 5
  // for starters and one of the top 12 for bench spots and backup pitchers.
  const CPU_ORDER = ["SP", "C", "SS", "CF", "1B", "2B", "3B", "LF", "RF", "CL", "RP1",
    "C BN", "SS BN", "CF BN", "1B BN", "2B BN", "3B BN", "LF BN", "RF BN", "RP2", "SPARE"];
  function cpuPick() {
    if (destroyed) return;
    const s = state();
    const cpu = s.onClock;
    if (busy || s.done || !s.players[cpu]?.cpu || room.host !== s.me) return;
    const team = s.teams[cpu] || {};
    const slot = CPU_ORDER.find((x) => !team[x]) ?? SLOTS.find((x) => !team[x]);
    if (!slot) return;
    const deep = slot.endsWith(" BN") || slot === "RP2" || slot === "SPARE";
    const choice = bestFor(slot, s, deep ? 12 : 5);
    if (choice) pick(choice, slot, cpu);
  }

  // ----- making a pick (for me, or for the computer) -----
  async function pick(player, slot, forWho) {
    if (destroyed) return;
    const s = state();
    const who = forWho ?? s.me;
    if (busy || s.done || s.onClock !== who || s.taken.has(player.id)) return;
    if (forWho && !(s.players[forWho]?.cpu && room.host === s.me)) return;
    busy = true; message = ""; renderList();
    const next = s.n + 1;
    try {
      await makePick(code, { n: s.n, pid: player.id, name: player.name, slot },
        next < TOTAL_PICKS ? s.uidBySeat[seatForPick(next)] : null, who);
      if (next >= TOTAL_PICKS) await updateRoom(code, { status: "drafted" });
      if (!forWho) { search.value = ""; query = ""; selPid = null; selSlot = null; }
    } catch (e) {
      message = "Pick didn't go through: " + e.message;
    }
    busy = false;
    render();
  }

  return {
    update(r) { room = r; render(); },
    destroy() { destroyed = true; document.body.classList.remove("drafting"); pad?.destroy(); },
  };
}
