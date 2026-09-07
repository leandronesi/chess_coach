# GOAL: dal catalogo alla lezione

> Bozza del 6 settembre 2026. Decisioni prese da lnesi lo stesso giorno:
> esperienza A (la lezione); Gioco con giocabilita' da partita contro bot;
> fermata unica dopo il design canvas. La voce segue la raccomandazione del §3b.
> Canvas approvato il 6 settembre 2026: il run e' autorizzato fino alla verifica finale.
> Questo documento prevale su `REBUILD_GOAL.md` per tutto cio' che l'utente
> vede e tocca. I contratti sui dati di
> `REBUILD_GOAL.md` (tempo prima della decisione, Maia relativo, denominatori,
> campione insufficiente) restano validi: cambia come vengono resi, non se.

## 1. Obiettivo

Trasformare il prodotto da un catalogo di pattern con filtri a una lezione
guidata da telefono: ogni giorno il prodotto ti convoca su UN pattern trovato
nelle tue partite, te lo fa vedere in tre momenti reali, te lo fa giocare fino
in fondo contro un avversario al tuo livello obiettivo, e ti dice cosa guardera'
nelle prossime partite. Il motore di analisi resta quello di oggi. Cambia tutto
quello che sta sopra.

Il risultato e' raggiunto quando una persona che non ha mai visto l'app, con il
telefono in mano, capisce in un secondo cosa sta guardando e cosa deve fare su
ogni schermata del percorso principale, e finisce la lezione senza mai scegliere
tra piu' di un bottone.

## 2. Perche' (misurato il 6 settembre 2026 a 390 px, dati sintetici `/dev/patterns`)

| Schermata | Altezza | Controlli visibili | Cosa non va |
|---|---|---|---|
| Home | 2,3 schermi | 6 bottoni + 14 link + 5 tab | Il titolo e' generico. La CTA e' il terzo blocco. Due card con numeri senza verdetto. |
| Dettaglio pattern | 2,1 schermi | 48 bottoni | Filtri "Errori / Scelte riuscite" e chip "Partita 1..6": un database, non una prova. La scacchiera arriva dopo 1,5 schermi. |
| Allenamento | 1,1 schermi | 14 controlli toccabili per fare UNA mossa | Domanda meta prima di muovere ("Come affronti questa scelta?"). Posizione 1/1, mossa singola. La barra tab fissa copre le ultime traverse della scacchiera. |

Le tre lamentele di lnesi (troppi tasti, non capisco cosa vedo, esercizi da
mossa singola) sono lo stesso difetto: `REBUILD_GOAL.md` ha reso ogni contratto
di onesta' un elemento di UI, e ha lasciato cadere le regole della sottrazione
di `PRODUCT.md` §11 (una CTA per schermo, una voce, lui ti convoca). Il
risultato mostra la propria epistemologia invece del proprio significato.

## 3. L'esperienza da realizzare (storyboard a 390 px)

Ogni beat e' una schermata. La voce e' una sola, in seconda persona, secondo la
skill `nonno-voice`. Le frasi sono frammenti autoriali costruiti da fatti veri
della posizione e degli aggregati (come `PRODUCT.md` §0.5): zero LLM sul
percorso principale. La narrazione LLM resta un approfondimento a richiesta.

**[Apertura]** Apri l'app. Una schermata, niente scroll. Una frase di apertura
che cita il pattern del giorno con un numero vero e una circostanza vera:
"In 24 partite ti ho visto lasciare un pezzo in presa 11 volte, quasi sempre
con piu' di un minuto sull'orologio. Oggi ne guardiamo tre, poi uno lo giochi
tu." Un bottone: "Sediamoci". In alto, piccola, l'icona del quaderno. Nient'altro.

**[Guardo, 1 di 3]** Una riga di contesto (data, avversario, mossa, orologio
prima della scelta). La scacchiera intera, mai coperta. Sotto, il film delle
3-4 mosse precedenti con un solo controllo avanti/indietro. Poi il verdetto in
due frasi: cosa hai fatto e in quanti secondi, cosa lasciava la tua mossa, cosa
era meglio e perche' (frase vera dalla posizione). Un bottone: "Avanti".

