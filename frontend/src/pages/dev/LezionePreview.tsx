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
import { assessDecisionTiming } from "../../pipeline/decisionTiming";
import { buildPersonalPatternReport, type PatternOpportunity } from "../../pipeline/personalPatterns";
import type { PatternLearning } from "../../pipeline/patternLearning";
import type { GameAnalysis } from "../../pipeline/analyze";
import type { FilmLoader } from "../../lezione/film";
import { buildLezione } from "../../lezione/lezione";
import { emptySyntheticAggregates } from "./syntheticPatterns";
import { AperturaView } from "../lezione/Apertura";
import { GuardoView } from "../lezione/Guardo";
import { ChiusuraView } from "../lezione/Chiusura";
import { GiocoView } from "../lezione/Gioco";

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

const opportunities = [featured, ...fillerErrors, success, ...padding];
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

// ── Preview shell: walks the same beats as the real routes, driven by ?beat= ──

export default function LezionePreview() {
  const [params, setParams] = useSearchParams();
  const beat = params.get("beat") ?? "apertura";
  const n = Math.max(1, Number(params.get("n") ?? "1"));

  const totalMomenti = useMemo(() => lezioneApertura?.momenti.length ?? 3, []);

  function goTo(nextBeat: string, nextN?: number) {
    const next = new URLSearchParams();
    next.set("beat", nextBeat);
    if (nextN != null) next.set("n", String(nextN));
    setParams(next);
  }

  if (beat === "ritorno") {
    return <AperturaView loading={false} error={false} lezione={lezioneRitorno} progress={null}
      refreshing={false} refreshError={null}
      onSediamoci={() => goTo("guardo", 1)} onRivediamola={() => goTo("guardo", 1)}
      onAggiorna={() => {}} onRiprova={() => {}} />;
  }
  if (beat === "guardo") {
    return <GuardoView loading={false} lezione={lezioneApertura} n={n} filmLoader={previewFilmLoader}
      onAvanti={() => (n < totalMomenti ? goTo("guardo", n + 1) : goTo("gioco"))} />;
  }
  if (beat === "gioco" || beat === "fermata") {
    // Both render the same placeholder in this slice — the real Gioco phase (with its own
    // "fermata" pattern-stop) is slice 3's job. Expected red on the referee until then.
    return <GiocoView onVaiAvanti={() => goTo("chiusura")} />;
  }
  if (beat === "chiusura") {
    return <ChiusuraView loading={false} lezione={lezioneApertura} esitoGioco="saltato" onVaiEGioca={() => goTo("apertura")} />;
  }
  return <AperturaView loading={false} error={false} lezione={lezioneApertura} progress={null}
    refreshing={false} refreshError={null}
    onSediamoci={() => goTo("guardo", 1)} onRivediamola={() => goTo("guardo", 1)}
    onAggiorna={() => {}} onRiprova={() => {}} />;
}
