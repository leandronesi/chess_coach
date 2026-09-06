import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useTavoloData } from "../tavolo/useTavoloData";
import { buildLezione, type Lezione, type Momento } from "../../lezione/lezione";
import { fraseContesto, fraseVerdetto, fraseLivello, sanItaliano } from "../../lezione/voce";
import { readLezioneProgress, writeLezioneProgress, todayLocal } from "../../lezione/progress";
import { loadFilm, type FilmLoader } from "../../lezione/film";
import { extractMoveFacts } from "../../session/moveReason";
import { downloadJson, analysisPath } from "../../auth/storage";
import type { GameAnalysis } from "../../pipeline/analyze";
import { BoardView } from "../../components/BoardView";
import { getCurrentTheme } from "../../theme";
import { LezioneShell } from "./LezioneShell";
import { tr } from "../../i18n/lang";
import "./lezione.css";

interface Frame {
  fen: string;
  /** SAN of the move that produced this frame. Null for the "adesso" frame (no move yet). */
  label: string | null;
}

// BoardView's highlight ring appends an alpha suffix to the color string
// (`${color}88`), which breaks for a CSS var() reference — so the gold token
// is mirrored here as its two theme literals (coach-shell.css --color-gold).
const GOLD = { dark: "#e4b879", light: "#a9722d" };
const LAST_MOVE_COLOR = "#c28b40"; // matches MovePlayback.tsx / PatternPractice.tsx move highlights

/** Best-effort destination square from a bare SAN, when no FEN replay is available. Never guesses the origin square. */
function destSquareFromSan(san: string, colorToMove: "white" | "black"): string | null {
  if (san.startsWith("O-O-O")) return colorToMove === "white" ? "c1" : "c8";
  if (san.startsWith("O-O")) return colorToMove === "white" ? "g1" : "g8";
  const match = san.replace(/[+#]$/, "").split("=")[0].match(/([a-h][1-8])$/);
  return match ? match[1] : null;
}

export interface GuardoViewProps {
  loading: boolean;
  lezione: Lezione | null;
  n: number;
  filmLoader: FilmLoader;
  onAvanti: () => void;
}

/** Pure presentation for one Guardo screen. n is 1-based. */
export function GuardoView({ loading, lezione, n, filmLoader, onAvanti }: GuardoViewProps) {
  const momento: Momento | null = lezione && Number.isInteger(n) && n >= 1 && n <= lezione.momenti.length
    ? lezione.momenti[n - 1]
    : null;

  const [prevFrames, setPrevFrames] = useState<Frame[]>([]);
  const [prevOppSquares, setPrevOppSquares] = useState<{ from?: string; to: string } | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
    setPrevFrames([]);
    setPrevOppSquares(null);
    if (!momento || momento.film.kind !== "prev") return;
    let cancelled = false;
    loadFilm(momento, filmLoader).then((resolved) => {
      if (cancelled || resolved.kind !== "prev") return;
      try {
        const board = new Chess(resolved.startFen);
        const frames: Frame[] = [];
        let last: { from: string; to: string } | null = null;
        for (const san of resolved.moves) {
          const mv = board.move(san, { strict: false } as never);
          if (!mv) break;
          frames.push({ fen: board.fen(), label: mv.san });
          last = { from: mv.from, to: mv.to };
        }
        if (!cancelled) {
          setPrevFrames(frames);
          setPrevOppSquares(last);
        }
      } catch {
        // The board already shows "adesso"; a broken replay just means no prior frames.
      }
    });
    return () => { cancelled = true; };
  }, [momento, filmLoader]);

  const facts = useMemo(() => momento ? extractMoveFacts({
    fenBefore: momento.opportunity.fen,
    myColor: momento.opportunity.color,
    playedSan: momento.opportunity.playedSan,
    playedUci: momento.opportunity.playedUci,
    bestUci: momento.opportunity.bestUci,
    lastOppSan: momento.opportunity.lastOpponentSan,
  }) : null, [momento]);

  const staticFrames = useMemo((): Frame[] => {
    if (!momento) return [];
    const o = momento.opportunity;
    const frames: Frame[] = [{ fen: o.fen, label: null }];
    try {
      const board = new Chess(o.fen);
      const mv = board.move(o.playedSan, { strict: false } as never);
      if (mv) {
        frames.push({ fen: board.fen(), label: mv.san });
        if (facts?.punishment?.capture_san) {
          try {
            const mv2 = board.move(facts.punishment.capture_san, { strict: false } as never);
            if (mv2) frames.push({ fen: board.fen(), label: mv2.san });
          } catch { /* punishment stays undepicted */ }
        }
      }
    } catch { /* keep just "adesso" if the played move cannot be replayed */ }
    return frames;
  }, [momento, facts]);

  const fallbackOppSquare = useMemo((): { from?: string; to: string } | null => {
    if (!momento || momento.film.kind !== "last") return null;
    const opponentColor = momento.opportunity.color === "white" ? "black" : "white";
    const to = destSquareFromSan(momento.film.san, opponentColor);
    return to ? { to } : null;
  }, [momento]);

  if (loading) {
    return <LezioneShell variant="passo" stepLabel="">
      <p className="lezione-status">{tr("Un attimo, guardo le tue partite.", "One moment, I am looking at your games.")}</p>
    </LezioneShell>;
  }
  if (!lezione || !momento) return <Navigate to="/lezione" replace />;

  const frames = [...prevFrames, ...staticFrames];
  const nowIndex = prevFrames.length;
  const absoluteIndex = Math.min(Math.max(0, nowIndex + offset), frames.length - 1);
  const current = frames[absoluteIndex];
  const lastOppSquares = prevOppSquares ?? fallbackOppSquare;
  const goldSquare = facts?.hung_piece?.square ?? null;
  const highlights = absoluteIndex === nowIndex
    ? [
        ...(lastOppSquares?.from ? [{ square: lastOppSquares.from, color: LAST_MOVE_COLOR }] : []),
        ...(lastOppSquares ? [{ square: lastOppSquares.to, color: LAST_MOVE_COLOR }] : []),
        ...(goldSquare ? [{ square: goldSquare, color: getCurrentTheme() === "light" ? GOLD.light : GOLD.dark }] : []),
      ]
    : [];

  const livello = fraseLivello(lezione.pattern, lezione.profile.targetRating);
  const contesto = fraseContesto(momento);
  const clockMatch = contesto.match(/\d{1,2}:\d{2}/);
  const clockIndex = clockMatch?.index ?? -1;

  return <LezioneShell variant="passo" stepLabel={`${n} ${tr("di", "of")} ${lezione.momenti.length}`}>
    <div className="lezione-guardo">
      <p className="lezione-contesto">
        {clockMatch && clockIndex >= 0
          ? <>{contesto.slice(0, clockIndex)}<strong>{clockMatch[0]}</strong>{contesto.slice(clockIndex + clockMatch[0].length)}</>
          : contesto}
      </p>

      <div className="lezione-board-wrap" data-referee="board" data-fen={current.fen}>
        <BoardView fen={current.fen} orientation={momento.opportunity.color} size={430} highlights={highlights} />
      </div>

      <div className="lezione-moves" data-referee="moves">
        <button type="button" className="lezione-moves-btn" aria-label={tr("Mossa precedente", "Previous move")}
          disabled={absoluteIndex <= 0} onClick={() => setOffset((v) => v - 1)}>
          <ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <div className="lezione-moves-strip">
          {frames.map((f, i) => (
            <span key={i} className={i === absoluteIndex ? "lezione-frame lezione-frame--now" : "lezione-frame"}>
              {f.label ? sanItaliano(f.label) : tr("ora", "now")}
            </span>
          ))}
        </div>
        <button type="button" className="lezione-moves-btn" aria-label={tr("Mossa successiva", "Next move")}
          disabled={absoluteIndex >= frames.length - 1} onClick={() => setOffset((v) => v + 1)}>
          <ChevronRight size={24} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>

      <p className="lezione-verdetto">{fraseVerdetto(momento)}</p>
      {livello && <p className="lezione-livello">{livello}</p>}

      <div className="lezione-foot">
        <button type="button" className="lezione-cta" data-cta="primary" onClick={onAvanti}>{tr("Avanti", "Next")}</button>
      </div>
    </div>
  </LezioneShell>;
}

