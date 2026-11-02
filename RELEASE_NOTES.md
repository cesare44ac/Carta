# Carta 3.5.3

## Novità e correzioni

- Aggiunto **Scopri**, accessibile dalla libreria con un pannello laterale a sinistra.
- Cerca paper e ricerche per argomento, autore o titolo. I risultati sono filtrati per copie ad accesso aperto e possono essere limitati a LSE, IMF, BCE o Federal Reserve.
- Aggiunta la scheda **Notizie**, con aggiornamenti dai feed istituzionali di LSE, IMF, BCE e Federal Reserve.
- Le schede mostrano autori, anno, fonte e abstract quando disponibili; i collegamenti portano alla scheda originale o al PDF segnalato come aperto.
- Ricerca e aggiornamenti partono solo quando richiesti. Le risposte di rete hanno limiti di dimensione e durata e i link vengono controllati prima di aprirsi.
- Nuovi testi del pannello disponibili in italiano e inglese.

## Installazione

L’installer Windows x64 viene copiato in `releases/Carta_3.5.3_x64-setup.exe`.

# Carta 3.5.2

## Novità e correzioni

- Aggiunta la sezione **Crea**, accessibile dalla libreria, con bozze salvate automaticamente sul dispositivo e riapribili dalla libreria.
- Editor Markdown con anteprima pulita, formattazione rapida e supporto alle formule LaTeX in linea e a blocco. È possibile aprire file `.md` e `.tex`; i comandi LaTeX comuni vengono convertiti per l’anteprima.
- Esportazione in Markdown, EPUB e PDF. L’EPUB include formule leggibili, font e rispettive licenze; il PDF usa la finestra di stampa del sistema e permette di scegliere “Salva come PDF”.
- Scelta di font, corpo, interlinea, spazio tra paragrafi e allineamento; controlli per grassetto, corsivo, barrato, titoli, citazioni, elenchi, collegamenti e formule.
- Sei font open source sono inclusi nell’app: Literata, Lora, Inter, Source Serif 4, Source Sans 3 e Atkinson Hyperlegible. Times New Roman e Helvetica usano i font disponibili sul computer. Si possono importare font personali WOFF2, WOFF, TTF e OTF; vengono conservati sul dispositivo e incorporati negli EPUB esportati.
- Le impostazioni dell’assistente AI ora si aprono in una finestra ampia dalla libreria o dal lettore. Scelta di provider e modello, connessioni API e download Qwen sono stati tolti dalla chat.
- Se manca un modello o una chiave API, Carta apre direttamente le impostazioni pertinenti.
- Migliorata la gestione delle chiavi: il portachiavi distingue credenziali mancanti da errori di accesso e la copia temporanea viene cancellata dalla memoria dopo il salvataggio.
- Ridotte le dipendenze del portachiavi in base al sistema operativo, eliminando il backend ZBus non mantenuto.

## Installazione

L’installer Windows x64 viene copiato in `releases/Carta_3.5.2_x64-setup.exe`.

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
