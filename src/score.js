// Time Machine Baseball scoring: "everything is a base". Every 4 bases = 1 run.
// Change the numbers here to tune the game.
export const RULES = {
  PITCH_WINDOW_DAYS: 3, // pitchers use their closest game within this many days of the date
  BASES_PER_RUN: 4,
  // what each thing an opposing pitcher gives up is worth to your team
  ALLOWED: { h: 1, hrExtra: 3, bb: 1, hbp: 1, wp: 1, bk: 1 }, // a homer allowed = 1 (hit) + 3 = 4
  K_MINUS: 1,  // each strikeout by the opposing pitcher takes away a base
  CS_MINUS: 1, // each runner caught stealing by the opposing catcher takes away a base
  BENCH_KEEP: 4, // bench players each manager protects from the shuffle (plus his SP)
  DERBY_WINDOW_DAYS: 3, // Home Run Derby counts bench homers this many days either side of game day
};

export const POSITIONS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
export const BENCH = POSITIONS.map((p) => p + " BN");
// Pitching roles in order, with how many outs each one gets (3 outs = 1 inning): 5 / 2 / 1 / 1
export const ROLES = [
  { slot: "SP", outs: 15, label: "Starter" },
  { slot: "RP1", outs: 6, label: "Reliever" },
  { slot: "RP2", outs: 3, label: "Reliever" },
  { slot: "CL", outs: 3, label: "Closer" },
];
export const PITCH_SLOTS = [...ROLES.map((r) => r.slot), "SPARE"];
export const ALL_SLOTS = [...POSITIONS, ...BENCH, ...PITCH_SLOTS];
const OLD_SLOTS = { P1: "SP", P2: "RP1", P3: "RP2", P4: "CL", P5: "SPARE" }; // drafts made before roles

// Turn a list of picks into {slot: pick}, fixing old P1–P5 slot names.
export function teamFromPicks(picks) {
  const t = {};
  for (const p of picks) t[OLD_SLOTS[p.slot] ?? p.slot] = p;
  return t;
}

// day.b[id] = [AB, H, 2B, 3B, HR, BB, HBP, SB, CS, K]
export function hitterBases(r) {
  const singles = r[1] - r[2] - r[3] - r[4];
  return singles + 2 * r[2] + 3 * r[3] + 4 * r[4] + r[5] + r[6] + r[7];
}

const toDate = (n) => new Date(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100);
const daysApart = (a, b) => Math.round(Math.abs(toDate(a) - toDate(b)) / 86400000);

// pitching[id] = [[date, outs, H, HR, BB, HBP, K, WP, BK, GS], ...]
function closestOuting(rows, date) {
  let best = null;
  for (const r of rows || []) {
    const d = daysApart(r[0], date);
    if (d > RULES.PITCH_WINDOW_DAYS || r[1] === 0) continue;
    if (!best || d < best.d || (d === best.d && r[0] < best.row[0])) best = { d, row: r };
  }
  return best?.row ?? null;
}

