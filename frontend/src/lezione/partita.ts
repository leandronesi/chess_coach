/**
 * partita.ts — pure state machine for the Gioco phase (slice 3 of
 * docs/GOAL_ESPERIENZA.md §3 "[Gioco]"). Zero I/O, zero engines: every
 * transition takes a state and returns a new one. usePartita.ts glues this to
 * Stockfish/Maia/timers/storage; Gioco.tsx only renders `PartitaState`.
 *
 * Key design point: the moment is judged on the FIRST attempt. `firstTry` is
 * set once and never overwritten; every later attempt at the pristine
 * position (after a takeback) is graded into `lastTry`, which drives the
 * on-screen feedback and whether the game continues, but not the outcome
 * that is saved. A wrong first try followed by a takeback reads "ritirato",
 * never "fermato": the saved attempt must not claim a success that was
 * reached only after Nonno stopped the hand.
 */

import { Chess } from "chess.js";
import type { Momento, LezioneProfile } from "./lezione";
import type { LezioneEsitoGioco } from "./progress";
import type { OpponentMoveSelection } from "../session/opponentPolicy";

export type PartitaBy = "user" | "bot";
export type PartitaPhase = "playing" | "bot_thinking" | "stopped" | "promotion" | "over";
export type PartitaOverReason = "checkmate" | "stalemate" | "draw" | "flag" | "cap" | "exit";
export type PartitaVerdict = "perfect" | "ok" | "wrong";

export interface PartitaMove {
  san: string;
  uci: string;
  fenAfter: string;
  by: PartitaBy;
  thinkMs: number | null;
}

export interface PartitaClock {
  userMs: number | null;
  incrementMs: number;
  running: boolean;
  lastTickAt: number | null;
}

export interface PartitaOverInfo {
  reason: PartitaOverReason;
  winner: "user" | "bot" | null;
}

export interface FirstTry {
  uci: string;
  san: string;
  cpLoss: number;
  verdict: PartitaVerdict;
  thinkMs: number | null;
}

export interface MomentoState {
  /** The first graded attempt at the moment. Set once; the saved outcome. */
  firstTry: FirstTry | null;
  /** The latest graded attempt at the pristine position; feeds the feedback line and the stop card. */
  lastTry: FirstTry | null;
  tookBackAfterStop: boolean;
  passed: boolean | null;
}

export interface PendingPromotion {
  from: string;
  to: string;
}

export interface PartitaState {
  startFen: string;
  userColor: "white" | "black";
  targetRating: number;
  timeClass: string;
  moves: PartitaMove[];
  /** null = live position (after the last move). Otherwise an index into
   *  `moves` (0..moves.length-2) or -1 for the start position — see browse(). */
  cursor: number | null;
  clock: PartitaClock;
  phase: PartitaPhase;
  over: PartitaOverInfo | null;
  momento: MomentoState;
  takebacks: number;
  pliesAfterMoment: number;
  opponent: OpponentMoveSelection | null;
  evalWhiteCp: number | null;
  evalMate: number | null;
  pendingPromotion: PendingPromotion | null;
}

export type ApplyMoveError = "illegal" | "not_your_turn" | "browsing";
export type ApplyMoveResult =
  | { state: PartitaState; move: PartitaMove | null }
  | { state: PartitaState; error: ApplyMoveError };

/** Half-moves allowed after the moment resolves before the game force-ends ("Basta cosi'"). */
export const CAP_PLIES_AFTER_MOMENT = 20;

function colorChar(color: "white" | "black"): "w" | "b" {
  return color === "white" ? "w" : "b";
}

// ── Position helpers ─────────────────────────────────────────────────────

export function currentFen(state: PartitaState): string {
  return state.moves.length ? state.moves[state.moves.length - 1].fenAfter : state.startFen;
}

