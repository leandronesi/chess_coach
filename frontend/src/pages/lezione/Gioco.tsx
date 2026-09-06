import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTavoloData } from "../tavolo/useTavoloData";
import { buildLezione } from "../../lezione/lezione";
import { readLezioneProgress, writeLezioneProgress, todayLocal } from "../../lezione/progress";
import { LezioneShell } from "./LezioneShell";
import { tr } from "../../i18n/lang";
import "./lezione.css";

export interface GiocoViewProps {
  onVaiAvanti: () => void;
}

/**
 * Pure presentation — placeholder for this slice. The real Gioco phase
 * (bot play at the target level, eval bar, clock, takeback, pattern stop —
 * docs/GOAL_ESPERIENZA.md §3) is slice 3's job. This screen only carries the
 * player from the third Guardo to the Chiusura.
 */
export function GiocoView({ onVaiAvanti }: GiocoViewProps) {
  return <LezioneShell variant="passo" stepLabel={tr("La partita", "The game")}>
    <div className="lezione-gioco-placeholder">
      <div className="lezione-voce-wrap"><p className="lezione-voce">{tr("La partita arriva tra poco.", "The game is coming soon.")}</p></div>
      <div className="lezione-foot">
        <button type="button" className="lezione-cta" data-cta="primary" onClick={onVaiAvanti}>{tr("Vai avanti", "Go on")}</button>
      </div>
    </div>
  </LezioneShell>;
}

/** Route "/lezione/gioco" — marks esitoGioco "saltato" (grouped with null in fraseChiusura — see voce.ts) and moves on. */
export function Gioco() {
  const data = useTavoloData();
  const nav = useNavigate();

  const report = data.aggregates?.personal_patterns ?? null;
  const [progress] = useState(() => readLezioneProgress());
  const lezione = useMemo(() => buildLezione({
    report, learning: [],
    profile: { currentRating: data.currentRating, targetRating: data.targetRating, timeClass: "" },
    progress,
  }), [report, data.currentRating, data.targetRating, progress]);

  function handleVaiAvanti() {
    const today = todayLocal();
    const existing = readLezioneProgress();
    const carrying = existing && existing.date === today ? existing : null;
    const patternId = lezione?.pattern.id ?? carrying?.patternId ?? "";
    writeLezioneProgress({
      patternId, date: today, beat: "fine",
      momento: carrying?.momento ?? lezione?.momenti.length ?? 0,
      esitoGioco: "saltato", completedAt: carrying?.completedAt ?? null,
    });
    nav("/lezione/fine");
  }

  return <GiocoView onVaiAvanti={handleVaiAvanti} />;
}