/** Route "/lezione/guardo/:n" — one real position, its film, its verdict. */
export function Guardo() {
  const { n: nParam } = useParams<{ n: string }>();
  const n = Number(nParam);
  const { user } = useAuth();
  const data = useTavoloData();
  const nav = useNavigate();

  const report = data.aggregates?.personal_patterns ?? null;
  const [progress] = useState(() => readLezioneProgress());
  const lezione = useMemo(() => buildLezione({
    report, learning: [],
    profile: { currentRating: data.currentRating, targetRating: data.targetRating, timeClass: "" },
    progress,
  }), [report, data.currentRating, data.targetRating, progress]);

  const momento = lezione && Number.isInteger(n) && n >= 1 && n <= lezione.momenti.length ? lezione.momenti[n - 1] : null;

  // Persist "where we are" as soon as we know it — a reload mid-Guardo resumes cleanly.
  useEffect(() => {
    if (!lezione || !momento) return;
    const today = todayLocal();
    const existing = readLezioneProgress();
    const carrying = existing && existing.date === today ? existing : null;
    writeLezioneProgress({
      patternId: lezione.pattern.id, date: today, beat: "guardo", momento: n,
      esitoGioco: carrying?.esitoGioco ?? null, completedAt: carrying?.completedAt ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lezione, momento, n]);

  const filmLoader: FilmLoader = useMemo(() => {
    const userId = user?.id;
    return async (gameId: string) => (userId ? downloadJson<GameAnalysis>(analysisPath(userId, gameId)) : null);
  }, [user?.id]);

  function handleAvanti() {
    if (!lezione) return;
    const today = todayLocal();
    const existing = readLezioneProgress();
    const carrying = existing && existing.date === today ? existing : null;
    const isLast = n >= lezione.momenti.length;
    writeLezioneProgress({
      patternId: lezione.pattern.id, date: today,
      beat: isLast ? "gioco" : "guardo", momento: isLast ? n : n + 1,
      esitoGioco: carrying?.esitoGioco ?? null, completedAt: carrying?.completedAt ?? null,
    });
    nav(isLast ? "/lezione/gioco" : `/lezione/guardo/${n + 1}`);
  }

  return <GuardoView loading={data.loading} lezione={lezione} n={n} filmLoader={filmLoader} onAvanti={handleAvanti} />;
}
