import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  createPartita, applyUserMove, applyBotMove, stopAtMoment, resumeAfterStop,
  takeback, browse, tick, esitoGioco, evalToWhite, currentFen,
  CAP_PLIES_AFTER_MOMENT, type PartitaState, type FirstTry,
} from "../src/lezione/partita";
import type { Momento } from "../src/lezione/lezione";
import type { PatternOpportunity } from "../src/pipeline/personalPatterns";
import type { DecisionTiming } from "../src/pipeline/decisionTiming";
import type { OpponentMoveSelection } from "../src/session/opponentPolicy";

// ── Fixtures ─────────────────────────────────────────────────────────────

const TIMING_AVAILABLE: DecisionTiming = {
  version: 1, status: "available", clockBeforeSeconds: 246, spentSeconds: 6,
  reserve: "ample", pace: "fast", context: "other_choice", eligible: true, excludedReason: null,
  thresholds: { fastSeconds: 5, ampleSeconds: 60, pressureSeconds: 18 },
};

// Same canvas position used across the project: white knight hanging on e5,
// bestUci e5f3 saves it, a2a3 ignores it. Verified reachable via chess.js
// elsewhere (see frontend/src/pages/dev/LezionePreview.tsx).
const FEATURED_FEN = "r1bq1rk1/ppp1bppp/2np1n2/4N3/2B1P3/2N5/PPP2PPP/R1BQ1RK1 w - - 0 13";
const SIMPLE_FEN = "4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1";
const PROMO_FEN = "8/1P6/8/6k1/8/8/7K/8 w - - 0 1";

function opportunity(overrides: Partial<PatternOpportunity> = {}): PatternOpportunity {
  return {
    id: "g1:25", gameId: "g1", startedAt: null, playedAt: "2026-08-01T12:00:00Z", kinds: ["hanging_piece"],
    scope: "blitz:180:2:middlegame", timeClass: "blitz", baseSeconds: 180, incrementSeconds: 2,
    opponentRating: 1240, phase: "middlegame", ply: 25,
    fen: FEATURED_FEN, color: "white", playedUci: "a2a3", playedSan: "a3", lastOpponentSan: "d6",
    previousMoves: ["Bc4", "Nc6", "Ne5", "d6"], bestUci: "e5f3", acceptableUcis: ["e5f3"],
    cpLoss: 150, scoreBeforeCp: 20, clockRemaining: 240, timing: TIMING_AVAILABLE,
    ...overrides,
  } as PatternOpportunity;
}

function momento(oppOverrides: Partial<PatternOpportunity> = {}): Momento {
  return { opportunity: opportunity(oppOverrides), esito: "errore", indice: 1, film: { kind: "none" } };
}

const PROFILE = { currentRating: 1200, targetRating: 1400, timeClass: "blitz" };

const OPP: OpponentMoveSelection = {
  uci: "h7h6", opponent_source: "maia_target_policy", fallback_reason: null,
  unavailable_reason: null, maia_domain: "chesscom_blitz_cross_platform", sampled_policy_mass: 0.8,
};

function wrongGrading(): FirstTry {
  return { uci: "a2a3", san: "a3", cpLoss: 280, verdict: "wrong", thinkMs: 1200 };
}
function goodGrading(verdict: "perfect" | "ok" = "perfect"): FirstTry {
  return { uci: "e5f3", san: "Nf3", cpLoss: verdict === "perfect" ? 0 : 60, verdict, thinkMs: 900 };
}

/** A legal, non-repeating sequence of half-moves, picked deterministically so the cap
 *  test never has to worry about accidentally hitting checkmate/stalemate/repetition. */
function longNonRepeatingSequence(startFen: string, count: number): { uci: string }[] {
  const chess = new Chess(startFen);
  const seen = new Set<string>([chess.fen().split(" ").slice(0, 4).join(" ")]);
  const seq: { uci: string }[] = [];
  for (let i = 0; i < count; i++) {
    const moves = chess.moves({ verbose: true });
    const chosen = moves.find((m) => {
      const probe = new Chess(chess.fen());
      probe.move(m.san);
      return !seen.has(probe.fen().split(" ").slice(0, 4).join(" "));
    });
    if (!chosen) throw new Error("fixture: no non-repeating move available");
    chess.move(chosen.san);
    seen.add(chess.fen().split(" ").slice(0, 4).join(" "));
    seq.push({ uci: `${chosen.from}${chosen.to}${chosen.promotion ?? ""}` });
  }
  return seq;
}

