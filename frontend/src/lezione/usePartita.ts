/**
 * usePartita.ts — glues the pure state machine in partita.ts to engines,
 * timers and storage for the Gioco phase (slice 3 of docs/GOAL_ESPERIENZA.md).
 *
 * One Stockfish instance owned by this hook (destroyed on unmount), Maia via
 * the shared getMaiaEngine() singleton (same wiring as PlayStep.tsx's
 * engineMove()), chooseTargetOpponentMove reused as-is. `deps` lets the dev
 * preview and tests inject fully deterministic fake engines — when every
 * field is supplied, this hook never touches a real Worker or ONNX model.
 */

import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  createPartita, applyUserMove, applyBotMove, stopAtMoment, resumeAfterStop,
  takeback, browse, tick, finish, esitoGioco, evalToWhite, setEval, setClockRunning,
  currentFen, displayedFen, type PartitaState, type FirstTry,
} from "./partita";
import type { Momento, LezioneProfile } from "./lezione";
import type { LezioneEsitoGioco } from "./progress";
import { chooseTargetOpponentMove, OpponentSelectionAbortedError } from "../session/opponentPolicy";
import { StockfishEngine, type BatchEvalResult } from "../pipeline/stockfishWorker";
import { getMaiaEngine } from "../pipeline/maia/maiaEngine";
import { gradePracticeMove } from "../session/patternPractice";
import { recordTrainingAttempt, type TrainingAttemptInput } from "../trainingProgress";
import { scopedStorage } from "../auth/userStorage";
import { tr } from "../i18n/lang";

const GRADE_DEPTH = 12;
const EVAL_DEPTH = 10;
const PARTITA_STORAGE_KEY = "lezione:v1:partita";
/** Read by Chiusura.tsx's "Riprova" row — see readPendingPartitaSave/clearPendingPartitaSave. */
export const PARTITA_PENDING_SAVE_KEY = "lezione:v1:gioco-save";

export interface PartitaStorage {
  read: () => string | null;
  write: (value: string) => boolean;
}

export interface PartitaEngineDeps {
  /** Test hook: overrides the Maia budget per opponent turn (default 15 s, model load included). */
  maiaTimeoutMs?: number;
  evaluate?: (fen: string, depth: number) => Promise<BatchEvalResult>;
  maiaPolicy?: (fen: string, rating: number) => Promise<{ policy: Record<string, number> }>;
  stockfishMove?: (fen: string) => Promise<string | null>;
  rng?: () => number;
  /**
   * Overrides scopedStorage for the full-game persistence key. The dev
   * preview mounts with no AuthProvider session, so the real scopedStorage
   * would otherwise be a silent no-op (activeUserId stays null) — it injects
   * a plain localStorage-backed PartitaStorage instead, exercising the same
   * read/resume logic without depending on auth state.
   */
  persistence?: PartitaStorage;
}

const defaultStorage: PartitaStorage = {
  read: () => scopedStorage.getItem(PARTITA_STORAGE_KEY),
  write: (value) => scopedStorage.setItem(PARTITA_STORAGE_KEY, value),
};

interface PersistedPartita {
  version: 1;
  positionId: string;
  clientAttemptId: string;
  state: PartitaState;
}

function isPersistedPartita(value: unknown): value is PersistedPartita {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && typeof v.positionId === "string" && typeof v.clientAttemptId === "string"
    && typeof v.state === "object" && v.state !== null;
}

/**
 * Reload-resume: "stopped"/"promotion" cannot be resumed mid-flight (see the
 * slice-3 delivery notes), so phase is re-derived from whose turn it actually
 * is — a stopped-but-not-retracted position simply behaves like "Lascio
 * cosi'" was already chosen, and the bot gets asked for a reply.
 */
function resumeState(raw: PartitaState): PartitaState {
  // A persisted lastTickAt is stale by definition: the time away from the page is not playing time.
  const persisted: PartitaState = { ...raw, momento: { ...raw.momento, lastTry: raw.momento.lastTry ?? null }, clock: { ...raw.clock, lastTickAt: null } };
  if (persisted.phase === "over") return { ...persisted, cursor: null };
  let turnIsUser = true;
  try {
    turnIsUser = new Chess(currentFen(persisted)).turn() === (persisted.userColor === "white" ? "w" : "b");
  } catch {
    turnIsUser = true;
  }
  return { ...persisted, cursor: null, pendingPromotion: null, phase: turnIsUser ? "playing" : "bot_thinking" };
}

