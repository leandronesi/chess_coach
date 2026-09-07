/**
 * LezionePreview.tsx — "/dev/lezione?beat=..." (DEV only, no auth).
 *
 * Explicitly synthetic data, built the same way PatternPreview.tsx builds its
 * own (buildPersonalPatternReport over a set of PatternOpportunity), reusing
 * the shared Aggregates scaffolding in ./syntheticPatterns so the two dev
 * previews do not duplicate it (§E of the slice-2 spec).
 *
 * The featured position (examples[0] of the "hanging_piece" pattern) is the
 * exact canvas position approved 2026-09-06: a white knight on e5, left
 * hanging after ...d6. Verified reachable via chess.js from a coherent
 * earlier position through Bc4, Nc6, Ne5, d6 (see the slice-2 delivery notes).
 */

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Chess } from "chess.js";
import { assessDecisionTiming } from "../../pipeline/decisionTiming";
import { buildPersonalPatternReport, type PatternOpportunity } from "../../pipeline/personalPatterns";
import type { PatternLearning } from "../../pipeline/patternLearning";
import type { GameAnalysis } from "../../pipeline/analyze";
import type { BatchEvalResult } from "../../pipeline/stockfishWorker";
import type { FilmLoader } from "../../lezione/film";
import type { PartitaEngineDeps } from "../../lezione/usePartita";
import { buildLezione } from "../../lezione/lezione";
import { tr } from "../../i18n/lang";
import type { LezioneEsitoGioco } from "../../lezione/progress";
import { emptySyntheticAggregates } from "./syntheticPatterns";
import { AperturaView } from "../lezione/Apertura";
import { GuardoView } from "../lezione/Guardo";
import { ChiusuraView } from "../lezione/Chiusura";
import { GiocoView } from "../lezione/Gioco";
import { QuadernoView } from "../quaderno/Quaderno";
import { QuadernoPatternView } from "../quaderno/QuadernoPattern";
import { findMomento } from "../quaderno/QuadernoMomento";

// ── Synthetic opportunities ──────────────────────────────────────────────

const BASE_SECONDS = 300;
const INCREMENT_SECONDS = 0;
const SCOPE = `blitz:${BASE_SECONDS}:${INCREMENT_SECONDS}:middlegame`;

const FEATURED_FEN = "r1bq1rk1/ppp1bppp/2np1n2/4N3/2B1P3/2N5/PPP2PPP/R1BQ1RK1 w - - 0 13";
// FEN before Bc4, Nc6, Ne5, d6 — verified with chess.js to reach FEATURED_FEN exactly.
const FEATURED_START_FEN = "rnbq1rk1/ppppbppp/5n2/8/4P3/2N2N2/PPP1BPPP/R1BQ1RK1 w - - 0 11";
const FILLER_FEN = "8/8/8/8/8/8/4K3/7k w - - 0 13";
export const LEZIONE_PREVIEW_GAME_ID = "canvas-1";

interface SyntheticMove {
  gameId: string; playedAt: string; ply: number; fen: string;
  playedSan: string; playedUci: string; bestUci: string; lastOpponentSan: string | null;
  previousMoves: string[]; cpLoss: number; scoreBeforeCp: number;
  spentSeconds: number; clockRemaining: number; opponentRating: number;
}

function hangingPieceOpportunity(m: SyntheticMove): PatternOpportunity {
  const timing = assessDecisionTiming({
    spentSeconds: m.spentSeconds, clockRemaining: m.clockRemaining,
    baseSeconds: BASE_SECONDS, incrementSeconds: INCREMENT_SECONDS,
    ply: m.ply, scoreBeforeCp: m.scoreBeforeCp, legalMoveCount: 30,
  });
  return {
    id: `${m.gameId}:${m.ply}`, gameId: m.gameId, playedAt: m.playedAt, startedAt: null,
    kinds: ["hanging_piece"], scope: SCOPE,
    timeClass: "blitz", baseSeconds: BASE_SECONDS, incrementSeconds: INCREMENT_SECONDS, opponentRating: m.opponentRating,
    phase: "middlegame", ply: m.ply, fen: m.fen, color: "white",
    playedUci: m.playedUci, playedSan: m.playedSan, lastOpponentSan: m.lastOpponentSan,
    previousMoves: m.previousMoves, bestUci: m.bestUci, acceptableUcis: [m.bestUci],
    cpLoss: m.cpLoss, scoreBeforeCp: m.scoreBeforeCp, clockRemaining: m.clockRemaining, timing,
  };
}

