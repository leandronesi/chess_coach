import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useTavoloData } from "../tavolo/useTavoloData";
import { loadPatternAttempts } from "../../patternLearningStore";
import { buildPatternLearning, type LearningAttempt, type PatternLearning } from "../../pipeline/patternLearning";
import type { PersonalPatternReport } from "../../pipeline/personalPatterns";
import { buildLezione, buildQuadernoAggregati } from "../../lezione/lezione";
import { fraseQuadernoApertura, fraseQuadernoPattern, fraseQuadernoLearning, fraseQuadernoNessunConfronto, fraseQuadernoCadenza, titoloPattern } from "../../lezione/voce";
import { LezioneShell } from "../lezione/LezioneShell";
import { tr } from "../../i18n/lang";
import "../lezione/lezione.css";
import "./quaderno.css";

export interface QuadernoViewProps {
  loading: boolean;
  error: boolean;
  report: PersonalPatternReport | null;
  learning: PatternLearning[];
  gamesAnalyzed: number | null;
  lastGameDate: string | null;
  currentRating: number | null;
  targetRating: number;
  timeClass: string | null;
  todayPatternId: string | null;
  refreshing: boolean;
  refreshError: string | null;
  refreshNotice: string | null;
  onAggiorna: () => void;
  onRiprova: () => void;
  /** A callback (not a Link) so /dev/lezione?beat=quaderno can stay on its own URL and switch beat= instead. */
  onSelectPattern: (patternId: string) => void;
}