function readPersisted(storage: PartitaStorage, positionId: string): { state: PartitaState; clientAttemptId: string } | null {
  const raw = storage.read();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isPersistedPartita(parsed) || parsed.positionId !== positionId) return null;
    return { state: resumeState(parsed.state), clientAttemptId: parsed.clientAttemptId };
  } catch {
    return null;
  }
}

function writePersisted(storage: PartitaStorage, positionId: string, clientAttemptId: string, state: PartitaState): void {
  storage.write(JSON.stringify({ version: 1, positionId, clientAttemptId, state }));
}

function buildTrainingAttemptInput(state: PartitaState, momento: Momento, patternId: string, clientAttemptId: string): TrainingAttemptInput {
  const ft = state.momento.firstTry;
  if (!ft) throw new Error("partita: cannot build a training attempt before the moment is graded");
  const o = momento.opportunity;
  const responseMs = ft.thinkMs;
  const timingInRange = responseMs !== null && Number.isFinite(responseMs) && responseMs >= 0 && responseMs <= 3_600_000;
  return {
    clientAttemptId,
    anchorKey: patternId,
    sourceGameId: o.gameId,
    positionId: o.id,
    mode: "drill",
    playedUci: ft.uci,
    verdict: ft.verdict,
    correct: ft.verdict !== "wrong",
    usedHint: state.momento.tookBackAfterStop,
    responseMs: timingInRange ? responseMs : null,
    context: {
      exercise: "gioco",
      esito: esitoGioco(state),
      takebacks: state.takebacks,
      plies: state.moves.length,
      over_reason: state.over?.reason ?? null,
      opponent_source: state.opponent?.opponent_source ?? null,
      original_clock_before_seconds: o.timing.status === "available" ? o.timing.clockBeforeSeconds : null,
      original_spent_seconds: o.timing.status === "available" ? o.timing.spentSeconds : null,
      time_class: o.timeClass,
      base_seconds: o.baseSeconds,
      increment_seconds: o.incrementSeconds,
      pattern_version: 1,
      response_clock_status: timingInRange ? "recorded" : "outside_column_range",
    },
  };
}

/**
 * Fire-and-forget save. Writes the blob to storage BEFORE the network call so
 * a closed tab still leaves something for Chiusura's "Riprova" to retry; the
 * blob is cleared only once the write is confirmed. Never a silent catch —
 * a failure is logged (rule: fai emergere gli errori) and stays retryable.
 */
function attemptSave(input: TrainingAttemptInput): void {
  scopedStorage.setItem(PARTITA_PENDING_SAVE_KEY, JSON.stringify(input));
  recordTrainingAttempt(input)
    .then(() => { scopedStorage.removeItem(PARTITA_PENDING_SAVE_KEY); })
    .catch((error: unknown) => {
      console.error("lezione: salvataggio del tentativo di gioco fallito", error);
    });
}

export interface UsePartitaResult {
  state: PartitaState;
  /** True while the first (or retried) attempt at the moment is being graded — input must be disabled. */
  busy: boolean;
  /** Set when neither engine responds; Gioco.tsx shows this instead of the normal end-of-game phrase. */
  engineError: string | null;
  displayFen: string;
  esito: LezioneEsitoGioco;
  /** Returns whether the drop was accepted (illegal/not-your-turn/browsing return false so BoardView snaps back). */
  move: (from: string, to: string, promotion?: string) => boolean;
  takebackMove: () => void;
  /** "Lascio cosi'": leaves the wrong move on the board and lets the bot reply. */
  leaveAsIs: () => void;
  browseTo: (cursor: number | null) => void;
  /** For the chrome "Esci" control: saves the attempt if one was made, returns the esito to persist+navigate with. */
  exit: () => LezioneEsitoGioco;
}

