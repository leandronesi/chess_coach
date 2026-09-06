// UX referee: deterministic invariants for the main path, measured in a real browser.
//
// The goal document (docs/GOAL_ESPERIENZA.md §4) defines the invariants; this
// script is the referee that measures them. It is intentionally conservative:
// anything the UI does not mark is counted against it.
//
// Markup contract the UI must honour:
//   data-referee="chrome"   wrapper of the app chrome (back / exit / quaderno icon)
//   data-referee="board"    wrapper of the chessboard (its squares are not controls)
//   data-referee="eval"     eval bar (gioco)
//   data-referee="clock"    the user's clock (gioco)
//   data-referee="moves"    the navigable move list (gioco / guardo film)
//   data-cta="primary"      the ONE primary call to action of the screen
//   data-cta="takeback"     "Ripensaci" (gioco)
//
// Usage:
//   node scripts/ux-referee.mjs                 # starts Vite on a free port, runs, exits 1 on failure
//   node scripts/ux-referee.mjs --scenes legacy # measure the pre-lezione screens (expected red)
//   REFEREE_BASE_URL=http://127.0.0.1:5173 node scripts/ux-referee.mjs   # reuse a running server
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

// kind: apertura | guardo | gioco | chiusura. Backstage screens are not refereed.
const SCENES = {
  legacy: [
    { id: "home", kind: "apertura", url: "/dev/patterns" },
    { id: "dettaglio", kind: "guardo", url: "/dev/patterns?detail" },
    { id: "allenamento", kind: "gioco", url: "/dev/patterns?practice", setup: [{ click: "Osserva la posizione" }] },
  ],
  lezione: [
    { id: "apertura", kind: "apertura", url: "/dev/lezione?beat=apertura" },
    { id: "guardo", kind: "guardo", url: "/dev/lezione?beat=guardo" },
    { id: "gioco", kind: "gioco", url: "/dev/lezione?beat=gioco" },
    { id: "fermata", kind: "gioco", url: "/dev/lezione?beat=fermata" },
    { id: "chiusura", kind: "chiusura", url: "/dev/lezione?beat=chiusura" },
    { id: "ritorno", kind: "apertura", url: "/dev/lezione?beat=ritorno" },
  ],
};

const LIMITS = {
  primary: 1,
  otherControls: 3,
  chromeControls: 2,
  oneViewport: 1.0,
  tallViewport: 1.6,
};

const args = process.argv.slice(2);
const sceneSet = args.includes("--scenes") ? args[args.indexOf("--scenes") + 1] : "lezione";
const scenes = SCENES[sceneSet];
if (!scenes) { console.error(`unknown scene set: ${sceneSet}`); process.exit(2); }

const outDir = join(process.cwd(), ".local-validation", "ux-referee", sceneSet);
mkdirSync(outDir, { recursive: true });

async function withServer(fn) {
  if (process.env.REFEREE_BASE_URL) return fn(process.env.REFEREE_BASE_URL);
  const port = 5179 + Math.floor(Math.random() * 200);
  const base = `http://127.0.0.1:${port}`;
  const vite = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try { const r = await fetch(base + "/"); if (r.ok) break; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return await fn(base);
  } finally { vite.kill(); }
}

