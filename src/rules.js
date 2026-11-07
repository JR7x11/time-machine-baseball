// RULES & FAQ screen and the Infinite M0b Studios tag. Shown from the home screen, the time machine,
// the draft and game day. Everything here describes how the game actually plays (see score.js / draft.js).
import { RULES, ROLES } from "./score.js";
import { PATCH_NOTES } from "./patchnotes.js";

export const STUDIO = "Infinite M0b Studios";

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) if (c != null) e.append(c);
  return e;
}

const box = el("div", { className: "modal rules-modal", hidden: true });
box.onclick = (e) => { if (e.target === box) closeRules(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) closeRules(); });
document.body.append(box);
let returnFocus = null;
function closeRules() { box.hidden = true; returnFocus?.focus?.(); }

const inn = (outs) => (outs % 3 ? `${(outs / 3).toFixed(1)}` : String(outs / 3));
const roleLine = (r) => `${r.slot} — ${r.label}: ${inn(r.outs)} inning${r.outs === 3 ? "" : "s"}`;

// One tab = a heading + its content. Built fresh each time so the numbers always match RULES.
function rulesTab() {
  const li = (...c) => el("li", {}, ...c);
  const b = (t) => el("strong", {}, t);
  return [
    el("h3", {}, "HOW A GAME WORKS"),
    el("ol", {},
      li(b("Pick a decade"), " (1950s–2010s) or let the time machine surprise you."),
      li(b("The time machine travels"), " from today back to one real day in that decade. That's your game day — draft with it in mind."),
      li(b("Snake draft."), " Whoever started the game picks first; picks go 1-2, 2-1, 1-2… Each team drafts a starter and a backup at C, 1B, 2B, 3B, SS, LF, CF and RF, plus 5 pitchers: ",
        ROLES.map((r) => r.slot).join(", "), " and a SPARE."),
      li(b("PLAY BALL."), ` Each manager protects ${RULES.BENCH_KEEP} bench players. Your starting pitcher is always protected.`),
      li(b("The shuffle."), " Every other spot is a coin flip: the two players drafted there may trade teams. Your team can end up with players you never picked."),
      li(b("Game day."), " Real stats from that day decide everything. Visitors bat first. Step through it with NEXT, or SKIP ahead.")),
    el("h3", {}, "EVERYTHING IS A BASE"),
    el("p", {}, `Every ${RULES.BASES_PER_RUN} bases = 1 run. Leftover bases are runners left on base.`),
    el("table", { className: "rules-table" },
      el("tbody", {},
        ...[["Your hitter's single / double / triple / homer", "+1 / +2 / +3 / +4"],
          ["Your hitter's walk, hit-by-pitch, stolen base", "+1 each"],
          ["Each hit the other team's pitchers give up", `+${RULES.ALLOWED.h}`],
          ["…and each homer they give up", `+${RULES.ALLOWED.h + RULES.ALLOWED.hrExtra} total`],
          ["Walks, hit batters, wild pitches, balks they give up", "+1 each"],
          ["Each strikeout by their pitchers", `−${RULES.K_MINUS}`],
          ["Each runner their catcher throws out", `−${RULES.CS_MINUS}`]]
          .map(([what, pts]) => el("tr", {}, el("td", {}, what), el("td", { className: "num" }, pts))))),
    el("h3", {}, "WHO PLAYS"),
    el("ul", {},
      li(b("Hitters:"), " your starter if he played that day. If not, your backup if he did. If neither played, that spot goes 0-for."),
      li(b("Pitchers:"), ` each uses his real game closest to the date, up to ${RULES.PITCH_WINDOW_DAYS} days either side, scaled to his innings:`),
      el("ul", {}, ...ROLES.map((r) => li(roleLine(r)))),
      li(b("SPARE:"), " steps in once for any pitcher who didn't pitch that week. Innings nobody covers simply go unpitched.")),
    el("h3", {}, "TIES"),
    el("ol", {},
      li(b("Home Run Derby:"), ` most homers by bench players who sat because their starter played — counting their homers the whole week (${RULES.DERBY_WINDOW_DAYS} days either side of game day).`),
      li(b("Starters' homers"), " that day."),
      li(b("Coin flip."))),
  ];
}