/** Pure presentation — the backstage hub (docs/GOAL_ESPERIENZA.md §3 "[Quaderno, backstage]"). */
export function QuadernoView({
  loading, error, report, learning, gamesAnalyzed, lastGameDate, currentRating, targetRating,
  timeClass, todayPatternId, refreshing, refreshError, refreshNotice, onAggiorna, onRiprova, onSelectPattern,
}: QuadernoViewProps) {
  if (loading) {
    return <LezioneShell variant="backstage" title={tr("Quaderno", "Notebook")}>
      <p className="lezione-status">{tr("Un attimo, guardo le tue partite.", "One moment, I am looking at your games.")}</p>
    </LezioneShell>;
  }
  if (error) {
    return <LezioneShell variant="backstage" title={tr("Quaderno", "Notebook")}>
      <div className="quaderno-empty">
        <p className="lezione-voce">{tr("Non riesco a leggere le tue partite adesso. Controlliamo la connessione.", "I cannot read your games right now. Let's check the connection.")}</p>
        <button type="button" className="quaderno-secondary-btn" onClick={onRiprova}>{tr("Riprova", "Try again")}</button>
      </div>
    </LezioneShell>;
  }
  if (!report) {
    return <LezioneShell variant="backstage" title={tr("Quaderno", "Notebook")}>
      <div className="quaderno-empty">
        <p className="lezione-voce">{tr("Non ho ancora partite da leggere.", "I do not have any games to read yet.")}</p>
        <button type="button" className="quaderno-secondary-btn" disabled={refreshing} onClick={onAggiorna}>
          {refreshing ? tr("Aggiornamento in corso", "Updating") : tr("Aggiorna", "Refresh")}
        </button>
      </div>
    </LezioneShell>;
  }

  return <LezioneShell variant="backstage" title={tr("Quaderno", "Notebook")}>
    <div className="quaderno-page">
      <p className="quaderno-voce">{fraseQuadernoApertura(gamesAnalyzed)}</p>

      <section className="quaderno-section">
        <p className="quaderno-kicker">{tr("Quello che torna", "What keeps happening")}</p>
        {report.patterns.length === 0 ? (
          <p className="quaderno-muted">{tr("Non ho ancora niente che torna abbastanza spesso.", "I do not yet have anything that comes up often enough.")}</p>
        ) : (
          <ul className="quaderno-pattern-list">
            {report.patterns.map((pattern) => {
              const aggregati = buildQuadernoAggregati(pattern, report, todayPatternId);
              return (
                <li key={pattern.id}>
                  <button type="button" className="quaderno-pattern-row" onClick={() => onSelectPattern(pattern.id)}>
                    <span className="quaderno-pattern-row-text">
                      <span className="quaderno-pattern-row-title">{titoloPattern(pattern.kind)}</span>
                      <span className="quaderno-pattern-row-frase">{fraseQuadernoPattern(pattern, aggregati)}</span>
                    </span>
                    <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="quaderno-section">
        <p className="quaderno-kicker">{tr("Come sta andando", "How it is going")}</p>
        {learning.length === 0 ? (
          <p className="quaderno-muted">{fraseQuadernoNessunConfronto()}</p>
        ) : (
          <ul className="quaderno-learning-list">
            {report.patterns.filter((p) => learning.some((l) => l.patternId === p.id)).map((pattern) => {
              const entry = learning.find((l) => l.patternId === pattern.id)!;
              return <li key={pattern.id} className="quaderno-learning-row">{fraseQuadernoLearning(entry, pattern.kind)}</li>;
            })}
          </ul>
        )}
      </section>

      <section className="quaderno-section">
        <p className="quaderno-kicker">{tr("Tu", "You")}</p>
        <p className="quaderno-tu-rating">
          {currentRating != null ? (
            <><span className="mono">{currentRating}</span>{tr(", verso ", ", heading to ")}<span className="mono quaderno-tu-target">{targetRating}</span></>
          ) : (
            <>{tr("Verso ", "Heading to ")}<span className="mono quaderno-tu-target">{targetRating}</span></>
          )}
        </p>
        <div className="quaderno-tu-row">
          <p className="quaderno-tu-cadenza">{fraseQuadernoCadenza(timeClass, gamesAnalyzed, lastGameDate)}</p>
          <button type="button" className="quaderno-secondary-btn" disabled={refreshing} onClick={onAggiorna}>
            {refreshing
              ? <span className="quaderno-refreshing"><span className="gioco-dot gioco-dot--grey gioco-dot--pulse" aria-hidden="true" />{tr("Aggiornamento in corso", "Updating")}</span>
              : tr("Aggiorna", "Refresh")}
          </button>
        </div>
        {refreshError && <p role="alert" className="quaderno-refresh-message">{refreshError}</p>}
        {refreshNotice && <p className="quaderno-refresh-message">{refreshNotice}</p>}
        <Link to="/settings" className="quaderno-settings-link">{tr("Impostazioni e dati", "Settings and data")}</Link>
      </section>
    </div>
  </LezioneShell>;
}

/** Route "/quaderno" — everything the rebuild has learned, read as sentences. */
export function Quaderno() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const data = useTavoloData();
  const [attempts, setAttempts] = useState<LearningAttempt[] | null>(null);
  const [attemptsError, setAttemptsError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setAttempts(null);
    setAttemptsError(false);
    loadPatternAttempts(user.id).then((rows) => { if (!cancelled) setAttempts(rows); })
      .catch((err: unknown) => {
        console.warn("quaderno: training attempts unavailable, showing without comparison", err);
        if (!cancelled) setAttemptsError(true);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const report = data.aggregates?.personal_patterns ?? null;
  const learning = useMemo(
    () => buildPatternLearning(report?.observations ?? [], attempts ?? []).patterns,
    [report, attempts],
  );
  const profileForToday = useMemo(() => ({ currentRating: data.currentRating, targetRating: data.targetRating, timeClass: profile?.goal_time_class ?? "" }), [data.currentRating, data.targetRating, profile?.goal_time_class]);
  const todayPatternId = useMemo(
    () => buildLezione({ report, learning: [], profile: profileForToday, progress: null })?.pattern.id ?? null,
    [report, profileForToday],
  );

  return <QuadernoView
    loading={data.loading || (attempts === null && !attemptsError)}
    error={Boolean(data.error)}
    report={report}
    learning={learning}
    gamesAnalyzed={data.aggregates?.games_analyzed ?? null}
    lastGameDate={data.pmLite?.identity.last_game_date ?? null}
    currentRating={data.currentRating}
    targetRating={data.targetRating}
    timeClass={profile?.goal_time_class ?? null}
    todayPatternId={todayPatternId}
    refreshing={data.refreshing}
    refreshError={data.refreshError}
    refreshNotice={data.refreshNotice}
    onAggiorna={() => void data.runRefreshHandler()}
    onRiprova={() => window.location.reload()}
    onSelectPattern={(patternId) => nav(`/quaderno/${patternId}`)}
  />;
}