**[Guardo, 2 e 3]** Come sopra, da partite diverse. Uno dei tre momenti puo'
essere una scelta riuscita: "Qui ti sei fermato. Bravo." La prova positiva e'
parte della lezione, non un filtro.

**[Gioco]** "Ora tocca a te. Stessa partita, stessa posizione, stesso
orologio." E' una partita contro un bot, con la giocabilita' che ci si aspetta
da Lichess o Chess.com (decisione lnesi 6 settembre 2026):

- scacchiera orientata dal tuo lato, tocco e trascinamento, case legali
  evidenziate, ultima mossa e scacco evidenziati, scelta del pezzo in promozione;
- eval bar sempre visibile accanto alla scacchiera, alimentata da Stockfish nel
  browser (deroga esplicita del PO al divieto della skill `nonno-voice`: vale
  solo qui, come strumento di gioco, mai come verdetto nella voce);
- orologio della partita originale che riparte dalla riserva che avevi, e viene
  misurato in silenzio; nessuna domanda prima di muovere;
- lista mosse navigabile avanti e indietro; "Ripensaci" ritira la tua ultima
  mossa e la risposta, senza limite;
- avversario: policy Maia al livello obiettivo, con Stockfish di riserva; una
  riga lo dichiara, senza equipararlo a un rating umano; risposta entro un
  secondo percepito;
- al momento del pattern, se sbagli il gioco si ferma: "Aspetta. Guarda c5."
  e puoi rigiocare. Se lo passi: "Ecco. Stavolta l'hai vista." L'interruzione
  e' l'unico aiuto: niente bottone "suggerimento";
- si continua finche' vuoi o fino a un tetto di semimosse; il verdetto e' sul
  momento del pattern, non sull'esito della partita; uscita sempre possibile.

Controlli fuori dalla scacchiera: "Ripensaci", la navigazione della lista
mosse, l'uscita. Nient'altro.

