import { Suspense, lazy, Fragment } from "react";
import { tr, LangProvider, useLang } from "./i18n/lang";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { OnboardingRunProvider } from "./pipeline/OnboardingRunContext";
import { Signup } from "./pages/auth/Signup";
import { Login } from "./pages/auth/Login";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { UpdatePassword } from "./pages/auth/UpdatePassword";
import { Onboarding } from "./pages/auth/Onboarding";
import { OnboardingWaiting } from "./pages/auth/OnboardingWaiting";
const PatternPreview = import.meta.env.DEV ? lazy(() => import("./pages/dev/PatternPreview")) : null;
const LezionePreview = import.meta.env.DEV ? lazy(() => import("./pages/dev/LezionePreview")) : null;
import { Apertura } from "./pages/lezione/Apertura";
import { Guardo } from "./pages/lezione/Guardo";
import { Gioco } from "./pages/lezione/Gioco";
import { Chiusura } from "./pages/lezione/Chiusura";
import { Landing } from "./pages/Landing";
import { Quaderno } from "./pages/quaderno/Quaderno";
import { QuadernoPattern } from "./pages/quaderno/QuadernoPattern";
import { QuadernoMomento } from "./pages/quaderno/QuadernoMomento";
import { MaiaTest } from "./pages/MaiaTest";
import { PRODUCT_NAME } from "./coaching";
import { Settings } from "./pages/settings/Settings";
import { Privacy } from "./pages/Privacy";
import { isAnalyzedTimeClass } from "./pipeline/config";

/**
 * Root router multi-utente per Nonno's Table.
 *
 * Flow (docs/GOAL_ESPERIENZA.md):
 *   anon                       → Landing (con CTA a signup/login)
 *   logged, no profile         → /onboarding
 *   logged, profile != ready   → /onboarding/waiting
 *   logged, profile == ready   → /lezione (la lezione del giorno)
 *
 * Percorso principale: /lezione*. Backstage: /quaderno*, /settings.
 */

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center text-[color:var(--color-muted)]"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="text-center">
        <div className="label-eyebrow text-[color:var(--color-brand-soft)]">
          {PRODUCT_NAME}
        </div>
        <div className="text-sm mt-2">{label}</div>
      </div>
    </div>
  );
}

/** Smista in base a sessione + stato profile: profilo pronto porta sempre a /lezione. */
function HomeGate() {
  const { loading, user, profile, profileLoading, profileError } = useAuth();
  if (loading || (!profile && profileLoading)) return <FullScreenLoader label={tr("Carico la sessione…", "One moment.")} />;
  if (!user) return <Landing />;
  if (!profile && profileError) return <Navigate to="/onboarding/waiting" replace />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  if (!isAnalyzedTimeClass(profile.goal_time_class)) {
    return <Navigate to="/onboarding/waiting" replace />;
  }
  if (profile.onboarding_state !== "ready") {
    return <Navigate to="/onboarding/waiting" replace />;
  }
  return <Navigate to="/lezione" replace />;
}

/** Wrapper per route che richiedono utente loggato (qualsiasi stato profile). */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <FullScreenLoader label={tr("Carico la sessione…", "One moment.")} />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Core product routes require a supported, completed analytical profile. */
function RequireReadyProfile({ children }: { children: React.ReactNode }) {
  const { loading, user, profile, profileLoading, profileError } = useAuth();
  if (loading || (!profile && profileLoading)) return <FullScreenLoader label={tr("Carico la sessione…", "One moment.")} />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile && profileError) return <Navigate to="/onboarding/waiting" replace />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  if (!isAnalyzedTimeClass(profile.goal_time_class) || profile.onboarding_state !== "ready") {
    return <Navigate to="/onboarding/waiting" replace />;
  }
  return <>{children}</>;
}

/** Remounts the visual tree on language change so every tr() re-evaluates.
 *  Sits BELOW the stateful providers, so a language switch does NOT remount
 *  AuthProvider / OnboardingRunProvider (the session and orchestrator run survive). */
function VisualRemountBoundary({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  return <Fragment key={lang}>{children}</Fragment>;
}

export function App() {
  const basename = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || undefined;
  return (
    <LangProvider>
    <AuthProvider>
      {/* OnboardingRunProvider vede useAuth e sopravvive alle route changes */}
      <OnboardingRunProvider>
      <BrowserRouter basename={basename}>
        {/* Room grain — static SVG noise layer, covers every page, pointer-events none */}
        <div className="room-grain" aria-hidden="true" />
        {/* Remount the visual tree on language change (providers above stay mounted) */}
        <VisualRemountBoundary>
        <Routes>
          {/* Pubbliche */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route path="/privacy" element={<Privacy />} />

          {/* Onboarding (richiede auth, gestisce stato profile dentro) */}
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />
          <Route
            path="/onboarding/waiting"
            element={
              <RequireAuth>
                <OnboardingWaiting />
              </RequireAuth>
            }
          />

          {/* Home — primo ingresso in Stanza, ritorni direttamente al Tavolo */}
          <Route path="/" element={<HomeGate />} />

          {/* La lezione — percorso principale (docs/GOAL_ESPERIENZA.md). /tavolo e' il vecchio ingresso, ora un redirect. */}
          <Route path="/tavolo" element={<Navigate to="/lezione" replace />} />
          <Route path="/lezione" element={<RequireReadyProfile><Apertura /></RequireReadyProfile>} />
          <Route path="/lezione/guardo/:n" element={<RequireReadyProfile><Guardo /></RequireReadyProfile>} />
          <Route path="/lezione/gioco" element={<RequireReadyProfile><Gioco /></RequireReadyProfile>} />
          <Route path="/lezione/fine" element={<RequireReadyProfile><Chiusura /></RequireReadyProfile>} />
          {PatternPreview && <Route path="/dev/patterns" element={<Suspense fallback={<div>Caricamento…</div>}><PatternPreview /></Suspense>} />}
          {LezionePreview && <Route path="/dev/lezione" element={<Suspense fallback={<div>Caricamento…</div>}><LezionePreview /></Suspense>} />}

          {/* Account, privacy, export/delete and first-party feedback. Own LezioneShell chrome, not AppShell. */}
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />

          {/* Il Quaderno — backstage: tutto quello che il rebuild ha costruito, letto come frasi. */}
          <Route path="/quaderno" element={<RequireReadyProfile><Quaderno /></RequireReadyProfile>} />
          <Route path="/quaderno/:patternId" element={<RequireReadyProfile><QuadernoPattern /></RequireReadyProfile>} />
          <Route path="/quaderno/:patternId/:momentoId" element={<RequireReadyProfile><QuadernoMomento /></RequireReadyProfile>} />
          {/* Legacy routes redirect into the Quaderno */}
          <Route path="/freni"     element={<Navigate to="/quaderno" replace />} />
          <Route path="/cadute"    element={<Navigate to="/quaderno" replace />} />
          <Route path="/progressi" element={<Navigate to="/quaderno" replace />} />
          <Route path="/sessione"  element={<Navigate to="/lezione" replace />} />

          {/* Maia smoke test — dev only (hidden from production build) */}
          {import.meta.env.DEV && (
            <Route path="/maia-test" element={<MaiaTest />} />
          )}

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </VisualRemountBoundary>
      </BrowserRouter>
      </OnboardingRunProvider>
    </AuthProvider>
    </LangProvider>
  );
}
