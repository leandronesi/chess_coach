/**
 * syntheticPatterns.ts — shared scaffolding for dev-only synthetic data.
 *
 * Extracted from PatternPreview.tsx (§E of the slice-2 spec: "estrai la
 * costruzione dei dati ... per non duplicare") so LezionePreview.tsx does not
 * repeat the same Aggregates boilerplate. Explicitly synthetic, dev-only:
 * never imported outside `src/pages/dev/`.
 */

import type { Aggregates } from "../../pipeline/aggregate";

export const zeroPhase = { moves: 0, blunders: 0, mistakes: 0, inaccuracies: 0, blunder_pct: 0, mistake_pct: 0, inaccuracy_pct: 0, avg_cp_loss: 0 };
export const zeroColor = { games: 0, wins: 0, draws: 0, losses: 0, win_rate: 0, avg_cp_loss: 0, blunder_pct: 0 };

/**
 * Fills every boilerplate zero-value field an Aggregates object needs, so a
 * preview only supplies what it actually varies (games_analyzed,
 * personal_patterns, timing, ...).
 */
export function emptySyntheticAggregates(overrides: Partial<Aggregates> & { games_analyzed: number }): Aggregates {
  return {
    generated_at: "2026-09-05T00:00:00Z",
    player_moves_total: overrides.games_analyzed * 4,
    blunder_pct: 0, mistake_pct: 0, inaccuracy_pct: 0, avg_cp_loss: 0,
    by_phase: { opening: zeroPhase, middlegame: zeroPhase, endgame: zeroPhase },
    by_color: { white: zeroColor, black: zeroColor },
    by_time_class: {},
    anchors: [], weaknesses: [],
    ...overrides,
  } as Aggregates;
}
