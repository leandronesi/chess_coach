/**
 * film.ts — resolves the starting FEN for a Guardo "film" (the 3-4 moves
 * before the decision).
 *
 * The opportunity itself only carries the previous moves as SAN (see
 * PatternOpportunity.previousMoves); the FEN they start from is not part of
 * the personal-pattern report. It has to be read back from the game's own
 * analysis JSON (GameAnalysis.moves[].fenBefore at the matching ply) — the
 * same Storage object the Tavolo already downloads via
 * `downloadJson(analysisPath(userId, chessComUuid))` (see auth/storage.ts).
 *
 * This module never touches Storage directly: callers inject a `loader` so
 * the dev preview can hand in a synthetic GameAnalysis instead of a network
 * call. Any failure (missing game, missing ply, network error) degrades to
 * "last" or "none" — the board is already showing the opportunity's own FEN,
 * the film is a progressive enhancement, never a blocker.
 */

import type { GameAnalysis } from "../pipeline/analyze";
import type { Momento } from "./lezione";

export type FilmLoader = (gameId: string) => Promise<GameAnalysis | null>;

export type ResolvedFilm =
  | { kind: "prev"; startFen: string; moves: string[] }
  | { kind: "last" }
  | { kind: "none" };

export async function loadFilm(momento: Momento, loader: FilmLoader): Promise<ResolvedFilm> {
  const source = momento.film;
  if (source.kind !== "prev") {
    return source.kind === "last" ? { kind: "last" } : { kind: "none" };
  }
  try {
    const analysis = await loader(momento.opportunity.gameId);
    const targetPly = momento.opportunity.ply - source.moves.length;
    const entry = analysis?.moves.find((m) => m.ply === targetPly);
    if (!entry) throw new Error("lezione_film_ply_not_found");
    return { kind: "prev", startFen: entry.fenBefore, moves: source.moves };
  } catch {
    if (momento.opportunity.lastOpponentSan) return { kind: "last" };
    return { kind: "none" };
  }
}
