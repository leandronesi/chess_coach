/**
 * lezione.ts — selection logic for the daily lesson (slice 2 of docs/GOAL_ESPERIENZA.md).
 *
 * Pure, deterministic, zero LLM: picks ONE pattern and up to three real moments
 * (Momento) from the personal pattern report, exactly the way REBUILD_GOAL's
 * pipeline already scored them. This module never touches Supabase or Storage;
 * callers (the lezione pages) fetch report/learning/profile and pass them in.
 */

import type { PatternOpportunity, PersonalPattern, PersonalPatternReport } from "../pipeline/personalPatterns";
import type { PatternLearning } from "../pipeline/patternLearning";
import type { LezioneProgress } from "./progress";

export type LezioneMode = "pattern" | "momento";
export type Esito = "errore" | "riuscita";

/**
 * Where the film's previous moves come from. Never invented: "prev" needs the
 * game's own analysis (see film.ts), "last" only knows the immediate reply,
 * "none" means neither is available.
 */
export type FilmSource =
  | { kind: "prev"; moves: string[] }
  | { kind: "last"; san: string }
  | { kind: "none" };

export interface Momento {
  opportunity: PatternOpportunity;
  esito: Esito;
  /** 1-based position of this momento within the lezione (1, 2, 3). Matches the "Guardo N di K" label. */
  indice: number;
  film: FilmSource;
}

export interface LezioneMemoria {
  partite: number;
  occasioni: number;
  errori: number;
  /** Fast decisions (pace) in the window; only meaningful when tempoNoto === occasioni. */
  veloci: number;
  /** Opportunities whose clock was known. */
  tempoNoto: number;
  /** Fewer than 5 opportunities: say so, do not claim a trend. */
  poche: boolean;
}

export interface LezioneProfile {
  currentRating: number | null;
  targetRating: number;
  timeClass: string;
}

export interface LezioneAggregati {
  partite: number;
  errori: number;
  /**
   * Among this pattern's error observations (cpLoss >= 100, from the full
   * observation ledger), how many were also flagged `fast === true` — moved
   * quickly despite time on the clock. Null when the ledger is unavailable
   * (older reports without `observations`): the apertura sentence shortens,
   * it never invents this figure.
   */
  velociConRiserva: number | null;
  /**
   * Quaderno-only: true when this is the pattern chosen for today's lezione.
   * Unused by fraseApertura/fraseRitorno — buildAggregati never sets it, the
   * Quaderno page adds it per row so fraseQuadernoPattern can close with
   * "Ci stiamo lavorando da oggi." Optional so the lezione's own aggregati
   * (built without this concept) stay valid without it.
   */
  isToday?: boolean;
}

export interface Lezione {
  mode: LezioneMode;
  pattern: PersonalPattern;
  momenti: Momento[];
  /** The moment slice 3's Gioco phase will replay. Always momenti[0]. */
  gioco: Momento | null;
  memoria: LezioneMemoria | null;
  profile: LezioneProfile;
  aggregati: LezioneAggregati;
  /** Pass-through of the saved progress this lezione was built alongside. Selection never reads it — see BuildLezioneInput. */
  progress: LezioneProgress | null;
}

export interface BuildLezioneInput {
  report: PersonalPatternReport | null;
  learning: PatternLearning[];
  profile: LezioneProfile;
  progress: LezioneProgress | null;
}

export function filmSourceOf(o: PatternOpportunity): FilmSource {
  if (o.previousMoves && o.previousMoves.length > 0) return { kind: "prev", moves: o.previousMoves };
  if (o.lastOpponentSan) return { kind: "last", san: o.lastOpponentSan };
  return { kind: "none" };
}

/** Wraps a single opportunity into a Momento — the Quaderno's read-only momento
 *  screens reuse this instead of duplicating pickMomenti's per-item shape. */
export function momentoFromOpportunity(o: PatternOpportunity, esito: Esito, indice = 1): Momento {
  return { opportunity: o, esito, indice, film: filmSourceOf(o) };
}

function hasExamples(p: PersonalPattern): boolean {
  return p.examples.length + p.successfulExamples.length > 0;
}

/** A lesson is about something to work on: it needs at least one real error to show and to replay. */
function hasErrorExample(p: PersonalPattern): boolean {
  return p.errors > 0 && p.examples.length > 0;
}

export type MotivoLezioneAssente = "senza_report" | "senza_partite" | "senza_errori";

