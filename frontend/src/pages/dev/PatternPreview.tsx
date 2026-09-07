/**
 * PatternPreview.tsx — "/dev/patterns?preparation..." (DEV only, no auth).
 *
 * Slice 4 (docs/GOAL_ESPERIENZA.md): the pattern-home/detail/practice/progress
 * dev views this file used to serve are gone along with PatternHome.tsx,
 * PatternLibrary.tsx, PatternPractice.tsx, PatternProgress.tsx and AppShell
 * (see the slice-4 removal notes). This route survives, narrowed to its one
 * remaining live consumer: `AnalysisPreparation`, the onboarding-waiting
 * screen, whose visual states `e2e/public-mobile.spec.ts` still exercises
 * here (progress counts, error recovery, Maia comparison estimate). The
 * `?preparation` query flag is kept even though it is now the only mode, so
 * that spec's existing goto() calls keep working unchanged.
 */

import { useState } from "react";
import { AnalysisPreparation } from "../auth/AnalysisPreparation";

export default function PatternPreview() {
  const [compared, setCompared] = useState(36);
  const params = new URLSearchParams(window.location.search);
  return <>
    <AnalysisPreparation
      progress={{
        activity: params.has("maia") ? { stage: "maia", completed: compared, total: 200 } : undefined,
        phase: params.has("maia") ? "coaching" : "analyzing",
        monthsTotal: 2, monthsDone: 2, gamesTotal: 24, gamesDone: 6, gamesAnalyzed: 5, corpusFinalized: true,
      }}
      error={params.has("error") ? "Esempio sintetico: connessione interrotta." : null}
      ready={params.has("ready")}
      username="ANTEPRIMA SINTETICA"
      onEnter={() => { window.location.href = window.location.pathname; }}
      onRetry={() => { window.location.search = "?preparation"; }}
      onExit={() => { window.location.href = "/login"; }}
    />
    {params.has("maia") && <button onClick={() => setCompared((n) => n + 12)}>Simula 12 confronti completati</button>}
  </>;
}
