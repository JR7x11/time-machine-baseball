// Phone handheld controls (phones only — PC and iPad keep the 3-column layout).
// On a phone the screen shows ONE pane at a time (the list / the game, AWAY, or HOME), and a
// handheld control pad is fixed to the bottom: a row of screen buttons + the big action buttons.

export const PHONE_QUERY = "(max-width: 600px)";
export const isPhone = () => !!window.matchMedia?.(PHONE_QUERY).matches;

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) if (c != null) e.append(c);
  return e;
}

// Short retro beep, only when the game's SOUND is on (sound() returns true/false).
let ctx = null;
export function padBeep(on, f = 520, d = 0.05) {
  if (!on) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = "square"; o.frequency.value = f;
    g.gain.setValueAtTime(0.025, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(t + d);
  } catch { /* sound is optional */ }
}

// panes: [{ key, label, look }] — look is "free" (green), "away" (road blue), "home" (white) or "plain" (cream).
// grid: the element whose children are the panes; each pane child carries data-pane="<key>".
export function makePad(grid, panes, start) {
  document.body.classList.add("phone");
  const tray = el("div", { className: "pad-tray", hidden: true });
  const selectors = el("div", { className: "pad-selectors" });
  const actions = el("div", { className: "pad-actions" });
  const pad = el("div", { className: "phone-pad", role: "group", ariaLabel: "Handheld controls" },
    tray, selectors, actions, el("div", { className: "pad-grille", ariaHidden: "true" }));
  document.body.append(pad);

  let active = start;
  const buttons = panes.map((p) => {
    const b = el("button", { type: "button", className: "pad-select look-" + p.look },
      el("span", { className: "pad-led" }), el("span", { className: "pad-label" }, p.label));
    b.onclick = () => { padBeep(api.sound?.(), 520); show(p.key); };
    selectors.append(b);
    return b;
  });
  function show(key) {
    active = key;
    grid.dataset.pane = key;
    panes.forEach((p, i) => {
      buttons[i].classList.toggle("on", p.key === key);
      buttons[i].setAttribute("aria-pressed", String(p.key === key));
    });
    window.scrollTo({ top: 0 });
  }
  show(start);
  // Keep the page's bottom padding equal to the pad's height (it grows when the pick tray opens).
  const fit = () => document.body.style.setProperty("--pad-h", pad.offsetHeight + "px");
  const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
  ro?.observe(pad); fit();

  const api = {
    el: pad, tray, sound: null,
    show, get active() { return active; },
    setActions(...nodes) { actions.replaceChildren(...nodes.filter(Boolean)); },
    setTray(...nodes) { tray.replaceChildren(...nodes.filter(Boolean)); tray.hidden = !nodes.filter(Boolean).length; },
    destroy() { ro?.disconnect(); pad.remove(); document.body.classList.remove("phone"); document.body.style.removeProperty("--pad-h"); },
  };
  return api;
}

// The handheld's big round buttons. kind: "go" (orange; gray until ready), "red", "blue".
export function padButton(label, kind, onclick, { ready = true, grow = 1 } = {}) {
  const b = el("button", { type: "button", className: `pad-btn pad-${kind}` + (ready ? "" : " waiting"), disabled: !ready }, label);
  b.style.flex = String(grow);
  b.onclick = onclick;
  return b;
}
