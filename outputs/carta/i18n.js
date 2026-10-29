(() => {
  const translations = {
    'Il tuo spazio di lettura': 'Your reading space',
    'Importa un libro': 'Import a book',
    '＋ Importa un libro': '＋ Import a book',
    'Un posto tutto tuo': 'A space of your own',
    'Leggi con calma.': 'Read at your own pace.',
    'I tuoi libri, le tue idee, il tuo ritmo.': 'Your books, your ideas, your pace.',
    'La tua libreria': 'Your library',
    'Letti': 'Finished',
    'Letto': 'Finished',
    'Da iniziare': 'Not started',
    'Formato non supportato': 'Unsupported format',
    'Sposta in “Letti”': 'Move to “Finished”',
    'Riporta nella libreria': 'Move back to library',
    'Elimina libro e file': 'Delete book and file',
    'Non ci sono libri in lettura. Puoi spostare un titolo da “Letti” con il tasto destro sulla copertina.': 'There are no books in progress. Right-click a cover to move a finished book back here.',
    'I libri che segni come letti appariranno qui.': 'Books you mark as finished will appear here.',
    'La tua prossima lettura inizia qui': 'Your next read starts here',
    'Importa un libro in formato EPUB. I tuoi progressi e le tue note restano salvati su questo dispositivo.': 'Import an EPUB book. Your progress and notes stay on this device.',
    'Importa EPUB, PDF o Markdown. Progressi e annotazioni restano salvati su questo dispositivo.': 'Import EPUB, PDF, or Markdown files. Progress and annotations stay on this device.',
    'Scegli un libro': 'Choose a book',
    'Aggiungi un libro': 'Add a book',
    'Trascina qui un EPUB': 'Drop an EPUB here',
    'Trascina qui EPUB, PDF o Markdown': 'Drop EPUB, PDF, or Markdown files here',
    'Sfoglia file': 'Browse files',
    'Libreria': 'Library',
    'Torna alla libreria': 'Back to library',
    'Numero di pagina': 'Page number',
    'Inserisci il numero della pagina': 'Type a page number',
    'Vai a una percentuale del libro': 'Jump to a reading percentage',
    'Inserisci una percentuale da 0 a 100': 'Enter a percentage from 0 to 100',
    'Torna alla pagina': 'Back to page',
    'completato': 'complete',
    'Calcolo del tempo…': 'Calculating reading time…',
    'Spotify': 'Spotify',
    'Apri Spotify per iniziare': 'Open Spotify to get started',
    'Apri': 'Open',
    'Brano precedente': 'Previous track',
    'Brano successivo': 'Next track',
    'Metti in pausa': 'Pause',
    'Riprendi': 'Resume',
    'Riproduci o metti in pausa': 'Play or pause',
    'Assistente Carta': 'Carta assistant',
    'Assistente AI': 'AI assistant',
    'Apri assistente': 'Open assistant',
    'Ora locale': 'Local time',
    'Avanzamento di lettura': 'Reading progress',
    'Note': 'Notes',
    'Aspetto': 'Appearance',
    'Modalità di lettura': 'Reading appearance',
    'Schermo intero': 'Full screen',
    'Evidenziazioni': 'Highlights',
    'La tua lettura': 'Your reading',
    'In questo libro': 'About this book',
    'Colore della pagina': 'Page color',
    'Impaginazione EPUB': 'EPUB layout',
    'Lettura PDF': 'PDF reader',
    'Documento Markdown': 'Markdown document',
    'Testo continuo': 'Continuous text',
    'Scorrimento verticale continuo. Le pagine vengono renderizzate vicino alla posizione di lettura.': 'Continuous vertical scrolling. Pages render as they approach your reading position.',
    'Testo formattato localmente. Le note restano collegate al passaggio selezionato.': 'Formatted locally. Notes remain linked to the selected passage.',
    'Ingrandimento pagina': 'Page zoom',
    'Ingrandimento PDF': 'PDF zoom',
    'Pagina': 'Page',
    'Adatta': 'Fit width',
    'Riduci ingrandimento': 'Zoom out',
    'Aumenta ingrandimento': 'Zoom in',
    'Una colonna': 'One column',
    'Due colonne': 'Two columns',
    'Dimensione del testo': 'Text size',
    'Spaziatura righe': 'Line spacing',
    'Le regolazioni tipografiche si applicano agli EPUB.': 'Typography settings apply to EPUBs.',
    'Velocità stimata': 'Estimated reading speed',
    'Tempo di lettura': 'Reading time',
    'Ultima pagina': 'Last page',
    'Le tue annotazioni': 'Your notes',
    'Le tue note': 'Your notes',
    '＋ Nota': '＋ Note',
    'Aggiungi un commento…': 'Add a comment…',
    'Pagina corrente': 'Current page',
    'Annulla': 'Cancel',
    'Salva': 'Save',
    'I passaggi evidenziati': 'Highlighted passages',
    'Chiara': 'Light',
    'Seppia': 'Sepia',
    'Scura': 'Dark',
    'Le regolazioni tipografiche si applicano ai libri EPUB.': 'Typography settings apply to EPUB books.',
    'Carica un EPUB per regolare colonne, corpo e spaziatura.': 'Load an EPUB to adjust columns, text size, and spacing.',
    'EPUB ·': 'EPUB ·',
    'Usare Carta AI': 'Using Carta AI',
    'Istruzioni': 'Instructions',
    'Chiudi istruzioni': 'Close instructions',
    'Chiudi il pannello': 'Close panel',
    'Fissa al lato': 'Dock to side',
    'Sgancia': 'Undock',
    'Nuova chat': 'New chat',
    'Messaggio': 'Message',
    'Chiedi qualcosa a Carta…': 'Ask Carta anything…',
    'Invia messaggio': 'Send message',
    'Invia': 'Send',
    'Aggiungi la risposta alle note': 'Add answer to notes',
    'Invio per inviare · Shift+Invio per andare a capo': 'Enter to send · Shift+Enter for a new line',
    'Qwen3.5-2B gira su questo computer. Il modello occupa circa 1,3 GB e si scarica una volta sola.': 'Qwen3.5-2B runs on this computer. The model is about 1.3 GB and only needs to be downloaded once.',
    'Modello e connessione': 'Model and connection',
    'Scegli un motore': 'Choose a provider',
    'Qwen · locale, incluso': 'Qwen · local, included',
    'Ollama · modelli sul computer': 'Ollama · models on this computer',
    'OpenAI · API': 'OpenAI · API',
    'Claude · API': 'Claude · API',
    'Gemini · API': 'Gemini · API',
    'OpenAI-compatible · API': 'OpenAI-compatible · API',
    'Modello': 'Model',
    'Modello installato': 'Installed model',
    'Indirizzo del servizio locale': 'Local service address',
    'Indirizzo Ollama': 'Ollama address',
    'Indirizzo API compatibile': 'Compatible API address',
    'Chiave API': 'API key',
    'Incolla la chiave del provider': 'Paste the provider key',
    'Salva connessione': 'Save connection',
    'Rimuovi chiave': 'Remove key',
    'Con un provider cloud, il testo inviato e l’estratto del libro vengono trasmessi al servizio scelto. L’uso API può avere costi separati dall’abbonamento chat. Carta non può rilevare o riutilizzare automaticamente gli abbonamenti delle app ChatGPT, Claude o VS Code.': 'With a cloud provider, your message and book excerpt are sent to that service. API usage may be billed separately from a chat subscription. Carta cannot automatically detect or reuse subscriptions from ChatGPT, Claude, or VS Code apps.',
    'Il modello Qwen viene scaricato una volta e resta su questo dispositivo.': 'Qwen is downloaded once and stays on this device.',
    'Ollama · locale': 'Ollama · local',
    'Avvia Ollama e aggiorna l’elenco dei modelli.': 'Start Ollama and refresh the model list.',
    'Chiave API salvata nel portachiavi di sistema.': 'API key saved in the system keychain.',
    'Inserisci la chiave API del provider per collegarti.': 'Enter the provider API key to connect.',
    'Cerco i modelli installati…': 'Looking for installed models…',
    'Nessun modello trovato. Installa un modello in Ollama e riprova.': 'No models found. Install a model in Ollama and try again.',
    'modello disponibile': 'model available',
    'modelli disponibili': 'models available',
    'Connessione salvata': 'Connection saved',
    'Chiave rimossa dal portachiavi': 'Key removed from keychain',
    'Apri “Modello e connessione” e salva una chiave API': 'Open “Model and connection” and save an API key',
    'Seleziona un modello prima di inviare la richiesta': 'Choose a model before sending the request',
    'Sto preparando la risposta…': 'Preparing the answer…',
    'Scarica Qwen · 1,3 GB': 'Download Qwen · 1.3 GB',
    'Fai domande sul libro aperto: puoi chiedere una spiegazione, una traduzione o un riassunto. Seleziona un passaggio e scegli': 'Ask questions about the open book: request an explanation, translation, or summary. Select a passage and choose',
    'per usarlo come contesto.': 'to use it as context.',
    'Puoi anche chiedere a Carta di aprire un libro, andare a una percentuale di lettura, aggiungere una nota o controllare Spotify. Per esempio:': 'You can also ask Carta to open a book, jump to a reading percentage, add a note, or control Spotify. Example commands (in Italian):',
    'Le risposte vengono generate dal modello selezionato: Qwen e Ollama restano su questo dispositivo; un provider cloud riceve il testo inviato e gli estratti del libro. La chat rimane salvata per il libro corrente.': 'Answers come from the selected model: Qwen and Ollama stay on this device; a cloud provider receives your message and book excerpts. The chat is saved for the current book.',
    'Carta · Ollama': 'Carta · Ollama',
    'Chiedi a Ollama': 'Ask Ollama',
    'Ollama sta leggendo…': 'Ollama is reading…',
    'Ollama è selezionato.': 'Ollama is selected.',
    'Evidenzia': 'Highlight',
    'Giallo': 'Yellow',
    'Verde': 'Green',
    'Azzurro': 'Blue',
    'Rosa': 'Pink',
    'Lilla': 'Lilac',
    'Rimuovi': 'Remove',
    'Chiedi all’AI': 'Ask AI',
    "Chiedi all'AI": 'Ask AI',
    'Dizionario': 'Dictionary',
    'Sto cercando…': 'Thinking…',
    'Scarica prima Qwen per usare l’assistente': 'Download Qwen to use the assistant',
    'Apri un libro o inserisci un testo': 'Open a book or enter some text',
    'Apro il tuo libro…': 'Opening your book…',
    'Preparo la pagina di lettura': 'Preparing your reading page',
    'Ci vorrà solo un momento': 'This will only take a moment',
    'Impossibile aprire il file: spazio esaurito?': 'Could not save the file. Is storage full?',
    'Libro aggiunto alla libreria': 'Book added to your library',
    'Libro e file eliminati': 'Book and file deleted',
    'Nota salvata': 'Note saved',
    'Nota eliminata': 'Note deleted',
    'Evidenziazione rimossa': 'Highlight removed',
    'Nessuna evidenziazione selezionata': 'No highlight selected',
    'Quasi terminato': 'Almost finished',
    'Stima iniziale': 'Initial estimate',
    'Stima': 'Estimate',
    'Ritmo iniziale': 'Initial pace',
    'Assistente locale pronto.': 'Local assistant ready.',
    'Qwen è pronto su questo dispositivo.': 'Qwen is ready on this device.',
    'Assistente locale · privato': 'Local assistant · private',
    'OpenAI · cloud': 'OpenAI · cloud',
    'Claude · cloud': 'Claude · cloud',
    'Gemini · cloud': 'Gemini · cloud',
    'AI · cloud': 'AI · cloud',
    'OpenAI è selezionato.': 'OpenAI is selected.',
    'Claude è selezionato.': 'Claude is selected.',
    'Gemini è selezionato.': 'Gemini is selected.',
    'AI è selezionato.': 'AI is selected.',
    'Carta · OpenAI': 'Carta · OpenAI',
    'Carta · Claude': 'Carta · Claude',
    'Carta · Gemini': 'Carta · Gemini',
    'Carta · AI': 'Carta · AI',
    'Chiedi a OpenAI': 'Ask OpenAI',
    'Chiedi a Claude': 'Ask Claude',
    'Chiedi a Gemini': 'Ask Gemini',
    'Chiedi a AI': 'Ask AI',
    'OpenAI sta leggendo…': 'OpenAI is reading…',
    'Claude sta leggendo…': 'Claude is reading…',
    'Gemini sta leggendo…': 'Gemini is reading…',
    'AI sta leggendo…': 'AI is reading…',
    'Sto preparando una risposta locale…': 'Preparing a local answer…',
    'Sto preparando la risposta…': 'Preparing the answer…',
    'Qwen è pronto. Ora puoi usare l’assistente.': 'Qwen is ready. You can now use the assistant.',
    'Un aiuto privato per capire il testo.': 'Private help for understanding your reading.',
    'Utente': 'You',
    'Assistente': 'Assistant',
    'Tu': 'You',
    'Apri fonte ↗': 'Open source ↗',
    'Fonti online': 'Online sources',
    'La conversazione su questo libro apparirà qui. Puoi usare un suggerimento o scrivere una domanda.': 'Your conversation about this book will appear here. Choose a suggestion or type a question.',
    'Download in corso…': 'Downloading…',
    'Riprova il download': 'Retry download',
    'Chiedi a Qwen': 'Ask Qwen',
    'Qwen sta leggendo…': 'Qwen is reading…',
    'Attendi la fine della risposta prima di iniziare una nuova chat': 'Wait for the answer to finish before starting a new chat',
    'Risposta aggiunta alle note': 'Answer added to notes',
    'Passaggio evidenziato': 'Passage highlighted',
    'Colore dell’evidenziazione aggiornato': 'Highlight color updated',
    'Passaggio aggiunto alle note': 'Passage added to notes',
    'Aggiungi un commento prima di salvare': 'Add a comment before saving',
    'Commento salvato': 'Comment saved',
    'Nessun commento aggiunto': 'No comment added',
    'Modifica': 'Edit',
    'Elimina': 'Delete',
    'Vai al passaggio': 'Go to passage',
    'Vai al': 'Go to',
    'rilascia per andare': 'release to jump',
    'Sto ancora preparando l’indice del libro': 'Still preparing the book index',
    'Impossibile raggiungere questa posizione': 'Could not reach this position',
    'Controlli disponibili nell’app desktop': 'Controls are available in the desktop app',
    'Comando Spotify non riuscito': 'Spotify command failed',
    'Spotify non è installato o non può essere aperto': 'Spotify is not installed or could not be opened',
    'Brano in riproduzione': 'Now playing',
    'Impossibile avviare la libreria': 'Could not start the library',
    'Impossibile aprire il libro': 'Could not open the book',
    'Schermo intero non disponibile in questa applicazione': 'Full screen is unavailable in this app',
    'Libro aperto; preparazione dell’indice non riuscita': 'Book opened, but its reading index could not be prepared',
    'Salva prima il file per aggiungere una nota': 'Save the file before adding a note',
    'Scrivi qualcosa prima di salvare': 'Write something before saving',
    'Impossibile salvare il file: spazio esaurito?': 'Could not save the file. Is storage full?',
    'Impossibile aprire il file: formato non valido': 'Could not open the file: invalid format',
    'Verifico il libro…': 'Checking the book…',
    'Controllo il file EPUB': 'Checking the EPUB file',
    'Il file EPUB supera il limite di 256 MB.': 'The EPUB file exceeds the 256 MB limit.',
    'L’EPUB contiene troppi elementi o supera il limite di decompressione.': 'This EPUB has too many entries or exceeds the expanded size limit.',
    'L’EPUB contiene un percorso interno non valido.': 'This EPUB contains an invalid internal path.',
    'L’EPUB contiene un elemento troppo grande.': 'This EPUB contains an oversized entry.',
    'L’EPUB supera il limite di decompressione.': 'This EPUB exceeds the expanded size limit.',
    'Il file EPUB non è leggibile.': 'The EPUB file could not be read.',
    'Lettore EPUB non disponibile.': 'The EPUB reader is unavailable.',
    'Il file EPUB è danneggiato o non valido.': 'The EPUB file is damaged or invalid.',
    'Il file EPUB non è valido.': 'The EPUB file is invalid.',
    'Struttura EPUB non valida.': 'The EPUB structure is invalid.',
    'Indice EPUB non valido.': 'The EPUB package index is invalid.',
    'Le parti evidenziate appariranno qui.': 'Your highlights will appear here.',
    'Seleziona un passaggio mentre leggi.': 'Select a passage while reading.',
    'Le tue annotazioni appariranno qui.': 'Your notes will appear here.',
    'Le tue note appariranno qui.': 'Your notes will appear here.',
    'Aggiungi un commento a un passaggio o alla pagina corrente.': 'Add a comment to a passage or the current page.',
    'Segna un’idea mentre leggi.': 'Capture an idea as you read.',
    'Questo formato non è supportato. Puoi rimuoverlo dal menu sulla copertina.': 'This format is not supported. You can remove it from the cover menu.',
    'Libro aggiunto alla libreria': 'Book added to your library',
    'Caricamento del libro non riuscito': 'Could not load the book',
    'Le pagine vengono preparate…': 'Preparing pages…',
    'Seleziona un passaggio': 'Select a passage',
    'Lingua del dizionario': 'Dictionary language',
    'Parole/min': 'Words/min',
    'Parole': 'Words',
    'Impossibile caricare il libro': 'Could not load the book',
    'EPUB': 'EPUB',
    'Lingua': 'Language',
    'Italiano': 'Italian',
    'English': 'English'
  };
  const originals = new WeakMap();
  const attrOriginals = new WeakMap();
  const attrWrites = new WeakMap();
  let language = localStorage.getItem('carta-language') === 'en' ? 'en' : 'it';
  const skipSelector = '#bookGrid, #readGrid, #readerTitle, #spotifyTrackTitle, #spotifyTrackArtist, .note-text, .note-card-comment, .note-card-quote, .note-quote-preview, .highlight-card blockquote, .assistant-message-body, .assistant-message-user, #assistantInput';

  function translateText(original) {
    const trimmed = original.trim();
    const key = trimmed.replace(/\s+/g, ' ');
    let value = translations[key];
    if (!value) {
      let match = trimmed.match(/^(\d+)% completato$/);
      if (match) value = `${match[1]}% complete`;
      match = trimmed.match(/^~(\d+) min rimanenti$/);
      if (match) value = `~${match[1]} min remaining`;
      match = trimmed.match(/^~(\d+) h (\d+) min rimanenti$/);
      if (match) value = `~${match[1]} hr ${match[2]} min remaining`;
      match = trimmed.match(/^(\d+) parole\/min$/);
      if (match) value = `${match[1]} words/min`;
      match = trimmed.match(/^(\d+) ppm$/);
      if (match) value = `${match[1]} words/min`;
      match = trimmed.match(/^(\d+) min$/);
      if (match) value = `${match[1]} min`;
      match = trimmed.match(/^(\d+) pagine stimate$/);
      if (match) value = `${match[1]} estimated pages`;
      match = trimmed.match(/^EPUB · (\d+) pagine stimate$/);
      if (match) value = `EPUB · ${match[1]} estimated pages`;
      match = trimmed.match(/^PDF · pagina (\d+)$/);
      if (match) value = `PDF · page ${match[1]}`;
      match = trimmed.match(/^Markdown · (\d+)%$/);
      if (match) value = `Markdown · ${match[1]}%`;
      match = trimmed.match(/^(\d+) annotazione$/);
      if (match) value = `${match[1]} note`;
      match = trimmed.match(/^(\d+) annotazioni$/);
      if (match) value = `${match[1]} notes`;
      match = trimmed.match(/^(\d+) passaggio evidenziato$/);
      if (match) value = `${match[1]} highlighted passage`;
      match = trimmed.match(/^(\d+) passaggi evidenziati$/);
      if (match) value = `${match[1]} highlighted passages`;
      match = trimmed.match(/^(EPUB|PDF|Markdown)\nImportato il (.+)\nLe note vengono salvate automaticamente\.$/);
      if (match) value = `${match[1]}\nImported on ${match[2]}\nNotes are saved automatically.`;
      match = trimmed.match(/^Assistente non disponibile: (.+)$/);
      if (match) value = `Assistant unavailable: ${match[1]}`;
      match = trimmed.match(/^Download non riuscito: (.+)$/);
      if (match) value = `Download failed: ${match[1]}`;
      match = trimmed.match(/^Non riesco a eseguire il comando: (.+)$/);
      if (match) value = `I couldn't run that command: ${match[1]}`;
      match = trimmed.match(/^Non riesco ad aprire la fonte: (.+)$/);
      if (match) value = `Couldn't open source: ${match[1]}`;
      match = trimmed.match(/^Eliminare “(.+)” e il file salvato su questo dispositivo\?$/);
      if (match) value = `Delete “${match[1]}” and its file from this device?`;
      match = trimmed.match(/^Download · (\d+)%$/);
      if (match) value = `Download · ${match[1]}%`;
      match = trimmed.match(/^(\d+) nota$/);
      if (match) value = `${match[1]} note`;
      match = trimmed.match(/^(\d+) note$/);
      if (match) value = `${match[1]} notes`;
      match = trimmed.match(/^EPUB · (\d+)%$/);
      if (match) value = `EPUB · ${match[1]}%`;
      match = trimmed.match(/^(\d+) \/ (\d+) · stima$/);
      if (match) value = `${match[1]} / ${match[2]} · estimate`;
    }
    if (language === 'it') return original;
    return value ? original.replace(trimmed, value) : original;
  }

  function translateNode(node) {
    if (node.nodeType !== Node.TEXT_NODE || !node.parentElement || node.parentElement.closest(skipSelector)) return;
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    const original = originals.get(node);
    const translated = translateText(original);
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }

  function translateAttributes(element, refreshOriginal = false) {
    if (element.closest?.('.language-picker')) return;
    for (const name of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(name)) continue;
      let writes = attrWrites.get(element);
      if (!writes) { writes = {}; attrWrites.set(element, writes); }
      const current = element.getAttribute(name);
      if (name in writes && writes[name] === current) { delete writes[name]; continue; }
      let saved = attrOriginals.get(element);
      if (!saved) { saved = {}; attrOriginals.set(element, saved); }
      if (!(name in saved) || refreshOriginal) saved[name] = current;
      const value = translateText(saved[name]);
      if (current !== value) { writes[name] = value; element.setAttribute(name, value); }
    }
  }

  function translateTree(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateNode(walker.currentNode);
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    root.querySelectorAll?.('*').forEach(translateAttributes);
  }

  function addLanguagePicker(header) {
    if (!header || header.querySelector('.language-picker')) return;
    const label = document.createElement('label');
    label.className = 'language-picker';
    label.setAttribute('aria-label', language === 'en' ? 'Language' : 'Lingua');
    const select = document.createElement('select');
    select.innerHTML = '<option value="it">Italiano</option><option value="en">Inglese</option>';
    select.value = language;
    select.addEventListener('change', () => window.setCartaLanguage(select.value));
    label.append(select);
    const spacer = header.querySelector('.top-spacer');
    spacer ? spacer.after(label) : header.append(label);
  }

  window.setCartaLanguage = function (nextLanguage) {
    language = nextLanguage === 'en' ? 'en' : 'it';
    localStorage.setItem('carta-language', language);
    document.documentElement.lang = language;
    document.querySelectorAll('.language-picker select').forEach(select => {
      select.options[0].textContent = language === 'en' ? 'Italian' : 'Italiano';
      select.options[1].textContent = language === 'en' ? 'English' : 'Inglese';
      select.value = language;
      select.setAttribute('aria-label', language === 'en' ? 'Interface language' : 'Lingua dell’interfaccia');
    });
    document.querySelectorAll('.language-picker').forEach(label => label.setAttribute('aria-label', language === 'en' ? 'Interface language' : 'Lingua dell’interfaccia'));
    document.querySelectorAll('.brandmark').forEach(mark => {
      mark.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7.2 6.5h13.2a4.2 4.2 0 0 1 4.2 4.2v14.8H11.4a4.2 4.2 0 0 1-4.2-4.2z"/><path d="M11.4 10.2h9.3M11.4 14h9.3M11.4 17.8h6.8M24.6 11.2h1.7v14.3h-15"/></svg>';
    });
    document.querySelectorAll('#libraryView .brand').forEach(brand => {
      const name = [...brand.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
      if (name) name.nodeValue = 'Carta';
    });
    translateTree(document.body);
  };

  function initialize() {
    addLanguagePicker(document.querySelector('#libraryView .topbar'));
    addLanguagePicker(document.querySelector('#readerView .reader-top'));
    window.setCartaLanguage(language);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') translateNode(record.target);
        else if (record.type === 'attributes') translateAttributes(record.target, true);
        record.addedNodes?.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) translateNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateTree(node);
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