export function usePartita(momento: Momento, profile: LezioneProfile, patternId: string, deps?: PartitaEngineDeps): UsePartitaResult {
  const storage = deps?.persistence ?? defaultStorage;
  const [positionId] = useState(() => momento.opportunity.id);
  const [clientAttemptId] = useState(() => readPersisted(storage, positionId)?.clientAttemptId ?? crypto.randomUUID());
  const [state, setState] = useState<PartitaState>(() => readPersisted(storage, positionId)?.state ?? createPartita(momento, profile));
  const [busy, setBusy] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const mountedRef = useRef(true);
  const savedRef = useRef(false);
  const gradeTokenRef = useRef(0);
  const botTokenRef = useRef(0);
  const turnStartRef = useRef(Date.now());
  const engineRef = useRef<StockfishEngine | null>(null);

  function getEngine(): StockfishEngine {
    if (!engineRef.current) engineRef.current = new StockfishEngine();
    return engineRef.current;
  }
  function evaluate(fen: string, depth: number): Promise<BatchEvalResult> {
    return deps?.evaluate ? deps.evaluate(fen, depth) : getEngine().evaluate(fen, depth);
  }
  async function stockfishMove(fen: string): Promise<string | null> {
    if (deps?.stockfishMove) return deps.stockfishMove(fen);
    const result = await getEngine().evaluate(fen, GRADE_DEPTH);
    return result.bestMoveUci;
  }
  async function maiaPolicy(fen: string, rating: number): Promise<{ policy: Record<string, number> }> {
    if (deps?.maiaPolicy) return deps.maiaPolicy(fen, rating);
    const engine = getMaiaEngine();
    await engine.waitReady();
    return engine.evaluate(fen, rating, rating);
  }

  useEffect(() => {
    mountedRef.current = true;
    // Warm Maia up now: the model load (~45 MB, WASM init) is what makes the
    // first opponent turn time out and fall back to Stockfish. Cold it needs
    // more than the 4.5 s default; warm it answers in under a second.
    if (!deps?.maiaPolicy) {
      getMaiaEngine().waitReady().catch((error: unknown) => {
        console.warn("lezione: Maia non pronta, la prima risposta potrebbe venire da Stockfish", error);
      });
    }
    return () => {
      mountedRef.current = false;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // Reset the decision-time clock whenever it is freshly the user's turn to act.
  useEffect(() => {
    if (state.phase === "playing" && state.cursor === null) turnStartRef.current = Date.now();
  }, [state.moves.length, state.phase, state.cursor]);

  // ── Grading the moment (Stockfish before/after, depth 12) ──────────────
  async function gradeMoment(startFen: string, moveUci: string, moveSan: string, fenAfter: string, thinkMs: number) {
    const token = ++gradeTokenRef.current;
    setBusy(true);
    try {
      const [before, after] = await Promise.all([evaluate(startFen, GRADE_DEPTH), evaluate(fenAfter, GRADE_DEPTH)]);
      if (!mountedRef.current || token !== gradeTokenRef.current) return;
      const { cpLoss, verdict } = gradePracticeMove(before, after);
      const grading: FirstTry = { uci: moveUci, san: moveSan, cpLoss, verdict, thinkMs };
      setState((s) => stopAtMoment(s, grading));
    } catch (error) {
      console.error("lezione: valutazione del momento fallita", error);
      if (!mountedRef.current || token !== gradeTokenRef.current) return;
      setEngineError(tr(
        "Il motore non risponde. Usciamo dalla partita: il resto lo trovi nel Quaderno.",
        "The engine is not responding. We are leaving the game: the rest is in your Notebook.",
      ));
      setState((s) => finish(s, "exit"));
    } finally {
      if (mountedRef.current && token === gradeTokenRef.current) setBusy(false);
    }
  }

  // ── Opponent move (Maia at target, Stockfish fallback) ──────────────────
  useEffect(() => {
    if (state.phase !== "bot_thinking") return;
    const token = ++botTokenRef.current;
    const controller = new AbortController();
    const fen = currentFen(state);
    (async () => {
      try {
        const selection = await chooseTargetOpponentMove(
          { fen, targetRating: state.targetRating, timeClass: state.timeClass, signal: controller.signal },
          // A generous first-turn budget: Maia may still be finishing its load.
          { maiaPolicy, stockfishMove, rng: deps?.rng, maiaTimeoutMs: deps?.maiaTimeoutMs ?? 15_000 },
        );
        if (!mountedRef.current || token !== botTokenRef.current || controller.signal.aborted) return;
        if (!selection.uci) {
          console.error("lezione: l'avversario non ha prodotto una mossa legale", selection);
          setEngineError(tr(
            "L'avversario non risponde. Usciamo dalla partita: il resto lo trovi nel Quaderno.",
            "The opponent is not responding. We are leaving the game: the rest is in your Notebook.",
          ));
          setState((s) => finish(s, "exit"));
          return;
        }
        setState((s) => applyBotMove(s, selection.uci as string, selection));
      } catch (error) {
        if (error instanceof OpponentSelectionAbortedError) return;
        if (!mountedRef.current || token !== botTokenRef.current) return;
        console.error("lezione: selezione della mossa avversaria fallita", error);
        setEngineError(tr(
          "L'avversario non risponde. Usciamo dalla partita: il resto lo trovi nel Quaderno.",
          "The opponent is not responding. We are leaving the game: the rest is in your Notebook.",
        ));
        setState((s) => finish(s, "exit"));
      }
    })();
    return () => controller.abort();
    // deps/maiaPolicy/stockfishMove close over `deps`, which the caller keeps stable; re-running
    // only on phase avoids re-firing the request on every eval/clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // ── Eval bar: re-evaluates whichever position is on screen, discards stale replies ──
  useEffect(() => {
    const fen = displayedFen(stateRef.current);
    let cancelled = false;
    evaluate(fen, EVAL_DEPTH).then((result) => {
      if (cancelled || !mountedRef.current) return;
      let sideToMove: "white" | "black" = "white";
      try {
        sideToMove = new Chess(fen).turn() === "w" ? "white" : "black";
      } catch { /* keep default */ }
      const { whiteCp, whiteMate } = evalToWhite(result.scoreCp, result.mate, sideToMove);
      setState((s) => setEval(s, whiteCp, whiteMate));
    }).catch((error: unknown) => {
      // Cosmetic only: the bar keeps its last value rather than ending the game over this.
      console.error("lezione: aggiornamento della barra di valutazione fallito", error);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedFen(state)]);

  // ── Clock: 250ms ticker + visibility (mirrors PatternPractice.tsx's pattern) ──
  useEffect(() => {
    const timer = setInterval(() => setState((s) => tick(s, Date.now())), 250);
    function onVisibility() {
      setState((s) => setClockRunning(s, !document.hidden, Date.now()));
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
  }, []);

  // ── Persistence: every structural change, not the 250ms clock tick or eval updates ──
  useEffect(() => {
    writePersisted(storage, positionId, clientAttemptId, stateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.moves, state.phase, state.cursor, state.takebacks, state.pliesAfterMoment, state.momento, state.over, state.opponent, state.pendingPromotion]);

  // ── Save the attempt once the game naturally ends (Esci saves via exit() below) ──
  useEffect(() => {
    if (state.phase !== "over" || state.momento.firstTry === null || savedRef.current) return;
    savedRef.current = true;
    attemptSave(buildTrainingAttemptInput(state, momento, patternId, clientAttemptId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.momento.firstTry]);

  function move(from: string, to: string, promotion?: string): boolean {
    if (busy) return false;
    const before = stateRef.current;
    const wasMomentAttempt = before.moves.length === 0;
    const result = applyUserMove(before, from, to, promotion);
    if ("error" in result) return false;
    setState(result.state);
    if (result.move && wasMomentAttempt) {
      const thinkMs = Date.now() - turnStartRef.current;
      void gradeMoment(before.startFen, result.move.uci, result.move.san, result.move.fenAfter, thinkMs);
    }
    return true;
  }

  function takebackMove() {
    if (busy) return;
    setState((s) => takeback(s));
  }

  function leaveAsIs() {
    if (busy) return;
    setState((s) => resumeAfterStop(s));
  }

  function browseTo(cursor: number | null) {
    setState((s) => browse(s, cursor));
  }

  function exit(): LezioneEsitoGioco {
    const current = stateRef.current;
    const esito = esitoGioco(current);
    if (current.momento.firstTry !== null && !savedRef.current) {
      savedRef.current = true;
      attemptSave(buildTrainingAttemptInput(current, momento, patternId, clientAttemptId));
    }
    return esito;
  }

  return {
    state, busy, engineError, displayFen: displayedFen(state), esito: esitoGioco(state),
    move, takebackMove, leaveAsIs, browseTo, exit,
  };
}
