import "./style.css";
import { signIn, createRoom, joinRoom, watchRoom, goOnline, myId } from "./firebase.js";
import { createDraft } from "./draft.js";
import { createGameDay } from "./gameday.js";

const app = document.querySelector("#app") || document.body;
let stopWatching = null;
let draft = null;
let gameday = null;

// ---------- RAIN DELAY: pause the screen while a player is disconnected ----------
const RAIN_DELAY_WAIT_MS = 5000; // how long someone can blink offline before the delay starts
let stopPresence = null, presenceKey = null, rainTimer = null, iAmOnline = true;
const rain = document.createElement("div");
rain.className = "rain-delay";
rain.hidden = true;
document.body.append(rain);

function showRain(title, text, code) {
  rain.replaceChildren(
    el("div", { className: "rain-box" },
      el("div", { className: "led small" }, "RAIN DELAY"),
      el("p", { className: "lead" }, title),
      el("p", { className: "hint" }, text),
      el("p", { className: "blink" }, "waiting..."),
      el("button", { className: "btn secondary", onclick: leave }, "LEAVE GAME")),
  );
  rain.hidden = false;
}
function hideRain() { rain.hidden = true; clearTimeout(rainTimer); rainTimer = null; }

// Decide whether the game should be paused. Waits a few seconds first so a quick blip
// (or the page still connecting) doesn't flash the sign.
function checkRain(code, room) {
  const me = myId(room);
  const other = Object.keys(room.players || {}).find((u) => u !== me);
  const otherGone = room.status !== "waiting" && other && !room.online?.[other];
  if (iAmOnline && !otherGone) return hideRain();
  if (!rain.hidden || rainTimer) return; // already showing or about to
  rainTimer = setTimeout(() => {
    rainTimer = null;
    const r = lastRoom || room;
    if (!iAmOnline) {
      showRain("You lost your connection.", "Reconnecting... the game picks up right where it left off.");
    } else if (other && r.status !== "waiting" && !r.online?.[other]) {
      const name = r.players[other].name;
      showRain(`${name} lost connection.`,
        `The game is paused until ${name} is back. ${name} can rejoin any time with room code ${code} and the name "${name}".`);
    }
  }, RAIN_DELAY_WAIT_MS);
}

function stopRain() {
  if (stopPresence) { stopPresence(); stopPresence = null; }
  presenceKey = null; iAmOnline = true;
  hideRain();
}

function closeDraft() {
  if (draft) { draft.destroy(); draft = null; }
  if (gameday) { gameday.destroy(); gameday = null; }
}

// ---------- little helpers ----------
function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) e.append(c);
  return e;
}

function show(...children) {
  app.replaceChildren(
    el("div", { className: "screen" },
      el("h1", { className: "title" }, "TIME MACHINE", el("br"), "BASEBALL"),
      ...children)
  );
}

function savedName() { try { return localStorage.getItem("tmb-name") || ""; } catch { return ""; } }
function saveName(n) { try { localStorage.setItem("tmb-name", n); } catch {} }
// The game you're in is remembered even if the browser closes (LEAVE forgets it).
function savedRoom() { try { return localStorage.getItem("tmb-room"); } catch { return null; } }
function saveRoom(c) {
  try { c ? localStorage.setItem("tmb-room", c) : localStorage.removeItem("tmb-room"); } catch {}
}

function leave() {
  stopRain();
  if (stopWatching) { stopWatching(); stopWatching = null; }
  closeDraft();
  saveRoom(null);
  homeScreen();
}