// examples[0]: the exact canvas position — a real hanging_piece blunder.
const featured = hangingPieceOpportunity({
  gameId: LEZIONE_PREVIEW_GAME_ID, playedAt: "2026-08-30T18:00:00Z", ply: 25, fen: FEATURED_FEN,
  playedSan: "a3", playedUci: "a2a3", bestUci: "e5f3", lastOpponentSan: "d6",
  previousMoves: ["Bc4", "Nc6", "Ne5", "d6"], cpLoss: 280, scoreBeforeCp: 20,
  spentSeconds: 6, clockRemaining: 246, opponentRating: 1240,
});
// examples[1..3]: simpler filler errors, distinct games, enough volume for "recurring" evidence.
const fillerErrors = [2, 3, 4].map((i) => hangingPieceOpportunity({
  gameId: `canvas-${i}`, playedAt: `2026-08-2${i}T18:00:00Z`, ply: 25, fen: FILLER_FEN,
  playedSan: "Kd3", playedUci: "e2d3", bestUci: "e2f3", lastOpponentSan: null,
  previousMoves: [], cpLoss: 150, scoreBeforeCp: 10,
  spentSeconds: 4, clockRemaining: 240, opponentRating: 1220,
}));
// successfulExamples[0]: a distinct-game "Qui ti sei fermato" moment for Guardo 2.
const success = hangingPieceOpportunity({
  gameId: "canvas-5", playedAt: "2026-08-25T18:00:00Z", ply: 27, fen: FILLER_FEN,
  playedSan: "Kd3", playedUci: "e2d3", bestUci: "e2d3", lastOpponentSan: null,
  previousMoves: [], cpLoss: 0, scoreBeforeCp: 10,
  spentSeconds: 40, clockRemaining: 200, opponentRating: 1230,
});
// Padding: handled rows on the same filler games, purely to clear the rows >= 8 evidence threshold.
const padding = [2, 3, 4].map((i) => hangingPieceOpportunity({
  gameId: `canvas-${i}`, playedAt: `2026-08-2${i}T18:05:00Z`, ply: 29, fen: FILLER_FEN,
  playedSan: "Kd3", playedUci: "e2d3", bestUci: "e2d3", lastOpponentSan: null,
  previousMoves: [], cpLoss: 0, scoreBeforeCp: 5,
  spentSeconds: 30, clockRemaining: 200, opponentRating: 1220,
}));

// A second, deliberately thin pattern (§A of the slice-4 spec): only two
// opportunities in two games, so evidence stays "insufficient" — the Quaderno
// needs both phrasings ("recurring" for hanging_piece, "insufficient" here)
// on screen at once. time_reserve's own frase reads fastDecisions/opportunities,
// not the errors/games pair, so pace must actually be "fast" with reserve "ample".
function timeReserveOpportunity(gameId: string, playedAt: string, ply: number, cpLoss: number): PatternOpportunity {
  const spentSeconds = 1;
  const clockRemaining = 99; // before-thinking = 99 + 1 - 0 = 100s, >= the 75s "ample" threshold at 300+0
  const timing = assessDecisionTiming({
    spentSeconds, clockRemaining, baseSeconds: BASE_SECONDS, incrementSeconds: INCREMENT_SECONDS,
    ply, scoreBeforeCp: 20, legalMoveCount: 30,
  });
  return {
    id: `${gameId}:${ply}`, gameId, playedAt, startedAt: null,
    kinds: ["time_reserve"], scope: SCOPE,
    timeClass: "blitz", baseSeconds: BASE_SECONDS, incrementSeconds: INCREMENT_SECONDS, opponentRating: 1210,
    phase: "middlegame", ply, fen: FILLER_FEN, color: "white",
    playedUci: "e2d3", playedSan: "Kd3", lastOpponentSan: null,
    previousMoves: [], bestUci: "e2f3", acceptableUcis: ["e2f3"],
    cpLoss, scoreBeforeCp: 20, clockRemaining, timing,
  };
}
const timeReserveOpportunities = [
  timeReserveOpportunity("canvas-tr-1", "2026-08-18T18:00:00Z", 25, 150),
  timeReserveOpportunity("canvas-tr-2", "2026-08-19T18:00:00Z", 27, 20),
];

const opportunities = [featured, ...fillerErrors, success, ...padding, ...timeReserveOpportunities];
const personalPatterns = buildPersonalPatternReport(opportunities, new Map(), 1200, 1400);
const aggregates = emptySyntheticAggregates({ games_analyzed: 5, personal_patterns: personalPatterns });
const featuredPattern = personalPatterns.patterns.find((p) => p.kind === "hanging_piece")!;

const PROFILE = { currentRating: 1200, targetRating: 1400, timeClass: "blitz" };

