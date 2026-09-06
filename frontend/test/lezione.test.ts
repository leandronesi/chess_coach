import { describe, expect, it } from "vitest";
import { buildLezione, type BuildLezioneInput } from "../src/lezione/lezione";
import { fraseApertura, fraseContesto, fraseVerdetto, fraseChiusura, fraseRitorno, sanItaliano } from "../src/lezione/voce";
import { isCompletedToday, todayLocal, type LezioneProgress } from "../src/lezione/progress";
import { PATTERN_VERSION, type PatternKind, type PatternOpportunity, type PersonalPattern, type PersonalPatternReport } from "../src/pipeline/personalPatterns";
import type { PatternLearning } from "../src/pipeline/patternLearning";
import type { DecisionTiming } from "../src/pipeline/decisionTiming";

// ── Fixture factories — only the fields buildLezione/voce actually read are meaningful. ──

const TIMING_AVAILABLE: DecisionTiming = {
  version: 1, status: "available", clockBeforeSeconds: 246, spentSeconds: 6,
  reserve: "ample", pace: "fast", context: "other_choice", eligible: true, excludedReason: null,
  thresholds: { fastSeconds: 5, ampleSeconds: 60, pressureSeconds: 18 },
};

function opportunity(overrides: Partial<PatternOpportunity> & { id: string; gameId: string }): PatternOpportunity {
  return {
    startedAt: null, playedAt: "2026-08-01T12:00:00Z", kinds: ["hanging_piece"],
    scope: "blitz:180:0:middlegame", timeClass: "blitz", baseSeconds: 180, incrementSeconds: 0,
    opponentRating: 1240, phase: "middlegame", ply: 25,
    fen: "r1bq1rk1/ppp1bppp/2np1n2/4N3/2B1P3/2N5/PPP2PPP/R1BQ1RK1 w - - 0 13",
    color: "white", playedUci: "a2a3", playedSan: "a3", lastOpponentSan: "d6",
    previousMoves: ["Bc4", "Nc6", "Ne5", "d6"], bestUci: "e5f3", acceptableUcis: ["e5f3"],
    cpLoss: 150, scoreBeforeCp: 20, clockRemaining: 240, timing: TIMING_AVAILABLE,
    ...overrides,
  } as PatternOpportunity;
}

function pattern(overrides: Partial<PersonalPattern> & { id: string; kind: PatternKind }): PersonalPattern {
  return {
    scope: "blitz:180:0:middlegame", opportunities: 10, games: 5, errors: 4, errorGames: 4,
    handled: 3, fastDecisions: 2, evidence: "recurring", priority: 10,
    examples: [], successfulExamples: [],
    maia: { eligible: 0, selected: 0, scored: 0, currentSupport: null, targetSupport: null },
    ...overrides,
  } as PersonalPattern;
}

function report(overrides: Partial<PersonalPatternReport> & { patterns: PersonalPattern[] }): PersonalPatternReport {
  return {
    version: PATTERN_VERSION, currentRating: 1200, targetRating: 1400,
    opportunities: 0, sampled: 0, sampling: "pattern_game_balanced_outcome_independent",
    observations: [], ...overrides,
  } as PersonalPatternReport;
}

const PROFILE = { currentRating: 1200, targetRating: 1400, timeClass: "blitz" };

function input(partial: Partial<BuildLezioneInput>): BuildLezioneInput {
  return { report: null, learning: [], profile: PROFILE, progress: null, ...partial };
}

