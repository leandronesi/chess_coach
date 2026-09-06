import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTavoloData } from "../tavolo/useTavoloData";
import { buildLezione, type Lezione } from "../../lezione/lezione";
import { fraseChiusura } from "../../lezione/voce";
import { readLezioneProgress, writeLezioneProgress, todayLocal, type LezioneEsitoGioco } from "../../lezione/progress";
import { LezioneShell } from "./LezioneShell";
import { tr } from "../../i18n/lang";
import "./lezione.css";

export interface ChiusuraViewProps {
  loading: boolean;
  lezione: Lezione | null;
  esitoGioco: LezioneEsitoGioco | null;
  onVaiEGioca: () => void;
}

/** Pure presentation — two sentences, one button. */
export function ChiusuraView({ loading, lezione, esitoGioco, onVaiEGioca }: ChiusuraViewProps) {
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
      <div className="lezione-foot">
        <button type="button" className="lezione-cta" data-cta="primary" onClick={onVaiEGioca}>{tr("Vai e gioca", "Go and play")}</button>
      </div>
    </div>
  </LezioneShell>;
}

/**
 * Route "/lezione/fine". In this slice Gioco is a placeholder (see Gioco.tsx),
 * so esitoGioco defaults to "saltato" — the exact case the spec groups with
 * null (§B, fraseChiusura).
 */
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

  return <ChiusuraView loading={data.loading} lezione={lezione} esitoGioco={esitoGioco} onVaiEGioca={handleVaiEGioca} />;
}