// ---------- screen 1: name + start or join ----------
function homeScreen(message = "") {
  const name = el("input", { className: "field", placeholder: "Your name", maxLength: 12, value: savedName() });
  const code = el("input", { className: "field code-field", placeholder: "CODE", maxLength: 4 });
  code.addEventListener("input", () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, "")));
  const error = el("p", { className: "error" }, message);
  const startBtn = el("button", { className: "btn" }, "START A GAME");
  // Decade picker: filled in from data/index.json (whatever decades have been built).
  const decadeSel = el("select", { className: "field" },
    el("option", { value: "random" }, "🎲 SURPRISE ME"));
  fetch("/data/index.json").then((r) => r.json()).then((ix) => {
    const decades = ix.decades || ["1990s"];
    for (const d of decades) decadeSel.append(el("option", { value: d }, "The " + d));
    decadeSel.dataset.all = JSON.stringify(decades);
  }).catch(() => { decadeSel.append(el("option", { value: "1990s" }, "The 1990s")); decadeSel.dataset.all = '["1990s"]'; });
  function chosenDecade() {
    const all = JSON.parse(decadeSel.dataset.all || '["1990s"]');
    return decadeSel.value === "random" ? all[Math.floor(Math.random() * all.length)] : decadeSel.value;
  }
  const joinBtn = el("button", { className: "btn" }, "JOIN");

  function needName() {
    const n = name.value.trim();
    if (!n) { error.textContent = "Type your name first."; name.focus(); return null; }
    saveName(n);
    return n;
  }
  function busy(on) { startBtn.disabled = joinBtn.disabled = on; }

  startBtn.onclick = async () => {
    const n = needName(); if (!n) return;
    busy(true); error.textContent = "Connecting...";
    try { enterRoom(await createRoom(n, chosenDecade())); }
    catch (e) { busy(false); error.textContent = "Couldn't start: " + e.message; }
  };

  joinBtn.onclick = async () => {
    const n = needName(); if (!n) return;
    if (code.value.length !== 4) { error.textContent = "Room codes are 4 letters."; code.focus(); return; }
    busy(true); error.textContent = "Joining...";
    try { enterRoom(await joinRoom(code.value, n)); }
    catch (e) { busy(false); error.textContent = e.message; }
  };

  show(
    el("label", { className: "label" }, "PLAYER NAME"), name,
    el("label", { className: "label top-gap" }, "TRAVEL TO (if you start the game)"), decadeSel,
    startBtn,
    el("p", { className: "or" }, "— or join a friend —"),
    el("div", { className: "row" }, code, joinBtn),
    el("p", { className: "hint small-hint" },
      "Lost your game? Type its room code and the same name you used, then click JOIN."),
    error,
  );
}

// ---------- listen to the room and show the right screen ----------
let lastRoom = null;
async function enterRoom(code) {
  saveRoom(code);
  lastRoom = null;
  if (stopWatching) stopWatching();
  await signIn(); // make sure we're signed in before reading (needed after a page refresh)
  stopWatching = watchRoom(code, (room) => {
    if (!room) { stopRain(); closeDraft(); saveRoom(null); return homeScreen("That room is gone."); }
    const meId = myId(room);
    if (presenceKey !== code + meId) {
      if (stopPresence) stopPresence();
      presenceKey = code + meId;
      stopPresence = goOnline(code, meId, (on) => { iAmOnline = on; lastRoom && checkRain(code, lastRoom); });
    }
    lastRoom = room;
    checkRain(code, room);
    const players = Object.values(room.players || {}).sort((a, b) => a.seat - b.seat);
    if (room.status === "waiting") { closeDraft(); waitingScreen(code, players, room.decade); }
    else if (room.status === "drafted") {
      if (draft) { draft.destroy(); draft = null; }
      if (!gameday) gameday = createGameDay(app, code, leave);
      gameday.update(room);
    } else {
      if (!draft) draft = createDraft(app, code, leave);
      draft.update(room);
    }
  });
}

// ---------- screen 2: host waits with the code ----------
function waitingScreen(code, players, decade) {
  show(
    el("p", { className: "hint" }, "Destination: the " + (decade || "1990s")),
    el("p", { className: "hint" }, "Tell your opponent this code:"),
    el("div", { className: "led" }, code),
    el("ul", { className: "players" },
      el("li", {}, el("span", {}, "HOME"), el("span", {}, players[0]?.name ?? "")),
      el("li", {}, el("span", {}, "AWAY"), el("span", { className: "blink" }, "waiting...")),
    ),
    el("button", { className: "btn secondary", onclick: leave }, "LEAVE"),
  );
}

// ---------- start ----------
const rejoin = savedRoom();
if (rejoin) enterRoom(rejoin); else homeScreen();
