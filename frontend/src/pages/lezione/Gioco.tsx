import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useTavoloData } from "../tavolo/useTavoloData";
import { buildLezione, type Lezione, type Momento } from "../../lezione/lezione";
import { extractMoveFacts } from "../../session/moveReason";
import { fraseFermata, fraseMinaccia, fraseFonteAvversario, sanItaliano } from "../../lezione/voce";
import { readLezioneProgress, writeLezioneProgress, todayLocal, type LezioneEsitoGioco } from "../../lezione/progress";
import { usePartita, type PartitaEngineDeps } from "../../lezione/usePartita";
import type { PartitaState } from "../../lezione/partita";
import { BoardView } from "../../components/BoardView";
import { LezioneShell } from "./LezioneShell";
import { tr } from "../../i18n/lang";
import "./lezione.css";

const PROMOTION_CHOICES: { code: "q" | "r" | "b" | "n"; label: string }[] = [
  { code: "q", label: "D" }, { code: "r", label: "T" }, { code: "b", label: "A" }, { code: "n", label: "C" },
];

function fenBeforeMove(state: PartitaState, index: number): string {
  return index === 0 ? state.startFen : state.moves[index - 1].fenAfter;
}
function moveLabel(state: PartitaState, index: number): string {
  const before = fenBeforeMove(state, index);
  const n = Number(before.split(" ")[5]) || 1;
  const white = (before.split(" ")[1] ?? "w") === "w";
  return `${n}${white ? "." : "..."} ${sanItaliano(state.moves[index].san)}`;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function evalBarPercent(whiteCp: number | null, whiteMate: number | null): number {
  if (whiteMate !== null) return whiteMate > 0 ? 98 : 2;
  if (whiteCp === null) return 50;
  const raw = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * whiteCp)) - 1);
  return Math.min(95, Math.max(5, raw));
}
function evalLabelText(whiteCp: number | null, whiteMate: number | null): string {
  if (whiteMate !== null) return `#${whiteMate}`;
  if (whiteCp === null) return "";
  const pawns = whiteCp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

function fraseFineGioco(state: PartitaState, engineError: string | null): string {
  if (engineError) return engineError;
  const over = state.over;
  if (!over) return "";
  switch (over.reason) {
    case "checkmate":
      return over.winner === "user"
        ? tr("Scacco matto. Hai vinto.", "Checkmate. You won.")
        : tr("Scacco matto. Vince lui, oggi.", "Checkmate. He wins, today.");
    case "stalemate":
      return tr("Stallo. Partita patta.", "Stalemate. The game is drawn.");
    case "draw":
      return tr("Partita patta.", "The game is drawn.");
    case "flag":
      return tr("Il tempo e' finito. In partita sarebbe stata persa.", "Time is up. In the real game it would have been lost.");
    case "cap":
      return tr("Basta cosi'. Il momento l'hai passato: il resto e' partita.", "That's enough. You got past the moment, the rest is just a game.");
    case "exit":
    default:
      return tr("Partita interrotta.", "Game interrupted.");
  }
}

export interface GiocoViewProps {
  loading: boolean;
  lezione: Lezione | null;
  onFine: (esito: LezioneEsitoGioco) => void;
  /** Dev preview only: fake engines so /dev/lezione never downloads Stockfish/Maia. */
  deps?: PartitaEngineDeps;
  /** Dev preview only: plays this move once on mount (beat=fermata reaches "stopped" via the real code path). */
  autoPlayMoment?: { from: string; to: string };
}

/** Loading/redirect guard; the real hook-driven screen only mounts once lezione.gioco exists. */
export function GiocoView({ loading, lezione, onFine, deps, autoPlayMoment }: GiocoViewProps) {
  if (loading) {
    return <LezioneShell variant="passo" stepLabel={tr("Partita", "Game")}>
      <p className="lezione-status">{tr("Un attimo, preparo la partita.", "One moment, I am setting up the game.")}</p>
    </LezioneShell>;
  }
  if (!lezione || !lezione.gioco) return <Navigate to="/lezione" replace />;
  return <GiocoPlaying lezione={lezione} momento={lezione.gioco} onFine={onFine} deps={deps} autoPlayMoment={autoPlayMoment} />;
}

interface GiocoPlayingProps {
  lezione: Lezione;
  momento: Momento;
  onFine: (esito: LezioneEsitoGioco) => void;
  deps?: PartitaEngineDeps;
  autoPlayMoment?: { from: string; to: string };
}

function GiocoPlaying({ lezione, momento, onFine, deps, autoPlayMoment }: GiocoPlayingProps) {
  const partita = usePartita(momento, lezione.profile, lezione.pattern.id, deps);
  const [selected, setSelected] = useState<string | null>(null);
  const [boardPx, setBoardPx] = useState(320);

  useEffect(() => {
    function measure() {
      // 40px = the screen's own left+right padding, 20px = eval bar (12px) + gap — see §D of the slice-3 spec.
      const available = Math.min(window.innerWidth - 60, 430);
      setBoardPx(Math.max(160, available));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (autoPlayMoment) partita.move(autoPlayMoment.from, autoPlayMoment.to);
    // Runs once on mount only — this is the dev preview's "?beat=fermata" seam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setSelected(null); }, [partita.displayFen]);

  const board = useMemo(() => {
    try { return new Chess(partita.displayFen); } catch { return null; }
  }, [partita.displayFen]);

  const userColorChar = partita.state.userColor === "white" ? "w" : "b";
  const inputEnabled = partita.state.phase === "playing" && partita.state.cursor === null && !partita.busy;

  const legalTargets: string[] = useMemo(() => {
    if (!selected || !board) return [];
    try { return board.moves({ square: selected as never, verbose: true }).map((m): string => m.to); } catch { return []; }
  }, [selected, board]);

  const checkSquare = useMemo(() => {
    if (!board || !board.inCheck()) return null;
    const turn = board.turn();
    const rows = board.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = rows[r][c];
        if (cell && cell.type === "k" && cell.color === turn) return `${String.fromCharCode(97 + c)}${8 - r}`;
      }
    }
    return null;
  }, [board]);

  const lastMoveSquares = useMemo(() => {
    const idx = partita.state.cursor === null ? partita.state.moves.length - 1 : partita.state.cursor;
    if (idx < 0 || idx >= partita.state.moves.length) return undefined;
    const uci = partita.state.moves[idx].uci;
    return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  }, [partita.state.cursor, partita.state.moves]);

  function handleSquareClick(square: string) {
    if (!inputEnabled) return;
    if (selected) {
      if (square === selected) { setSelected(null); return; }
      if (legalTargets.includes(square)) { partita.move(selected, square); setSelected(null); return; }
      const piece = board?.get(square as never);
      setSelected(piece && piece.color === userColorChar ? square : null);
      return;
    }
    const piece = board?.get(square as never);
    if (piece && piece.color === userColorChar) setSelected(square);
  }

  function handlePieceDrop(from: string, to: string): boolean {
    if (!inputEnabled) return false;
    setSelected(null);
    return partita.move(from, to);
  }

  function handleBack() {
    const cursor = partita.state.cursor;
    partita.browseTo((cursor ?? partita.state.moves.length - 1) - 1);
  }
  function handleForward() {
    const cursor = partita.state.cursor;
    const next = (cursor ?? partita.state.moves.length - 1) + 1;
    partita.browseTo(next >= partita.state.moves.length - 1 ? null : next);
  }
  const backDisabled = partita.state.moves.length === 0 || partita.state.cursor === -1;
  const forwardDisabled = partita.state.cursor === null;

  function handleEsci() {
    onFine(partita.exit());
  }
  function handleVaiAvanti() {
    onFine(partita.esito);
  }

  const stopFacts = useMemo(() => {
    if (partita.state.phase !== "stopped" || !partita.state.momento.lastTry) return null;
    return extractMoveFacts({
      fenBefore: partita.state.startFen, myColor: partita.state.userColor,
      playedUci: partita.state.momento.lastTry.uci, playedSan: partita.state.momento.lastTry.san,
      bestUci: momento.opportunity.bestUci,
    });
  }, [partita.state.phase, partita.state.momento.lastTry, partita.state.startFen, partita.state.userColor, momento.opportunity.bestUci]);

  const stopMeta = useMemo(() => partita.state.phase === "stopped" ? fraseMinaccia(stopFacts) : null, [partita.state.phase, stopFacts]);

  const hasClock = partita.state.clock.userMs !== null;
  const clockRunning = inputEnabled && hasClock;
  const ft = partita.state.momento.lastTry;
  const initialPhrase = hasClock
    ? tr("Tocca a te. Stessa partita, stessa posizione, stesso orologio.", "Your turn. Same game, same position, same clock.")
    : tr("Tocca a te. Stessa partita, stessa posizione.", "Your turn. Same game, same position.");
  const topPhrase = partita.state.phase === "over"
    ? fraseFineGioco(partita.state, partita.engineError)
    : ft && ft.verdict !== "wrong" && partita.state.phase !== "stopped"
    ? (ft.verdict === "perfect" ? tr("Ecco. Stavolta l'hai vista.", "There. This time you saw it.") : tr("Bene. Tiene.", "Good. It holds."))
    : initialPhrase;

  const oppName = partita.state.opponent && partita.state.opponent.opponent_source !== "maia_target_policy"
    ? tr("Stockfish di riserva", "Stockfish fallback")
    : tr(`Maia ${partita.state.targetRating}`, `Maia ${partita.state.targetRating}`);
  const sourceLine = fraseFonteAvversario(partita.state.opponent?.opponent_source ?? null, partita.state.targetRating);

  const evalPercent = evalBarPercent(partita.state.evalWhiteCp, partita.state.evalMate);
  const evalReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return <LezioneShell variant="passo" stepLabel={tr("Partita", "Game")} backLabel={tr("Esci", "Exit")} onBack={handleEsci}>
    <div className="gioco-screen">
      <p className="gioco-frase">{topPhrase}</p>

      <div className="gioco-row gioco-opponent-row">
        <span className={`gioco-dot gioco-dot--grey${partita.state.phase === "bot_thinking" ? " gioco-dot--pulse" : ""}`} aria-hidden="true" />
        <span>{oppName}</span>
      </div>

      <div className="gioco-board-row">
        <div className="gioco-eval-col" style={{ height: boardPx }}>
          <div className="gioco-eval-bar" data-referee="eval">
            <div className="gioco-eval-fill" style={{ height: `${evalPercent}%`, transition: evalReducedMotion ? "none" : "height 260ms ease-out" }} />
          </div>
          <span className="gioco-eval-label">{evalLabelText(partita.state.evalWhiteCp, partita.state.evalMate)}</span>
        </div>
        <div className="gioco-board-wrap" data-referee="board" data-fen={partita.displayFen} data-input-enabled={inputEnabled} style={{ width: boardPx }}>
          <BoardView
            fen={partita.displayFen}
            orientation={partita.state.userColor}
            size={boardPx}
            draggable={inputEnabled}
            onSquareClick={handleSquareClick}
            onPieceDrop={handlePieceDrop}
            dots={inputEnabled && selected ? legalTargets : undefined}
            lastMove={lastMoveSquares}
            checkSquare={checkSquare}
            animate
          />
          {partita.state.phase === "promotion" && partita.state.pendingPromotion && (
            <div className="gioco-promo-picker">
              {PROMOTION_CHOICES.map((c) => (
                <button key={c.code} type="button" className="gioco-promo-btn"
                  onClick={() => partita.move(partita.state.pendingPromotion!.from, partita.state.pendingPromotion!.to, c.code)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="gioco-row gioco-user-row">
        <span className="gioco-dot gioco-dot--gold" aria-hidden="true" />
        <span>{tr(`Tu, ${partita.state.userColor === "white" ? "bianco" : "nero"}`, `You, ${partita.state.userColor === "white" ? "white" : "black"}`)}</span>
        <span className="gioco-clock" data-referee="clock" style={clockRunning ? { color: "var(--color-gold-soft)" } : undefined}>
          {hasClock ? formatClock(partita.state.clock.userMs as number) : tr("senza orologio", "no clock")}
        </span>
      </div>

      <div className="lezione-moves" data-referee="moves">
        <button type="button" className="lezione-moves-btn" aria-label={tr("Mossa precedente", "Previous move")} disabled={backDisabled} onClick={handleBack}>
          <ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <div className="lezione-moves-strip">
          {partita.state.moves.map((_, i) => (
            <span key={i} className={(partita.state.cursor === null ? i === partita.state.moves.length - 1 : i === partita.state.cursor) ? "lezione-frame lezione-frame--now" : "lezione-frame"}>
              {moveLabel(partita.state, i)}
            </span>
          ))}
        </div>
        <button type="button" className="lezione-moves-btn" aria-label={tr("Mossa successiva", "Next move")} disabled={forwardDisabled} onClick={handleForward}>
          <ChevronRight size={24} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>

      {partita.state.phase === "over" ? (
        <div className="lezione-foot">
          <button type="button" className="lezione-cta" data-cta="primary" onClick={handleVaiAvanti}>{tr("Vai avanti", "Go on")}</button>
        </div>
      ) : (
        <div className="gioco-footer-row" hidden={partita.state.phase === "stopped"}>
          <button type="button" className="gioco-takeback-btn" data-cta="takeback" disabled={partita.busy} onClick={partita.takebackMove}>
            <Undo2 size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{tr("Ripensaci", "Take it back")}</span>
          </button>
          <p className="gioco-source-copy">{sourceLine}</p>
        </div>
      )}

      {partita.state.phase === "stopped" && (
        <div className="gioco-stop-overlay">
          <div className="gioco-stop-card">
            <p className="gioco-stop-frase">{fraseFermata(stopFacts)}</p>
            {stopMeta && <p className="gioco-stop-meta">{stopMeta}</p>}
            <div className="gioco-stop-actions">
              <button type="button" className="lezione-cta" data-cta="primary" onClick={partita.takebackMove}>{tr("Ripensaci", "Take it back")}</button>
              <button type="button" className="gioco-stop-leave" onClick={partita.leaveAsIs}>{tr("Lascio cosi'", "Leave it")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  </LezioneShell>;
}

/** Route "/lezione/gioco" — the real game (docs/GOAL_ESPERIENZA.md §3 "[Gioco]"). */
export function Gioco() {
  const { profile } = useAuth();
  const data = useTavoloData();
  const nav = useNavigate();

  const report = data.aggregates?.personal_patterns ?? null;
  const [progress] = useState(() => readLezioneProgress());
  const lezione = useMemo(() => buildLezione({
    report, learning: [],
    // The opponent needs a real time class (Maia's domain gate wants "blitz"/"rapid") — the
    // same goal_time_class Apertura.tsx already reads, not the "" placeholder Guardo/Chiusura
    // pass since they never touch the opponent (debt noted, not fixed there: out of scope here).
    profile: { currentRating: data.currentRating, targetRating: data.targetRating, timeClass: profile?.goal_time_class ?? "" },
    progress,
  }), [report, data.currentRating, data.targetRating, profile?.goal_time_class, progress]);

  function handleFine(esito: LezioneEsitoGioco) {
    const today = todayLocal();
    const existing = readLezioneProgress();
    const carrying = existing && existing.date === today ? existing : null;
    const patternId = lezione?.pattern.id ?? carrying?.patternId ?? "";
    writeLezioneProgress({
      patternId, date: today, beat: "fine",
      momento: carrying?.momento ?? lezione?.momenti.length ?? 0,
      esitoGioco: esito, completedAt: carrying?.completedAt ?? null,
    });
    nav("/lezione/fine");
  }

  return <GiocoView loading={data.loading} lezione={lezione} onFine={handleFine} />;
}