/** The FEN the board should actually render: the browsed frame, or the live position. */
export function displayedFen(state: PartitaState): string {
  if (state.cursor === null) return currentFen(state);
  if (state.cursor < 0) return state.startFen;
  return state.moves[state.cursor]?.fenAfter ?? state.startFen;
}

export function isUserTurn(state: PartitaState): boolean {
  try {
    return new Chess(currentFen(state)).turn() === colorChar(state.userColor);
  } catch {
    return false;
  }
}

// ── Creation ─────────────────────────────────────────────────────────────

export function createPartita(momento: Momento, profile: LezioneProfile): PartitaState {
  const o = momento.opportunity;
  const clockKnown = o.timing.status === "available" && o.timing.clockBeforeSeconds !== null;
  return {
    startFen: o.fen,
    userColor: o.color,
    targetRating: profile.targetRating,
    timeClass: profile.timeClass,
    moves: [],
    cursor: null,
    clock: {
      userMs: clockKnown ? Math.round((o.timing.clockBeforeSeconds as number) * 1000) : null,
      incrementMs: Math.round((o.incrementSeconds ?? 0) * 1000),
      running: true,
      lastTickAt: null,
    },
    phase: "playing",
    over: null,
    momento: { firstTry: null, lastTry: null, tookBackAfterStop: false, passed: null },
    takebacks: 0,
    pliesAfterMoment: 0,
    opponent: null,
    evalWhiteCp: null,
    evalMate: null,
    pendingPromotion: null,
  };
}

// ── Ending ───────────────────────────────────────────────────────────────

export function finish(state: PartitaState, reason: PartitaOverReason): PartitaState {
  let winner: "user" | "bot" | null = null;
  if (reason === "checkmate") {
    try {
      const matedSide = new Chess(currentFen(state)).turn(); // side to move is the mated side
      winner = matedSide === colorChar(state.userColor) ? "bot" : "user";
    } catch {
      winner = null;
    }
  } else if (reason === "flag") {
    winner = "bot";
  }
  return { ...state, phase: "over", over: { reason, winner }, clock: { ...state.clock, running: false } };
}

export function flag(state: PartitaState): PartitaState {
  return finish(state, "flag");
}

function checkGameEnd(state: PartitaState, chess: Chess): PartitaState | null {
  if (!chess.isGameOver()) return null;
  const reason: PartitaOverReason = chess.isCheckmate() ? "checkmate" : chess.isStalemate() ? "stalemate" : "draw";
  return finish(state, reason);
}

/** Shared tail of every move application: game-over check, then the ply cap, then the next phase. */
function settleAfterMove(state: PartitaState, chess: Chess, nextPhaseIfOngoing: PartitaPhase): PartitaState {
  const ended = checkGameEnd(state, chess);
  if (ended) return ended;
  if (state.momento.passed !== null && state.pliesAfterMoment >= CAP_PLIES_AFTER_MOMENT) {
    return finish(state, "cap");
  }
  return { ...state, phase: nextPhaseIfOngoing };
}

// ── Moves ────────────────────────────────────────────────────────────────

