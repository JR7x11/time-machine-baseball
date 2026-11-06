// Time Machine Baseball — build game data from Retrosheet's big CSV download.
//
// Usage (in VS Code's terminal, in the time-machine-baseball folder):
//   node tools/build-data.mjs "C:/Users/YOU/Downloads/retrosheet" 1950 2019
//
// The first argument is the folder where you unzipped Retrosheet's download
// (it must contain allplayers.csv, batting.csv, pitching.csv, fielding.csv — they can be in subfolders).
// Writes everything into public/data. Needs no extra packages.
//
// Output:
//   public/data/index.json                 {"decades":["1950s",...], "years":{"1955":["19550412",...]}}
//   public/data/players-<decade>.json      draft pool with decade stats
//   public/data/<year>/days/<date>.json    {"b": {id:[AB,H,2B,3B,HR,BB,HBP,SB,CS,K,team,opp]}, "c": {catcherId: CS}}
//   public/data/<year>/pitching.json       {id: [[date,outs,H,HR,BB,HBP,K,WP,BK,GS,team,opp], ...]}
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const [src, fromArg, toArg] = process.argv.slice(2);
if (!src) {
  console.log('Usage: node tools/build-data.mjs "<folder with Retrosheet csvs>" 1950 2019');
  process.exit(1);
}
const FROM = Number(fromArg || 1950), TO = Number(toArg || 2019);
const OUT = path.resolve("public/data");

// ---------- find the csv files (they may be in subfolders) ----------
function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name) return full;
    if (entry.isDirectory()) { const f = findFile(full, name); if (f) return f; }
  }
  return null;
}
const FILES = {};
for (const kind of ["allplayers", "batting", "pitching", "fielding"]) {
  FILES[kind] = findFile(src, kind + ".csv");
  if (!FILES[kind]) {
    console.log(`Couldn't find ${kind}.csv inside ${src}. Did you unzip the Retrosheet download there?`);
    process.exit(1);
  }
}

// ---------- tiny CSV reader (handles quotes) ----------
function splitCsv(line) {
  if (!line.includes('"')) return line.split(",");
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
async function eachRow(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let head = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = splitCsv(line);
    if (!head) { head = Object.fromEntries(cells.map((h, i) => [h.trim(), i])); continue; }
    fn((k) => (head[k] === undefined ? "" : cells[head[k]]), head);
  }
}
const n = (v) => (v ? parseInt(v, 10) || 0 : 0);
// Only regular-season, one row per game ("value" rows) — skip anything else.
const keep = (g) => (g("gametype") === "" || g("gametype") === "regular") && (g("stattype") === "" || g("stattype") === "value");
const yearOf = (g) => Number(String(g("date")).slice(0, 4));
const POSNUM = { 1: "P", 2: "C", 3: "1B", 4: "2B", 5: "3B", 6: "SS", 7: "LF", 8: "CF", 9: "RF" };

function dump(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
}

// ---------- names ----------
console.log("Reading player names...");
const names = {};
await eachRow(FILES.allplayers, (g) => {
  if (g("team") === "ALS" || g("team") === "NLS") return;
  if (g("first") || g("last")) names[g("id")] = `${g("first")} ${g("last")}`.trim();
});

// ---------- one decade at a time (keeps memory small) ----------
const indexFile = path.join(OUT, "index.json");
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : { years: {} };
index.years ??= {};

