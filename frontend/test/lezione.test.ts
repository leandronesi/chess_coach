import { describe, expect, it } from "vitest";
import { buildLezione, type BuildLezioneInput, type LezioneAggregati, type Momento } from "../src/lezione/lezione";
import {
  fraseApertura, fraseContesto, fraseVerdetto, fraseChiusura, fraseRitorno, sanItaliano,
  fraseQuadernoPattern, fraseProvaBreve, fraseQuadernoLearning, fraseQuadernoNessunConfronto,
  fraseLivelloIndisponibile, fraseNumeriQuaderno, fraseQuadernoApertura, fraseQuadernoCadenza,
} from "../src/lezione/voce";
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

describe("Quaderno — fraseQuadernoPattern (slice 4)", () => {
  it("hanging_piece: 'N volte in M partite', senza clausola quando il ledger non sa i veloci", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", errors: 11 });
    const agg: LezioneAggregati = { partite: 24, errori: 11, velociConRiserva: null };
    expect(fraseQuadernoPattern(p, agg)).toBe("11 volte in 24 partite.");
  });

  it("hanging_piece: aggiunge 'in pochi secondi' quando il ledger conosce il ritmo", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", errors: 11 });
    const agg: LezioneAggregati = { partite: 24, errori: 11, velociConRiserva: 6 };
    expect(fraseQuadernoPattern(p, agg)).toBe("11 volte in 24 partite, 6 in pochi secondi.");
  });

  it("hanging_piece: 'una volta' al singolare, capitalizzata come inizio frase", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", errors: 1 });
    const agg: LezioneAggregati = { partite: 2, errori: 1, velociConRiserva: null };
    expect(fraseQuadernoPattern(p, agg)).toBe("Una volta in 2 partite.");
  });

  it("fork usa la stessa clausola di hanging_piece", () => {
    const p = pattern({ id: "fork:a", kind: "fork", errors: 3 });
    const agg: LezioneAggregati = { partite: 5, errori: 3, velociConRiserva: null };
    expect(fraseQuadernoPattern(p, agg)).toBe("3 volte in 5 partite.");
  });

  it("back_rank usa la stessa clausola", () => {
    const p = pattern({ id: "back_rank:a", kind: "back_rank", errors: 4 });
    const agg: LezioneAggregati = { partite: 8, errori: 4, velociConRiserva: 2 };
    expect(fraseQuadernoPattern(p, agg)).toBe("4 volte in 8 partite, 2 in pochi secondi.");
  });

  it("keep_advantage usa la stessa clausola", () => {
    const p = pattern({ id: "keep_advantage:a", kind: "keep_advantage", errors: 4 });
    const agg: LezioneAggregati = { partite: 8, errori: 4, velociConRiserva: null };
    expect(fraseQuadernoPattern(p, agg)).toBe("4 volte in 8 partite.");
  });

  it("time_reserve legge fastDecisions su opportunities, non gli errori", () => {
    const p = pattern({ id: "time_reserve:a", kind: "time_reserve", opportunities: 10, fastDecisions: 6, errors: 2 });
    const agg: LezioneAggregati = { partite: 5, errori: 2, velociConRiserva: null };
    expect(fraseQuadernoPattern(p, agg)).toBe("6 volte su 10 hai mosso in pochi secondi con il tempo in riserva.");
  });

  it("time_pressure legge errori su opportunities", () => {
    const p = pattern({ id: "time_pressure:a", kind: "time_pressure", opportunities: 9, errors: 3 });
    const agg: LezioneAggregati = { partite: 4, errori: 3, velociConRiserva: null };
    expect(fraseQuadernoPattern(p, agg)).toBe("3 errori su 9 occasioni sotto i trenta secondi.");
  });

  it("narrow_choice legge errori su opportunities", () => {
    const p = pattern({ id: "narrow_choice:a", kind: "narrow_choice", opportunities: 12, errors: 5 });
    const agg: LezioneAggregati = { partite: 6, errori: 5, velociConRiserva: null };
    expect(fraseQuadernoPattern(p, agg)).toBe("5 volte su 12 dove c'erano due candidate vere.");
  });

  it("evidenza insufficient chiude con la frase sulla scarsita' di occasioni", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", errors: 2, evidence: "insufficient" });
    const agg: LezioneAggregati = { partite: 2, errori: 2, velociConRiserva: null };
    expect(fraseQuadernoPattern(p, agg)).toBe("2 volte in 2 partite. Sono poche occasioni: non lo chiamo ancora un'abitudine.");
  });

  it("il pattern della lezione di oggi chiude con 'Ci stiamo lavorando da oggi.'", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", errors: 2 });
    const agg: LezioneAggregati = { partite: 2, errori: 2, velociConRiserva: null, isToday: true };
    expect(fraseQuadernoPattern(p, agg)).toBe("2 volte in 2 partite. Ci stiamo lavorando da oggi.");
  });

  it("insufficient e isToday insieme mantengono entrambe le code, nell'ordine", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", errors: 2, evidence: "insufficient" });
    const agg: LezioneAggregati = { partite: 2, errori: 2, velociConRiserva: null, isToday: true };
    expect(fraseQuadernoPattern(p, agg)).toBe(
      "2 volte in 2 partite. Sono poche occasioni: non lo chiamo ancora un'abitudine. Ci stiamo lavorando da oggi.",
    );
  });

  it("nessuna frase contiene un em-dash", () => {
    const kinds: PatternKind[] = ["hanging_piece", "fork", "back_rank", "narrow_choice", "time_reserve", "time_pressure", "keep_advantage"];
    for (const kind of kinds) {
      const p = pattern({ id: `${kind}:a`, kind, errors: 3, opportunities: 9, fastDecisions: 3 });
      const agg: LezioneAggregati = { partite: 4, errori: 3, velociConRiserva: 1, isToday: true };
      expect(fraseQuadernoPattern(p, agg)).not.toContain("—");
    }
  });
});

