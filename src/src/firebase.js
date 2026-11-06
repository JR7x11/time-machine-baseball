// src/firebase.js — Time Machine Baseball online play (Firebase Realtime Database)
// 1) npm install firebase
// 2) Paste YOUR config from the Firebase console over the placeholder below.

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getDatabase, ref, get, set, update, onValue, push, serverTimestamp, onDisconnect, remove,
} from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBGd5MC3MHUX3f8s5QY675gZl4CB1rrOAI",
  authDomain: "time-machine-baseball.firebaseapp.com",
  databaseURL: "https://time-machine-baseball-default-rtdb.firebaseio.com",
  projectId: "time-machine-baseball",
  storageBucket: "time-machine-baseball.firebasestorage.app",
  messagingSenderId: "402722040385",
  appId: "1:402722040385:web:3afc52985ab45dacdfb4c0",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Signs the player in anonymously (no login screen). Resolves with the user.
export function signIn() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) { stop(); resolve(user); }
    });
    signInAnonymously(auth).catch(reject);
  });
}

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O (look like 1 and 0)
function randomCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return c;
}

// Player 1: makes a room and gets a 4-letter code to tell player 2.
// The computer manager gets a random Hall of Famer's first name each game.
const CPU_NAMES = ["Hank", "Mickey", "Stan", "Babe", "Willie", "Ted", "Lou", "Joe", "Jackie", "Roberto",
  "Cy", "Sandy", "Yogi", "Ernie", "Nolan", "Reggie", "Cal", "Tony", "Ozzie", "Kirby", "Rickey",
  "Satchel", "Honus", "Rogers", "Christy", "Walter", "Ty", "Tris", "Lefty", "Dizzy", "Josh", "Cool Papa",
  "Whitey", "Duke", "Pee Wee", "Johnny", "Brooks", "Harmon", "Yaz", "Rod", "Fergie", "Rollie", "Goose",
  "Eck", "Tom", "Bob", "Mike", "George", "Wade", "Kirby", "Chipper", "Mariano", "Derek", "Ichiro"];
const cpuName = () => CPU_NAMES[Math.floor(Math.random() * CPU_NAMES.length)];

// vsComputer = true makes a 1-player game: seat 2 is the computer, and the draft starts right away.
export async function createRoom(name, decade, vsComputer = false) {
  const user = await signIn();
  let code, snap;
  do {
    code = randomCode();
    snap = await get(ref(db, `rooms/${code}`));
  } while (snap.exists());

  await set(ref(db, `rooms/${code}`), {
    host: user.uid,
    status: vsComputer ? "drafting" : "waiting", // waiting -> drafting -> drafted
    decade: decade ?? null,
    gameDate: null,             // fill in when you pick the random date
    turn: user.uid,             // whose pick it is
    players: vsComputer
      ? { [user.uid]: { name, seat: 1 }, cpu: { name: cpuName(), seat: 2, cpu: true } }
      : { [user.uid]: { name, seat: 1 } },
    createdAt: serverTimestamp(),
  });
  return code;
}

// Player 2: joins with the code.
export async function joinRoom(code, name) {
  const user = await signIn();
  code = code.trim().toUpperCase();
  const snap = await get(ref(db, `rooms/${code}`));
  if (!snap.exists()) throw new Error("No room with that code.");

  const room = snap.val();
  const players = room.players || {};
  if (players[user.uid] || room.alias?.[user.uid]) return code; // rejoining (refresh / same browser)
  if (Object.keys(players).length >= 2) {
    // Lost your seat (new device, closed private window)? Same name = take your seat back.
    const want = name.trim().toLowerCase();
    const seat = Object.keys(players).find((u) => players[u].name.trim().toLowerCase() === want);
    if (!seat) throw new Error("That room is full. To rejoin, type the exact same name you used in that game.");
    await set(ref(db, `rooms/${code}/alias/${user.uid}`), seat);
    return code;
  }

  await update(ref(db, `rooms/${code}`), {
    [`players/${user.uid}`]: { name, seat: 2 },
    status: "drafting",
  });
  return code;
}

// Which player am I in this room? (After a rejoin, my new sign-in points to my old seat.)
export function myId(room) {
  const uid = auth.currentUser?.uid;
  return room?.alias?.[uid] ?? uid;
}

// Call once in your scene. callback(room) fires every time anything changes.
// Returns a function — call it to stop listening (e.g. on scene shutdown).
export function watchRoom(code, callback) {
  return onValue(ref(db, `rooms/${code}`), (snap) => callback(snap.val()));
}

// Draft a player and hand the turn to the other person, in one write.
export async function makePick(code, pick, otherUid, by = auth.currentUser.uid) {
  const key = push(ref(db, `rooms/${code}/picks`)).key;
  await update(ref(db, `rooms/${code}`), {
    [`picks/${key}`]: { ...pick, by, at: serverTimestamp() },
    turn: otherUid,
  });
}

// Tell the room I'm here. Firebase removes the flag by itself if my connection drops.
// onConnection(true/false) reports my own internet. Returns a function that marks me gone.
export function goOnline(code, id, onConnection = () => {}) {
  const me = ref(db, `rooms/${code}/online/${id}`);
  const stop = onValue(ref(db, ".info/connected"), (snap) => {
    const connected = snap.val() === true;
    onConnection(connected);
    if (connected) onDisconnect(me).remove().then(() => set(me, true)).catch(() => {});
  });
  return () => { stop(); remove(me).catch(() => {}); };
}

// Any other change (gameDate, status, scores...).
export function updateRoom(code, changes) {
  return update(ref(db, `rooms/${code}`), changes);
}
