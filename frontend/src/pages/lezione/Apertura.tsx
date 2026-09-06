import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useTavoloData } from "../tavolo/useTavoloData";
import { loadPatternAttempts } from "../../patternLearningStore";
import { buildPatternLearning, type LearningAttempt } from "../../pipeline/patternLearning";
import { buildLezione, type Lezione } from "../../lezione/lezione";
import { fraseApertura, fraseRitorno, fraseChiusura } from "../../lezione/voce";
import { readLezioneProgress, writeLezioneProgress, todayLocal, isCompletedToday, type LezioneProgress } from "../../lezione/progress";
import { LezioneShell } from "./LezioneShell";
import { tr } from "../../i18n/lang";
import "./lezione.css";

// Fraunces at 23px starts crowding a 360px screen past this length; §F allows dropping to 21px.
const VOICE_COMPACT_THRESHOLD = 140;

export interface AperturaViewProps {
  loading: boolean;
  error: boolean;
  lezione: Lezione | null;
  progress: LezioneProgress | null;
  refreshing: boolean;
  refreshError: string | null;
  onSediamoci: () => void;
  onRivediamola: () => void;
  onAggiorna: () => void;
  onRiprova: () => void;
}

/** Pure presentation — the same lezione/progress shape the page below builds from real data, or a dev preview builds synthetically. */
export function AperturaView({ loading, error, lezione, progress, refreshing, refreshError, onSediamoci, onRivediamola, onAggiorna, onRiprova }: AperturaViewProps) {
  let voice: string;
  let meta: string | null = null;
  let footer: ReactNode = null;

  if (loading) {
    voice = tr("Un attimo, guardo le tue partite.", "One moment, I am looking at your games.");
  } else if (error) {
    voice = tr("Non riesco a leggere le tue partite adesso. Controlliamo la connessione.", "I cannot read your games right now. Let's check the connection.");
    footer = <button type="button" className="lezione-cta" data-cta="primary" onClick={onRiprova}>{tr("Riprova", "Try again")}</button>;
  } else if (!lezione) {
    voice = tr("Non ho ancora partite da leggere.", "I do not have any games to read yet.");
    if (refreshError) meta = refreshError;
    footer = <button type="button" className="lezione-cta" data-cta="primary" disabled={refreshing} onClick={onAggiorna}>
      {refreshing ? tr("Aggiornamento in corso…", "Updating…") : tr("Aggiorna le partite", "Refresh games")}
    </button>;
  } else if (isCompletedToday(progress)) {
    const chiusura = fraseChiusura(lezione, progress!.esitoGioco);
    voice = `${chiusura} ${tr("Domani riapriamo. Se vuoi rivederla, e' qui.", "Tomorrow we open a new one. If you want to see it again, it is here.")}`;
    footer = <button type="button" className="lezione-cta" data-cta="primary" onClick={onRivediamola}>{tr("Rivediamola", "Watch it again")}</button>;
  } else {
    voice = lezione.memoria ? fraseRitorno(lezione) : fraseApertura(lezione);
    meta = tr("Tre momenti, una partita. Un quarto d'ora.", "Three moments, one game. A quarter of an hour.");
    footer = <button type="button" className="lezione-cta" data-cta="primary" onClick={onSediamoci}>{tr("Sediamoci", "Let's sit down")}</button>;
  }

  return <LezioneShell variant="home">
    <div className="lezione-centered">
      <div className="lezione-voce-wrap">
        <p className={voice.length > VOICE_COMPACT_THRESHOLD ? "lezione-voce lezione-voce--compact" : "lezione-voce"}>{voice}</p>
      </div>
      {meta && <p className="lezione-meta" role={meta === refreshError ? "alert" : undefined}>{meta}</p>}
      {footer && <div className="lezione-foot">{footer}</div>}
    </div>
  </LezioneShell>;
}

/** Route "/lezione" — the daily convocation: one true sentence, one button. */
export function Apertura() {
  const { user, profile } = useAuth();
  const data = useTavoloData();
  const nav = useNavigate();
  const [attempts, setAttempts] = useState<LearningAttempt[] | null>(null);
  const [attemptsError, setAttemptsError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setAttempts(null);
    setAttemptsError(false);
    loadPatternAttempts(user.id).then((rows) => { if (!cancelled) setAttempts(rows); })
      .catch((err: unknown) => {
        // The attempts feed only the memory line of the Ritorno: the lesson itself must not depend on it.
        console.warn("lezione: training attempts unavailable, opening without memory", err);
        if (!cancelled) setAttemptsError(true);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const report = data.aggregates?.personal_patterns ?? null;
  const learning = useMemo(
    () => buildPatternLearning(report?.observations ?? [], attempts ?? []).patterns,
    [report, attempts],
  );
  // Read once per mount: a fresh object on every render would re-key every memo below.
  const [progress] = useState(() => readLezioneProgress());
  const lezione = useMemo(() => buildLezione({
    report,
    learning,
    profile: { currentRating: data.currentRating, targetRating: data.targetRating, timeClass: profile?.goal_time_class ?? "" },
    progress,
  }), [report, learning, data.currentRating, data.targetRating, profile?.goal_time_class, progress]);

  function handleSediamoci() {
    if (!lezione) return;
    writeLezioneProgress({ patternId: lezione.pattern.id, date: todayLocal(), beat: "guardo", momento: 1, esitoGioco: null, completedAt: null });
    nav("/lezione/guardo/1");
  }

  function handleRivediamola() {
    if (!progress) return;
    writeLezioneProgress({ ...progress, beat: "guardo", momento: 1 });
    nav("/lezione/guardo/1");
  }

  return <AperturaView
    loading={data.loading || (attempts === null && !attemptsError)}
    error={Boolean(data.error)}
    lezione={lezione}
    progress={progress}
    refreshing={data.refreshing}
    refreshError={data.refreshError}
    onSediamoci={handleSediamoci}
    onRivediamola={handleRivediamola}
    onAggiorna={() => void data.runRefreshHandler()}
    onRiprova={() => window.location.reload()}
  />;
}