**[Chiusura]** Due frasi: cosa e' successo oggi e cosa il prodotto guardera'
nelle prossime partite ("Nelle prossime dieci partite guardo se ti fermi quando
hai piu' di un minuto"). Un bottone: "Vai e gioca".

**[Ritorno]** Dopo nuove partite, l'apertura porta la memoria: "Ho letto le sei
partite di ieri. Ti sei fermato quattro volte su cinque. Oggi lavoriamo su
un'altra cosa." Se il campione non basta, lo dice in una frase, non con una
tabella.

**[Quaderno, backstage]** Un posto solo, dall'icona in alto. I pattern trovati
(oggi sette tipi), ognuno con la frase-verdetto, le prove raccontate come storia
(partita, data, cosa e' successo) e, a richiesta, il confronto di livello, i
denominatori e i limiti del campione. Progressi: prima/dopo in una frase con il
suo denominatore. Profilo: obiettivo, cadenza, aggiorna partite. Tutto cio' che
`REBUILD_GOAL.md` ha costruito resta raggiungibile da qui.

### 3b. La voce: due strati, il primo basta

lnesi (6 settembre): "non so se riusciamo a essere sharp senza un LLM, ma non
so se un LLM capisce di scacchi". Risposta: l'LLM non deve capire di scacchi,
deve scrivere bene fatti che gli vengono dati gia' verificati.

- **Strato 1, sempre acceso.** Frasi autoriali costruite in modo deterministico
  da fatti veri: aggregati ("11 volte in 24 partite, quasi sempre con piu' di
  un minuto"), posizione (`moveReason.ts`: quale pezzo, quale casa, cosa
  faceva la mossa giusta), tempo (`spent_seconds`), livello (`levelCompare.ts`).
  Sono sharp perche' nominano il TUO pezzo e la TUA casa; quando il fatto manca,
  tacciono. E' il pavimento: la lezione funziona intera senza quota LLM.
- **Strato 2, quando c'e' quota.** Una sola chiamata per lezione, che riceve
  SOLO i fatti dello strato 1 e li riscrive in voce di Nonno, collegando i tre
  momenti e la memoria ("la stessa mano di martedi'"). Un referee deterministico
  scarta ogni frase che nomina una casa, un pezzo, una mossa o un numero non
  presente nei fatti, o che usa le forme vietate; in caso di scarto resta lo
  strato 1. L'utente non vede differenza di struttura, solo di prosa.

Ordine di lavoro: si costruisce e si giudica lo strato 1 su dati reali; lo
strato 2 entra come ultimo slice, solo se lnesi trova lo strato 1 non
abbastanza sharp. E' la regola "LLM giocatore, Python referee".

## 4. Invarianti hard (referee deterministico, cancello di build)

Uno script Playwright `frontend/scripts/ux-referee.mjs` visita le schermate del
percorso principale a 360, 390 e 430 px con i dati sintetici e fallisce se:

- una schermata del percorso principale ha piu' di una CTA primaria, o piu' di
  tre altri controlli toccabili fuori dalla scacchiera e dal chrome;
- il chrome dell'app ha piu' di due controlli (icona quaderno e indietro);
- la scacchiera non e' interamente visibile nel primo viewport in Guardo e
  Gioco, o e' coperta da un elemento fisso;
- l'Apertura non sta in un viewport; Guardo, Gioco e Chiusura superano 1,6 viewport;
- sul percorso principale compaiono chip di filtro, tab, selettori "Partita N"
  o una barra di navigazione inferiore;
- la fase Gioco non permette almeno due mosse dell'utente con risposta
  dell'avversario prima del verdetto, o non offre il ritiro della mossa;
- nella fase Gioco la scacchiera, l'eval bar e l'orologio non stanno insieme
  nel primo viewport a 360 px;
- il copy del percorso principale contiene em-dash, o una schermata apre con
  un'etichetta invece che con una frase.

Il referee vive nel repo, gira in `npm run build` e nella CI. Un'invariante che
non si puo' misurare non entra nel referee: viene giudicata da lnesi sugli
screenshot.

## 5. Cosa resta fermo

- Pipeline (`analyze`, `aggregate`, `decisionTiming`, `personalPatterns`,
  `patternLearning`), schema Supabase, Edge Functions: si toccano solo se un
  beat non puo' funzionare senza, e la modifica sta nello stesso slice con la
  sua migrazione e il suo vincolo (vedi `modo-di-lavoro` §5).
- Nessuna migrazione applicata al database remoto senza il via esplicito di lnesi.
- Landing, auth, onboarding: solo i cambi necessari a sbarcare sull'Apertura.
- Nessuna nuova feature di prodotto. Nessun paywall. Nessuna LLM sul percorso principale.
- Bug o debiti trovati per strada: si riportano nel log, non si correggono,
  salvo che il beat non possa funzionare senza.
- Le superfici vecchie che il nuovo routing rende irraggiungibili si eliminano
  nello stesso slice; il resto si elenca come follow-up.
- Test: quelli che il repo gia' tiene per questo tipo di cambio (Playwright a
  360/390/430, Vitest sulla logica), uno per comportamento dichiarato. Gli
  script di verifica usa e getta non diventano test permanenti.

## 6. Come si lavora in questo run

- Branch dedicato. Commit per slice coerente sul branch, build verde e
  secret-check prima di ogni commit. Mai merge o push su `main` senza lnesi.
- Fase 0: storyboard visivo dei sei beat come design canvas, rifinito a mano da
  lnesi. Nessun codice di UI prima dell'approvazione del canvas. E' l'unico
  punto di fermata previsto: tutto il resto procede da solo.
- Ogni slice chiude con: screenshot a 360/390/430 in `.local-validation/ux/<slice>/`,
  esito del referee, test passati, e una riga per schermata "cosa legge l'utente
  nel primo secondo". Le prove si aggiungono in coda a questo documento, come
  in `REBUILD_GOAL.md`.
- Chi esegue non e' osservato in tempo reale: non chiede permesso per lavoro
  gia' richiesto, non termina il turno con un piano al posto del lavoro, si
  ferma solo alle fermate elencate qui o per azioni distruttive.
- Se il contesto viene compattato, il riassunto conserva parola per parola:
  lo storyboard del §3, le soglie del §4, le fermate del §6, e lo stato del §7.
- Prosa e copy senza manierismi: dire la cosa, non la metafora della cosa.

## 7. Stato del lavoro

Il GOAL resta aperto finche' il percorso Apertura, Guardo x3, Gioco, Chiusura,
Ritorno funziona da telefono su dati reali e il referee e' verde.

- [x] Fase 0: design canvas dei sei beat approvato da lnesi il 6 settembre 2026 ("mi torna, approvato, vai"; ha voluto in particolare l'orologio originale che scorre come in partita).
      Bozza del 6 settembre: https://claude.ai/code/artifact/ed05198d-7c0a-4d34-bca8-1dba8e46c5a5
- [x] Referee UX nel repo, rosso sulle schermate attuali (prova che misura).
- [x] Apertura e Chiusura con memoria: una frase vera, un bottone.
- [x] Guardo: film, verdetto in due frasi, scacchiera intera.
- [x] Gioco: partita contro Maia al livello obiettivo con eval bar, orologio,
      lista mosse, Ripensaci, fermata sul pattern.
- [ ] Voce strato 2 (LLM sotto referee): solo se lnesi giudica lo strato 1 non sharp.
- [x] Quaderno backstage: prove come storia, numeri a richiesta, progressi in una frase.
- [x] Rimozione della barra tab e delle superfici rese irraggiungibili.
- [ ] Verifica su corpus reale con `verify-full-journey.mjs` esteso al nuovo percorso.

La verifica finale cita prove per ogni riga. Una build verde da sola non basta.

## Evidenze di implementazione, slice 1: il referee

- `frontend/scripts/ux-referee.mjs` (`npm run referee`, `npm run referee:legacy`):
  avvia Vite su una porta libera, visita le scene a 360/390/430 px e applica le
  invarianti del §4. Contratto di marcatura: `data-referee=chrome|board|eval|clock|moves`,
  `data-cta=primary|takeback`. Cio' che la UI non marca viene contato contro di lei.
- Eseguito il 7 settembre 2026 sulle schermate attuali (`--scenes legacy`): nove scene
  rosse su nove. Home: 21 controlli fuori chrome e 2,3 viewport. Dettaglio pattern:
  60 controlli, 12 chip, 6 selettori "Partita N", scacchiera non marcata. Allenamento:
  52 controlli, barra fissa in basso, niente eval bar, orologio, lista mosse, Ripensaci.
  Report e screenshot in `frontend/.local-validation/ux-referee/legacy/`.
- Il cancello su `prebuild` e in CI viene agganciato nello slice di rimozione, quando
  il percorso principale esiste: prima renderebbe rosso il branch per giorni.
- Build verde. Nessun test aggiunto: il referee e' esso stesso la verifica.

## Evidenze di implementazione, slice 2: la lezione senza il Gioco

- `frontend/src/lezione/`: `lezione.ts` (selezione pura: pattern con evidenza,
  tre momenti da partite distinte con la scelta riuscita al secondo posto,
  modalita' "momento" quando il campione non basta, memoria dalle finestre di
  `patternLearning`), `voce.ts` (strato 1: apertura, contesto, verdetto con il
  perche' vero di `moveReason`, livello da `levelCompare`, chiusura, ritorno;
  notazione italiana anche dentro le frasi del motore), `progress.ts` (una
  lezione al giorno, per utente), `film.ts` (FEN di partenza del film letto
  dall'analisi della partita al ply giusto; senza analisi degrada, mai inventa).
- `frontend/src/pages/lezione/`: `LezioneShell` (chrome a due controlli, niente
  tab), `Apertura`, `Guardo`, `Chiusura`, `Gioco` segnaposto, `lezione.css`.
  Route `/lezione`, `/lezione/guardo/:n`, `/lezione/gioco`, `/lezione/fine`;
  `HomeGate` porta a `/lezione`; `/tavolo` e' un redirect.
- Anteprima `/dev/lezione?beat=...` con la posizione approvata nel canvas
  (cavallo in e5 in presa dopo ...d6, verificata con chess.js).
- Revisione di chi dirige, con tre correzioni prima del commit: (1) il
  progresso veniva riletto dallo storage a ogni render, cambiando identita' a
  lezione e momento e facendo ripartire in loop il caricamento del film dallo
  Storage; ora si legge una volta per montaggio; (2) l'Apertura diceva "con
  piu' di un minuto sull'orologio" da un dato che registra solo il ritmo
  ("in pochi secondi"): la frase ora dice cio' che il ledger sa; (3) un errore
  nel caricamento dei tentativi bloccava la lezione intera, mentre serve solo
  alla memoria del Ritorno: ora la lezione si apre senza memoria e l'errore va
  in console. Piu' copy: chiusura parametrica sul numero di momenti, esito
  "ritirato" previsto per il Gioco, memoria del Ritorno con il soggetto giusto
  per tipo di pattern, voce allineata a sinistra e bottone pieno come nel canvas.
- Verifiche del 7 settembre 2026: Vitest 25 file, 199 test (16 nuovi);
  Playwright 19 test (3 nuovi: percorso intero, Apertura senza scroll a 360 px,
  Ritorno con "4 volte su 5"); referee verde su apertura, guardo, chiusura,
  ritorno a 360/390/430; foundation 17/17; build verde. Screenshot in
  `frontend/.local-validation/ux/slice-2/`.
- Prima riga che legge l'utente (dati sintetici): Apertura "Eccoti. In 5 partite
  un pezzo in presa ti e' sfuggito 4 volte."; Guardo "Domenica 30 agosto, contro
  un 1240. Mossa 13, avevi 4:12 sull'orologio." e verdetto "Hai mosso a3 in 6
  secondi. Il tuo cavallo in e5 era in presa. Cf3 mette al sicuro il pezzo.";
  Chiusura "Bene cosi'. Tre momenti visti con calma."; Ritorno "Ho letto le 6
  partite nuove. Il pezzo in presa l'hai visto 4 volte su 5."
- Debiti riportati, non corretti: il ramo "completata oggi / Rivediamola" non
  ha un test automatico; "Riprova" su errore di rete ricarica la pagina perche'
  `useTavoloData` non espone un retry mirato; l'evidenziazione delle case in
  `BoardView` e' un anello con alone, non il riempimento piatto del canvas.

## Evidenze di implementazione, slice 3: il Gioco

- `frontend/src/lezione/partita.ts`: macchina a stati pura della partita (mosse
  utente e avversario, momento con primo tentativo e ultimo tentativo, fermata,
  "Lascio cosi'", Ripensaci senza limite, sfoglio della lista mosse, orologio con
  incremento, bandierina, tetto di 20 semimosse dopo il momento, esito).
  `usePartita.ts`: Stockfish per la valutazione del momento e dell'eval bar,
  avversario da `opponentPolicy.ts` (policy Maia al livello obiettivo, Stockfish
  di riserva dichiarato), timer a 250 ms, persistenza per utente, salvataggio del
  tentativo con UUID stabile e "Riprova" nella Chiusura se non arriva all'account.
- `Gioco.tsx`: la schermata del canvas. `BoardView` ha ora case legali, ultima
  mossa e scacco (prop opzionali). La fermata e' un velo con una domanda sul
  fatto ("Aspetta. Il cavallo in e5: chi lo difende?") e la minaccia sotto,
  Ripensaci primario e "Lascio cosi'" discreto.
- Revisione di chi dirige, quattro correzioni prima del commit: (1) dopo un
  Ripensaci il tentativo buono sovrascriveva il primo e l'esito diventava
  "fermato" con `correct = true` salvato: ora il primo tentativo e' l'esito
  (`firstTry`) e l'ultimo guida solo il feedback (`lastTry`); (2) l'orologio
  addebitava al giocatore le pause (bot che pensa, fermata, sfoglio) al ritorno
  del turno: ora il tick dimentica l'ultimo istante quando non consuma;
  (3) la fermata rivelava la soluzione ("Cf3 mette al sicuro il pezzo"): ora
  nomina la minaccia ("Dopo dxe5 il cavallo lo perdi gratis"), mai la risposta;
  (4) la dichiarazione della fonte era un paragrafo tecnico troncato: ora una
  riga ("Risponde la policy Maia al livello 1400. Non e' un giocatore vero.").
- Prova con i motori veri nel browser (`/dev/lezione?beat=gioco&real`, modello
  Maia locale): al primo tentativo Maia andava in timeout durante il caricamento
  del modello e rispondeva sempre Stockfish di riserva. Ora Maia si scalda
  nell'ultimo Guardo e all'ingresso nel Gioco, con 15 s di budget al turno:
  risposta in 2,1 s con fonte `maia_target_policy` e massa campionata 0,10;
  orologio da 4:12 a 4:07 senza addebito della valutazione; nessun errore di pagina.
- Verifiche del 7 settembre 2026: Vitest 26 file, 225 test (26 nuovi in
  `partita.test.ts`, inclusa la pausa non addebitata); Playwright 22 test
  (3 nuovi: fermata, Ripensaci, mossa buona, trascinamento, sfoglio, takeback,
  uscita con esito "ritirato"; ripresa dopo reload; primo viewport a 360 px);
  referee verde su tutte e sei le scene a 360/390/430; foundation 17/17; build
  verde. Screenshot in `frontend/.local-validation/ux/slice-3/`.
- Prima riga che legge l'utente: Gioco "Tocca a te. Stessa partita, stessa
  posizione, stesso orologio."; fermata "Aspetta. Il cavallo in e5: chi lo
  difende?"; dopo la mossa buona "Ecco. Stavolta l'hai vista."; al tetto "Basta
  cosi'. Il momento l'hai passato: il resto e' partita."
- Debiti riportati, non corretti: un reload nella finestra tra la mossa del
  momento e il verdetto riprende senza valutare quel tentativo; il ramo
  "Stockfish di riserva" non e' esercitato dai test browser (solo dalla prova
  manuale con i motori veri prima della correzione del timeout); la lista mosse
  del Gioco parte vuota, senza le ultime mosse della partita originale.

## Evidenze di implementazione, slice 4: il Quaderno, la rimozione, il cancello

- `frontend/src/pages/quaderno/`: `Quaderno.tsx` (hub: voce d'apertura, "Quello
  che torna" con una riga per pattern, "Come sta andando", "Tu"),
  `QuadernoPattern.tsx` (titolo, frase-verdetto, "Le prove" come storia, due
  `details` chiusi di default), `QuadernoMomento.tsx` (riusa `GuardoView` in
  modalita' lettura), `quaderno.css` nuovo con gli stessi token di
  `coach-shell.css` (caricati via `LezioneShell`). Route `/quaderno`,
  `/quaderno/:patternId`, `/quaderno/:patternId/:momentoId`. Le righe cliccabili
  sono bottoni con callback, non `Link`, come "Sediamoci"/"Avanti": cosi'
  `/dev/lezione?beat=quaderno|quaderno-pattern|quaderno-momento` resta sulla
  propria URL invece di rompersi contro `RequireReadyProfile` (nessun utente
  autenticato in quell'anteprima). Navigazione volutamente piatta: dal
  dettaglio e dalla prova si torna sempre a "Quaderno", non a una catena di
  breadcrumb, per far tornare il test "back 'Quaderno'" del §D della spec.
- `frontend/src/lezione/voce.ts`: `fraseQuadernoApertura`, `fraseQuadernoPattern`
  (clausola per kind, coda "evidenza insufficiente", coda "lezione di oggi"),
  `fraseProvaBreve`, `fraseQuadernoLearning`/`fraseQuadernoNessunConfronto`,
  `fraseLivelloIndisponibile`, `fraseNumeriQuaderno`, `fraseQuadernoCadenza`,
  `titoloPattern`. `frontend/src/lezione/lezione.ts`: `buildAggregati` e
  `filmSourceOf` esportati (erano privati), `momentoFromOpportunity` e
  `buildQuadernoAggregati` nuovi (quest'ultimo aggiunge il flag `isToday` a
  `LezioneAggregati`, usato solo dal Quaderno).
- `LezioneShell.tsx`: variante `backstage` (titolo h1 + X verso `/lezione`),
  prop `backTo`/`onBack` opzionali sulla variante `passo`. `Guardo.tsx`: prop
  `lettura` su `GuardoView` per la modalita' di sola lettura (niente "Avanti",
  back configurabile via `backTo` o `onBack`).
- `Settings.tsx`: shell `AppShell` -> `LezioneShell` passo (back "Quaderno");
  tema, lingua e "Esci" spostati in tre righe in cima (riusando `theme.ts`,
  `LangToggle`, `signOut` di `useAuth`), la vecchia sezione "Lingua" a meta'
  pagina tolta per non duplicare il toggle.
- Rimozione, verificata con grep prima di ogni cancellazione (nessun import
  vivo residuo): 70 file, 19.723 righe. Espliciti dallo spec: `TavoloHome.tsx`,
  `Sessione.tsx`, il vecchio `pages/quaderno/Quaderno.tsx` (2166 righe,
  sostituito, non solo cancellato) e `boardArrows.ts`, `components/Quaderno.tsx`,
  `NonnoSession`/`PlayStep`/`WarmupGuidato`/`CaduteTrainer`/`MomentReview`,
  `session/store.ts`, `session/fromCadute.ts`, `PlaySession.tsx`,
  `MomentoDelGiorno.tsx`, `Viaggio.tsx`, `BoardScene.tsx`, `engine/useStockfish.ts`,
  `IncontroScene`+`IncontroPreview`+route, `TeachTest`+route, la Stanza intera
  (route, 4 file, le tre dipendenze three.js), `PatternHome`/`Library`/`Practice`/
  `Progress` + `pattern-coach.css`, `AppShell.tsx` (svuotato `coach-shell.css`
  di tutto tranne i token `:root` e `.coach-brand-mark`, ancora usati da
  `LezioneShell`). Orfani a cascata trovati con grep, non nell'elenco letterale
  dello spec: `RepertorioPanel.tsx`, `TimingPatterns.tsx`, `MovePlayback.tsx`,
  i tre `components/onboarding/Teach*.tsx`, `lib/motion.ts`, `srs.ts`,
  `session/adaptiveSelector.ts`/`attemptRecorder.ts`/`passiveReviewHistory.ts`/
  `selectionPersistence.ts`, `eco.ts`, `chess-utils.ts`, `glossary.ts`,
  `BlunderCard.tsx` (gia' orfano prima di questo slice: zero importatori anche
  a inizio slice), l'intero cluster grafici (`GameArcChart`/`RatingCurveChart`/
  `SpeedVsErrorsChart`/`TimeManagementChart`/`NonnoExplain`/`DecisionsCard`/
  `WeeklyTrendCard`) e card (`PlayerCard`/`TacticalBreakdownCard`/
  `BlindSpotsList`/`DiagnosisList`/`CoachNarrative`/`RepertoireCard`/
  `CoachNote`/`SureCheck`/`NonnoGreeting`), la dipendenza `recharts` (nessun
  file vivo la importava piu' una volta tolti quei grafici). `session/journal.ts`
  importava `todayUTC` da `store.ts`: spostata dentro `journal.ts` prima di
  cancellare `store.ts`, che altrimenti restava un modulo condiviso vivo.
- `PatternPreview.tsx` (`/dev/patterns`) NON cancellato come lo spec elencava:
  ridotto alla sola anteprima di `AnalysisPreparation` (95 -> 35 righe), l'unica
  parte ancora viva, testata da 3 dei 5 scenari di `e2e/public-mobile.spec.ts`
  (contatori di progresso, recupero da errore, stima Maia). Deviazione dichiarata
  dall'elenco "raggiungibile solo in DEV" della spec (che non cita `/dev/patterns`):
  la route resta invisibile in produzione (gated da `import.meta.env.DEV` come
  sempre), zero impatto utente, e salva test di un componente onboarding vivo
  che altrimenti sarebbero spariti senza sostituto.
- Cancello: `prebuild` ora `assert-no-personal-public-data.mjs && ux-referee.mjs`;
  il set `legacy` tolto dal referee (resta solo `lezione`, sei scene, il Quaderno
  non aggiunto perche' non e' percorso principale); step "Install browser for
  the UX referee" (`npx playwright install --with-deps chromium`) aggiunto in
  `.github/workflows/build-and-deploy.yml` subito prima della build, senza altre
  modifiche al workflow.
- Verifiche del 7 settembre 2026: `npx tsc -b` pulito; `npm run build` verde
  CON il referee dentro (18/18 scene a 360/390/430); `npm test` verde (17
  foundation + 207 Vitest, 25 nuovi in `test/lezione.test.ts` su
  `fraseQuadernoPattern` (una per kind, evidenza insufficiente, lezione di
  oggi), `fraseProvaBreve` ed le altre frasi del Quaderno); `npx playwright test`
  verde (14/14, incluso il nuovo `e2e/quaderno.spec.ts`: righe con le frasi,
  apertura del dettaglio, apertura della prova con scacchiera visibile e
  nessun bottone in fondo, back "Quaderno", i due `details` chiusi che si
  aprono, "Aggiorna" abilitato, nessun overflow orizzontale a 360px).
  Screenshot in `frontend/.local-validation/ux/slice-4/`. Bundle totale in
  `dist/assets/*.js`: prima (fine slice 3, HEAD `e816e5e`, misurato in un
  worktree isolato per non toccare le modifiche in corso) 1.856,33 kB su 3
  chunk (928,66 principale + 916,01 Stanza/three.js + 11,66 lazy) e 189,42 kB
  di CSS; dopo 901,08 kB su un chunk solo e 170,91 kB di CSS.
- Prima riga che legge l'utente: Quaderno "Qui c'e' tutto quello che ho visto
  nelle tue 5 partite. Leggilo quando vuoi."; dettaglio pattern "4 volte in 5
  partite. Ci stiamo lavorando da oggi." sotto il titolo "Pezzi in presa".
- Debiti riportati, non corretti: `coach/selectPrinciple.ts`/`coach/teachClient.ts`
  sono rimasti (hanno un test in `analyticsTruth.test.ts` ed erano l'unico
  candidato "sottosistema", non "foglia UI", tra gli orfani: da rivalutare se
  parte la voce strato 2) pur avendo perso l'unico consumatore UI (`TeachTest.tsx`,
  cancellato). Le regole CSS `.stanza-*` e `.recharts-*` in `index.css` restano
  morte (file condiviso, fuori scope di questo slice). `README.md` "Struttura
  utile" e `docs/OOUX_IA.md` non toccati (follow-up, come richiesto dalla spec).
  "I numeri" nel dettaglio pattern accorpa gli 8 valori richiesti (occasioni,
  partite, errori, partite con errori, decisioni rapide, idonee, valutate,
  campione) in 5 frasi anziche' 8 righe 1:1: lettura piu' diretta scelta in
  assenza di un elenco esplicito nella spec.
- Revisione di chi dirige, due correzioni di copy prima del commit: la frase di
  "Come sta andando" diceva "4 volte su 5" senza dire di cosa (ora "Pezzi in
  presa, dal 20 agosto: il pezzo in presa l'hai visto 4 volte su 5 nelle partite
  dopo l'esercizio. Prima erano 4 su 10."); la riga "Tu" mostrava i minuti
  settimanali dell'onboarding al posto della cadenza letta (ora "Leggo le tue
  partite blitz." o "rapid"). Rieseguiti build con referee (18 scene verdi),
  Vitest 21 file e 207 test, Playwright 14 test, foundation 17/17.
