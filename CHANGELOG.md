# Registro delle modifiche

## 3.5.0

- Aggiunta la scelta tra Qwen locale, Ollama e provider cloud OpenAI, Claude, Gemini e OpenAI-compatible.
- Rilevamento dei modelli Ollama disponibili e selezione del modello dall’interfaccia.
- Salvate le chiavi API nel portachiavi di sistema; preferenze di provider, modello e endpoint restano locali.
- Aggiunto un avviso prima dell’uso cloud su invio degli estratti del libro e fatturazione API separata.
- Stabilizzata la cartella degli installer: ogni build copia `Carta_<versione>_x64-setup.exe` nella cartella `releases/` alla radice e GitHub carica da lì.

## 3.0.3

- Compattata la barra di lettura: percentuale in un badge leggero e rimossa la barra di avanzamento.
- Sostituita la scritta “Libreria” con un pulsante icona accessibile.
- Reso il salto pagina PDF selezionabile digitando il numero, senza frecce o etichetta ridondante.
- Chiarito il selettore lingua mostrando il nome completo di ciascuna lingua.

## 3.0.2

- Rimossa la barra PDF separata e spostati zoom e salto pagina nella barra superiore.
- Semplificato lo stato di lettura: in alto restano percentuale e pagina, senza tempo residuo o parole al minuto.

## 3.0.1

- Corretto il contenitore del lettore PDF: la barra superiore e i controlli restano visibili, mentre la rotella scorre le pagine nell'area dedicata senza spostare l'intera schermata.
- Il cambio pagina aggiorna correttamente l'indicatore e il progresso.

## 3.0.0

- Aggiunti il lettore PDF locale con pagine a scorrimento verticale continuo, rendering progressivo, zoom e salto diretto alla pagina.
- Aggiunte selezione del testo, evidenziazioni a colori e note collegate a pagina e posizione nei PDF.
- Aggiunta lettura di file Markdown con formattazione locale, selezione, evidenziazioni e note ancorate al testo.
- Sanificato il contenuto Markdown e disattivati i collegamenti esterni nel lettore.
- Aggiornato il file picker e la libreria per distinguere EPUB, PDF e Markdown.
- Aggiornata la versione desktop a 3.0.0; il lettore EPUB resta sul percorso esistente.

## 2.1.10

- Rafforzata la CSP: niente JavaScript inline e collegamento esplicito dei controlli dell’interfaccia.
- Ridotti i permessi Tauri ai soli eventi necessari per il progresso del download.
- Aggiornato Tokio a 1.54.1 per correggere una race condition segnalata da RustSec.
- Limitati a 2 GB i download del modello Qwen e a 4 MB le risposte di ricerca; aggiunti timeout, HTTPS obbligatorio e pulizia dei file incompleti.
- Convalidati origine, percorso e porta degli URL aperti dal dizionario e dalle fonti.
- Reso sicuro il rendering di copertine e note ed esplicitamente disabilitati script e popup EPUB.
- Aggiunti controlli di dimensione e struttura agli archivi EPUB prima dell’importazione e della lettura.
- Aggiunti controlli di sicurezza automatici e test Rust per URL e limiti di trasferimento.

## 2.1.9

- Corretto il ridimensionamento delle immagini EPUB nella build desktop: i limiti vengono applicati direttamente agli elementi del libro, senza dipendere da fogli di stile dinamici.

## 2.1.8

- Corretto il ricalcolo della pagina EPUB dopo le variazioni di larghezza: viene ripristinato il punto di lettura corrente, evitando che resti visibile una colonna della pagina precedente.

## 2.1.7

- Aggiunti limiti dinamici alle immagini EPUB calcolati sulla colonna e sull’altezza effettiva della pagina, così gli elementi non invadono il testo della pagina adiacente.

## 2.1.6

- Corretto lo sconfinamento delle immagini EPUB tra colonne: le dimensioni per pagina e per colonna di epub.js non vengono più sovrascritte dalle regole globali dell’app.

## 2.1.5

- Corretto il limite verticale delle immagini EPUB, lasciando a epub.js il calcolo rispetto all’area utile della pagina.

## 2.1.4

- Risolto il ridimensionamento delle immagini EPUB con il pannello AI agganciato, impedendo a elementi flottanti o a dimensione fissa di coprire il testo.
- Reso semitrasparente il pannello AI per mostrare la sfumatura lilla sottostante, anche a schermo intero.

## 2.1.3

- Corretto il ridimensionamento delle immagini EPUB quando il pannello AI è fissato, evitando che le immagini coprano il testo.

## 2.1.2

- Corretto il ridimensionamento delle pagine EPUB quando l’assistente AI è fissato al lato.

## 2.1.1

- Aggiornata l’icona desktop di Carta con il marchio lilla ridisegnato.

## 2.1.0

- Aggiunto il selettore Italiano / English per i menu e le istruzioni dell’app.
- Ridisegnato il marchio Carta con un simbolo essenziale ispirato alle pagine di un libro.

## 2.0.0

- Rinnovata la modalità scura con uno sfondo quasi nero, sfumature laterali discrete e testo neutro.
- Spostati avanzamento, tempo stimato e ritmo di lettura nella barra superiore, rimuovendo la barra inferiore.
- Aggiunta una sfumatura lilla quasi impercettibile ai lati nella modalità scura.

## 1.0.14

- Aggiunti comandi espliciti per aprire i libri, controllare Spotify, creare note, gestire le evidenziazioni, mostrare note e spostarsi nel libro.
- L’assistente può cercare passaggi pertinenti nei libri EPUB della libreria, anche se non sono aperti.
- Aggiunta la ricerca online facoltativa con fonti Google Books e Wikipedia, inclusi i prezzi quando disponibili.
- Aggiunto un pannello AI indipendente, apribile e chiudibile dalla libreria o dalla lettura, con modalità laterale persistente.

## 1.0.12

- Collegati i pulsanti AI agli eventi desktop Tauri, così funzionano anche con la CSP della build di produzione.

## 1.0.11

- Aggiornate le GitHub Actions al runtime Node.js 24 per eliminare gli avvisi di deprecazione.
- L'assistente mostra ora il motivo restituito da Tauri quando non riesce a verificare lo stato del modello Qwen.

## 1.0.10

- Aggiunta una chat AI locale per ogni libro, con cronologia salvata sul dispositivo e comando per iniziare una nuova conversazione.
- Resi più sicuri i suggerimenti rapidi AI limitando il testo inviato, impedendo richieste simultanee e contenendo la lunghezza delle risposte.
- Aggiunto il rendering LaTeX locale con KaTeX, comprese formule su più righe.
- Aggiunti i controlli Spotify nella barra di lettura.
- Aggiunti i permessi Tauri per gli eventi di avanzamento del download di Qwen.
- L’assistente Qwen resta facoltativo: il modello viene scaricato dall’utente e non è incluso nell’installer.
