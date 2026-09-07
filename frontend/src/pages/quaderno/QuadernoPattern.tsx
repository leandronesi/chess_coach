import { useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useTavoloData } from "../tavolo/useTavoloData";
import { buildLezione, buildQuadernoAggregati, momentoFromOpportunity } from "../../lezione/lezione";
import type { PersonalPattern, PersonalPatternReport } from "../../pipeline/personalPatterns";
import { fraseQuadernoPattern, fraseProvaBreve, fraseLivello, fraseLivelloIndisponibile, fraseNumeriQuaderno, titoloPattern } from "../../lezione/voce";
import { LezioneShell } from "../lezione/LezioneShell";
import { tr } from "../../i18n/lang";
import "../lezione/lezione.css";
import "./quaderno.css";

export interface QuadernoPatternViewProps {
  loading: boolean;
  report: PersonalPatternReport | null;
  pattern: PersonalPattern | null;
  todayPatternId: string | null;
  targetRating: number;
  /** Back to the Quaderno list. A callback (not a Link) so /dev/lezione?beat=quaderno-pattern can stay on its own URL. */
  onBack: () => void;
  onSelectMomento: (momentoId: string) => void;
}

/** Pure presentation for "/quaderno/:patternId" — one pattern read as a story, not a database. */
export function QuadernoPatternView({ loading, report, pattern, todayPatternId, targetRating, onBack, onSelectMomento }: QuadernoPatternViewProps) {
  if (loading) {
    return <LezioneShell variant="passo" stepLabel="" onBack={onBack} backLabel={tr("Quaderno", "Notebook")}>
      <p className="lezione-status">{tr("Un attimo, guardo le tue partite.", "One moment, I am looking at your games.")}</p>
    </LezioneShell>;
  }
  if (!report || !pattern) return <Navigate to="/quaderno" replace />;

  const aggregati = buildQuadernoAggregati(pattern, report, todayPatternId);
  const frase = fraseQuadernoPattern(pattern, aggregati);
  const livello = fraseLivello(pattern, targetRating) ?? fraseLivelloIndisponibile(pattern);
  const numeri = fraseNumeriQuaderno(pattern);

  const prove = [
    ...pattern.examples.map((o) => momentoFromOpportunity(o, "errore")),
    ...pattern.successfulExamples.map((o) => momentoFromOpportunity(o, "riuscita")),
  ];

  return <LezioneShell variant="passo" stepLabel="" onBack={onBack} backLabel={tr("Quaderno", "Notebook")}>
    <div className="quaderno-pattern">
      <h1 className="quaderno-pattern-title">{titoloPattern(pattern.kind)}</h1>
      <p className="quaderno-pattern-frase">{frase}</p>

      {prove.length > 0 && (
        <section aria-label={tr("Le prove", "The evidence")}>
          <p className="quaderno-kicker">{tr("Le prove", "The evidence")}</p>
          <ul className="quaderno-prove-list">
            {prove.map((momento) => (
              <li key={momento.opportunity.id}>
                <button type="button" className="quaderno-prova-row" onClick={() => onSelectMomento(momento.opportunity.id)}>
                  <span>{fraseProvaBreve(momento)}</span>
                  <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="quaderno-details">
        <summary>{tr("Il confronto di livello", "The level comparison")}</summary>
        <p>{livello}</p>
      </details>

      <details className="quaderno-details">
        <summary>{tr("I numeri", "The numbers")}</summary>
        <ul className="quaderno-numeri-list">
          {numeri.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </details>
    </div>
  </LezioneShell>;
}

/** Route "/quaderno/:patternId" (docs/GOAL_ESPERIENZA.md §3 "[Quaderno, backstage]"). */
export function QuadernoPattern() {
  const { patternId } = useParams<{ patternId: string }>();
  const nav = useNavigate();
  const data = useTavoloData();

  const report = data.aggregates?.personal_patterns ?? null;
  const profile = useMemo(() => ({ currentRating: data.currentRating, targetRating: data.targetRating, timeClass: "" }), [data.currentRating, data.targetRating]);
  const todayPatternId = useMemo(
    () => buildLezione({ report, learning: [], profile, progress: null })?.pattern.id ?? null,
    [report, profile],
  );
  const pattern = report?.patterns.find((p) => p.id === patternId) ?? null;

  return <QuadernoPatternView loading={data.loading} report={report} pattern={pattern} todayPatternId={todayPatternId} targetRating={data.targetRating}
    onBack={() => nav("/quaderno")}
    onSelectMomento={(momentoId) => nav(`/quaderno/${patternId}/${momentoId}`)} />;
}