export function applyUserMove(state: PartitaState, from: string, to: string, promotion?: string): ApplyMoveResult {
  if (state.cursor !== null) return { state, error: "browsing" };
  if (state.phase === "promotion") {
    if (!promotion || !state.pendingPromotion || state.pendingPromotion.from !== from || state.pendingPromotion.to !== to) {
      return { state, error: "not_your_turn" };
    }
  } else if (state.phase !== "playing") {
    return { state, error: "not_your_turn" };
  }

  let chess: Chess;
  try {
    chess = new Chess(currentFen(state));
  } catch {
    return { state, error: "illegal" };
  }
  if (chess.turn() !== colorChar(state.userColor)) return { state, error: "not_your_turn" };

  const candidates = chess.moves({ verbose: true }).filter((m) => m.from === from && m.to === to);
  if (!candidates.length) return { state, error: "illegal" };

  if (candidates.some((m) => m.promotion) && !promotion) {
    return { state: { ...state, phase: "promotion", pendingPromotion: { from, to } }, move: null };
  }

  let mv;
  try {
    mv = chess.move({ from, to, promotion });
  } catch {
    return { state, error: "illegal" };
  }
  if (!mv) return { state, error: "illegal" };

  const move: PartitaMove = { san: mv.san, uci: `${from}${to}${mv.promotion ?? ""}`, fenAfter: chess.fen(), by: "user", thinkMs: null };
  const isMomentAttempt = state.moves.length === 0;
  const clock = state.clock.userMs !== null ? { ...state.clock, userMs: state.clock.userMs + state.clock.incrementMs } : state.clock;

  let next: PartitaState = {
    ...state,
    moves: [...state.moves, move],
    pendingPromotion: null,
    clock,
    // A fresh attempt at the pristine position: the grading is in flight, so no
    // verdict is current. firstTry is untouched (the first swing is the outcome).
    momento: isMomentAttempt ? { ...state.momento, lastTry: null, passed: null } : state.momento,
  };

  if (isMomentAttempt) {
    // The hook grades this move (Stockfish before/after) and calls stopAtMoment;
    // the bot must not be asked to reply before that verdict lands.
    next.phase = "playing";
  } else {
    next.pliesAfterMoment = state.momento.passed !== null ? state.pliesAfterMoment + 1 : state.pliesAfterMoment;
    next = settleAfterMove(next, chess, "bot_thinking");
  }

  return { state: next, move };
}