// Small repeatable "random" number from text, so both players get the same result.
export function hash(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The shuffle: each manager keeps his SP and the bench spots he protected.
// Every other spot is a coin flip: the two players drafted there may trade teams.
export function shuffleTeams(teams, keep, seed) {
  const A = {}, B = {}, moved = new Set();
  for (const slot of ALL_SLOTS) {
    const a = teams.A[slot], b = teams.B[slot];
    const locked = slot === "SP" || keep.A.includes(slot) || keep.B.includes(slot);
    const swap = !locked && hash(seed + "|" + slot) % 2 === 1;
    A[slot] = swap ? b : a;
    B[slot] = swap ? a : b;
    if (swap) { if (a) moved.add(a.pid); if (b) moved.add(b.pid); }
  }
  return { A, B, moved };
}

// LINEUP card: after the shuffle, a manager can start his backup instead of his starter at any position.
// swaps = positions (e.g. ["LF", "C"]) where the backup starts. The starter moves to the bench spot, so if
// both play that day the backup's line counts, and the benched starter becomes a Home Run Derby hitter.
// If the man you start didn't play that day, the other one still fills in, same as always.
export const DH_FROM = ["LF BN", "CF BN", "RF BN"]; // who can be the DH: the bench outfielders

// LINEUP CARD, outfield: outfielders are interchangeable. order = the 6 outfield slots as they came out of
// the shuffle, listed in their new spots (OF_SLOTS order), e.g. ["CF", "LF", "RF", "LF BN", "CF BN", "RF BN"]
// puts the shuffle's CF in left and its LF in center. Moving a backup into a starting spot starts him.
// Anything that isn't a full reshuffle of the 6 slots is ignored (outfield stays as it was).
export const OF_SLOTS = ["LF", "CF", "RF", "LF BN", "CF BN", "RF BN"];
export function applyOutfield(team, order) {
  if (!Array.isArray(order) || order.length !== OF_SLOTS.length ||
      [...order].sort().join() !== [...OF_SLOTS].sort().join()) return team;
  const t = { ...team };
  OF_SLOTS.forEach((spot, i) => { t[spot] = team[order[i]]; if (!t[spot]) delete t[spot]; });
  return t;
}
export function applyLineup(team, swaps = [], dh = null) {
  const t = { ...team };
  for (const pos of swaps || []) {
    const bn = pos + " BN";
    if (POSITIONS.includes(pos) && t[pos] && t[bn]) [t[pos], t[bn]] = [t[bn], t[pos]];
  }
  // DH: one of the bench outfield spots (after the swaps above), e.g. "CF BN".
  delete t.DH;
  if (DH_FROM.includes(dh) && t[dh]) t.DH = t[dh];
  return t;
}

// LINEUP CARD, pitching staff: order = the drafted pitching slots listed in their new roles, e.g.
// ["RP1", "SP", "RP2", "CL", "SPARE"] puts the pitcher drafted as RP1 in the SP role and vice versa.
// Anything that isn't a full reshuffle of the 5 slots is ignored (staff stays as drafted).
export function applyStaff(team, order) {
  if (!Array.isArray(order) || order.length !== PITCH_SLOTS.length ||
      [...order].sort().join() !== [...PITCH_SLOTS].sort().join()) return team;
  const t = { ...team };
  PITCH_SLOTS.forEach((role, i) => { t[role] = team[order[i]]; });
  return t;
}

// One team's hitters: starter if he played, else the backup, else nobody (0 bases).
// Plus a 9th spot, "DH": team.DH is the bench outfielder the manager named on his lineup card. He bats if he
// played and wasn't needed at his own position (his starter played). Otherwise the starting pitcher bats —
// but only if he really came to the plate that day (pitchers batted before the DH, and in the NL).
// Nobody tells the players that last part; they find out when it happens.
function lineup(team, day, share) {
  const rows = POSITIONS.map((pos) => {
    const starter = team[pos], backup = team[pos + " BN"];
    const used = starter && day.b[starter.pid] ? starter : backup && day.b[backup.pid] ? backup : null;
    const line = used ? day.b[used.pid] : null;
    return { pos, starter, backup, used, line, bases: line ? hitterBases(line) * share : 0 };
  });
  const dh = team.DH;
  const home = dh ? rows.find((r) => r.backup && r.backup.pid === dh.pid) : null;
  const dhFree = !!(dh && home && home.used === home.starter && day.b[dh.pid]);
  const sp = team.SP;
  const used = dhFree ? dh : sp && day.b[sp.pid] ? sp : null;
  if (dhFree) home.dhUsed = true; // he batted as the DH, so he isn't a Home Run Derby hitter
  const line = used ? day.b[used.pid] : null;
  rows.push({ pos: "DH", starter: dh || null, backup: null, used, line, pitcherBat: !!used && used === sp,
    bases: line ? hitterBases(line) * share : 0 });
  return rows;
}

// One team's pitchers by role (5/2/1/1 innings). A pitcher with no game that week is replaced
// by the SPARE (once). Each pitcher's real game is scaled to his innings. Short outings = luck.
// maxOuts lets us score part of the game (18 = through 6 innings).
function staff(team, pitching, date, maxOuts) {
  let spareUsed = false, outsSoFar = 0;
  const spareRow = team.SPARE ? closestOuting(pitching[team.SPARE.pid], date) : null;
  return ROLES.map((role) => {
    let p = team[role.slot];
    let row = p ? closestOuting(pitching[p.pid], date) : null;
    let sub = false;
    if (!row && spareRow && !spareUsed) { p = team.SPARE; row = spareRow; spareUsed = true; sub = true; }
    const start = outsSoFar;
    outsSoFar += role.outs; // each role owns its innings even if the pitcher falls short
    const roomLeft = Math.max(0, Math.min(role.outs, maxOuts - start));
    const outs = row ? Math.min(row[1], roomLeft) : 0;
    const fullOuts = row ? Math.min(row[1], role.outs) : 0; // what he gets over the whole game
    const scale = row && row[1] ? outs / row[1] : 0;
    const [, , h = 0, hr = 0, bb = 0, hbp = 0, k = 0, wp = 0, bk = 0] = row || [];
    const s = (v) => v * scale;
    const allowed = s(h) * RULES.ALLOWED.h + s(hr) * RULES.ALLOWED.hrExtra + s(bb) * RULES.ALLOWED.bb +
      s(hbp) * RULES.ALLOWED.hbp + s(wp) * RULES.ALLOWED.wp + s(bk) * RULES.ALLOWED.bk;
    return { role, p, row, sub, outs, fullOuts, scale, allowed, k: s(k) };
  });
}

// teams: { A: {slot: pick}, B: {slot: pick} } → result for both sides.
// innings: 9 for the whole game, 6 for the 7th inning stretch.
// Home Run Derby: a bench player who sat because his starter played on game day.
// Returns his homers over the derby week (game day ± DERBY_WINDOW_DAYS), or null if he isn't eligible
// (his starter didn't play, or he had no games that week). `week` = the day files for that week.
export function derbyHomers(h, week) {
  if (!h.used || h.used !== h.starter || !h.backup || h.dhUsed) return null;
  const games = week.map((d) => d?.b?.[h.backup.pid]).filter(Boolean);
  return games.length ? games.reduce((t, r) => t + (r[4] || 0), 0) : null;
}

// week (optional): day files for the derby week; without it the derby uses game day only.
export function playGame(teams, day, pitching, date, seed = "", innings = 9, week = null) {
  const derbyWeek = week?.length ? week : [day];
  const maxOuts = innings * 3;
  const share = innings / 9; // hitters' day is spread evenly over 9 innings
  const side = {};
  for (const key of ["A", "B"]) {
    side[key] = { hitters: lineup(teams[key], day, share), pitchers: staff(teams[key], pitching, date, maxOuts) };
  }
  for (const [me, opp] of [["A", "B"], ["B", "A"]]) {
    const s = side[me], o = side[opp];
    const hit = s.hitters.reduce((t, h) => t + h.bases, 0);
    const allowed = o.pitchers.reduce((t, p) => t + p.allowed, 0);
    const ks = o.pitchers.reduce((t, p) => t + p.k, 0);
    const catcher = o.hitters.find((h) => h.pos === "C")?.used;
    const cs = catcher ? (day.c[catcher.pid] || 0) * share : 0;
    const total = Math.max(0, Math.round(hit + allowed - ks * RULES.K_MINUS - cs * RULES.CS_MINUS));
    s.parts = { hit, allowed, ks, cs };
    s.bases = total;
    s.runs = Math.floor(total / RULES.BASES_PER_RUN);
    s.stranded = total % RULES.BASES_PER_RUN;
    s.outs = s.pitchers.reduce((t, p) => t + p.outs, 0);
    s.derby = s.hitters.reduce((t, h) => t + (derbyHomers(h, derbyWeek) ?? 0), 0);
    s.starterHR = s.hitters.reduce((t, h) => t + (h.line ? h.line[4] : 0), 0);
  }

  const A = side.A, B = side.B;
  let winner = null, decidedBy = "runs";
  if (A.runs !== B.runs) winner = A.runs > B.runs ? "A" : "B";
  else if (A.derby !== B.derby) { winner = A.derby > B.derby ? "A" : "B"; decidedBy = "derby"; }
  else if (A.starterHR !== B.starterHR) { winner = A.starterHR > B.starterHR ? "A" : "B"; decidedBy = "starterHR"; }
  else { winner = hash(seed + date) % 2 ? "A" : "B"; decidedBy = "coin"; }
  return { A, B, winner, decidedBy };
}
