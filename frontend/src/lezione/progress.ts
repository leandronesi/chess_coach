/**
 * progress.ts — one lezione a day, persisted per user.
 *
 * Storage: scopedStorage (see auth/userStorage.ts), same mechanism
 * PatternPractice.tsx uses — namespaced to the active user, cleared on logout.
 * A single record lives under one key: there is only ever "today's lezione".
 */

import { scopedStorage } from "../auth/userStorage";

export type LezioneBeat = "apertura" | "guardo" | "gioco" | "fine";
export type LezioneEsitoGioco = "fermato" | "sbagliato" | "ritirato" | "saltato";

export interface LezioneProgress {
  patternId: string;
  /** YYYY-MM-DD, local calendar day. */
  date: string;
  beat: LezioneBeat;
  momento: number;
  esitoGioco: LezioneEsitoGioco | null;
  completedAt: string | null;
}

const STORAGE_KEY = "lezione:v1";

/** Today's date as YYYY-MM-DD, local calendar (not UTC — "a day" means the player's day). */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isLezioneProgress(value: unknown): value is LezioneProgress {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.patternId === "string" && typeof v.date === "string"
    && typeof v.beat === "string" && typeof v.momento === "number";
}

export function readLezioneProgress(): LezioneProgress | null {
  const raw = scopedStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isLezioneProgress(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLezioneProgress(progress: LezioneProgress): boolean {
  return scopedStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

/**
 * Progress belongs to today only when its `date` matches the local calendar
 * day. A stale (older-day) record is never treated as "in progress" or
 * "completed today" — the next Sediamoci starts clean.
 */
export function isTodayProgress(progress: LezioneProgress | null): progress is LezioneProgress {
  return progress != null && progress.date === todayLocal();
}

/** True once today's lezione has an actual completion timestamp. */
export function isCompletedToday(progress: LezioneProgress | null): boolean {
  return isTodayProgress(progress) && progress.completedAt != null;
}
