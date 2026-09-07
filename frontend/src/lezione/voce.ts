/**
 * voce.ts — strato 1 (docs/GOAL_ESPERIENZA.md §3b): deterministic Nonno-voice
 * sentences built from verified facts (aggregates, the position itself, the
 * clock, the level comparison). No LLM. Every function returns a string, or
 * null when the underlying fact is not available — silence over invention
 * (skill nonno-voice).
 */

import { Chess } from "chess.js";
import type { Lezione, Momento } from "./lezione";
import type { PatternKind, PersonalPattern } from "../pipeline/personalPatterns";
import { buildMoveReason, pieceName, type MoveFacts } from "../session/moveReason";
import { buildLevelCompare } from "../session/levelCompare";
import { tr, getLang } from "../i18n/lang";

// ── SAN notation in Italian (piece letter only, never the square) ──────────

const PIECE_IT: Record<string, string> = { N: "C", B: "A", R: "T", Q: "D", K: "R" };

export function sanItaliano(san: string): string {
  if (!san) return san;
  if (san.startsWith("O-O")) return san; // castling has no piece letter
  let result = san;
  const first = result.charAt(0);
  if (PIECE_IT[first]) result = PIECE_IT[first] + result.slice(1);
  result = result.replace(/=([NBRQK])/, (_all, p: string) => `=${PIECE_IT[p] ?? p}`);
  return result;
}