function faqTab() {
  const qa = (q, a) => el("details", { className: "faq" }, el("summary", {}, q), el("p", {}, a));
  return [
    el("h3", {}, "FAQ"),
    qa("Are these real stats?",
      "Yes. Every hit, walk and strikeout is from the real box score of that day, from Retrosheet's game-by-game records."),
    qa("Why did my player score zero?",
      "He didn't play on game day, and neither did his backup — maybe a day off, an injury, or he wasn't in the majors that year. Check the years on each player when you draft."),
    qa("Why is there a player on my team I didn't draft?",
      `The shuffle. Every spot you didn't protect gets a coin flip, and the two players drafted there can trade teams. Protect your ${RULES.BENCH_KEEP} favorite bench players to keep them.`),
    qa("What if my pitcher didn't pitch that week?",
      "Your SPARE takes his place once. If more than one pitcher is missing, those innings go unpitched."),
    qa("Which positions can a player play?",
      "Any position he played at least 10 games at during that decade. Outfielders can play any outfield spot, and full-time designated hitters can play first base."),
    qa("Who bats first?", "The visitors: the player who joined (or the computer). The player who started the game is the home team."),
    qa("What happens if someone loses their connection?",
      "The game pauses with a RAIN DELAY sign until they're back. To rejoin from any device, type the room code and the exact same name, then click JOIN."),
    qa("How does the Home Run Derby work?",
      `If the game ends tied, it isn't over yet. Each bench player who sat because his starter played steps up, and every homer he hit that week (${RULES.DERBY_WINDOW_DAYS} days either side of game day) counts. Most homers wins. Still tied? The starters' homers on game day decide it, then a coin flip.`),
    qa("Can I play by myself?", "Yes — click PLAY THE COMPUTER. Turn on AUTO-DRAFT if you want the draft done in seconds."),
    qa("Why does the clock start on today's date?",
      "That's the time machine leaving the present. It flips back through the years and stops on your game day."),
  ];
}

// PATCH NOTES, drawn like CHANGELOG.md open in VS Code (Dark+ colors, line numbers, editor font).
let fontLoaded = false;
function loadEditorFont() {
  if (fontLoaded) return;
  fontLoaded = true; // Fira Code for anyone without Cascadia Code / Consolas (VS Code's fonts on Windows)
  document.head.append(el("link", { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&display=swap" }));
}
function patchTab() {
  loadEditorFont();
  // Drawn as patchNotes.js in VS Code with the One Dark Pro theme.
  const FN = { NEW: "added", CHANGE: "changed", RULE: "ruleChange", IMPROVED: "improved", FIX: "fixed" };
  const t = (cls, text) => el("span", { className: cls }, text);
  const str = (text) => t("js-str", JSON.stringify(text));
  const lines = []; // [indented?, ...parts]
  const add = (indent, ...parts) => lines.push({ indent, parts });
  add(false, t("js-comment", "// Time Machine Baseball — Patch Notes (newest first)"));
  for (const u of PATCH_NOTES) {
    add(false);
    add(false, t("js-comment", `// ----- ${u.title} -----`));
    add(false, t("js-fn", "update"), t("js-brace", "("), str(u.version), t("js-punct", ", "), str(u.date),
      t("js-punct", ", "), t("js-brace2", "()"), t("js-kw", " => "), t("js-brace2", "{"));
    for (const [tag, text] of u.notes) {
      add(true, t("js-fn", FN[tag] || "added"), t("js-brace2", "("), str(text), t("js-brace2", ")"), t("js-punct", ";"));
    }
    add(false, t("js-brace2", "}"), t("js-brace", ")"), t("js-punct", ";"));
  }
  add(false);
  return [el("div", { className: "code-editor", role: "document", ariaLabel: "Patch notes" },
    el("div", { className: "code-tabs" }, el("span", { className: "code-tab" }, el("span", { className: "js-icon" }, "JS"), " patchNotes.js ", el("span", { className: "code-crumb" }, "> …"))),
    el("ol", { className: "code-lines" }, ...lines.map(({ indent, parts }) =>
      el("li", { className: indent ? "ind" : "" }, ...(parts.length ? parts : ["\u00a0"])))))];
}

export function openRules(start = "rules") {
  returnFocus = document.activeElement;
  const body = el("div", { className: "rules-body" });
  const title = el("h2", {}, "RULES & FAQ");
  const tabs = [["rules", "RULES", rulesTab], ["faq", "FAQ", faqTab], ["patch", "PATCH NOTES", patchTab]];
  const buttons = tabs.map(([key, label]) => el("button", {
    className: "chip", type: "button", role: "tab", textContent: label, onclick: () => show(key),
  }));
  function show(key) {
    tabs.forEach(([k], i) => { buttons[i].classList.toggle("on", k === key); buttons[i].setAttribute("aria-selected", String(k === key)); });
    body.replaceChildren(...tabs.find(([k]) => k === key)[2]());
    body.scrollTop = 0;
  }
  const close = el("button", { className: "btn secondary", type: "button", onclick: closeRules }, "CLOSE");
  box.replaceChildren(el("div", { className: "modal-box rules-box", role: "dialog", ariaModal: "true", ariaLabel: "Rules and FAQ" },
    title,
    el("div", { className: "filters", role: "tablist" }, ...buttons),
    body,
    close,
    el("p", { className: "studio-tag" }, `— ${STUDIO} —`)));
  show(start);
  box.hidden = false;
  close.focus({ preventScroll: true });
}

// Small footer for any screen: the studio tag + a RULES & FAQ link.
export function studioFooter() {
  return el("div", { className: "studio-footer" },
    el("button", { className: "rules-link", type: "button", onclick: () => openRules() }, "RULES & FAQ"),
    el("p", { className: "studio-tag" }, `— ${STUDIO} —`));
}
