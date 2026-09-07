/**
 * voce.ts — strato 1 (docs/GOAL_ESPERIENZA.md §3b): deterministic Nonno-voice
 * sentences built from verified facts (aggregates, the position itself, the
 * clock, the level comparison). No LLM. Every function returns a string, or
 * null when the underlying fact is not available — silence over invention
 * (skill nonno-voice).
 */

import { Chess } from "chess.js";
import type { Lezione, LezioneAggregati, Momento } from "./lezione";
import type { PatternKind, PersonalPattern } from "../pipeline/personalPatterns";
import type { PatternLearning } from "../pipeline/patternLearning";
import { buildMoveReason, pieceName, pieceIsFeminine, pieceWithArticle, type MoveFacts } from "../session/moveReason";
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

function capitalizza(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "Domenica 30 agosto" — shared by fraseContesto (Guardo) and fraseProvaBreve (Quaderno). */
function formatGiornoData(iso: string): string | null {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(getLang() === "en" ? "en-US" : "it-IT", { weekday: "long", day: "numeric", month: "long" }).format(date)
    : null;
}

/** "5 settembre" — short form for reference dates that are not "the day of the mistake" (Quaderno's Tu/Come sta andando). */
function formatDataBreve(iso: string): string | null {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(getLang() === "en" ? "en-US" : "it-IT", { day: "numeric", month: "long" }).format(date)
    : null;
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
    case "narrow_choice": return tr(`hai sbagliato dove c'erano due candidate vere, ${volte}`, `you went wrong where there were two real candidates, ${volte}`);
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

/** Short pattern titles for the Quaderno (§A of the slice-4 spec) — a noun phrase, never a sentence. */
const TITOLO_PATTERN: Record<PatternKind, { it: string; en: string }> = {
  hanging_piece: { it: "Pezzi in presa", en: "Hanging pieces" },
  fork: { it: "Doppi attacchi", en: "Double attacks" },
  back_rank: { it: "L'ultima traversa", en: "The back rank" },
  narrow_choice: { it: "Scelte delicate", en: "Delicate choices" },
  time_reserve: { it: "Il tempo che hai", en: "The time you have" },
  time_pressure: { it: "Sotto i trenta secondi", en: "Under thirty seconds" },
  keep_advantage: { it: "Vantaggio da tenere", en: "Advantage to keep" },
};

export function titoloPattern(kind: PatternKind): string {
  const t = TITOLO_PATTERN[kind];
  return tr(t.it, t.en);
}

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
  const giorno = formatGiornoData(o.playedAt);
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
        `${capitalizza(pieceWithArticle(facts.hung_piece.type))} in ${facts.hung_piece.square}: chi ${pieceIsFeminine(facts.hung_piece.type) ? "la" : "lo"} difende?`,
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
      `Dopo ${sanItaliano(facts.punishment.capture_san)} ${pieceWithArticle(facts.hung_piece.type)} ${pieceIsFeminine(facts.hung_piece.type) ? "la" : "lo"} perdi gratis.`,
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

// ── Quaderno (backstage, docs/GOAL_ESPERIENZA.md §3 "[Quaderno, backstage]") ─

/** Opening voice of /quaderno. N = games_analyzed; when unknown, the sentence drops the number rather than inventing it. */
export function fraseQuadernoApertura(gamesAnalyzed: number | null): string {
  const partite = gamesAnalyzed != null
    ? tr(`nelle tue ${gamesAnalyzed} partite`, `across your ${gamesAnalyzed} games`)
    : tr("nelle tue partite", "across your games");
  return tr(
    `Qui c'e' tutto quello che ho visto ${partite}. Leggilo quando vuoi.`,
    `Here is everything I have seen ${partite}. Read it whenever you like.`,
  );
}

/** The pattern-kind-specific clause of fraseQuadernoPattern; see that function for the shared tail. */
function clausolaQuadernoPattern(pattern: PersonalPattern, aggregati: LezioneAggregati): string {
  const { kind, errors, opportunities, fastDecisions } = pattern;
  switch (kind) {
    case "time_reserve":
      return tr(
        `${fastDecisions} volte su ${opportunities} hai mosso in pochi secondi con il tempo in riserva.`,
        `${fastDecisions} times out of ${opportunities} you moved in a few seconds with time in reserve.`,
      );
    case "time_pressure":
      return tr(
        `${errors} errori su ${opportunities} occasioni sotto i trenta secondi.`,
        `${errors} mistakes out of ${opportunities} chances under thirty seconds.`,
      );
    case "narrow_choice":
      return tr(
        `Hai sbagliato ${errors} volte su ${opportunities} dove c'erano due candidate vere.`,
        `You went wrong ${errors} times out of ${opportunities} where there were two real candidates.`,
      );
    default: {
      const volte = errors === 1 ? tr("una volta", "once") : tr(`${errors} volte`, `${errors} times`);
      const base = tr(`${volte} in ${aggregati.partite} partite`, `${volte} in ${aggregati.partite} games`);
      const n = aggregati.velociConRiserva;
      const veloci = n != null && n > 0
        ? tr(`, ${n} in pochi secondi`, `, ${n} in a few seconds`)
        : "";
      return `${base}${veloci}.`;
    }
  }
}

/**
 * One row's frase in "Quello che torna" (and repeated atop /quaderno/:patternId).
 * aggregati.isToday (set by the Quaderno page, not by buildAggregati) appends the
 * "we're working on it since today" tail; evidence "insufficient" appends its own.
 */
export function fraseQuadernoPattern(pattern: PersonalPattern, aggregati: LezioneAggregati): string {
  const clausola = clausolaQuadernoPattern(pattern, aggregati);
  const sentence = clausola.charAt(0).toUpperCase() + clausola.slice(1);
  const insufficiente = pattern.evidence === "insufficient"
    ? tr(" Sono poche occasioni: non lo chiamo ancora un'abitudine.", " These are still few chances: I would not call it a habit yet.")
    : "";
  const oggi = aggregati.isToday
    ? tr(" Ci stiamo lavorando da oggi.", " We have been working on it since today.")
    : "";
  return `${sentence}${insufficiente}${oggi}`;
}

/** One row of "Le prove" on /quaderno/:patternId: date, opponent, move, seconds, outcome — no reasoning, no film. */
export function fraseProvaBreve(momento: Momento): string {
  const o = momento.opportunity;
  const giorno = formatGiornoData(o.playedAt);
  const numeroMossa = Math.ceil(o.ply / 2);
  const avversario = o.opponentRating != null ? tr(`un ${o.opponentRating}`, `a ${o.opponentRating}`) : tr("un avversario", "an opponent");
  const playedSan = sanItaliano(o.playedSan);
  const spent = o.timing.status === "available" ? o.timing.spentSeconds : null;
  const lead = giorno ? `${giorno}, ` : "";
  const base = tr(
    `${lead}contro ${avversario}, mossa ${numeroMossa}: ${playedSan}`,
    `${lead}against ${avversario}, move ${numeroMossa}: ${playedSan}`,
  );
  const tempo = spent != null ? tr(` in ${spent} secondi`, ` in ${spent} seconds`) : "";
  const esito = momento.esito === "riuscita" ? tr(" L'hai vista.", " You saw it.") : tr(" Ti e' sfuggito.", " It slipped past you.");
  const sentence = `${base}${tempo}.${esito}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** "Come sta andando" — one pattern's before/after, or null-state text when nothing has been practiced yet. */
export function fraseQuadernoLearning(learning: PatternLearning, kind: PatternKind): string {
  const data = formatDataBreve(learning.firstPracticedAt);
  const dataClause = data ?? tr("dal primo esercizio", "since the first exercise");
  const { subsequent, baseline } = learning;
  const riuscite = subsequent.opportunities - subsequent.errors;
  const riusciteBaseline = baseline.opportunities - baseline.errors;
  const soggetto = FRASE_RIUSCITA[kind];
  const base = tr(
    `${titoloPattern(kind)}, dal ${dataClause}: ${soggetto.it.charAt(0).toLowerCase()}${soggetto.it.slice(1)} ${riuscite} volte su ${subsequent.opportunities} nelle partite dopo l'esercizio. Prima erano ${riusciteBaseline} su ${baseline.opportunities}.`,
    `${titoloPattern(kind)}, since ${dataClause}: ${soggetto.en.charAt(0).toLowerCase()}${soggetto.en.slice(1)} ${riuscite} times out of ${subsequent.opportunities} in the games after the exercise. Before, it was ${riusciteBaseline} out of ${baseline.opportunities}.`,
  );
  const poche = subsequent.opportunities < 5
    ? tr(" Sono poche partite: ne servono almeno dieci per dirlo davvero.", " That is still few games: it takes at least ten to really tell.")
    : "";
  const escluse = learning.excludedChronologyGames > 0
    ? tr(
        ` ${learning.excludedChronologyGames} partite senza orario sono fuori dal confronto.`,
        ` ${learning.excludedChronologyGames} games without a timestamp are outside the comparison.`,
      )
    : "";
  return `${base}${poche}${escluse}`;
}

/** "Come sta andando" when no pattern has ever been practiced yet. */
export function fraseQuadernoNessunConfronto(): string {
  return tr("Il confronto comincia dopo la prima lezione giocata.", "The comparison starts after the first lezione you play.");
}

/** "Il confronto di livello" fallback when fraseLivello (voce.ts) returns null for lack of a scored Maia sample. */
export function fraseLivelloIndisponibile(pattern: PersonalPattern): string {
  return tr(
    `Maia non ha abbastanza posizioni confrontate per dirlo: ${pattern.maia.scored} su ${pattern.maia.eligible} idonee.`,
    `Maia has not compared enough positions to tell: ${pattern.maia.scored} of ${pattern.maia.eligible} eligible.`,
  );
}

/** "I numeri" — one sentence per line, every count inside a verb. Fixed sample-honesty sentence stays attached to "campione". */
export function fraseNumeriQuaderno(pattern: PersonalPattern): string[] {
  const { opportunities, games, errors, errorGames, fastDecisions, maia } = pattern;
  return [
    tr(`Il pattern e' capitato ${opportunities} volte in ${games} partite.`, `The pattern came up ${opportunities} times in ${games} games.`),
    tr(`Hai sbagliato ${errors} volte, in ${errorGames} partite diverse.`, `You erred ${errors} times, across ${errorGames} different games.`),
    tr(`Hai deciso in fretta ${fastDecisions} volte.`, `You decided quickly ${fastDecisions} times.`),
    tr(
      `Erano idonee per il confronto con Maia ${maia.eligible} posizioni, ne sono state valutate ${maia.scored}.`,
      `${maia.eligible} positions were eligible for the Maia comparison, ${maia.scored} of them were scored.`,
    ),
    tr(
      `Il campione era di ${maia.selected} posizioni. Il campione e' bilanciato per pattern e partita, non e' una stima della popolazione.`,
      `The sample held ${maia.selected} positions. The sample is balanced by pattern and game, not a population estimate.`,
    ),
  ];
}

/** "Tu": training cadence + how many games have been read, and when the last one was. */
export function fraseQuadernoCadenza(timeClass: string | null, gamesAnalyzed: number | null, lastGameDateIso: string | null): string {
  const cadenza = timeClass === "blitz"
    ? tr("Leggo le tue partite blitz.", "I read your blitz games.")
    : timeClass === "rapid"
    ? tr("Leggo le tue partite rapid.", "I read your rapid games.")
    : tr("Non hai ancora scelto una cadenza.", "You have not chosen a time control yet.");
  const data = lastGameDateIso ? formatDataBreve(lastGameDateIso) : null;
  const letture = gamesAnalyzed != null
    ? (data
      ? tr(`Ho letto ${gamesAnalyzed} partite, l'ultima il ${data}.`, `I have read ${gamesAnalyzed} games, the last one on ${data}.`)
      : tr(`Ho letto ${gamesAnalyzed} partite.`, `I have read ${gamesAnalyzed} games.`))
    : tr("Non ho ancora partite lette.", "I have not read any games yet.");
  return `${cadenza} ${letture}`;
}
