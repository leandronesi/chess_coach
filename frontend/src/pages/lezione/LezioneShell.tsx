import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronLeft } from "lucide-react";
import { tr } from "../../i18n/lang";
import "../../components/coach-shell.css";
import "./lezione.css";

interface LezioneShellHomeProps {
  variant: "home";
  children: ReactNode;
}

interface LezioneShellPassoProps {
  variant: "passo";
  /** e.g. "1 di 3" — monospace, not a heading, not clickable. */
  stepLabel: string;
  children: ReactNode;
  /** Overrides the default "Tavolo" back-link label (Gioco uses "Esci"). */
  backLabel?: string;
  /** When set, the back control is a button calling this instead of a Link to /lezione
   *  (Gioco needs to save the attempt and write esitoGioco before navigating). */
  onBack?: () => void;
}

type LezioneShellProps = LezioneShellHomeProps | LezioneShellPassoProps;

/**
 * Minimal chrome for the lezione path: no tabs, no account menu, no theme
 * toggle. At most two controls, marked `data-referee="chrome"` for the UX
 * referee (scripts/ux-referee.mjs). Deliberately NOT AppShell.
 */
export function LezioneShell(props: LezioneShellProps) {
  return (
    <div className="lezione-shell">
      <header className="lezione-chrome" data-referee="chrome">
        {props.variant === "home" ? (
          <>
            <span className="lezione-brand" aria-hidden="true">
              <span className="coach-brand-mark">n.</span>
              <strong>Nonno</strong>
            </span>
            <Link to="/quaderno" className="lezione-icon-btn" aria-label={tr("Quaderno", "Notebook")}>
              <BookOpen size={24} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </>
        ) : props.onBack ? (
          <>
            <button type="button" className="lezione-back" onClick={props.onBack}>
              <ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
              <span>{props.backLabel ?? tr("Tavolo", "Table")}</span>
            </button>
            <span className="lezione-step">{props.stepLabel}</span>
          </>
        ) : (
          <>
            <Link to="/lezione" className="lezione-back">
              <ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
              <span>{props.backLabel ?? tr("Tavolo", "Table")}</span>
            </Link>
            <span className="lezione-step">{props.stepLabel}</span>
          </>
        )}
      </header>
      <main className="lezione-main">{props.children}</main>
    </div>
  );
}
