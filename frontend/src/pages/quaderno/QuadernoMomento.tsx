import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useTavoloData } from "../tavolo/useTavoloData";
import { momentoFromOpportunity, type Lezione, type Momento } from "../../lezione/lezione";
import type { PersonalPattern, PersonalPatternReport } from "../../pipeline/personalPatterns";
import { downloadJson, analysisPath } from "../../auth/storage";
import type { GameAnalysis } from "../../pipeline/analyze";
import type { FilmLoader } from "../../lezione/film";
import { GuardoView } from "../lezione/Guardo";
import { tr } from "../../i18n/lang";

/**
 * Finds the pattern + momento named by the URL, tagging the outcome by which list it came
 * from. Exported so /dev/lezione?beat=quaderno-momento (LezionePreview.tsx) can look up the
 * same synthetic momento by id instead of duplicating this lookup.
 */
export function findMomento(report: PersonalPatternReport | null, patternId: string | undefined, momentoId: string | undefined): { pattern: PersonalPattern; momento: Momento } | null {
  if (!report || !patternId || !momentoId) return null;
  const pattern = report.patterns.find((p) => p.id === patternId);
  if (!pattern) return null;
  const asError = pattern.examples.find((o) => o.id === momentoId);
  if (asError) return { pattern, momento: momentoFromOpportunity(asError, "errore") };
  const asSuccess = pattern.successfulExamples.find((o) => o.id === momentoId);
  if (asSuccess) return { pattern, momento: momentoFromOpportunity(asSuccess, "riuscita") };
  return null;
}

/** Route "/quaderno/:patternId/:momentoId" — the Quaderno's read-only Guardo (docs/GOAL_ESPERIENZA.md §3 "[Quaderno, backstage]"). */
export function QuadernoMomento() {
  const { patternId, momentoId } = useParams<{ patternId: string; momentoId: string }>();
  const { user } = useAuth();
  const data = useTavoloData();

  const report = data.aggregates?.personal_patterns ?? null;
  const found = useMemo(() => findMomento(report, patternId, momentoId), [report, patternId, momentoId]);

  const lezione: Lezione | null = useMemo(() => {
    if (!found) return null;
    return {
      mode: "pattern",
      pattern: found.pattern,
      momenti: [found.momento],
      gioco: null,
      memoria: null,
      profile: { currentRating: data.currentRating, targetRating: data.targetRating, timeClass: "" },
      aggregati: { partite: found.pattern.games, errori: found.pattern.errors, velociConRiserva: null },
      progress: null,
    };
  }, [found, data.currentRating, data.targetRating]);

  const filmLoader: FilmLoader = useMemo(() => {
    const userId = user?.id;
    return async (gameId: string) => (userId ? downloadJson<GameAnalysis>(analysisPath(userId, gameId)) : null);
  }, [user?.id]);

  // Flat backstage nav (docs/GOAL_ESPERIENZA.md §3 "[Quaderno, backstage]"): every sub-screen
  // returns straight to the Quaderno list, not a pattern-detail breadcrumb.
  return <GuardoView loading={data.loading} lezione={lezione} n={1} filmLoader={filmLoader}
    onAvanti={() => {}} lettura={{ backTo: "/quaderno", backLabel: tr("Quaderno", "Notebook") }} />;
}
