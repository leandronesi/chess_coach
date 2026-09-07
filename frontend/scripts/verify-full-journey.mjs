// Live verification of the whole lesson on a real corpus, from an empty
// account to a saved Gioco attempt. Creates a temporary Supabase user through
// the administrative CLI already configured on this machine, drives the real
// app in Chrome (real Stockfish, real Maia), and removes the account and its
// private files at the end. Summary in .local-validation/full-journey-summary.json.
//
// Run from frontend/ with the dev server on 127.0.0.1:5173:
//   node scripts/verify-full-journey.mjs            # full run (about 15 minutes)
//   node scripts/verify-full-journey.mjs --cleanup-only
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const cli = process.env.SUPABASE_CLI || join(process.env.LOCALAPPDATA, "npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe");
const ref = (await readFile("../supabase/.temp/project-ref", "utf8")).trim();
let keys;
try { keys = JSON.parse(execFileSync(cli, ["projects", "api-keys", "--project-ref", ref, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
catch { throw new Error("Cannot obtain administrative access through configured CLI"); }
const key = keys.find((k) => k.name === "service_role")?.api_key;
if (!key) throw new Error("Administrative key unavailable");
const admin = createClient(`https://${ref}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

const BASE = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5173";
const email = `pattern-validation-${randomUUID()}@example.invalid`, password = randomBytes(30).toString("base64url");
let owner, browser, page;
const manifest = ".local-validation/full-journey-owner.json";
const summary = { startedAt: new Date().toISOString(), milestones: [], completed: false };
async function mark(event, detail = {}) {
  summary.milestones.push({ at: new Date().toISOString(), event, ...detail });
  await writeFile(".local-validation/full-journey-summary.json", JSON.stringify(summary, null, 2));
  console.log(event, JSON.stringify(detail));
}
async function shot(name) { await page.screenshot({ path: `.local-validation/full-journey-${name}.png`, fullPage: true }); }
const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/** The referee's control census, on the live screen: controls outside chrome/board, and primary CTAs. */
async function census() {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const all = [...document.querySelectorAll("button, a[href], [role=button], summary, input, select, textarea, [role=tab]")].filter(vis);
    const other = all.filter((el) => !el.closest("[data-referee=board]") && !el.closest("[data-referee=chrome]") && !el.matches("[data-cta=primary]"));
    const primary = all.filter((el) => el.matches("[data-cta=primary]")).length;
    const board = document.querySelector("[data-referee=board]");
    const r = board?.getBoundingClientRect();
    return { other: other.length, primary, labels: other.map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)), boardInView: r ? r.top >= 0 && r.bottom <= innerHeight : null, screens: document.documentElement.scrollHeight / innerHeight };
  });
}
async function expectRefereeOk(kind) {
  const c = await census();
  assert.ok(c.primary <= 1, `${kind}: ${c.primary} primary CTAs`);
  assert.ok(c.other <= 3, `${kind}: ${c.other} other controls: ${c.labels.join(" | ")}`);
  if (kind === "guardo" || kind === "gioco") assert.equal(c.boardInView, true, `${kind}: board outside the first viewport`);
  if (kind === "apertura" || kind === "chiusura") assert.ok(c.screens <= 1.01, `${kind}: ${c.screens.toFixed(2)} viewports`);
  assert.ok(await noOverflow(), `${kind}: horizontal overflow`);
  return c;
}

await mkdir(".local-validation", { recursive: true });
try {
  if (process.argv.includes("--cleanup-only")) { owner = JSON.parse(await readFile(manifest, "utf8")).id; } else {
    owner = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { purpose: "pattern-validation" } })).user.id;
    await writeFile(manifest, JSON.stringify({ id: owner, purpose: "pattern-validation" }));
    checked(await admin.from("profiles").insert({ user_id: owner, chess_com_username: "erik", goal_rating: 2100, goal_horizon_weeks: 26, goal_time_class: "blitz", weekly_minutes: 120, onboarding_state: "pending" }));
    browser = await chromium.launch({ channel: process.platform === "win32" ? "chrome" : undefined });
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "it-IT" });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entra", exact: true }).click();
    await mark("Signed in with an empty corpus");

    // ── Analysis runs; the first reading opens as soon as the first batch is ready ──
    let firstReady = false, lastStatus = "", finished = false;
    const deadline = Date.now() + 90 * 60 * 1000;
    while (Date.now() < deadline) {
      const jobs = checked(await admin.from("ingest_jobs").select("status,error,games_done,games_total").eq("user_id", owner).eq("kind", "main").order("created_at", { ascending: false }).limit(1));
      const job = jobs[0];
      const { count, error } = await admin.from("games").select("id", { count: "exact", head: true }).eq("user_id", owner).eq("analysis_status", "done"); if (error) throw error;
      const status = JSON.stringify({ job: job?.status, analysed: count });
      if (status !== lastStatus) { console.log("Progress", status); lastStatus = status; }
      if (job?.status === "error") throw new Error(`Pipeline stopped: ${job.error}`);
      const open = page.getByRole("button", { name: "Apri il tuo gioco", exact: true });
      if (await open.isVisible().catch(() => false)) await open.click();
      if (!firstReady && page.url().includes("/lezione") && (await page.locator(".lezione-voce").count())) {
        const voice = (await page.locator(".lezione-voce").first().innerText()).trim();
        if (voice && !voice.startsWith("Un attimo")) {
          firstReady = true;
          assert.notEqual(job?.status, "done");
          await expectRefereeOk("apertura");
          await shot("first-apertura");
          await mark("First lesson usable while remaining games run", { analysed: count, job: job.status, voice: voice.slice(0, 120) });
        }
      }
      if (job?.status === "done") { finished = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
    assert.ok(finished, "Full journey exceeded 90 minutes"); assert.ok(firstReady, "No early access to the first lesson"); assert.deepEqual(errors, []);
    const games = checked(await admin.from("games").select("id,analysis_status,analysis_path,time_class").eq("user_id", owner));
    assert.equal(games.length, 100); assert.ok(games.every((g) => g.analysis_status === "done" && g.analysis_path && g.time_class === "blitz"));
    const stored = checked(await admin.storage.from("user-data").download(`${owner}/quaderno/aggregates.json`));
    const report = JSON.parse(await stored.text()); assert.equal(report.games_analyzed, 100); assert.ok(report.personal_patterns.sampled > 0);
    await mark("Full corpus saved with Maia", { games: 100, maia: report.personal_patterns.sampled, patterns: report.personal_patterns.patterns.map((p) => `${p.id}:${p.evidence}:${p.games}g/${p.errors}e`).slice(0, 6) });

    // ── Apertura on the full corpus ──
    await page.goto(`${BASE}/lezione`);
    await page.locator(".lezione-voce").first().waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector(".lezione-voce")?.textContent?.startsWith("Un attimo"), null, { timeout: 60000 });
    const voice = (await page.locator(".lezione-voce").first().innerText()).trim();
    assert.ok(/^(Eccoti\.|Ho letto)/.test(voice), `Apertura voice: ${voice.slice(0, 80)}`);
    assert.ok(!voice.includes("—"), "em-dash in the Apertura");
    await expectRefereeOk("apertura");
    await shot("apertura");
    const sediamoci = page.getByRole("button", { name: "Sediamoci", exact: true });
    await sediamoci.waitFor({ timeout: 10000 });
    await mark("Apertura with the full corpus", { voice: voice.slice(0, 160) });
    await sediamoci.click();

    // ── Guardo 1..k ──
    await page.waitForURL(/\/lezione\/guardo\/1$/);
    // The Guardo shows a loading line (empty step label) until the report is in hand.
    await page.locator("[data-referee=board]").waitFor({ timeout: 30000 });
    await page.waitForFunction(() => /\d+\s+\S+\s+\d+/.test(document.querySelector(".lezione-step")?.textContent ?? ""), null, { timeout: 30000 });
    const stepLabel = (await page.locator(".lezione-step").innerText()).trim();
    const total = Number(stepLabel.split(/\s+/).pop());
    assert.ok(total >= 1 && total <= 3, `step label: ${stepLabel}`);
    const guardo = [];
    const seenMomenti = new Set();
    for (let n = 1; n <= total; n++) {
      await page.waitForURL(new RegExp(`/lezione/guardo/${n}$`));
      // The same route element serves every n: wait for a moment we have not seen yet.
      await page.waitForFunction((seen) => { const id = document.querySelector("[data-momento]")?.getAttribute("data-momento"); return Boolean(id) && !seen.includes(id); }, [...seenMomenti], { timeout: 20000 });
      const momentoId = await page.locator("[data-momento]").getAttribute("data-momento");
      seenMomenti.add(momentoId);
      await page.locator("[data-referee=board]").waitFor({ timeout: 20000 });
      const contesto = (await page.locator(".lezione-contesto").innerText()).trim();
      const verdetto = (await page.locator(".lezione-verdetto").innerText()).trim();
      assert.ok(contesto.length > 10 && verdetto.length > 10, `Guardo ${n}: contesto/verdetto missing`);
      // English piece letters must never leak into the Italian voice (R is the Italian king, so it is not a signal).
      assert.ok(!verdetto.includes("—") && !/\b[NBQK][a-h]?[1-8]?x?[a-h][1-8]/.test(verdetto), `Guardo ${n}: notation or em-dash: ${verdetto}`);
      assert.ok(!/\bIl tuo (torre|donna)\b|\bil (torre|donna)\b/.test(verdetto), `Guardo ${n}: gender agreement: ${verdetto}`);
      // The film arrives from Storage: wait for at least "ora" + the played move, then for the strip to settle.
      await page.waitForFunction(() => document.querySelectorAll(".lezione-frame").length >= 2, null, { timeout: 20000 }).catch(() => {});
      let frames = await page.locator(".lezione-frame").allInnerTexts();
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(800);
        const again = await page.locator(".lezione-frame").allInnerTexts();
        if (again.join("|") === frames.join("|")) break;
        frames = again;
      }
      await expectRefereeOk("guardo");
      await shot(`guardo-${n}`);
      guardo.push({ n, momentoId, contesto, verdetto: verdetto.slice(0, 160), frames });
      await page.getByRole("button", { name: "Avanti", exact: true }).click();
    }
    assert.equal(seenMomenti.size, total, "every Guardo must show a different moment");
    await mark("Guardo screens with real moments", { total, guardo });

    // ── Gioco: real Stockfish and Maia; play the best move of the moment ──
    await page.waitForURL(/\/lezione\/gioco$/);
    await page.locator("[data-referee=board]").waitFor({ timeout: 30000 });
    await page.locator("[data-referee=clock]").waitFor();
    await page.locator("[data-referee=eval]").waitFor();
    await expectRefereeOk("gioco");
    // The lesson's game replays the lesson's first moment: read it from the persisted lesson state.
    const persisted = await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.includes("lezione:v1:partita")) return JSON.parse(localStorage.getItem(k)); } return null; });
    assert.ok(persisted?.state?.startFen, "no persisted partita state");
    const moment = report.personal_patterns.patterns.flatMap((p) => [...p.examples, ...p.successfulExamples]).find((o) => o.fen === persisted.state.startFen);
    assert.ok(moment, "the game position is not one of the report's moments");
    const uci = moment.bestUci;
    assert.ok(uci, "the moment has no engine move to play");
    await shot("gioco-before");
    await page.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
    await page.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
    if (uci[4]) {
      const names = { q: "Donna", r: "Torre", b: "Alfiere", n: "Cavallo" };
      await page.getByRole("button", { name: names[uci[4]] }).click();
    }
    await page.waitForFunction(() => document.querySelectorAll(".lezione-frame").length >= 2, null, { timeout: 90000 });
    const stopped = await page.locator(".gioco-stop-card").count().catch(() => 0);
    assert.equal(stopped, 0, "the engine's own move was judged wrong");
    const sourceLine = (await page.locator(".gioco-source-copy").innerText()).trim();
    const clockText = (await page.locator("[data-referee=clock]").innerText()).trim();
    const moves = await page.locator(".lezione-frame").allInnerTexts();
    await shot("gioco-after-reply");
    await mark("Gioco: moment played, opponent replied", { uci, moves, sourceLine, clock: clockText, pattern: moment.kinds });
    assert.deepEqual(errors, []);

    // ── Esci -> Chiusura, the attempt reaches the account ──
    await page.getByRole("button", { name: "Esci", exact: true }).click();
    await page.waitForURL(/\/lezione\/fine$/);
    await page.waitForFunction(() => { const t = document.querySelector(".lezione-voce")?.textContent ?? ""; return t.length > 0 && !t.startsWith("Un attimo"); }, null, { timeout: 30000 });
    const chiusura = (await page.locator(".lezione-voce").first().innerText()).trim();
    assert.ok(chiusura.startsWith("Bene cosi'. Oggi ti sei fermato"), `Chiusura: ${chiusura.slice(0, 80)}`);
    await expectRefereeOk("chiusura");
    await shot("chiusura");
    let attempts = [];
    for (let i = 0; i < 12 && attempts.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      attempts = checked(await admin.from("training_attempts").select("anchor_key,position_id,mode,verdict,correct,used_hint,response_ms,context").eq("user_id", owner));
    }
    assert.equal(attempts.length, 1, "expected exactly one saved attempt");
    assert.equal(attempts[0].context?.exercise, "gioco"); assert.equal(attempts[0].correct, true); assert.equal(attempts[0].position_id, moment.id);
    await mark("Chiusura and the saved attempt", { chiusura: chiusura.slice(0, 160), attempt: { anchor: attempts[0].anchor_key, verdict: attempts[0].verdict, response_ms: attempts[0].response_ms, esito: attempts[0].context?.esito } });

    // ── Back to the Apertura: completed today, and it survives a reload ──
    await page.getByRole("button", { name: "Vai e gioca", exact: true }).click();
    await page.waitForURL(/\/lezione$/);
    await page.getByRole("button", { name: "Rivediamola", exact: true }).waitFor({ timeout: 20000 });
    await page.reload();
    await page.getByRole("button", { name: "Rivediamola", exact: true }).waitFor({ timeout: 30000 });
    await expectRefereeOk("apertura");
    await shot("apertura-completed");

    // ── Quaderno backstage: rows, detail, a moment in reading mode ──
    await page.getByRole("link", { name: "Quaderno", exact: true }).click();
    await page.waitForURL(/\/quaderno$/);
    const rows = page.locator(".quaderno-pattern-row");
    await rows.first().waitFor({ timeout: 30000 });
    const rowTexts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 120));
    for (const t of rowTexts) assert.ok(!t.includes("—"), `quaderno row with em-dash: ${t}`);
    assert.ok(await noOverflow(), "quaderno: horizontal overflow");
    await shot("quaderno");
    await rows.first().click();
    await page.waitForURL(/\/quaderno\/[^/]+$/);
    const prove = page.locator(".quaderno-prova-row");
    await prove.first().waitFor({ timeout: 30000 });
    const proveTexts = (await prove.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 120));
    await shot("quaderno-pattern");
    await prove.first().click();
    await page.waitForURL(/\/quaderno\/[^/]+\/[^/]+$/);
    await page.locator("[data-referee=board]").waitFor({ timeout: 20000 });
    assert.equal(await page.locator("[data-cta=primary]").count(), 0, "reading mode must have no primary CTA");
    await page.waitForFunction(() => document.querySelectorAll(".lezione-frame").length >= 2, null, { timeout: 20000 }).catch(() => {});
    const momentoFrames = await page.locator(".lezione-frame").allInnerTexts();
    await shot("quaderno-momento");
    await mark("Quaderno backstage", { rows: rowTexts, prove: proveTexts.slice(0, 4), momentoFrames });
    assert.deepEqual(errors, []);
    summary.completed = true;
    await mark("PASS: import, first lesson, full corpus with Maia, Guardo, Gioco with real engines, saved attempt, completed Apertura, Quaderno", { games: 100, maia: report.personal_patterns.sampled });
  }
} catch (error) {
  await page?.screenshot({ path: ".local-validation/full-journey-failure.png", fullPage: true }).catch(() => {});
  summary.failure = String(error.message); await mark("FAIL", { message: summary.failure });
  throw error;
} finally {
  await browser?.close();
  if (owner) {
    const user = checked(await admin.auth.admin.getUserById(owner)).user;
    if (user.user_metadata.purpose !== "pattern-validation") throw new Error("Cleanup owner guard failed");
    async function files(prefix, depth = 0) {
      if (depth > 6) throw new Error("Cleanup depth guard failed");
      const items = checked(await admin.storage.from("user-data").list(prefix, { limit: 1000 }));
      const paths = [];
      for (const item of items) { const path = `${prefix}/${item.name}`; if (item.id || item.metadata) paths.push(path); else paths.push(...await files(path, depth + 1)); }
      return paths;
    }
    const paths = await files(owner);
    if (paths.some((p) => !p.startsWith(owner + "/"))) throw new Error("Cleanup path guard failed");
    if (paths.length) checked(await admin.storage.from("user-data").remove(paths));
    checked(await admin.auth.admin.deleteUser(owner));
    await unlink(manifest);
    console.log("Temporary account and private test files removed.");
  }
}