const RITORNO_LEARNING: PatternLearning[] = [{
  excludedChronologyGames: 0, patternId: featuredPattern.id, firstPracticedAt: "2026-08-20T00:00:00Z",
  practiceAttempts: 4, practiceSuccesses: 3, practiceWithHint: 1,
  baseline: { opportunities: 10, games: 5, errors: 6, fast: 4, timingKnown: 8, errorRate: 0.6, fastShare: 0.5 },
  subsequent: { opportunities: 5, games: 6, errors: 1, fast: 0, timingKnown: 4, errorRate: 0.2, fastShare: 0 },
  errorRateChange: -0.4,
}];

const lezioneApertura = buildLezione({ report: aggregates.personal_patterns!, learning: [], profile: PROFILE, progress: null });
const lezioneRitorno = buildLezione({ report: aggregates.personal_patterns!, learning: RITORNO_LEARNING, profile: PROFILE, progress: null });

// The film loader only needs to answer for the featured game, at the ply the
// "prev" moves start from (25 - 4 = 21) — see film.ts.
const filmFixtures = new Map<string, GameAnalysis>([
  [LEZIONE_PREVIEW_GAME_ID, { moves: [{ ply: 21, fenBefore: FEATURED_START_FEN }] } as unknown as GameAnalysis],
]);
const previewFilmLoader: FilmLoader = async (gameId) => filmFixtures.get(gameId) ?? null;

// ── Fake engines for beat=gioco|fermata — never download Stockfish or Maia ──
// (§E of the slice-3 spec). Evaluate is keyed by exact FEN: the featured
// position (best e5f3), the position after the wrong a3, and after the good
// e5f3, matching the exact cpLoss thresholds the spec calls for.
const FEN_AFTER_A3 = (() => { const c = new Chess(FEATURED_FEN); c.move("a3"); return c.fen(); })();
const FEN_AFTER_NF3 = (() => { const c = new Chess(FEATURED_FEN); c.move("Nf3"); return c.fen(); })();
const NEUTRAL_EVAL: BatchEvalResult = { scoreCp: 0, mate: null, bestMoveUci: null, depth: 12, lines: [], pvUci: null };

function firstLegalUci(fen: string): string | null {
  try {
    const move = new Chess(fen).moves({ verbose: true })[0];
    return move ? `${move.from}${move.to}${move.promotion ?? ""}` : null;
  } catch {
    return null;
  }
}

// This route mounts inside AuthProvider (see App.tsx) but with no session, so
// AuthContext resets scopedStorage's activeUserId to null shortly after load —
// the real scopedStorage would silently no-op every read/write here. A plain
// fixed-key localStorage stand-in exercises the SAME resume logic in usePartita
// without depending on auth state, isolated from any real account's keys.
const PREVIEW_STORAGE_KEY = "dev-lezione-preview:partita";
const previewPersistence = {
  read: (): string | null => {
    try { return window.localStorage.getItem(PREVIEW_STORAGE_KEY); } catch { return null; }
  },
  write: (value: string): boolean => {
    try { window.localStorage.setItem(PREVIEW_STORAGE_KEY, value); return true; } catch { return false; }
  },
};

// `?beat=gioco&real`: the real Stockfish worker and the real Maia model (public/maia3),
// only the storage stays the preview's. A manual smoke check, never used by the e2e suite.
const giocoDepsReal: PartitaEngineDeps = { persistence: previewPersistence };

const giocoDeps: PartitaEngineDeps = {
  persistence: previewPersistence,
  evaluate: async (fen) => {
    if (fen === FEATURED_FEN) return { ...NEUTRAL_EVAL, scoreCp: 20, bestMoveUci: "e5f3" };
    if (fen === FEN_AFTER_A3) return { ...NEUTRAL_EVAL, scoreCp: 90 }; // cpLoss 20+90=110 >= 100 -> wrong
    if (fen === FEN_AFTER_NF3) return { ...NEUTRAL_EVAL, scoreCp: -20 }; // cpLoss 20-20=0 -> perfect
    return NEUTRAL_EVAL;
  },
  // Always resolves via Maia (source "maia_target_policy"): all the mass sits on
  // the first legal move, so sampling is deterministic regardless of rng.
  maiaPolicy: async (fen) => {
    const uci = firstLegalUci(fen);
    return { policy: uci ? { [uci]: 1 } : {} };
  },
  stockfishMove: async (fen) => firstLegalUci(fen),
  rng: () => 0,
};

// ── Preview shell: walks the same beats as the real routes, driven by ?beat= ──