describe("buildLezione — selezione", () => {
  it("sceglie il primo pattern non insufficient", () => {
    const top = pattern({ id: "hanging_piece:a", kind: "hanging_piece", evidence: "recurring", examples: [opportunity({ id: "g1:25", gameId: "g1" })] });
    const other = pattern({ id: "fork:a", kind: "fork", evidence: "recurring", priority: 999, examples: [opportunity({ id: "g9:25", gameId: "g9" })] });
    const lezione = buildLezione(input({ report: report({ patterns: [top, other] }) }));
    expect(lezione?.pattern.id).toBe("hanging_piece:a");
    expect(lezione?.mode).toBe("pattern");
  });

  it("prende i momenti da partite distinte, in ordine", () => {
    const p = pattern({
      id: "hanging_piece:a", kind: "hanging_piece",
      examples: [
        opportunity({ id: "g1:25", gameId: "g1", cpLoss: 300 }),
        opportunity({ id: "g2:25", gameId: "g2", cpLoss: 200 }),
        opportunity({ id: "g3:25", gameId: "g3", cpLoss: 150 }),
      ],
    });
    const lezione = buildLezione(input({ report: report({ patterns: [p] }) }));
    expect(lezione?.momenti.map((m) => m.opportunity.gameId)).toEqual(["g1", "g2", "g3"]);
    expect(lezione?.momenti.every((m) => m.esito === "errore")).toBe(true);
    expect(lezione?.momenti.map((m) => m.indice)).toEqual([1, 2, 3]);
  });

  it("mette la scelta riuscita al secondo posto quando viene da un'altra partita", () => {
    const p = pattern({
      id: "hanging_piece:a", kind: "hanging_piece",
      examples: [opportunity({ id: "g1:25", gameId: "g1" })],
      successfulExamples: [opportunity({ id: "g2:31", gameId: "g2", cpLoss: 10 })],
    });
    const lezione = buildLezione(input({ report: report({ patterns: [p] }) }));
    expect(lezione?.momenti).toHaveLength(2);
    expect(lezione?.momenti[0]).toMatchObject({ esito: "errore" });
    expect(lezione?.momenti[1]).toMatchObject({ esito: "riuscita" });
    expect(lezione?.momenti[1].opportunity.gameId).toBe("g2");
  });

  it("ha meno di 3 momenti quando mancano esempi distinti", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", examples: [opportunity({ id: "g1:25", gameId: "g1" })] });
    const lezione = buildLezione(input({ report: report({ patterns: [p] }) }));
    expect(lezione?.momenti).toHaveLength(1);
  });

  it("passa a mode momento quando tutti i pattern sono insufficient ma uno ha esempi", () => {
    const weak = pattern({ id: "fork:a", kind: "fork", evidence: "insufficient", errors: 0, successfulExamples: [opportunity({ id: "g1:25", gameId: "g1", cpLoss: 10 })] });
    const strong = pattern({ id: "hanging_piece:a", kind: "hanging_piece", evidence: "insufficient", errors: 1, examples: [opportunity({ id: "g2:25", gameId: "g2" })] });
    const lezione = buildLezione(input({ report: report({ patterns: [weak, strong] }) }));
    expect(lezione?.mode).toBe("momento");
    expect(lezione?.pattern.id).toBe("hanging_piece:a");
  });

  it("ritorna null quando nessun pattern ha esempi", () => {
    const empty = pattern({ id: "fork:a", kind: "fork", evidence: "insufficient", examples: [], successfulExamples: [] });
    const lezione = buildLezione(input({ report: report({ patterns: [empty] }) }));
    expect(lezione).toBeNull();
  });

  it("ritorna null senza report", () => {
    expect(buildLezione(input({ report: null }))).toBeNull();
  });
});

describe("voce — numeri e silenzi", () => {
  it("fraseApertura riporta i numeri veri dagli aggregati e dal ledger", () => {
    const observations = [
      { id: "g1:25", gameId: "g1", playedAt: "2026-08-01T12:00:00Z", patternIds: ["hanging_piece:a"], cpLoss: 150, fast: true },
      { id: "g2:25", gameId: "g2", playedAt: "2026-08-02T12:00:00Z", patternIds: ["hanging_piece:a"], cpLoss: 150, fast: false },
      { id: "g3:25", gameId: "g3", playedAt: "2026-08-03T12:00:00Z", patternIds: ["hanging_piece:a"], cpLoss: 10, fast: null },
    ];
    const p = pattern({
      id: "hanging_piece:a", kind: "hanging_piece", games: 24, errors: 11,
      examples: [opportunity({ id: "g1:25", gameId: "g1" })],
    });
    const lezione = buildLezione(input({ report: report({ patterns: [p], observations }) }))!;
    expect(lezione.aggregati).toMatchObject({ partite: 24, errori: 11, velociConRiserva: 1 });
    const frase = fraseApertura(lezione);
    expect(frase).toContain("24");
    expect(frase).toContain("11");
    expect(frase).toContain("1 di quelle");
    expect(frase).toContain("Oggi ne guardiamo uno, poi lo giochi tu.");
  });

  it("fraseApertura con un solo momento usa la forma singolare", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", examples: [opportunity({ id: "g1:25", gameId: "g1" })] });
    const lezione = buildLezione(input({ report: report({ patterns: [p] }) }))!;
    expect(lezione.momenti).toHaveLength(1);
    expect(fraseApertura(lezione)).toContain("Oggi ne guardiamo uno, poi lo giochi tu.");
  });

  it("nessuna frase del percorso principale contiene un em-dash", () => {
    const p = pattern({
      id: "hanging_piece:a", kind: "hanging_piece",
      examples: [opportunity({ id: "g1:25", gameId: "g1" })],
      successfulExamples: [opportunity({ id: "g2:31", gameId: "g2", cpLoss: 10 })],
    });
    const lezione = buildLezione(input({ report: report({ patterns: [p] }) }))!;
    const frasi = [
      fraseApertura(lezione),
      fraseContesto(lezione.momenti[0]),
      fraseVerdetto(lezione.momenti[0]),
      fraseVerdetto(lezione.momenti[1]),
      fraseChiusura(lezione, "fermato"),
      fraseChiusura(lezione, "sbagliato"),
      fraseChiusura(lezione, "saltato"),
    ];
    for (const frase of frasi) expect(frase).not.toContain("—");
  });

  it("senza orologio disponibile, il contesto e il verdetto non lo nominano", () => {
    const noClock: DecisionTiming = { ...TIMING_AVAILABLE, status: "missing_clock", clockBeforeSeconds: null, spentSeconds: null };
    const momento = { opportunity: opportunity({ id: "g1:25", gameId: "g1", timing: noClock }), esito: "errore" as const, indice: 1, film: { kind: "none" as const } };
    expect(fraseContesto(momento)).not.toContain("sull'orologio");
    expect(fraseVerdetto(momento)).not.toContain("secondi");
  });

  it("quando buildMoveReason non trova un fatto, il verdetto cade sulla mossa del motore", () => {
    const quiet = opportunity({
      id: "g1:21", gameId: "g1",
      fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      color: "white", playedSan: "Nc3", playedUci: "b1c3", bestUci: "g1f3", lastOpponentSan: "e5",
    });
    const momento = { opportunity: quiet, esito: "errore" as const, indice: 1, film: { kind: "none" as const } };
    const frase = fraseVerdetto(momento);
    expect(frase).toContain("Il motore preferiva Cf3.");
  });

  it("sanItaliano traduce solo la lettera del pezzo, mai la casa", () => {
    expect(sanItaliano("Ne5")).toBe("Ce5");
    expect(sanItaliano("Nxe5")).toBe("Cxe5");
    expect(sanItaliano("Qh4+")).toBe("Dh4+");
    expect(sanItaliano("e8=Q")).toBe("e8=D");
    expect(sanItaliano("O-O")).toBe("O-O");
    expect(sanItaliano("a3")).toBe("a3");
  });
});

