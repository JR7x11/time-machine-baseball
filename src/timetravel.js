// The time machine: picks the game date and shows the flip-clock trip to it.
// Plays right before the draft so both players know exactly which day they're drafting for.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const START_HOLD_MS = 2000; // today's date sits still before the trip begins
const BUTTON_DELAY_MS = 600; // brief pause after the date lands, then the START THE DRAFT button appears
const CREDIT = "The information used here was obtained free of charge from and is copyrighted by Retrosheet. " +
  "Interested parties may contact Retrosheet at www.retrosheet.org.";

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) if (c != null) e.append(c);
  return e;
}

// Random regular-season date inside the decade (falls back to any date if the decade has none).
export async function randomDate(decade) {
  const r = await fetch("/data/index.json");
  if (!r.ok) throw new Error("Couldn't load the list of game dates.");
  const { years } = await r.json();
  const start = parseInt(decade, 10);
  let all = Object.entries(years).filter(([y]) => +y >= start && +y <= start + 9).flatMap(([, d]) => d);
  if (!all.length) all = Object.values(years).flat();
  return Number(all[Math.floor(Math.random() * all.length)]);
}

// Has this browser already watched the trip for this game? (So a refresh doesn't replay it.)
const seenKey = (code, date) => `tmb-clock-${code}-${date}`;
export function clockSeen(code, date) { try { return localStorage.getItem(seenKey(code, date)) === "1"; } catch { return false; } }
function markSeen(code, date) { try { localStorage.setItem(seenKey(code, date), "1"); } catch {} }

// Draws the handheld with the flip clock into `container`, flips from today back to targetDate
// (YYYYMMDD number), waits for the player to click START THE DRAFT, then calls onDone().
// Returns a cancel function.
export function showFlipClock(container, code, decade, targetDate, onDone) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const today = new Date();
  const from = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
  const to = { year: Math.floor(targetDate / 10000), month: Math.floor(targetDate / 100) % 100, day: targetDate % 100 };
  const display = reduceMotion ? { ...to } : { ...from };
  const values = {};
  let timer = null, cancelled = false;

  const tiles = ["month", "day", "year"].map((key) => {
    values[key] = el("div", { className: "flip-number" });
    return el("div", { className: "flip-tile" }, el("span", { className: "flip-label" }, key.toUpperCase()), values[key]);
  });
  const label = `${MONTHS[to.month - 1]} ${to.day}, ${to.year}`;
  const startBtn = el("button", { className: "btn start-draft", type: "button", hidden: true }, "START THE DRAFT ▸");
  startBtn.onclick = () => {
    if (cancelled) return;
    startBtn.disabled = true;
    markSeen(code, targetDate);
    onDone();
  };
  container.replaceChildren(
    el("section", { className: "screen middle handheld time-travel solo" },
      el("div", {},
        el("h1", { className: "title small" }, "TIME MACHINE BASEBALL"),
        el("p", { className: "roomcode" }, `ROOM ${code} · THE ${(decade || "1990s").toUpperCase()}`)),
      el("div", { className: "travel-display" },
        el("p", { className: "travel-caption" }, "TRAVELING THROUGH BASEBALL HISTORY"),
        el("div", { className: "flip-clock", role: "timer", ariaLabel: "Traveling to " + label }, ...tiles)),
      startBtn,
      el("div", { className: "speaker-grille", ariaHidden: "true" }),
      el("p", { className: "handheld-caption" }, "TIME MACHINE ENGAGED"),
      el("p", { className: "credit" }, CREDIT)));

  const fmt = (key, val) => key === "month" ? MONTHS[val - 1] : key === "day" ? String(val).padStart(2, "0") : String(val);
  const paint = (key, animate = true) =>
    values[key].replaceChildren(el("span", { className: animate && !reduceMotion ? "flip-leaf" : "" }, fmt(key, display[key])));
  ["month", "day", "year"].forEach((key) => paint(key, false));

  // The date stays on the clock until the player clicks START THE DRAFT.
  const finish = () => {
    timer = setTimeout(() => {
      timer = null;
      if (cancelled) return;
      startBtn.hidden = false;
      startBtn.focus({ preventScroll: true });
    }, reduceMotion ? 0 : BUTTON_DELAY_MS);
  };
  if (reduceMotion) { finish(); return cancel; }

  // Every year ticks backwards once; then the month and day clunk into place.
  const sequence = [];
  for (let y = from.year - 1; y >= to.year; y--) sequence.push(["year", y]);
  if (from.year < to.year) sequence.push(["year", to.year]);
  for (let m = from.month; m !== to.month;) { m = m === 1 ? 12 : m - 1; sequence.push(["month", m]); }
  for (let d = from.day; d !== to.day;) { d = d === 1 ? 31 : d - 1; sequence.push(["day", d]); }

  let i = 0;
  const tick = () => {
    if (cancelled) return;
    if (i >= sequence.length) return finish();
    const [key, val] = sequence[i++];
    display[key] = val;
    paint(key);
    const remaining = sequence.length - i;
    timer = setTimeout(tick, remaining < 7 ? 95 : key === "year" ? 34 : 42);
  };
  timer = setTimeout(tick, START_HOLD_MS);

  function cancel() { cancelled = true; if (timer != null) clearTimeout(timer); timer = null; }
  return cancel;
}