describe("Quaderno — fraseProvaBreve (slice 4)", () => {
  function momento(overrides: Partial<PatternOpportunity> & { id: string; gameId: string }, esito: Momento["esito"] = "errore"): Momento {
    return { opportunity: opportunity(overrides), esito, indice: 1, film: { kind: "none" } };
  }

  it("errore: data, avversario, mossa, SAN in italiano e secondi, poi 'Ti e' sfuggito.'", () => {
    const m = momento({ id: "g1:25", gameId: "g1", playedAt: "2026-08-30T18:00:00Z", opponentRating: 1240, ply: 25, playedSan: "Nxe5" }, "errore");
    const frase = fraseProvaBreve(m);
    expect(frase).toContain("contro un 1240");
    expect(frase).toContain("mossa 13");
    expect(frase).toContain("Cxe5 in 6 secondi");
    expect(frase.endsWith("Ti e' sfuggito.")).toBe(true);
  });

  it("riuscita: chiude con 'L'hai vista.'", () => {
    const m = momento({ id: "g1:31", gameId: "g1", cpLoss: 10 }, "riuscita");
    expect(fraseProvaBreve(m).endsWith("L'hai vista.")).toBe(true);
  });

  it("senza orologio disponibile, non nomina i secondi", () => {
    const noClock: DecisionTiming = { ...TIMING_AVAILABLE, status: "missing_clock", clockBeforeSeconds: null, spentSeconds: null };
    const m = momento({ id: "g1:25", gameId: "g1", timing: noClock });
    expect(fraseProvaBreve(m)).not.toContain("secondi");
  });

  it("senza rating avversario, dice 'un avversario'", () => {
    const m = momento({ id: "g1:25", gameId: "g1", opponentRating: null });
    expect(fraseProvaBreve(m)).toContain("contro un avversario");
  });
});