describe("progress — una lezione al giorno", () => {
  it("completedAt conta solo se il record e' di oggi", () => {
    const today: LezioneProgress = { patternId: "x", date: todayLocal(), beat: "fine", momento: 3, esitoGioco: "saltato", completedAt: new Date().toISOString() };
    const stale: LezioneProgress = { ...today, date: "2020-01-01" };
    expect(isCompletedToday(today)).toBe(true);
    expect(isCompletedToday(stale)).toBe(false);
    expect(isCompletedToday(null)).toBe(false);
    expect(isCompletedToday({ ...today, completedAt: null })).toBe(false);
  });
});

describe("memoria — il Ritorno", () => {
  it("con subsequent presente, la frase di ritorno porta i denominatori veri", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", examples: [opportunity({ id: "g1:25", gameId: "g1" })] });
    const learning: PatternLearning[] = [{
      excludedChronologyGames: 0, patternId: "hanging_piece:a", firstPracticedAt: "2026-08-01T00:00:00Z",
      practiceAttempts: 3, practiceSuccesses: 2, practiceWithHint: 0,
      baseline: { opportunities: 0, games: 0, errors: 0, fast: 0, timingKnown: 0, errorRate: null, fastShare: null },
      subsequent: { opportunities: 5, games: 6, errors: 1, fast: 0, timingKnown: 0, errorRate: null, fastShare: null },
      errorRateChange: null,
    }];
    const lezione = buildLezione(input({ report: report({ patterns: [p] }), learning }))!;
    // opportunities: 5 is the exact boundary used by the dev preview (§E) — not "poche" (< 5).
    expect(lezione.memoria).toMatchObject({ partite: 6, occasioni: 5, errori: 1, poche: false });
    const frase = fraseRitorno(lezione);
    expect(frase).toContain("Ho letto le 6 partite nuove.");
    expect(frase).toContain("Il pezzo in presa l'hai visto 4 volte su 5.");
    expect(frase).not.toContain("Sono poche partite ancora");
  });

  it("con meno di 5 occasioni, la frase dice esplicitamente che il campione e' piccolo", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", examples: [opportunity({ id: "g1:25", gameId: "g1" })] });
    const learning: PatternLearning[] = [{
      excludedChronologyGames: 0, patternId: "hanging_piece:a", firstPracticedAt: "2026-08-01T00:00:00Z",
      practiceAttempts: 3, practiceSuccesses: 2, practiceWithHint: 0,
      baseline: { opportunities: 0, games: 0, errors: 0, fast: 0, timingKnown: 0, errorRate: null, fastShare: null },
      subsequent: { opportunities: 3, games: 2, errors: 1, fast: 0, timingKnown: 0, errorRate: null, fastShare: null },
      errorRateChange: null,
    }];
    const lezione = buildLezione(input({ report: report({ patterns: [p] }), learning }))!;
    expect(lezione.memoria).toMatchObject({ poche: true });
    expect(fraseRitorno(lezione)).toContain("Sono poche partite ancora, ma la mano sta cambiando.");
  });
});
