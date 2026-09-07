import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTavoloData } from "../tavolo/useTavoloData";
import { buildLezione, type Lezione } from "../../lezione/lezione";
import { fraseChiusura } from "../../lezione/voce";
import { readLezioneProgress, writeLezioneProgress, todayLocal, type LezioneEsitoGioco } from "../../lezione/progress";
import { PARTITA_PENDING_SAVE_KEY } from "../../lezione/usePartita";
import { recordTrainingAttempt, type TrainingAttemptInput } from "../../trainingProgress";
import { scopedStorage } from "../../auth/userStorage";
import { LezioneShell } from "./LezioneShell";
import { tr } from "../../i18n/lang";
import "./lezione.css";

export interface ChiusuraViewProps {
  loading: boolean;
  lezione: Lezione | null;
  esitoGioco: LezioneEsitoGioco | null;
  onVaiEGioca: () => void;
  /** True while a Gioco attempt is saved on-device but not yet in the account. */
  pendingSave?: boolean;
  retryingSave?: boolean;
  onRiprovaSalvataggio?: () => void;
}

/** Pure presentation — two sentences, one button, plus the rare "Riprova" row. */
export function ChiusuraView({ loading, lezione, esitoGioco, onVaiEGioca, pendingSave = false, retryingSave = false, onRiprovaSalvataggio }: ChiusuraViewProps) {
  if (loading) {
    return <LezioneShell variant="home">
      <div className="lezione-centered">
        <div className="lezione-voce-wrap"><p className="lezione-voce">{tr("Un attimo, guardo le tue partite.", "One moment, I am looking at your games.")}</p></div>
      </div>
    </LezioneShell>;
  }
  if (!lezione) return <Navigate to="/lezione" replace />;

  const voice = fraseChiusura(lezione, esitoGioco);
  return <LezioneShell variant="home">
    <div className="lezione-centered">
      <div className="lezione-voce-wrap"><p className="lezione-voce">{voice}</p></div>
      {pendingSave && (
        <div className="lezione-pending-save">
          <p>{tr("Il risultato e' sul dispositivo, non ancora nel tuo account.", "The result is on this device, not yet in your account.")}</p>
          <button type="button" className="lezione-pending-save-retry" disabled={retryingSave} onClick={onRiprovaSalvataggio}>
            {retryingSave ? tr("Riprovo…", "Retrying…") : tr("Riprova", "Retry")}
          </button>
        </div>
      )}
      <div className="lezione-foot">
        <button type="button" className="lezione-cta" data-cta="primary" onClick={onVaiEGioca}>{tr("Vai e gioca", "Go and play")}</button>
      </div>
    </div>
  </LezioneShell>;
}

/** Route "/lezione/fine". */
export function Chiusura() {
  const data = useTavoloData();
  const nav = useNavigate();

  const report = data.aggregates?.personal_patterns ?? null;
  const [progress] = useState(() => readLezioneProgress());
  const lezione = useMemo(() => buildLezione({
    report, learning: [],
    profile: { currentRating: data.currentRating, targetRating: data.targetRating, timeClass: "" },
    progress,
  }), [report, data.currentRating, data.targetRating, progress]);

  const esitoGioco = progress?.esitoGioco ?? "saltato";

  const [pendingInput, setPendingInput] = useState<TrainingAttemptInput | null>(null);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    const raw = scopedStorage.getItem(PARTITA_PENDING_SAVE_KEY);
    if (!raw) return;
    try {
      setPendingInput(JSON.parse(raw) as TrainingAttemptInput);
    } catch {
      // Corrupt blob: nothing sane to retry: drop it rather than show a retry that can never work.
      scopedStorage.removeItem(PARTITA_PENDING_SAVE_KEY);
    }
  }, []);

  function handleRiprovaSalvataggio() {
    if (!pendingInput || retrying) return;
    setRetrying(true);
    recordTrainingAttempt(pendingInput)
      .then(() => {
        scopedStorage.removeItem(PARTITA_PENDING_SAVE_KEY);
        setPendingInput(null);
      })
      .catch((error: unknown) => {
        console.error("lezione: nuovo tentativo di salvataggio fallito", error);
      })
      .finally(() => setRetrying(false));
  }

  function handleVaiEGioca() {
    if (!lezione) return;
    const today = todayLocal();
    const existing = readLezioneProgress();
    const carrying = existing && existing.date === today ? existing : null;
    writeLezioneProgress({
      patternId: lezione.pattern.id, date: today, beat: "fine",
      momento: carrying?.momento ?? lezione.momenti.length,
      esitoGioco, completedAt: new Date().toISOString(),
    });
    nav("/lezione");
  }

  return <ChiusuraView loading={data.loading} lezione={lezione} esitoGioco={esitoGioco} onVaiEGioca={handleVaiEGioca}
    pendingSave={pendingInput !== null} retryingSave={retrying} onRiprovaSalvataggio={handleRiprovaSalvataggio} />;
}