export default function LezionePreview() {
  const [params, setParams] = useSearchParams();
  const beat = params.get("beat") ?? "apertura";
  const n = Math.max(1, Number(params.get("n") ?? "1"));

  const totalMomenti = useMemo(() => lezioneApertura?.momenti.length ?? 3, []);

  function goTo(nextBeat: string, nextN?: number, esito?: LezioneEsitoGioco) {
    const next = new URLSearchParams();
    next.set("beat", nextBeat);
    if (nextN != null) next.set("n", String(nextN));
    if (esito != null) next.set("esito", esito);
    setParams(next);
  }

  // Quaderno beats carry their own pattern/momento id in the URL (pid/mid) instead of a
  // real Link to /quaderno/... — this preview must stay on /dev/lezione, unauthenticated.
  function goToQuaderno(nextBeat: string, extra?: { pid?: string; mid?: string }) {
    const next = new URLSearchParams();
    next.set("beat", nextBeat);
    if (extra?.pid) next.set("pid", extra.pid);
    if (extra?.mid) next.set("mid", extra.mid);
    setParams(next);
  }

  if (beat === "ritorno") {
    return <AperturaView loading={false} error={false} lezione={lezioneRitorno} progress={null}
      refreshing={false} refreshError={null}
      onSediamoci={() => goTo("guardo", 1)} onRivediamola={() => goTo("guardo", 1)}
      onAggiorna={() => {}} onRiprova={() => {}} />;
  }
  if (beat === "quaderno") {
    return <QuadernoView loading={false} error={false} report={personalPatterns} learning={RITORNO_LEARNING}
      gamesAnalyzed={aggregates.games_analyzed} lastGameDate="2026-08-30" currentRating={1200} targetRating={1400}
      timeClass="rapid" todayPatternId={featuredPattern.id}
      refreshing={false} refreshError={null} refreshNotice={null}
      onAggiorna={() => {}} onRiprova={() => {}}
      onSelectPattern={(patternId) => goToQuaderno("quaderno-pattern", { pid: patternId })} />;
  }
  if (beat === "quaderno-pattern") {
    const pid = params.get("pid");
    const selected = personalPatterns.patterns.find((p) => p.id === pid) ?? featuredPattern;
    return <QuadernoPatternView loading={false} report={personalPatterns} pattern={selected} todayPatternId={featuredPattern.id} targetRating={1400}
      onBack={() => goToQuaderno("quaderno")}
      onSelectMomento={(momentoId) => goToQuaderno("quaderno-momento", { pid: selected.id, mid: momentoId })} />;
  }
  if (beat === "quaderno-momento") {
    const found = findMomento(personalPatterns, params.get("pid") ?? featuredPattern.id, params.get("mid") ?? featured.id);
    const lezione = found ? { ...lezioneApertura!, pattern: found.pattern, momenti: [found.momento] } : null;
    // Flat backstage nav (docs/GOAL_ESPERIENZA.md §3 "[Quaderno, backstage]"): back always reads
    // "Quaderno" and returns to the list, matching QuadernoMomento.tsx's real route.
    return <GuardoView loading={false} lezione={lezione} n={1} filmLoader={previewFilmLoader}
      onAvanti={() => {}}
      lettura={{ backTo: "/quaderno", backLabel: tr("Quaderno", "Notebook"), onBack: () => goToQuaderno("quaderno") }} />;
  }
  if (beat === "guardo") {
    return <GuardoView loading={false} lezione={lezioneApertura} n={n} filmLoader={previewFilmLoader}
      onAvanti={() => (n < totalMomenti ? goTo("guardo", n + 1) : goTo("gioco"))} />;
  }
  if (beat === "gioco") {
    return <GiocoView loading={false} lezione={lezioneApertura} onFine={(esito) => goTo("chiusura", undefined, esito)} deps={params.has("real") ? giocoDepsReal : giocoDeps} />;
  }
  if (beat === "fermata") {
    // Plays the wrong a2a3 once on mount through the real move/grading path,
    // so "fermata" is the actual "stopped" state, not a hand-built stand-in.
    return <GiocoView loading={false} lezione={lezioneApertura} onFine={(esito) => goTo("chiusura", undefined, esito)} deps={giocoDeps}
      autoPlayMoment={{ from: "a2", to: "a3" }} />;
  }
  if (beat === "chiusura") {
    const esito = (params.get("esito") as LezioneEsitoGioco | null) ?? "saltato";
    return <ChiusuraView loading={false} lezione={lezioneApertura} esitoGioco={esito} onVaiEGioca={() => goTo("apertura")} />;
  }
  return <AperturaView loading={false} error={false} lezione={lezioneApertura} progress={null}
    refreshing={false} refreshError={null}
    onSediamoci={() => goTo("guardo", 1)} onRivediamola={() => goTo("guardo", 1)}
    onAggiorna={() => {}} onRiprova={() => {}} />;
}