async function launch() {
  try { return await chromium.launch({ channel: "chrome", headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}

// Runs inside the page. Returns the raw measurements; the rules are applied in Node.
function measure() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.pointerEvents !== "none";
  };
  const text = (el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
  const within = (el, sel) => Boolean(el.closest(sel));
  const controls = [...document.querySelectorAll("button, a[href], [role=button], summary, input, select, textarea, [role=tab]")].filter(vis)
    .filter((el) => !within(el, "[data-referee-ignore]"));
  const region = (el) => within(el, "[data-referee=board]") ? "board" : within(el, "[data-referee=chrome]") ? "chrome" : el.matches("[data-cta=primary]") ? "primary" : "other";
  const list = controls.map((el) => ({ label: text(el).slice(0, 60), region: region(el), pressed: el.getAttribute("aria-pressed"), tag: el.tagName.toLowerCase() }));
  const vh = window.innerHeight;
  const rect = (sel) => { const el = document.querySelector(sel); if (!el || !vis(el)) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  const board = rect("[data-referee=board]");
  let occluded = null;
  if (board) {
    const points = [[0.1, 0.1], [0.9, 0.1], [0.5, 0.5], [0.1, 0.9], [0.9, 0.9]].map(([fx, fy]) => [board.left + (board.right - board.left) * fx, board.top + (board.bottom - board.top) * fy]);
    occluded = points.some(([x, y]) => { if (y < 0 || y > vh) return true; const hit = document.elementFromPoint(x, y); return !hit || !within(hit, "[data-referee=board]"); });
  }
  const fixedBottomNav = [...document.querySelectorAll("nav, [role=navigation], footer, div")].filter(vis).some((el) => {
    const cs = getComputedStyle(el); if (cs.position !== "fixed" && cs.position !== "sticky") return false;
    const r = el.getBoundingClientRect(); return r.bottom >= vh - 2 && r.height > 40 && el.querySelectorAll("a[href], button").length >= 3;
  });
  const main = document.querySelector("main") || document.body;
  const firstText = [...main.querySelectorAll("h1, h2, h3, p")].filter(vis).map((el) => el.textContent.replace(/\s+/g, " ").trim()).find((t) => t.length > 0) || "";
  const bodyText = main.innerText || "";
  return {
    vh, scrollHeight: document.documentElement.scrollHeight, controls: list, board, occluded, fixedBottomNav, firstText,
    hasTabs: document.querySelectorAll("[role=tab], [role=tablist]").length > 0,
    emDash: bodyText.includes("—"),
    eval: rect("[data-referee=eval]"), clock: rect("[data-referee=clock]"), moves: Boolean(document.querySelector("[data-referee=moves]")),
    takeback: Boolean(document.querySelector("[data-cta=takeback]")),
  };
}

function judge(kind, m) {
  const fails = [];
  const primary = m.controls.filter((c) => c.region === "primary").length;
  const other = m.controls.filter((c) => c.region === "other");
  const chrome = m.controls.filter((c) => c.region === "chrome").length;
  const pressedGroups = m.controls.filter((c) => c.pressed !== null).length;
  const partitaChips = other.filter((c) => /^partita \d+$/i.test(c.label)).length;
  if (primary > LIMITS.primary) fails.push(`${primary} CTA primarie (max ${LIMITS.primary})`);
  if (other.length > LIMITS.otherControls) fails.push(`${other.length} altri controlli (max ${LIMITS.otherControls}): ${other.map((c) => c.label || c.tag).join(" | ")}`);
  if (chrome > LIMITS.chromeControls) fails.push(`${chrome} controlli nel chrome (max ${LIMITS.chromeControls})`);
  if (m.hasTabs) fails.push("tab presenti");
  if (m.fixedBottomNav) fails.push("barra di navigazione fissa in basso");
  if (pressedGroups >= 3) fails.push(`${pressedGroups} chip con aria-pressed (filtri)`);
  if (partitaChips) fails.push(`${partitaChips} selettori "Partita N"`);
  if (m.emDash) fails.push("em-dash nel testo");
  const words = m.firstText.split(/\s+/).filter(Boolean);
  if (words.length < 5 || m.firstText === m.firstText.toUpperCase()) fails.push(`apre con un'etichetta, non una frase: "${m.firstText.slice(0, 50)}"`);
  const screens = m.scrollHeight / m.vh;
  if ((kind === "apertura" || kind === "chiusura") && screens > LIMITS.oneViewport + 0.01) fails.push(`${screens.toFixed(2)} viewport (max 1)`);
  if ((kind === "guardo" || kind === "gioco") && screens > LIMITS.tallViewport) fails.push(`${screens.toFixed(2)} viewport (max ${LIMITS.tallViewport})`);
  if (kind === "guardo" || kind === "gioco") {
    if (!m.board) fails.push("scacchiera assente o non marcata data-referee=board");
    else {
      if (m.board.top < 0 || m.board.bottom > m.vh) fails.push(`scacchiera fuori dal primo viewport (top ${Math.round(m.board.top)}, bottom ${Math.round(m.board.bottom)}, vh ${m.vh})`);
      if (m.occluded) fails.push("scacchiera coperta da un elemento fisso");
    }
  }
  if (kind === "gioco") {
    if (!m.eval || m.eval.bottom > m.vh || m.eval.top < 0) fails.push("eval bar assente o fuori dal primo viewport");
    if (!m.clock || m.clock.bottom > m.vh || m.clock.top < 0) fails.push("orologio assente o fuori dal primo viewport");
    if (!m.moves) fails.push("lista mosse assente");
    if (!m.takeback) fails.push("Ripensaci assente");
  }
  return fails;
}

const report = [];
let red = 0;
await withServer(async (base) => {
  const browser = await launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, locale: "it-IT", deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const scene of scenes) {
      await page.goto(base + scene.url, { waitUntil: "networkidle" });
      for (const step of scene.setup ?? []) { await page.getByRole("button", { name: step.click }).click(); }
      await page.waitForTimeout(800);
      const m = await page.evaluate(measure);
      const fails = judge(scene.kind, m);
      const label = `${scene.id}@${vp.width}`;
      if (fails.length) { red++; await page.screenshot({ path: join(outDir, `${label}.png`), fullPage: true }); }
      report.push({ scene: scene.id, kind: scene.kind, viewport: vp.width, fails, controls: m.controls.length, screens: Number((m.scrollHeight / m.vh).toFixed(2)) });
      console.log(`${fails.length ? "ROSSO" : "verde"}  ${label.padEnd(16)} ${fails.length ? fails.join("; ") : "ok"}`);
    }
    await ctx.close();
  }
  await browser.close();
});
writeFileSync(join(outDir, "report.json"), JSON.stringify({ sceneSet, limits: LIMITS, at: new Date().toISOString(), report }, null, 2));
console.log(`\n${red ? `${red} scene rosse` : "tutto verde"} · report in ${outDir}`);
process.exit(red ? 1 : 0);