function playUserMove(state: PartitaState, uci: string) {
  const res = applyUserMove(state, uci.slice(0, 2), uci.slice(2, 4), uci.length > 4 ? uci.slice(4, 5) : undefined);
  if (!("move" in res) || !res.move) throw new Error(`unexpected applyUserMove failure: ${JSON.stringify(res)}`);
  return res.state;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("applyUserMove — legalita' e turni", () => {
  it("rifiuta una mossa illegale", () => {
    const state = createPartita(momento(), PROFILE);
    const result = applyUserMove(state, "a2", "a5");
    expect("error" in result && result.error).toBe("illegal");
    expect(result.state).toBe(state);
  });

  it("rifiuta una mossa mentre il bot sta pensando", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "e5f3");
    state = stopAtMoment(state, goodGrading());
    expect(state.phase).toBe("bot_thinking");
    const attempt = applyUserMove(state, "c6", "d4");
    expect("error" in attempt && attempt.error).toBe("not_your_turn");
  });

  it("rifiuta una mossa mentre si sta sfogliando", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "e5f3");
    state = stopAtMoment(state, goodGrading());
    state = applyBotMove(state, "h7h6", OPP);
    state = browse(state, 0);
    expect(state.cursor).toBe(0);
    const attempt = applyUserMove(state, "c6", "d4");
    expect("error" in attempt && attempt.error).toBe("browsing");
  });
});

describe("il momento: stop e ripensaci", () => {
  it("prima mossa sbagliata -> stopped, il bot non risponde", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "a2a3");
    expect(state.phase).toBe("playing"); // pending grading, bot not asked yet
    state = stopAtMoment(state, wrongGrading());
    expect(state.phase).toBe("stopped");
    expect(state.moves).toHaveLength(1);
    expect(state.momento.firstTry?.verdict).toBe("wrong");
    expect(state.momento.passed).toBe(false);
  });

  it("Ripensaci in stop ritira solo la mossa utente e tookBackAfterStop = true", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "a2a3");
    state = stopAtMoment(state, wrongGrading());
    state = takeback(state);
    expect(state.moves).toHaveLength(0);
    expect(state.phase).toBe("playing");
    expect(state.momento.tookBackAfterStop).toBe(true);
    expect(state.takebacks).toBe(1);
  });

  it("'Lascio cosi'' lascia la mossa sbagliata sul tabellone e fa rispondere il bot", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "a2a3");
    state = stopAtMoment(state, wrongGrading());
    state = resumeAfterStop(state);
    expect(state.phase).toBe("bot_thinking");
    expect(state.moves).toHaveLength(1);
    expect(state.momento.tookBackAfterStop).toBe(false);
  });

  it("prima mossa buona -> passed = true e il bot puo' rispondere", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "e5f3");
    state = stopAtMoment(state, goodGrading());
    expect(state.momento.passed).toBe(true);
    expect(state.phase).toBe("bot_thinking");
    state = applyBotMove(state, OPP.uci!, OPP);
    expect(state.moves).toHaveLength(2);
    expect(state.moves[1].by).toBe("bot");
    expect(state.phase).toBe("playing");
  });

  it("un tentativo riuscito dopo il ritiro resta 'ritirato': il primo tentativo e' l'esito, l'ultimo guida il feedback", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "a2a3");
    state = stopAtMoment(state, wrongGrading());
    state = takeback(state);
    state = playUserMove(state, "e5f3");
    state = stopAtMoment(state, goodGrading());
    expect(state.phase).toBe("bot_thinking");
    expect(state.momento.tookBackAfterStop).toBe(true);
    expect(state.momento.firstTry?.verdict).toBe("wrong");
    expect(state.momento.lastTry?.verdict).not.toBe("wrong");
    expect(state.momento.passed).toBe(true);
    expect(esitoGioco(state)).toBe("ritirato");
  });
});

