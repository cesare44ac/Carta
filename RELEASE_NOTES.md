# Carta 3.5.0

Carta è un lettore desktop EPUB, PDF e Markdown, con annotazioni e assistente AI locale.

## Assistente AI a scelta

- Scelta tra Qwen integrato, modelli locali già installati con Ollama, OpenAI, Claude, Gemini e servizi compatibili con l’API OpenAI.
- Elenco dei modelli Ollama rilevato automaticamente dal servizio locale e selezione dall’app.
- Connessione cloud con chiave API inserita dall’utente; credenziali conservate nel portachiavi di sistema di Windows, non nei dati dell’interfaccia.
- Le richieste cloud vengono inviate al provider scelto solo quando l’utente le invia; l’interfaccia avvisa che estratti del libro e messaggi lasciano il dispositivo e che l’uso API può essere fatturato separatamente.
- Provider e modello selezionati vengono ricordati localmente. L’app non tenta di leggere sessioni o abbonamenti di altri software.

## Installer

- Ogni build copia l’installer Windows nella cartella stabile `releases/` alla radice della repository, con il nome `Carta_<versione>_x64-setup.exe`.
- Il flusso GitHub Releases carica l’installer dalla stessa cartella, così le build locali e quelle pubblicate condividono il percorso.

## Lettura e annotazioni

- Importazione e lettura di libri EPUB, con avanzamento salvato, stima del tempo rimanente e scelta rapida della posizione.
- Testo regolabile per colonne, dimensione e spaziatura.
- Note collegate ai passaggi e raccolta separata delle evidenziazioni, con colori selezionabili.
- Pannelli laterali richiudibili e assistente AI agganciabile accanto al libro.

## Lettura PDF e Markdown

- PDF con scorrimento verticale continuo; la rotella muove il documento in modo nativo, senza scatti forzati tra pagine.
- Le pagine vicine alla posizione corrente vengono renderizzate progressivamente e quelle lontane vengono scaricate dalla memoria grafica.
- Testo PDF selezionabile con evidenziazioni a colori e note collegate alla pagina e alla posizione nel documento.
- Zoom, adattamento alla larghezza, salto diretto a una pagina e ripristino della posizione di lettura.
- File Markdown formattati localmente, con selezione del testo, note ed evidenziazioni persistenti.
- Il contenuto Markdown viene sanificato prima di essere mostrato; i collegamenti esterni restano disattivati.

## Assistente e integrazioni

- Chat persistente con il provider AI selezionato, in grado di spiegare, tradurre e riassumere passaggi del libro.
- Comandi per cercare contenuti nella libreria, aggiungere note o evidenziazioni e controllare la lettura.
- Ricerca online facoltativa con risultati da Google Books e Wikipedia.
- Controlli Spotify disponibili durante la lettura.

## Interfaccia

- Interfaccia in italiano e inglese.
- Modalità scura rinnovata, sfumatura lilla laterale e logo aggiornato.
- Barra superiore compatta con pagina, percentuale di avanzamento e controlli essenziali.

## Correzioni in questa versione

- La barra mostra soltanto la percentuale in un piccolo riquadro; rimossa la barra di avanzamento.
- Rimossa la parola “Pagina” dall’indicatore numerico e sostituito il pulsante Libreria con un’icona casa.
- Il salto pagina PDF usa un campo testuale: il numero si digita da tastiera senza controlli a freccia.
- Il selettore lingua mostra nomi completi e coerenti con la lingua dell’interfaccia.

- Rimossa la barra PDF aggiuntiva; pagina e zoom sono accessibili dalla barra superiore.
- Semplificati gli indicatori in alto: pagina e percentuale di lettura, senza ritmo in parole al minuto.
- Corretta l'area di scorrimento PDF per mantenere fissi barra superiore e indicatore di pagina durante la lettura.
- Il salto a una pagina e lo scorrimento aggiornano correttamente pagina corrente e progresso.

- Rafforzata la sicurezza del WebView: CSP senza script inline, permessi Tauri ridotti e contenuti di copertine e note inseriti come testo.
- Aggiornato Tokio alla versione correttiva 1.54.1.
- Imposti limiti e timeout per il download Qwen e per le risposte delle ricerche online; verificato l’hash SHA-256 del modello.
- Accettati solo link HTTPS con origine autorizzata per dizionario e fonti.
- Disabilitati esplicitamente script e popup incorporati negli EPUB.
- Aggiunti controlli su dimensione e contenuti dichiarati degli archivi EPUB prima di importarli o aprirli.
- Corretto il ridimensionamento delle immagini EPUB nella build desktop: i limiti vengono applicati direttamente a immagini e figure per evitare che invadano il testo delle pagine vicine.
- Migliorato il ridisegno del libro quando cambia la larghezza dell’area di lettura.

## Download

Installer Windows x64 in formato NSIS. Qwen non è incluso nell’installer: viene scaricato dall’app solo quando l’utente lo richiede. Se WebView2 manca, l’installer avvia il bootstrapper Microsoft.