for (let d0 = Math.floor(FROM / 10) * 10; d0 <= TO; d0 += 10) {
  const lo = Math.max(d0, FROM), hi = Math.min(d0 + 9, TO);
  const decade = `${d0}s`;
  const inRange = (y) => y >= lo && y <= hi;
  console.log(`\n=== ${decade} (${lo}-${hi}) ===`);

  const days = {};                         // date -> {b:{}, c:{}}
  const pitching = {};                     // year -> id -> rows
  const pool = {};                         // id -> decade totals
  const P = (id) => (pool[id] ??= { id, g: new Set(), years: new Set(), pos: {}, teams: {},
    h: { ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, hbp: 0, sb: 0, k: 0, r: 0, rbi: 0, sf: 0 },
    p: { outs: 0, er: 0, k: 0, bb: 0, h: 0, w: 0, l: 0, sv: 0, gs: 0 } });
  const addPos = (id, pos, gid) => { const p = P(id); (p.pos[pos] ??= new Set()).add(gid); };

  console.log("  batting...");
  await eachRow(FILES.batting, (g) => {
    if (!keep(g)) return;
    const y = yearOf(g); if (!inRange(y)) return;
    const id = g("id"), date = g("date");
    const row = [n(g("b_ab")), n(g("b_h")), n(g("b_d")), n(g("b_t")), n(g("b_hr")), n(g("b_w")),
      n(g("b_hbp")), n(g("b_sb")), n(g("b_cs")), n(g("b_k")), g("team"), g("opp")];
    const day = (days[date] ??= { b: {}, c: {} });
    const old = day.b[id];
    day.b[id] = old ? old.map((v, i) => (i < 10 ? v + row[i] : v)) : row; // doubleheader: add up
    const p = P(id); p.g.add(g("gid")); p.years.add(y); p.teams[g("team")] = (p.teams[g("team")] || 0) + 1;
    const h = p.h;
    h.ab += row[0]; h.h += row[1]; h.d += row[2]; h.t += row[3]; h.hr += row[4]; h.bb += row[5];
    h.hbp += row[6]; h.sb += row[7]; h.k += row[9]; h.r += n(g("b_r")); h.rbi += n(g("b_rbi")); h.sf += n(g("b_sf"));
    if (g("dh")) addPos(id, "DH", g("gid"));
  });

  console.log("  pitching...");
  await eachRow(FILES.pitching, (g) => {
    if (!keep(g)) return;
    const y = yearOf(g); if (!inRange(y)) return;
    const id = g("id");
    const row = [Number(g("date")), n(g("p_ipouts")), n(g("p_h")), n(g("p_hr")), n(g("p_w")), n(g("p_hbp")),
      n(g("p_k")), n(g("p_wp")), n(g("p_bk")), n(g("p_gs")), g("team"), g("opp")];
    ((pitching[y] ??= {})[id] ??= []).push(row);
    const p = P(id); p.g.add(g("gid")); p.years.add(y); p.teams[g("team")] = (p.teams[g("team")] || 0) + 1;
    const s = p.p;
    s.outs += row[1]; s.h += row[2]; s.bb += row[4]; s.k += row[6]; s.gs += row[9]; s.er += n(g("p_er"));
    if (g("wp")) s.w++; if (g("lp")) s.l++; if (g("save")) s.sv++;
  });

  console.log("  fielding...");
  await eachRow(FILES.fielding, (g) => {
    if (!keep(g)) return;
    const y = yearOf(g); if (!inRange(y)) return;
    const pos = POSNUM[g("d_pos")]; if (!pos) return;
    addPos(g("id"), pos, g("gid"));
    if (pos === "C" && n(g("d_cs"))) {
      const day = (days[g("date")] ??= { b: {}, c: {} });
      day.c[g("id")] = (day.c[g("id")] || 0) + n(g("d_cs"));
    }
  });

  // write day files and pitching files
  let dayCount = 0;
  for (const [date, obj] of Object.entries(days)) {
    dump(path.join(OUT, date.slice(0, 4), "days", date + ".json"), obj);
    dayCount++;
  }
  for (const [year, byId] of Object.entries(pitching)) {
    for (const rows of Object.values(byId)) rows.sort((a, b) => a[0] - b[0]);
    dump(path.join(OUT, String(year), "pitching.json"), byId);
  }
  for (let y = lo; y <= hi; y++) {
    const list = Object.keys(days).filter((d) => d.startsWith(String(y))).sort();
    if (list.length) index.years[y] = list; else delete index.years[y];
  }

  // draft pool
  const out = [];
  for (const p of Object.values(pool)) {
    if (!names[p.id] || !p.g.size) continue;
    const pos = Object.fromEntries(Object.entries(p.pos).map(([k, v]) => [k, v.size]).sort((a, b) => b[1] - a[1]));
    if (!Object.keys(pos).length) continue;
    const yrs = [...p.years].sort();
    const team = Object.entries(p.teams).sort((a, b) => b[1] - a[1]).slice(0, 3).map((t) => t[0]);
    const rec = { id: p.id, name: names[p.id], y: [yrs[0], yrs[yrs.length - 1]], g: p.g.size, pos, team, hit: null, pit: null };
    const h = p.h;
    if (h.ab >= 50) {
      const singles = h.h - h.d - h.t - h.hr;
      const pa = h.ab + h.bb + h.hbp + h.sf;
      rec.hit = {
        avg: +(h.h / h.ab).toFixed(3), obp: +((h.h + h.bb + h.hbp) / (pa || 1)).toFixed(3),
        slg: +((singles + 2 * h.d + 3 * h.t + 4 * h.hr) / h.ab).toFixed(3),
        h: h.h, hr: h.hr, rbi: h.rbi, r: h.r, sb: h.sb, bb: h.bb, k: h.k,
        bases: singles + 2 * h.d + 3 * h.t + 4 * h.hr + h.bb + h.hbp + h.sb,
      };
    }
    const s = p.p;
    if (s.outs >= 30) {
      rec.pit = { ip: Math.round(s.outs / 3), era: +(27 * s.er / s.outs).toFixed(2), whip: +(3 * (s.h + s.bb) / s.outs).toFixed(2),
        w: s.w, l: s.l, sv: s.sv, k: s.k, bb: s.bb, gs: s.gs };
    }
    out.push(rec);
  }
  // two players with the same name in one decade (Ken Griffey Sr. & Jr.) → add their years
  const byName = {};
  for (const r of out) (byName[r.name] ??= []).push(r);
  for (const list of Object.values(byName)) {
    if (list.length > 1) for (const r of list) r.name += ` ('${String(r.y[0]).slice(2)}-'${String(r.y[1]).slice(2)})`;
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  dump(path.join(OUT, `players-${decade}.json`), out);
  console.log(`  ${decade}: ${out.length} players, ${dayCount} game days`);
}

index.decades = [...new Set(Object.keys(index.years).map((y) => `${Math.floor(y / 10) * 10}s`))].sort();
dump(indexFile, index);
console.log("\nDone! Decades ready:", index.decades.join(", "));