describe("orologio e pause", () => {
  it("una pausa (bot che pensa, fermata) non viene addebitata al ritorno del turno", () => {
    let state = createPartita(momento(), PROFILE);
    state = { ...state, clock: { ...state.clock, userMs: 60_000, running: true, lastTickAt: null } };
    state = tick(state, 1_000);
    state = tick(state, 2_000);
    expect(state.clock.userMs).toBe(59_000);
    // The moment move: the board is now the bot's turn, the grading is in flight -> guarded.
    state = playUserMove(state, "e5f3");
    const afterIncrement = 59_000 + state.clock.incrementMs;
    state = tick(state, 12_000);
    expect(state.clock.userMs).toBe(afterIncrement);
    expect(state.clock.lastTickAt).toBeNull();
    state = stopAtMoment(state, goodGrading());
    state = applyBotMove(state, OPP.uci!, OPP);
    // Back on the user's turn: the first tick starts from now, the ten seconds away are not charged.
    state = tick(state, 20_000);
    expect(state.clock.userMs).toBe(afterIncrement);
    state = tick(state, 21_000);
    expect(state.clock.userMs).toBe(afterIncrement - 1_000);
  });
});

describe("takeback durante la partita normale", () => {
  it("dopo la risposta del bot ritira due semimosse", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "e5f3");
    state = stopAtMoment(state, goodGrading());
    state = applyBotMove(state, "h7h6", OPP);
    expect(state.moves).toHaveLength(2);
    state = takeback(state);
    expect(state.moves).toHaveLength(0);
    expect(state.phase).toBe("playing");
    expect(state.takebacks).toBe(1);
  });

  it("se l'avversario sta pensando, il ripensaci toglie solo la mossa dell'utente", () => {
    let state = createPartita(momento(), PROFILE);
    state = playUserMove(state, "e5f3");
    state = stopAtMoment(state, goodGrading());
    expect(state.phase).toBe("bot_thinking");
    state = takeback(state);
    expect(state.moves).toHaveLength(0);
    expect(state.phase).toBe("playing");
  });
});

describe("tick e orologio", () => {
  it("consuma tempo quando e' il turno dell'utente e la partita e' in gioco", () => {
    const base = createPartita(momento(), PROFILE);
    const t0 = 1_000_000;
    const primed = tick(base, t0);
    const after = tick(primed, t0 + 500);
    expect(after.clock.userMs).toBe((base.clock.userMs ?? 0) - 500);
  });

  it("non consuma durante 'stopped'", () => {
    const base = createPartita(momento(), PROFILE);
    const stopped: PartitaState = { ...base, phase: "stopped" };
    const ticked = tick(stopped, Date.now() + 5000);
    expect(ticked).toBe(stopped);
  });

  it("non consuma durante 'bot_thinking'", () => {
    const base = createPartita(momento(), PROFILE);
    const thinking: PartitaState = { ...base, phase: "bot_thinking" };
    const ticked = tick(thinking, Date.now() + 5000);
    expect(ticked).toBe(thinking);
  });

  it("non consuma mentre si sfoglia la lista mosse", () => {
    const base = createPartita(momento(), PROFILE);
    const browsing: PartitaState = { ...base, cursor: -1 };
    const ticked = tick(browsing, Date.now() + 5000);
    expect(ticked).toBe(browsing);
  });

  it("bandierina: a zero finisce la partita per 'flag', vince il bot", () => {
    const base = createPartita(momento(), PROFILE);
    const short: PartitaState = { ...base, clock: { ...base.clock, userMs: 400 } };
    const t0 = 1_000_000;
    const primed = tick(short, t0);
    const flagged = tick(primed, t0 + 1000);
    expect(flagged.phase).toBe("over");
    expect(flagged.over).toEqual({ reason: "flag", winner: "bot" });
    expect(flagged.clock.userMs).toBe(0);
  });
});

describe("tetto delle 20 semimosse dopo il momento", () => {
  it("finisce con reason 'cap' dopo 20 semimosse dalla risoluzione del momento", () => {
    let state = createPartita(momento({ fen: SIMPLE_FEN, playedSan: "e3", playedUci: "e2e3", bestUci: "e2e4" }), PROFILE);
    state = playUserMove(state, "e2e3");
    state = stopAtMoment(state, { uci: "e2e3", san: "e3", cpLoss: 0, verdict: "perfect", thinkMs: 500 });
    expect(state.phase).toBe("bot_thinking");

    const seq = longNonRepeatingSequence(currentFen(state), CAP_PLIES_AFTER_MOMENT + 4);
    let botTurn = true;
    for (const mv of seq) {
      if (state.phase === "over") break;
      state = botTurn ? applyBotMove(state, mv.uci, OPP) : playUserMove(state, mv.uci);
      botTurn = !botTurn;
    }
    expect(state.over).toEqual({ reason: "cap", winner: null });
    expect(state.pliesAfterMoment).toBe(CAP_PLIES_AFTER_MOMENT);
  });
});