describe("Quaderno — altre frasi (slice 4)", () => {
  it("fraseQuadernoApertura nomina le partite quando il conteggio c'e', altrimenti resta generica", () => {
    expect(fraseQuadernoApertura(24)).toContain("nelle tue 24 partite");
    expect(fraseQuadernoApertura(null)).toContain("nelle tue partite");
    expect(fraseQuadernoApertura(null)).not.toMatch(/\d/);
  });

  it("fraseQuadernoCadenza compone cadenza, partite lette e ultima data, con verbi", () => {
    const frase = fraseQuadernoCadenza("blitz", 24, "2026-08-30");
    expect(frase).toContain("Leggo le tue partite blitz.");
    expect(frase).toContain("Ho letto 24 partite");
    expect(frase).not.toContain("—");
  });

  it("fraseQuadernoCadenza senza cadenza o senza partite non inventa numeri", () => {
    expect(fraseQuadernoCadenza(null, null, null)).toContain("Non hai ancora scelto una cadenza");
    expect(fraseQuadernoCadenza(null, null, null)).toContain("Non ho ancora partite lette.");
  });

  it("fraseQuadernoLearning riporta riuscite/occasioni prima e dopo, con verbo", () => {
    const learning: PatternLearning = {
      excludedChronologyGames: 0, patternId: "hanging_piece:a", firstPracticedAt: "2026-08-01T00:00:00Z",
      practiceAttempts: 3, practiceSuccesses: 2, practiceWithHint: 0,
      baseline: { opportunities: 10, games: 5, errors: 6, fast: 4, timingKnown: 8, errorRate: 0.6, fastShare: 0.5 },
      subsequent: { opportunities: 12, games: 8, errors: 3, fast: 0, timingKnown: 4, errorRate: 0.25, fastShare: 0 },
      errorRateChange: -0.35,
    };
    const frase = fraseQuadernoLearning(learning, "hanging_piece");
    expect(frase).toContain("il pezzo in presa l'hai visto 9 volte su 12");
    expect(frase).toContain("Prima erano 4 su 10");
    expect(frase).not.toContain("Sono poche partite");
  });

  it("fraseQuadernoLearning avverte quando il campione dopo l'esercizio e' ancora piccolo (< 5)", () => {
    const learning: PatternLearning = {
      excludedChronologyGames: 0, patternId: "hanging_piece:a", firstPracticedAt: "2026-08-01T00:00:00Z",
      practiceAttempts: 3, practiceSuccesses: 2, practiceWithHint: 0,
      baseline: { opportunities: 0, games: 0, errors: 0, fast: 0, timingKnown: 0, errorRate: null, fastShare: null },
      subsequent: { opportunities: 3, games: 2, errors: 1, fast: 0, timingKnown: 0, errorRate: null, fastShare: null },
      errorRateChange: null,
    };
    expect(fraseQuadernoLearning(learning, "hanging_piece")).toContain("Sono poche partite: ne servono almeno dieci per dirlo davvero.");
  });

  it("fraseQuadernoLearning segnala le partite senza orario escluse dal confronto", () => {
    const learning: PatternLearning = {
      excludedChronologyGames: 2, patternId: "hanging_piece:a", firstPracticedAt: "2026-08-01T00:00:00Z",
      practiceAttempts: 3, practiceSuccesses: 2, practiceWithHint: 0,
      baseline: { opportunities: 0, games: 0, errors: 0, fast: 0, timingKnown: 0, errorRate: null, fastShare: null },
      subsequent: { opportunities: 12, games: 8, errors: 2, fast: 0, timingKnown: 0, errorRate: null, fastShare: null },
      errorRateChange: null,
    };
    expect(fraseQuadernoLearning(learning, "hanging_piece")).toContain("2 partite senza orario sono fuori dal confronto.");
  });

  it("fraseQuadernoNessunConfronto non inventa un pattern specifico", () => {
    expect(fraseQuadernoNessunConfronto()).toBe("Il confronto comincia dopo la prima lezione giocata.");
  });

  it("fraseLivelloIndisponibile riporta scored su eligible, con verbo", () => {
    const p = pattern({ id: "hanging_piece:a", kind: "hanging_piece", maia: { eligible: 9, selected: 9, scored: 2, currentSupport: null, targetSupport: null } });
    expect(fraseLivelloIndisponibile(p)).toBe("Maia non ha abbastanza posizioni confrontate per dirlo: 2 su 9 idonee.");
  });

  it("fraseNumeriQuaderno mette ogni numero dentro una frase con un verbo", () => {
    const p = pattern({
      id: "hanging_piece:a", kind: "hanging_piece", opportunities: 20, games: 10, errors: 11, errorGames: 6, fastDecisions: 4,
      maia: { eligible: 9, selected: 7, scored: 5, currentSupport: null, targetSupport: null },
    });
    const righe = fraseNumeriQuaderno(p);
    expect(righe).toHaveLength(5);
    expect(righe.join(" ")).toContain("20 volte in 10 partite");
    expect(righe.join(" ")).toContain("11 volte");
    expect(righe.join(" ")).toContain("6 partite diverse");
    expect(righe.join(" ")).toContain("4 volte");
    expect(righe.join(" ")).toContain("9 posizioni");
    expect(righe.join(" ")).toContain("valutate 5");
    expect(righe.join(" ")).toContain("campione era di 7 posizioni");
    expect(righe.join(" ")).toContain("non e' una stima della popolazione.");
    for (const riga of righe) expect(riga).not.toContain("—");
  });
});
