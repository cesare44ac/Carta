(() => {
  const $ai = (id) => document.getElementById(id);
  let modelReady = false;
  let selectedQuote = '';
  let lastAnswer = '';
  let chatMessages = [];
  let chatBookId = null;
  let isAsking = false;
  let commandPassage = null;
  const corpusCache = new Map();

  function updateAiPanelState() {
    const panel = $ai('aiPanel');
    const pinned = localStorage.getItem('carta-ai-docked') === 'true';
    const open = pinned || panel?.classList.contains('open');
    panel?.classList.toggle('pinned', pinned);
    panel?.classList.toggle('open', Boolean(open));
    if (panel) { panel.inert = !open; panel.setAttribute('aria-hidden', String(!open)); }
    document.body.classList.toggle('ai-dock-open', pinned);
    if (panel) { const host = document.fullscreenElement || document.body; if (panel.parentElement !== host) host.append(panel); }
    window.resizeReaderLayout?.(true);
    clearTimeout(updateAiPanelState.resizeTimer);
    updateAiPanelState.resizeTimer = setTimeout(() => window.resizeReaderLayout?.(true), 280);
    const toggle = $ai('aiDockToggle');
    if (toggle) {
      toggle.textContent = pinned ? 'Sgancia' : 'Fissa al lato';
      toggle.setAttribute('aria-pressed', String(pinned));
    }
  }

  window.toggleAiDock = () => {
    const pinned = localStorage.getItem('carta-ai-docked') === 'true';
    localStorage.setItem('carta-ai-docked', String(!pinned));
    $ai('aiPanel')?.classList.add('open');
    updateAiPanelState();
  };
  window.toggleAiPanel = function (force) {
    const panel = $ai('aiPanel');
    if (!panel) return;
    if (force === true) panel.classList.add('open');
    else if (force === false || panel.classList.contains('open')) {
      panel.classList.remove('open');
      if (localStorage.getItem('carta-ai-docked') === 'true') localStorage.removeItem('carta-ai-docked');
    } else panel.classList.add('open');
    updateAiPanelState();
    if (panel.classList.contains('open')) { loadChat(); $ai('assistantInput')?.focus(); }
  };
  window.closeAiPanel = () => window.toggleAiPanel(false);

  const originalTogglePanel = window.togglePanel;
  window.togglePanel = function (tab) {
    if (tab === 'assistant') {
      window.toggleAiPanel();
      return;
    }
    originalTogglePanel?.(tab);
  };

  function initializeDock() {
    const panel = $ai('aiPanel');
    if (panel && (document.body.classList.contains('reading') || $ai('readerView')?.contains(panel))) {
      document.body.append(panel);
    }
    if (localStorage.getItem('carta-ai-docked') === 'true') panel?.classList.add('open');
    updateAiPanelState();
  }

  document.addEventListener('fullscreenchange', updateAiPanelState);

  window.showTab = function (tab) {
    if (tab === 'assistant') { window.toggleAiPanel(true); return; }
    for (const name of ['notes', 'highlights', 'settings']) {
      $ai(`${name}Pane`)?.classList.toggle('hidden', name !== tab);
      $ai(`${name}Tab`)?.classList.toggle('active', name === tab);
    }
  };

  async function refreshModelState() {
    try {
      modelReady = await window.__TAURI__.core.invoke('qwen_model_status');
      $ai('assistantSetup').classList.toggle('hidden', modelReady);
      $ai('assistantWorkspace').classList.remove('hidden');
      $ai('assistantStatus').textContent = modelReady ? 'Qwen è pronto su questo dispositivo.' : 'Un aiuto privato per capire il testo.';
    } catch (error) {
      const detail = String(error?.message || error || 'errore sconosciuto');
      $ai('assistantSetup')?.classList.remove('hidden');
      $ai('assistantWorkspace')?.classList.remove('hidden');
      $ai('assistantStatus').textContent = `Assistente non disponibile: ${detail}`;
      console.error('Impossibile verificare Qwen:', error);
    }
  }

  window.downloadQwen = async function () {
    const button = $ai('downloadQwen');
    const progress = $ai('assistantDownloadProgress');
    button.disabled = true;
    button.textContent = 'Download in corso…';
    progress.classList.remove('hidden');
    let unlisten = null;
    try {
      // Progress events are optional: a denied event-listen permission must
      // never prevent the native download command from running.
      try {
        unlisten = await window.__TAURI__?.event?.listen?.('qwen-download-progress', (event) => {
          const percent = Number(event.payload) || 0;
          $ai('assistantProgressFill').style.width = `${percent}%`;
          button.textContent = percent ? `Download · ${percent}%` : 'Download in corso…';
        });
      } catch (eventError) {
        console.warn('Avanzamento del download non disponibile:', eventError);
      }
      await window.__TAURI__.core.invoke('download_qwen_model');
      await refreshModelState();
      if (modelReady) toast('Qwen è pronto. Ora puoi usare l’assistente.');
    } catch (error) {
      const detail = String(error?.message || error || 'Errore sconosciuto');
      $ai('assistantStatus').textContent = `Download non riuscito: ${detail}`;
      toast(`Download non riuscito: ${detail}`);
      button.disabled = false;
      button.textContent = 'Riprova il download';
    } finally {
      unlisten?.();
      progress.classList.add('hidden');
    }
  };

  function pageText() {
    try {
      return (doc?.rendition?.getContents() || []).map((content) => content.document?.body?.innerText || '').join('\n').trim().slice(0, 9000);
    } catch { return ''; }
  }

  function cleanText(html) {
    const source = html.replace(/<(script|style|svg|nav)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    const parsed = new DOMParser().parseFromString(source, 'application/xhtml+xml');
    parsed.querySelectorAll('script,style,svg,nav').forEach(node => node.remove());
    return (parsed.body?.textContent || parsed.documentElement?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  async function bookCorpus(book) {
    if (corpusCache.has(book.id)) return corpusCache.get(book.id);
    const request = indexedDB.open('carta-library-v1', 2);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const blob = await new Promise((resolve, reject) => {
      const get = database.transaction('files').objectStore('files').get(book.id);
      get.onsuccess = () => get.result ? resolve(get.result.file) : reject(new Error(`File non trovato: ${book.title}`));
      get.onerror = () => reject(get.error);
    });
    database.close();
    if (!window.JSZip) throw new Error('Lettore EPUB non disponibile');
    const zip = await window.JSZip.loadAsync(blob);
    const container = await zip.file('META-INF/container.xml')?.async('text');
    if (!container) throw new Error(`Struttura EPUB non valida: ${book.title}`);
    const containerXml = new DOMParser().parseFromString(container, 'application/xml');
    const rootfile = containerXml.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path');
    if (!rootfile) throw new Error(`Indice EPUB non trovato: ${book.title}`);
    const opf = await zip.file(rootfile)?.async('text');
    if (!opf) throw new Error(`Indice del libro non leggibile: ${book.title}`);
    const xml = new DOMParser().parseFromString(opf, 'application/xml');
    const manifest = new Map([...xml.getElementsByTagNameNS('*', 'item')].map(item => [item.id, item.getAttribute('href')]));
    const base = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : '';
    const path = href => {
      const parts = `${base}${href.split('#')[0]}`.split('/');
      const normalized = [];
      for (const part of parts) { if (part === '..') normalized.pop(); else if (part && part !== '.') normalized.push(part); }
      return normalized.join('/');
    };
    let text = '';
    for (const item of xml.getElementsByTagNameNS('*', 'itemref')) {
      const href = manifest.get(item.getAttribute('idref'));
      if (!href) continue;
      const file = zip.file(path(href));
      if (!file) continue;
      text += ` ${cleanText(await file.async('text'))}`;
      if (text.length >= 240000) break;
    }
    corpusCache.set(book.id, text.slice(0, 240000));
    return corpusCache.get(book.id);
  }

  function relevantPassages(text, query, limit = 4) {
    const terms = [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [])]
      .filter(word => !['questo', 'quella', 'quello', 'della', 'delle', 'degli', 'nella', 'nelle', 'come', 'sono', 'sulla', 'libro', 'testo', 'spiega', 'riassumi'].includes(word));
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    const ranked = sentences.map((sentence, index) => ({ sentence: sentence.trim(), index, score: terms.reduce((score, term) => score + (sentence.toLocaleLowerCase().includes(term) ? 1 : 0), 0) }))
      .filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit)
      .sort((a, b) => a.index - b.index);
    if (!ranked.length && !terms.length) {
      const step = Math.max(1, Math.floor(sentences.length / limit));
      return sentences.filter((_, index) => index % step === 0).slice(0, limit).map(sentence => sentence.trim()).join('\n');
    }
    return ranked.map(item => item.sentence).join('\n');
  }

  async function findBookContext(question) {
    const library = Array.isArray(books) && books.length ? books : await new Promise((resolve, reject) => {
      const open = indexedDB.open('carta-library-v1', 2);
      open.onsuccess = () => { const db = open.result; const req = db.transaction('books').objectStore('books').getAll(); req.onsuccess = () => { db.close(); resolve(req.result); }; req.onerror = () => reject(req.error); };
      open.onerror = () => reject(open.error);
    });
    const query = question.replace(/(?:cerca nei libri|cerca|cercami|trova|nel libro|nel testo|in tutti i libri|nel libro chiamato|questo libro|libro corrente|il libro che sto leggendo)\b/gi, '').replace(/[«»"“”]/g, ' ').trim();
    const targetBooks = library.filter(book => book.type === 'epub' && question.toLocaleLowerCase().includes(book.title.toLocaleLowerCase())).slice(0, 3);
    const searchAll = /\b(tutti i libri|libreria|altri libri|cerca nei libri)\b/i.test(question);
    const currentBookRequest = current && /\b(questo libro|libro corrente|il libro che sto leggendo)\b/i.test(question);
    const candidates = targetBooks.length ? targetBooks : currentBookRequest ? [current] : searchAll ? library.filter(book => book.type === 'epub').slice(0, 10) : [];
    if (!candidates.length) return '';
    const excerpts = [];
    for (const book of candidates) {
      try {
        const text = await bookCorpus(book);
        const bookQuery = query.toLocaleLowerCase().replace(book.title.toLocaleLowerCase(), '').trim();
        const passage = relevantPassages(text, bookQuery || query || question, targetBooks.length ? 5 : 2);
        if (passage) excerpts.push(`Libro: ${book.title}\n${passage}`);
      } catch (error) { console.warn('Non riesco a leggere il libro per l’AI:', error); }
      if (excerpts.join('\n\n').length > 6000) break;
    }
    return excerpts.length ? excerpts.join('\n\n').slice(0, 6000) : (candidates.length ? 'Non ho trovato passaggi corrispondenti nei libri indicati. Dì chiaramente che non hai trovato riscontri nel testo.' : '');
  }

  async function runAppCommand(input) {
    const text = input.trim();
    const lower = text.toLocaleLowerCase();
    const invoke = (command, args) => window.__TAURI__?.core?.invoke(command, args);
    if (/spotify/.test(lower) && /\b(successiv[oa]|avanti|skip|prossim[oa])\b/.test(lower)) {
      await invoke('spotify_media_control', { action: 'next' }); return 'Ho passato al brano successivo su Spotify.';
    }
    if (/spotify/.test(lower) && /\b(precedent[ei]|indietro|scors[oa])\b/.test(lower)) {
      await invoke('spotify_media_control', { action: 'previous' }); return 'Ho riavviato il brano precedente su Spotify.';
    }
    if (/spotify/.test(lower) && /\b(pausa|pausa|ferma|stop)\b/.test(lower)) {
      const state = await invoke('get_spotify_playback');
      if (state?.playing) await invoke('spotify_media_control', { action: 'toggle' });
      return state?.playing ? 'Ho messo in pausa Spotify.' : 'Spotify è già in pausa.';
    }
    if (/spotify/.test(lower) && /\b(riprendi|riproduci|play|avvia)\b/.test(lower)) {
      const state = await invoke('get_spotify_playback');
      if (!state?.playing) await invoke('spotify_media_control', { action: 'toggle' });
      return 'Ho avviato la riproduzione su Spotify.';
    }
    if (/\b(apri|avvia)\s+spotify\b/.test(lower)) {
      await invoke('open_spotify_app'); return 'Ho aperto Spotify.';
    }
    if (/\b(apri|leggi|passa a)\b/.test(lower)) {
      const requested = text.replace(/^.*?\b(?:apri|leggi|passa a)\s+(?:il libro\s+|il\s+)?/i, '').replace(/[.!?]+$/, '').trim().replace(/[«»"“”]/g, '').toLocaleLowerCase();
      const book = books.find(item => item.title.toLocaleLowerCase() === requested) || books.find(item => item.title.toLocaleLowerCase().includes(requested) && requested.length > 2);
      if (book) { await window.openBook(book.id); return `Ho aperto “${book.title}”.`; }
    }
    if (/\b(evidenzia|metti in evidenza|colora)\b/.test(lower)) {
      const passage = selectedPassage?.text ? selectedPassage : commandPassage;
      if (!passage?.text || !current) return 'Seleziona prima il passaggio da evidenziare, poi chiedimi di evidenziarlo.';
      selectedPassage = passage;
      const color = /\b(verde)\b/.test(lower) ? '#91c987' : /\b(azzurro|blu)\b/.test(lower) ? '#83c9e8' : /\b(rosa)\b/.test(lower) ? '#ec9bae' : /\b(lilla|viola)\b/.test(lower) ? '#b7a0df' : '#f1d55e';
      await window.highlightSelection(color); commandPassage = null; return 'Ho evidenziato il passaggio selezionato.';
    }
    if (/\b(rimuovi|cancella)\s+(l[’']?)?evidenziazione\b/.test(lower)) {
      const passage = selectedPassage?.text ? selectedPassage : commandPassage;
      if (!passage?.text || !current) return 'Seleziona il passaggio evidenziato da rimuovere.';
      selectedPassage = passage;
      await window.removeSelectedHighlight(); commandPassage = null; return 'Ho rimosso l’evidenziazione selezionata.';
    }
    const seek = lower.match(/\b(?:vai|salta|spostati)\s+(?:al|alla|a)\s+(\d{1,3})\s*%/);
    if (seek) {
      if (!current || !doc?.rendition) return 'Apri un libro prima di cambiare la posizione di lettura.';
      await seekToPosition(Math.min(100, Number(seek[1])) * 10);
      return `Sono andato al ${Math.min(100, Number(seek[1]))}% del libro.`;
    }
    const theme = lower.match(/\b(?:tema|modalità|aspetto)\s+(chiara|chiaro|scura|scuro|seppia)\b/);
    if (theme) {
      const value = theme[1].startsWith('scur') ? 'dark' : theme[1] === 'seppia' ? 'sepia' : 'light';
      window.setTheme(value); return `Ho impostato il tema ${value === 'dark' ? 'scuro' : value === 'sepia' ? 'seppia' : 'chiaro'}.`;
    }
    if (/\b(mostra|leggi|elenca)\s+(le\s+)?note\b/.test(lower)) {
      const notes = (await all('notes')).filter(note => !current || note.bookId === current.id).sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 8);
      if (!notes.length) return current ? 'Questo libro non contiene note.' : 'La libreria non contiene note.';
      return notes.map(note => `• ${books.find(book => book.id === note.bookId)?.title || 'Libro'} · ${Math.round((note.location || 0) * 100)}%\n${note.text}`).join('\n\n').slice(0, 3000);
    }
    if (/\b(mostra|leggi|elenca)\s+(le\s+)?evidenziazioni\b/.test(lower)) {
      const highlights = (await all('highlights')).filter(item => (!current || item.bookId === current.id) && item.type !== 'pdf').sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0)).slice(0, 8);
      if (!highlights.length) return current ? 'Questo libro non contiene evidenziazioni.' : 'La libreria non contiene evidenziazioni.';
      return highlights.map(item => `• ${books.find(book => book.id === item.bookId)?.title || 'Libro'} · ${Math.round((item.location || 0) * 100)}%\n${item.text}`).join('\n\n').slice(0, 3000);
    }
    if (/\b(aggiungi|crea|scrivi)\s+(una\s+)?nota\b/i.test(text)) {
      if (!current) return 'Apri un libro prima di aggiungere una nota.';
      const comment = text.replace(/^.*?\bnota\b\s*/i, '').replace(/^[:\-–]\s*/, '').trim();
      if (!comment) return 'Scrivi il commento dopo “aggiungi nota”, per esempio: “Aggiungi nota: verificare questo dato”.';
      const passage = selectedPassage?.text ? selectedPassage : commandPassage;
      const note = { id: crypto.randomUUID(), bookId: current.id, text: comment, quote: passage?.text || undefined, cfi: passage?.cfi || undefined, location: passage?.location ?? current.progress ?? 0, updated: Date.now() };
      await put('notes', note); currentNotes.unshift(note); renderNotes(); commandPassage = null; return 'Ho aggiunto la nota al libro aperto.';
    }
    return null;
  }

  async function seekToPosition(value) {
    if (typeof window.seekToProgress !== 'function') throw new Error('Il salto alla posizione non è disponibile.');
    return window.seekToProgress(value);
  }

  function chatKey() {
    return `carta-ai-chat:${current?.id || 'general'}`;
  }

  function loadChat() {
    const bookId = current?.id || 'general';
    if (chatBookId === bookId) return;
    chatBookId = bookId;
    try {
      const saved = JSON.parse(localStorage.getItem(chatKey()) || '[]');
      chatMessages = Array.isArray(saved) ? saved.filter(message =>
        message && ['user', 'assistant'].includes(message.role) && typeof message.text === 'string'
      ).map(message => message.pending ? { role: 'assistant', text: 'La risposta è stata interrotta. Puoi riprovare.' } : message).slice(-40) : [];
    } catch { chatMessages = []; }
    lastAnswer = [...chatMessages].reverse().find(message => message.role === 'assistant')?.text || '';
    $ai('assistantSaveNote')?.classList.toggle('hidden', !lastAnswer);
    renderChat();
  }

  function saveChat() {
    try { localStorage.setItem(chatKey(), JSON.stringify(chatMessages.slice(-40))); }
    catch (error) { console.warn('Cronologia AI non salvata:', error); }
  }

  function renderChat() {
    const chat = $ai('assistantAnswer');
    if (!chat) return;
    chat.replaceChildren();
    if (!chatMessages.length) {
      const welcome = document.createElement('p');
      welcome.className = 'assistant-chat-empty';
      welcome.textContent = 'La conversazione su questo libro apparirà qui. Puoi usare un suggerimento o scrivere una domanda.';
      chat.append(welcome);
      return;
    }
    for (const message of chatMessages) {
      const bubble = document.createElement('article');
      bubble.className = `assistant-message assistant-message-${message.role}`;
      const author = document.createElement('span');
      author.className = 'assistant-message-author';
      author.textContent = message.role === 'user' ? 'Tu' : 'Carta · Qwen';
      bubble.append(author);
      const body = document.createElement('div');
      body.className = 'assistant-message-body';
      if (message.role === 'assistant') renderAssistantAnswer(body, message.text);
      else body.textContent = message.text;
      bubble.append(body);
      if (message.role === 'assistant' && Array.isArray(message.sources) && message.sources.length) {
        const sources = document.createElement('div');
        sources.className = 'assistant-sources';
        const heading = document.createElement('span');
        heading.className = 'assistant-sources-title';
        heading.textContent = 'Fonti online';
        sources.append(heading);
        message.sources.forEach((source, index) => {
          const item = document.createElement('article'); item.className = 'assistant-source';
          const title = document.createElement('strong'); title.textContent = `[${index + 1}] ${source.title || source.source || 'Fonte'}`;
          const excerpt = document.createElement('span'); excerpt.textContent = source.price ? `${source.price} · ${source.snippet || ''}` : (source.snippet || '');
          const link = document.createElement('button'); link.type = 'button'; link.className = 'assistant-source-link'; link.textContent = 'Apri fonte ↗';
          link.addEventListener('click', async () => {
            try { await window.__TAURI__.core.invoke('open_web_result', { url: source.url }); }
            catch (error) { toast(`Non riesco ad aprire la fonte: ${String(error?.message || error)}`); }
          });
          item.append(title, excerpt, link); sources.append(item);
        });
        bubble.append(sources);
      }
      chat.append(bubble);
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function cleanAssistantAnswer(text) {
    return String(text || '')
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/<\/?think>/gi, '')
      .replace(/<\|(?:im_start|im_end|endoftext|fim_suffix|fim_prefix|fim_middle)\|>/gi, '')
      .replace(/^\s*```(?:markdown|md|text)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }

  function appendFormattedText(parent, text) {
    const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\$[^$\n]+\$)/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(offset, match.index)));
      const token = match[0];
      const element = token.startsWith('**') ? document.createElement('strong')
        : token.startsWith('`') ? document.createElement('code')
          : token.startsWith('$') ? document.createElement('span')
            : document.createElement('em');
      if (token.startsWith('$')) {
        renderMath(element, normalizeLatex(token.slice(1, -1)), false);
        element.className = 'assistant-math';
      } else {
        element.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1);
      }
      parent.append(element);
      offset = match.index + token.length;
    }
    parent.append(document.createTextNode(text.slice(offset)));
  }

  function normalizeLatex(source) {
    return source.replace(/\\_/g, '_').replace(/\\\\([{}])/g, '\\$1');
  }

  function renderMath(element, source, displayMode) {
    if (!window.katex) {
      element.textContent = source;
      return;
    }
    try {
      window.katex.render(source, element, {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: 'htmlAndMathml'
      });
    } catch {
      element.textContent = source;
    }
  }

  function renderAssistantAnswer(element, rawText) {
    const text = cleanAssistantAnswer(rawText);
    element.replaceChildren();
    let list = null;
    let listType = '';
    const closeList = () => { list = null; listType = ''; };

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) { closeList(); continue; }
      if (trimmed === '$$') {
        closeList();
        const formulaLines = [];
        for (i++; i < lines.length && lines[i].trim() !== '$$'; i++) formulaLines.push(lines[i]);
        const equation = document.createElement('div');
        equation.className = 'assistant-equation';
        renderMath(equation, normalizeLatex(formulaLines.join('\n').trim()), true);
        element.append(equation);
        continue;
      }
      const inlineMathLine = trimmed.match(/^\$\$(.+)\$\$$/);
      if (inlineMathLine) {
        closeList();
        const equation = document.createElement('div');
        equation.className = 'assistant-equation';
        renderMath(equation, normalizeLatex(inlineMathLine[1]), true);
        element.append(equation);
        continue;
      }
      const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
      const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (heading) {
        closeList();
        const title = document.createElement('h3');
        appendFormattedText(title, heading[1]);
        element.append(title);
      } else if (bullet || ordered) {
        const type = bullet ? 'ul' : 'ol';
        if (!list || listType !== type) {
          closeList();
          list = document.createElement(type);
          listType = type;
          element.append(list);
        }
        const item = document.createElement('li');
        appendFormattedText(item, (bullet || ordered)[1]);
        list.append(item);
      } else {
        closeList();
        const paragraph = document.createElement('p');
        appendFormattedText(paragraph, trimmed);
        element.append(paragraph);
      }
    }
    return text;
  }

  window.askAboutSelection = function () {
    selectedQuote = selectedPassage?.text || '';
    if (!selectedQuote) return;
    commandPassage = { ...selectedPassage };
    window.toggleAiPanel(true);
    $('assistantInput').value = '';
    hideSelectionMenu();
    $('assistantInput').focus();
  };

  window.askAssistant = async function (task = '') {
    if (isAsking) return;
    const input = $ai('assistantInput').value.trim();
    if (input) {
      try {
        const actionResult = await runAppCommand(input);
        if (actionResult) {
          chatMessages.push({ role: 'user', text: input }, { role: 'assistant', text: actionResult });
          renderChat(); saveChat(); $ai('assistantInput').value = '';
          return;
        }
      } catch (error) {
        chatMessages.push({ role: 'user', text: input }, { role: 'assistant', text: `Non riesco a eseguire il comando: ${String(error?.message || error)}` });
        renderChat(); saveChat(); $ai('assistantInput').value = '';
        return;
      }
    }
    if (!modelReady) return toast('Scarica prima Qwen per usare l’assistente');
    const source = selectedQuote || pageText();
    if (!source && !input && !chatMessages.length) return toast('Apri un libro o inserisci un testo');
    const button = $ai('assistantAsk');
    isAsking = true;
    button.disabled = true;
    button.textContent = 'Sto cercando…';
    document.querySelectorAll('.assistant-prompts button').forEach(item => { item.disabled = true; });
    const tasks = {
      spiega: ['Spiega questo passaggio', 'Spiega in modo semplice il significato e il contesto del passaggio.'],
      traduci: ['Traduci questo passaggio', 'Traduci in italiano il passaggio. Se è già in italiano, traducilo in inglese.'],
      idee: ['Idee chiave', 'Individua e spiega i concetti chiave del passaggio in elenco.'],
      riassumi: ['Riassumi questo passaggio', 'Riassumi il passaggio in poche frasi.']
    };
    const selectedTask = tasks[task];
    const question = selectedTask ? `${selectedTask[1]}${input ? `\nIndicazioni aggiuntive: ${input.slice(0, 800)}` : ''}` : input;
    const displayQuestion = selectedTask ? `${selectedTask[0]}${input ? `: ${input}` : ''}` : input;
    const excerpt = source ? source.slice(0, 1600) + (source.length > 1600 ? '…' : '') : '';
    const history = chatMessages.slice(-2).map(message =>
      `${message.role === 'user' ? 'Utente' : 'Assistente'}: ${message.text.slice(0, 300)}`
    ).join('\n');
    let libraryContext = '';
    try { if (input) libraryContext = await findBookContext(input); }
    catch (error) { console.warn('Ricerca nei libri non riuscita:', error); }
    const queryWeb = false;
    let sourcesForAnswer = [];
    let webError = '';
    let webContext = '';
    const webQuery = input || selectedQuote;
    if (queryWeb && webQuery) {
      $ai('assistantStatus').textContent = 'Cerco fonti online…';
      button.textContent = 'Cerco sul web…';
      try {
        sourcesForAnswer = await window.__TAURI__.core.invoke('search_web', { query: webQuery.slice(0, 240) });
        webContext = sourcesForAnswer.map((item, index) => `[${index + 1}] ${item.title} (${item.source})${item.price ? ` · ${item.price}` : ''}\n${item.snippet}\nURL: ${item.url}`).join('\n\n');
      } catch (error) {
        webError = String(error?.message || error || 'errore sconosciuto');
        console.warn('Ricerca online non riuscita:', error);
      }
    }
    const prompt = [
      libraryContext ? `Passaggi trovati nella libreria dell’utente. Rispondi basandoti su questi estratti e cita il titolo del libro.\n${libraryContext}` : '',
      !libraryContext && excerpt ? `Passaggio di riferimento (eventualmente abbreviato):\n${excerpt}` : '',
      webContext ? `Fonti web aggiornate ottenute da Google Books e Wikipedia. Usa solo queste fonti per i fatti online e cita le affermazioni con [1], [2]. Per prezzi assenti, dì che non sono disponibili.\n${webContext}` : '',
      webError ? `La ricerca online è fallita (${webError}); non presentare informazioni come verificate online.` : '',
      history ? `Conversazione recente:\n${history}` : '',
      `Utente: ${(question || 'Continua la conversazione sul libro.').slice(0, 600)}\nAssistente:`
    ].filter(Boolean).join('\n\n');
    button.textContent = 'Qwen sta leggendo…';
    if (displayQuestion) chatMessages.push({ role: 'user', text: displayQuestion });
    chatMessages.push({ role: 'assistant', text: 'Sto preparando una risposta locale…', pending: true });
    renderChat();
    saveChat();
    $ai('assistantInput').value = '';
    $ai('assistantSaveNote').classList.add('hidden');
    try {
      const response = await window.__TAURI__.core.invoke('ask_qwen', { prompt });
      lastAnswer = cleanAssistantAnswer(response);
      chatMessages[chatMessages.length - 1] = { role: 'assistant', text: lastAnswer || 'Non è arrivata una risposta. Prova con un passaggio più breve.', sources: sourcesForAnswer };
      renderChat();
      saveChat();
      $ai('assistantSaveNote').classList.toggle('hidden', !lastAnswer);
    } catch (error) {
      chatMessages[chatMessages.length - 1] = { role: 'assistant', text: `Non riesco a completare la richiesta: ${String(error?.message || error)}` };
      renderChat();
      saveChat();
    } finally {
      isAsking = false;
      button.disabled = false;
      button.textContent = 'Chiedi a Qwen';
      $ai('assistantStatus').textContent = webError ? `Ricerca online non riuscita: ${webError}` : 'Qwen è pronto su questo dispositivo.';
      document.querySelectorAll('.assistant-prompts button').forEach(item => { item.disabled = false; });
    }
  };

  window.newAssistantChat = function () {
    if (isAsking) return toast('Attendi la fine della risposta prima di iniziare una nuova chat');
    chatMessages = [];
    lastAnswer = '';
    selectedQuote = '';
    saveChat();
    renderChat();
    $ai('assistantSaveNote').classList.add('hidden');
    $ai('assistantInput').value = '';
  };

  window.saveAssistantNote = async function () {
    if (!current || !lastAnswer) return;
    const note = {
      id: uid(), bookId: current.id, text: lastAnswer,
      quote: selectedQuote || undefined, location: current.progress || 0, updated: Date.now()
    };
    await put('notes', note);
    currentNotes.unshift(note);
    renderNotes();
    showTab('notes');
    toast('Risposta aggiunta alle note');
  };

  $ai('assistantInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      window.askAssistant();
    }
  });



  $ai('assistantHelpToggle')?.addEventListener('click', () => $ai('assistantHelpDialog')?.showModal());
  $ai('assistantHelpClose')?.addEventListener('click', () => $ai('assistantHelpDialog')?.close());
  document.addEventListener('DOMContentLoaded', () => { initializeDock(); refreshModelState(); }, { once: true });
  if (document.readyState !== 'loading') { initializeDock(); refreshModelState(); }
})();