/** Italianizes SAN tokens inside a prose string (e.g. "Nf3 mette al sicuro" -> "Cf3 mette al sicuro"). */
export function sanItalianoNelTesto(text: string): string {
  return text.replace(/\b([NBRQK])([a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)/g, (_all, piece: string, rest: string) => sanItaliano(piece + rest));
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function resolveBestSan(fenBefore: string, bestUci: string | null): string | null {
  if (!bestUci || bestUci.length < 4) return null;
  try {
    const board = new Chess(fenBefore);
    const mv = board.move({
      from: bestUci.slice(0, 2),
      to: bestUci.slice(2, 4),
      promotion: bestUci.length > 4 ? bestUci.slice(4, 5) : undefined,
    });
    return mv ? mv.san : null;
  } catch {
    return null;
  }
}

// ── Per-kind phrase banks ───────────────────────────────────────────────────

/** "In N partite, {clause}": what the pattern's errors actually are, with the count inside the clause. */
function clausolaErrori(kind: PatternKind, n: number): string {
  const volte = n === 1 ? tr("una volta", "once") : tr(`${n} volte`, `${n} times`);
  switch (kind) {
    case "hanging_piece": return tr(`un pezzo in presa ti e' sfuggito ${volte}`, `a hanging piece slipped past you ${volte}`);
    case "fork": return tr(`un doppio attacco ti e' sfuggito ${volte}`, `a double attack slipped past you ${volte}`);
    case "back_rank": return tr(`hai lasciato l'ultima traversa scoperta ${volte}`, `you left your back rank exposed ${volte}`);
    case "narrow_choice": return tr(`hai mosso in fretta dove c'erano due candidate vere, ${volte}`, `you rushed where there were two real candidates, ${volte}`);
    case "time_reserve": return tr(`hai mosso in pochi secondi con il tempo in riserva ${volte}`, `you moved in a few seconds with time in reserve ${volte}`);
    case "time_pressure": return tr(`hai sbagliato con l'orologio addosso ${volte}`, `you erred with the clock closing in ${volte}`);
    case "keep_advantage": return tr(`ti e' scappato un vantaggio ${volte}`, `an advantage slipped away ${volte}`);
  }
}

const COSA_GUARDO: Record<PatternKind, { it: string; en: string }> = {
  hanging_piece: { it: "se controlli cosa e' in presa prima di lasciare la mano", en: "whether you check what is hanging before letting go" },
  fork: { it: "se cerchi il doppio attacco prima di muovere", en: "whether you look for the double attack before moving" },
  back_rank: { it: "se tieni una via di fuga al re", en: "whether you keep an escape square for your king" },
  narrow_choice: { it: "se metti a confronto due candidate prima di scegliere", en: "whether you compare two candidates before choosing" },
  time_reserve: { it: "se, con piu' di un minuto, ti fermi prima di muovere", en: "whether, with more than a minute, you stop before moving" },
  time_pressure: { it: "cosa fai con meno di trenta secondi", en: "what you do with less than thirty seconds" },
  keep_advantage: { it: "se, in vantaggio, controlli il controgioco", en: "whether, while ahead, you check the counterplay" },
};

/** "{X} {n} volte su {m}": the subject must match what the window's errors actually count. */
const FRASE_RIUSCITA: Record<PatternKind, { it: string; en: string }> = {
  hanging_piece: { it: "Il pezzo in presa l'hai visto", en: "You saw the hanging piece" },
  fork: { it: "Il doppio attacco l'hai visto", en: "You saw the double attack" },
  back_rank: { it: "L'ultima traversa l'hai tenuta", en: "You held your back rank" },
  narrow_choice: { it: "Nelle scelte delicate hai tenuto", en: "In the delicate choices you held" },
  time_reserve: { it: "Con piu' di un minuto hai tenuto", en: "With more than a minute you held" },
  time_pressure: { it: "Con l'orologio addosso hai tenuto", en: "With the clock closing in you held" },
  keep_advantage: { it: "Il vantaggio l'hai tenuto", en: "You kept the advantage" },
};
const FRASE_FERMATO_TIME_RESERVE = { it: "Con piu' di un minuto ti sei fermato", en: "With more than a minute you stopped" };

function oggiNeGuardiamo(k: number): string {
  if (k <= 1) return tr("Oggi ne guardiamo uno, poi lo giochi tu.", "Today we look at just one, then you play it.");
  return tr(`Oggi ne guardiamo ${k}. Poi una la giochi tu, fino in fondo.`, `Today we look at ${k}. Then you play one, all the way through.`);
}

// ── Apertura ─────────────────────────────────────────────────────────────

export function fraseApertura(lezione: Lezione): string {
  if (lezione.mode === "momento") {
    return tr(
      `Ho letto ${lezione.aggregati.partite} partite: troppo poche per dirti cosa torna. Un momento pero' ce l'ho. Guardiamolo, poi lo giochi tu.`,
      `I have read ${lezione.aggregati.partite} games: too few to tell you what recurs. But I do have one moment. Let's look at it, then you play it.`,
    );
  }
  const clausola = clausolaErrori(lezione.pattern.kind, lezione.aggregati.errori);
  const base = tr(
    `Eccoti. In ${lezione.aggregati.partite} partite ${clausola}.`,
    `Here you are. In ${lezione.aggregati.partite} games ${clausola}.`,
  );
  const n = lezione.aggregati.velociConRiserva;
  const clock = n != null && n > 0
    ? tr(
        ` ${n} di quelle in pochi secondi: la mano che parte prima degli occhi.`,
        ` ${n} of those in a few seconds: the hand moving before the eyes.`,
      )
    : "";
  return `${base}${clock} ${oggiNeGuardiamo(lezione.momenti.length)}`;
}

// ── Contesto (Guardo) ────────────────────────────────────────────────────

export function fraseContesto(momento: Momento): string {
  const o = momento.opportunity;
  const date = new Date(o.playedAt);
  const giorno = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(getLang() === "en" ? "en-US" : "it-IT", { weekday: "long", day: "numeric", month: "long" }).format(date)
    : null;
  const numeroMossa = Math.ceil(o.ply / 2);
  const avversario = o.opponentRating != null
    ? tr(`un ${o.opponentRating}`, `a ${o.opponentRating}`)
    : tr("un avversario", "an opponent");
  const lead = giorno ? `${giorno}, ` : "";
  const base = tr(`${lead}contro ${avversario}. Mossa ${numeroMossa}`, `${lead}against ${avversario}. Move ${numeroMossa}`);
  const clockSeconds = o.timing.status === "available" ? o.timing.clockBeforeSeconds : null;
  const clock = clockSeconds != null
    ? tr(`, avevi ${formatClock(clockSeconds)} sull'orologio`, `, you had ${formatClock(clockSeconds)} on the clock`)
    : "";
  const sentence = `${base}${clock}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// ── Verdetto (Guardo) ────────────────────────────────────────────────────

export function fraseVerdetto(momento: Momento): string {
  const o = momento.opportunity;
  const playedSan = sanItaliano(o.playedSan);
  const spent = o.timing.status === "available" ? o.timing.spentSeconds : null;

  if (momento.esito === "riuscita") {
    return spent != null
      ? tr(`Qui l'hai vista: ${playedSan}, in ${spent} secondi. Bene cosi'.`, `Here you saw it: ${playedSan}, in ${spent} seconds. Good.`)
      : tr(`Qui l'hai vista: ${playedSan}. Bene cosi'.`, `Here you saw it: ${playedSan}. Good.`);
  }

  const base = spent != null
    ? tr(`Hai mosso ${playedSan} in ${spent} secondi.`, `You played ${playedSan} in ${spent} seconds.`)
    : tr(`Hai mosso ${playedSan}.`, `You played ${playedSan}.`);

  const reason = buildMoveReason({
    fenBefore: o.fen,
    myColor: o.color,
    playedSan: o.playedSan,
    playedUci: o.playedUci,
    bestUci: o.bestUci,
    lastOppSan: o.lastOpponentSan,
  });
  if (reason) return `${base} ${sanItalianoNelTesto(reason)}`;

  const bestSan = resolveBestSan(o.fen, o.bestUci);
  if (bestSan) {
    return `${base} ${tr(`Il motore preferiva ${sanItaliano(bestSan)}.`, `The engine preferred ${sanItaliano(bestSan)}.`)}`;
  }
  return base;
}

// ── Livello (Guardo) ─────────────────────────────────────────────────────

export function fraseLivello(pattern: PersonalPattern, targetRating: number): string | null {
  return buildLevelCompare({
    pMineAcceptable: pattern.maia.currentSupport,
    pTargetAcceptable: pattern.maia.targetSupport,
    targetRating,
    maiaStatus: pattern.maia.scored > 0 ? "scored" : null,
  });
}

// ── Fermata (Gioco) ──────────────────────────────────────────────────────

/**
 * The stop overlay's headline, right after the first (or retried) attempt at
 * the moment comes back "wrong". Built from extractMoveFacts on the position
 * with the move actually played — never invented (skill nonno-voice).
 */
export function fraseFermata(facts: MoveFacts | null): string {
  const prefix = tr("Aspetta.", "Wait.");
  const fatto = facts?.hung_piece
    ? tr(
        `Il ${pieceName(facts.hung_piece.type)} in ${facts.hung_piece.square}: chi lo difende?`,
        `Your ${pieceName(facts.hung_piece.type)} on ${facts.hung_piece.square}: who defends it?`,
      )
    : facts?.punishment
    ? tr(
        `Dopo ${sanItaliano(facts.punishment.capture_san)} cosa resta?`,
        `After ${facts.punishment.capture_san}, what is left?`,
      )
    : tr(
        "Guarda cosa lasci all'avversario prima di lasciare la mano.",
        "Look at what you leave for your opponent before letting go.",
      );
  return `${prefix} ${fatto}`;
}

/**
 * Second line of the stop card: the threat, never the answer. The retry is
 * only worth something if the player still has to find the move.
 */
export function fraseMinaccia(facts: MoveFacts | null): string | null {
  if (facts?.punishment && facts?.hung_piece) {
    return tr(
      `Dopo ${sanItaliano(facts.punishment.capture_san)} il ${pieceName(facts.hung_piece.type)} lo perdi gratis.`,
      `After ${facts.punishment.capture_san} you lose the ${pieceName(facts.hung_piece.type)} for nothing.`,
    );
  }
  if (facts?.punishment) {
    return tr(`L'avversario ha ${sanItaliano(facts.punishment.capture_san)}.`, `Your opponent has ${facts.punishment.capture_san}.`);
  }
  return null;
}

/** One line under the board: who is replying, without pretending it is a human rating. */
export function fraseFonteAvversario(source: "maia_target_policy" | "stockfish_fallback" | "unavailable" | null, targetRating: number): string {
  if (source === "stockfish_fallback") {
    return tr("Risponde Stockfish di riserva: Maia non e' disponibile adesso.", "Stockfish is replying as a fallback: Maia is not available right now.");
  }
  return tr(`Risponde la policy Maia al livello ${targetRating}. Non e' un giocatore vero.`, `The Maia policy at level ${targetRating} is replying. It is not a real player.`);
}

// ── Chiusura ─────────────────────────────────────────────────────────────

function momentiVisti(k: number): string {
  if (k <= 1) return tr("Bene cosi'. Un momento visto con calma.", "Well done. One moment, seen calmly.");
  if (k === 2) return tr("Bene cosi'. Due momenti visti con calma.", "Well done. Two moments, seen calmly.");
  return tr("Bene cosi'. Tre momenti visti con calma.", "Well done. Three moments, seen calmly.");
}

export function fraseChiusura(lezione: Lezione, esitoGioco: "fermato" | "sbagliato" | "ritirato" | "saltato" | null): string {
  const apertura = esitoGioco === "fermato"
    ? tr("Bene cosi'. Oggi ti sei fermato prima di muovere.", "Well done. Today you stopped before moving.")
    : esitoGioco === "sbagliato"
    ? tr("Oggi la mano e' partita di nuovo. Succede: adesso sai dove guardare.", "Today the hand moved again. It happens: now you know where to look.")
    : esitoGioco === "ritirato"
    ? tr("Oggi la mano e' partita di nuovo, ma l'hai ritirata. Adesso sai dove guardare.", "Today the hand moved again, but you took it back. Now you know where to look.")
    : momentiVisti(lezione.momenti.length);
  const cosa = COSA_GUARDO[lezione.pattern.kind];
  const prossime = tr(
    `Nelle prossime dieci partite guardo una cosa sola: ${cosa.it}.`,
    `In your next ten games I am watching just one thing: ${cosa.en}.`,
  );
  return `${apertura} ${prossime} ${tr("A domani.", "See you tomorrow.")}`;
}

// ── Ritorno (Apertura con memoria) ───────────────────────────────────────

export function fraseRitorno(lezione: Lezione): string {
  const memoria = lezione.memoria;
  if (!memoria) return fraseApertura(lezione);
  // time_reserve is about stopping, so count the pace when every clock in the window is known;
  // otherwise fall back to the error count, which is always known.
  const paceKnown = lezione.pattern.kind === "time_reserve" && memoria.tempoNoto === memoria.occasioni && memoria.occasioni > 0;
  const riuscite = paceKnown ? memoria.occasioni - memoria.veloci : memoria.occasioni - memoria.errori;
  const riuscitaLabel = paceKnown ? FRASE_FERMATO_TIME_RESERVE : FRASE_RIUSCITA[lezione.pattern.kind];
  const partite = memoria.partite === 1 ? tr("la partita nuova", "the new game") : tr(`le ${memoria.partite} partite nuove`, `the ${memoria.partite} new games`);
  const base = tr(
    `Ho letto ${partite}. ${riuscitaLabel.it} ${riuscite} volte su ${memoria.occasioni}.`,
    `I read ${partite}. ${riuscitaLabel.en} ${riuscite} out of ${memoria.occasioni} times.`,
  );
  const poche = memoria.poche
    ? tr(" Sono poche partite ancora, ma la mano sta cambiando.", " It is still a small sample, but the hand is changing.")
    : "";
  return `${base}${poche} ${oggiNeGuardiamo(lezione.momenti.length)}`;
}