export function applyBotMove(state: PartitaState, uci: string, selection: OpponentMoveSelection): PartitaState {
  let chess: Chess;
  try {
    chess = new Chess(currentFen(state));
  } catch {
    return state;
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
  let mv;
  try {
    mv = chess.move({ from, to, promotion });
  } catch {
    mv = null;
  }
  if (!mv) return state;

  const move: PartitaMove = { san: mv.san, uci, fenAfter: chess.fen(), by: "bot", thinkMs: null };
  const pliesAfterMoment = state.momento.passed !== null ? state.pliesAfterMoment + 1 : state.pliesAfterMoment;
  const next: PartitaState = { ...state, moves: [...state.moves, move], opponent: selection, pliesAfterMoment };
  return settleAfterMove(next, chess, "playing");
}

// ── The moment: grading, stop, resume ───────────────────────────────────

export function stopAtMoment(state: PartitaState, grading: FirstTry): PartitaState {
  const passed = grading.verdict !== "wrong";
  const momento: MomentoState = { ...state.momento, firstTry: state.momento.firstTry ?? grading, lastTry: grading, passed };
  const withMomento: PartitaState = { ...state, momento, pliesAfterMoment: 0 };
  if (!passed) {
    return { ...withMomento, phase: "stopped" };
  }
  const lastMove = withMomento.moves[withMomento.moves.length - 1];
  let chess: Chess;
  try {
    chess = new Chess(lastMove.fenAfter);
  } catch {
    return { ...withMomento, phase: "bot_thinking" };
  }
  return settleAfterMove(withMomento, chess, "bot_thinking");
}

/** "Lascio cosi'": leaves the wrong move on the board and lets the bot reply. */
export function resumeAfterStop(state: PartitaState): PartitaState {
  if (state.phase !== "stopped") return state;
  const lastMove = state.moves[state.moves.length - 1];
  let chess: Chess;
  try {
    chess = new Chess(lastMove.fenAfter);
  } catch {
    return { ...state, phase: "bot_thinking" };
  }
  return settleAfterMove(state, chess, "bot_thinking");
}

// ── Takeback ─────────────────────────────────────────────────────────────

/**
 * Pops the last one or two plies (both the user's move and the bot's reply,
 * when one already landed), unlimited. From "stopped" there is only ever the
 * user's move to pop, which is exactly "ritira solo la tua mossa" — the
 * overlay's primary Ripensaci and the row-6 secondary one share this function.
 */
export function takeback(state: PartitaState): PartitaState {
  if (state.phase === "over" || state.phase === "promotion") return state;
  if (!state.moves.length) return state;
  const last = state.moves[state.moves.length - 1];
  const popCount = last.by === "bot" && state.moves.length >= 2 ? 2 : 1;
  const moves = state.moves.slice(0, state.moves.length - popCount);
  const wasStopped = state.phase === "stopped";
  return {
    ...state,
    moves,
    cursor: null,
    phase: "playing",
    over: null,
    takebacks: state.takebacks + 1,
    momento: wasStopped ? { ...state.momento, tookBackAfterStop: true } : state.momento,
    pliesAfterMoment: state.momento.passed !== null ? Math.max(0, state.pliesAfterMoment - popCount) : state.pliesAfterMoment,
  };
}

// ── Browsing the move list ───────────────────────────────────────────────

export function browse(state: PartitaState, cursor: number | null): PartitaState {
  if (cursor === null) return { ...state, cursor: null };
  const maxCursor = state.moves.length - 2;
  if (maxCursor < -1) return { ...state, cursor: null };
  return { ...state, cursor: Math.max(-1, Math.min(cursor, maxCursor)) };
}

// ── Clock ────────────────────────────────────────────────────────────────

export function setClockRunning(state: PartitaState, running: boolean, now: number): PartitaState {
  if (state.clock.running === running) return state;
  return { ...state, clock: { ...state.clock, running, lastTickAt: running ? now : state.clock.lastTickAt } };
}

/**
 * Consumes wall-clock time from the user's reserve. Self-guards on phase,
 * cursor and whose turn it is (not just `clock.running`) so a caller cannot
 * accidentally drain the clock during the stop overlay, while the bot
 * thinks, while browsing, or during the async gap while the first move is
 * being graded (phase is still "playing" there, but it is not the user's
 * turn on the board yet).
 */
export function tick(state: PartitaState, now: number): PartitaState {
  if (!state.clock.running || state.phase !== "playing" || state.cursor !== null || state.clock.userMs === null || !isUserTurn(state)) {
    // Not consuming: forget the last tick so the pause (bot thinking, the stop
    // overlay, browsing) is never charged to the player when the turn resumes.
    return state.clock.lastTickAt === null ? state : { ...state, clock: { ...state.clock, lastTickAt: null } };
  }
  const last = state.clock.lastTickAt ?? now;
  const elapsed = Math.max(0, now - last);
  const userMs = Math.max(0, state.clock.userMs - elapsed);
  const next: PartitaState = { ...state, clock: { ...state.clock, userMs, lastTickAt: now } };
  return userMs <= 0 ? flag(next) : next;
}

// ── Eval bar ─────────────────────────────────────────────────────────────

/** Stockfish scores are from the side-to-move's POV; the bar always reads from White's. */
export function evalToWhite(scoreCp: number | null, mate: number | null, sideToMove: "white" | "black"): { whiteCp: number | null; whiteMate: number | null } {
  const flip = sideToMove === "black";
  if (mate !== null) return { whiteCp: null, whiteMate: flip ? -mate : mate };
  if (scoreCp === null) return { whiteCp: null, whiteMate: null };
  return { whiteCp: flip ? -scoreCp : scoreCp, whiteMate: null };
}

export function setEval(state: PartitaState, whiteCp: number | null, whiteMate: number | null): PartitaState {
  return { ...state, evalWhiteCp: whiteCp, evalMate: whiteMate };
}

// ── Outcome ──────────────────────────────────────────────────────────────

export function esitoGioco(state: PartitaState): LezioneEsitoGioco {
  const ft = state.momento.firstTry;
  if (!ft) return "saltato";
  if (ft.verdict !== "wrong") return "fermato";
  if (state.momento.tookBackAfterStop) return "ritirato";
  return "sbagliato";
}