describe("fine partita per matto", () => {
  it("matto del bot: la partita finisce, vince il bot", () => {
    const state: PartitaState = {
      startFen: "r3k3/8/8/8/8/8/5PPP/7K b - - 0 1",
      userColor: "white", targetRating: 1400, timeClass: "blitz",
      moves: [], cursor: null,
      clock: { userMs: 60000, incrementMs: 0, running: true, lastTickAt: null },
      phase: "bot_thinking", over: null,
      momento: { firstTry: goodGrading(), tookBackAfterStop: false, passed: true },
      takebacks: 0, pliesAfterMoment: 1, opponent: null,
      evalWhiteCp: null, evalMate: null, pendingPromotion: null,
    };
    const next = applyBotMove(state, "a8a1", OPP);
    expect(next.phase).toBe("over");
    expect(next.over).toEqual({ reason: "checkmate", winner: "bot" });
  });
});

describe("promozione in due passi", () => {
  it("prima richiede la scelta del pezzo, poi completa la mossa", () => {
    const state = createPartita(momento({ fen: PROMO_FEN, playedSan: "b8=Q", playedUci: "b7b8q", bestUci: "b7b8q" }), PROFILE);
    const step1 = applyUserMove(state, "b7", "b8");
    if (!("move" in step1)) throw new Error("unexpected error");
    expect(step1.move).toBeNull();
    expect(step1.state.phase).toBe("promotion");
    expect(step1.state.pendingPromotion).toEqual({ from: "b7", to: "b8" });

    const step2 = applyUserMove(step1.state, "b7", "b8", "q");
    if (!("move" in step2) || !step2.move) throw new Error("unexpected error");
    expect(step2.move.san).toContain("=Q");
    expect(step2.state.pendingPromotion).toBeNull();
    expect(step2.state.moves).toHaveLength(1);
  });
});

describe("evalToWhite — conversione al punto di vista del bianco", () => {
  it("non inverte quando tocca al bianco", () => {
    expect(evalToWhite(80, null, "white")).toEqual({ whiteCp: 80, whiteMate: null });
  });
  it("inverte il segno quando tocca al nero", () => {
    expect(evalToWhite(80, null, "black")).toEqual({ whiteCp: -80, whiteMate: null });
  });
  it("matto: il segno segue lo stesso schema del cp", () => {
    expect(evalToWhite(null, 3, "white")).toEqual({ whiteCp: null, whiteMate: 3 });
    expect(evalToWhite(null, 3, "black")).toEqual({ whiteCp: null, whiteMate: -3 });
  });
});

describe("esitoGioco nei quattro casi", () => {
  it("saltato quando il momento non e' stato giocato", () => {
    const state = createPartita(momento(), PROFILE);
    expect(esitoGioco(state)).toBe("saltato");
  });
  it("fermato quando la prova finale non e' wrong", () => {
    const base = createPartita(momento(), PROFILE);
    const state: PartitaState = { ...base, momento: { firstTry: goodGrading(), tookBackAfterStop: false, passed: true } };
    expect(esitoGioco(state)).toBe("fermato");
  });
  it("sbagliato quando wrong e mai ritirata", () => {
    const base = createPartita(momento(), PROFILE);
    const state: PartitaState = { ...base, momento: { firstTry: wrongGrading(), tookBackAfterStop: false, passed: false } };
    expect(esitoGioco(state)).toBe("sbagliato");
  });
  it("ritirato quando wrong e ritirata", () => {
    const base = createPartita(momento(), PROFILE);
    const state: PartitaState = { ...base, momento: { firstTry: wrongGrading(), tookBackAfterStop: true, passed: false } };
    expect(esitoGioco(state)).toBe("ritirato");
  });
});