/** Why buildLezione returned null, so the Apertura can say the true thing. */
export function motivoLezioneAssente(report: PersonalPatternReport | null): MotivoLezioneAssente {
  if (!report) return "senza_report";
  if (!report.patterns.some(hasExamples)) return "senza_partite";
  return "senza_errori";
}

/**
 * Picks the pattern for today. The report's patterns are already sorted by
 * priority, but that sort can put an "insufficient" pattern ahead of an
 * "observed" one on the games-desc tiebreak (insufficient-by-row-count can
 * still have more games). Searching for the first non-insufficient pattern
 * with real examples is equivalent to `patterns[0]` in the overwhelming
 * majority of reports and avoids that edge case silently picking a weaker
 * pattern. See the final report for this call.
 */
function pickPattern(report: PersonalPatternReport): { pattern: PersonalPattern; mode: LezioneMode } | null {
  // Recurring first, then merely observed: both need a real error, never a pattern the player already handles.
  const top = report.patterns.find((p) => p.evidence === "recurring" && hasErrorExample(p))
    ?? report.patterns.find((p) => p.evidence === "observed" && hasErrorExample(p));
  if (top) return { pattern: top, mode: "pattern" };
  const candidates = report.patterns.filter(hasErrorExample);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.errors - a.errors || b.games - a.games || a.id.localeCompare(b.id));
  return { pattern: candidates[0], mode: "momento" };
}

/**
 * Up to three moments from distinct games: the worst error, then a successful
 * choice if one exists from a different game, then the next worst errors.
 */
function pickMomenti(pattern: PersonalPattern): Momento[] {
  const used = new Set<string>();
  const momenti: Momento[] = [];
  function add(o: PatternOpportunity | undefined, esito: Esito) {
    if (!o || momenti.length >= 3 || used.has(o.gameId)) return;
    used.add(o.gameId);
    momenti.push({ opportunity: o, esito, indice: momenti.length + 1, film: filmSourceOf(o) });
  }
  add(pattern.examples[0], "errore");
  add(pattern.successfulExamples[0], "riuscita");
  for (let i = 1; i < pattern.examples.length && momenti.length < 3; i++) add(pattern.examples[i], "errore");
  return momenti;
}

function buildMemoria(pattern: PersonalPattern, learning: PatternLearning[]): LezioneMemoria | null {
  const entry = learning.find((l) => l.patternId === pattern.id && l.subsequent.opportunities > 0);
  if (!entry) return null;
  return {
    partite: entry.subsequent.games,
    occasioni: entry.subsequent.opportunities,
    errori: entry.subsequent.errors,
    veloci: entry.subsequent.fast,
    tempoNoto: entry.subsequent.timingKnown,
    poche: entry.subsequent.opportunities < 5,
  };
}

/** Exported: also drives each pattern row's frase in the Quaderno (Quaderno.tsx), not just today's lezione. */
export function buildAggregati(pattern: PersonalPattern, report: PersonalPatternReport): LezioneAggregati {
  const observations = report.observations;
  if (!observations) return { partite: pattern.games, errori: pattern.errors, velociConRiserva: null };
  const rows = observations.filter((o) => o.patternIds.includes(pattern.id));
  const errorRows = rows.filter((o) => o.cpLoss >= 100);
  const veloci = errorRows.filter((o) => o.fast === true).length;
  return { partite: pattern.games, errori: pattern.errors, velociConRiserva: veloci };
}

/**
 * Same as buildAggregati, tagged with whether `pattern` is the one today's
 * lezione would pick (Quaderno.tsx and QuadernoPattern.tsx share this so the
 * "Ci stiamo lavorando da oggi." tail agrees between the list row and the
 * pattern's own page — see fraseQuadernoPattern in voce.ts).
 */
export function buildQuadernoAggregati(pattern: PersonalPattern, report: PersonalPatternReport, todayPatternId: string | null): LezioneAggregati {
  return { ...buildAggregati(pattern, report), isToday: todayPatternId != null && pattern.id === todayPatternId };
}

export function buildLezione(input: BuildLezioneInput): Lezione | null {
  const { report, learning, profile, progress } = input;
  if (!report) return null;
  const picked = pickPattern(report);
  if (!picked) return null;
  const { pattern, mode } = picked;
  const momenti = pickMomenti(pattern);
  if (!momenti.length) return null;
  return {
    mode,
    pattern,
    momenti,
    gioco: momenti[0] ?? null,
    memoria: buildMemoria(pattern, learning),
    profile,
    aggregati: buildAggregati(pattern, report),
    progress,
  };
}
