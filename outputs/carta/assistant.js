(() => {
  const $ai = (id) => document.getElementById(id);
  let modelReady = false;
  let selectedQuote = '';
  let lastAnswer = '';
  let chatMessages = [];
  let chatBookId = null;
  let isAsking = false;

  window.showTab = function (tab) {
    for (const name of ['notes', 'highlights', 'settings', 'assistant']) {
      $ai(`${name}Pane`)?.classList.toggle('hidden', name !== tab);
      $ai(`${name}Tab`)?.classList.toggle('active', name === tab);
    }
    if (tab === 'assistant') loadChat();
  };

  async function refreshModelState() {
    try {
      modelReady = await window.__TAURI__.core.invoke('qwen_model_status');
      $ai('assistantSetup').classList.toggle('hidden', modelReady);
      $ai('assistantWorkspace').classList.toggle('hidden', !modelReady);
      $ai('assistantStatus').textContent = modelReady ? 'Qwen è pronto su questo dispositivo.' : 'Un aiuto privato per capire il testo.';
    } catch (error) {
      const detail = String(error?.message || error || 'errore sconosciuto');
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
    $('sidePanel').classList.add('open');
    $('panelBackdrop').classList.remove('hidden');
    showTab('assistant');
    $('assistantInput').value = '';
    hideSelectionMenu();
    $('assistantInput').focus();
  };

  window.askAssistant = async function (task = '') {
    if (isAsking) return;
    if (!modelReady) return toast('Scarica prima Qwen per usare l’assistente');
    const input = $ai('assistantInput').value.trim();
    const source = selectedQuote || pageText();
    if (!source && !input && !chatMessages.length) return toast('Apri un libro o inserisci un testo');
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
    const prompt = [
      excerpt ? `Passaggio di riferimento (eventualmente abbreviato):\n${excerpt}` : '',
      history ? `Conversazione recente:\n${history}` : '',
      `Utente: ${(question || 'Continua la conversazione sul libro.').slice(0, 600)}\nAssistente:`
    ].filter(Boolean).join('\n\n');
    const button = $ai('assistantAsk');
    isAsking = true;
    button.disabled = true;
    button.textContent = 'Qwen sta leggendo…';
    document.querySelectorAll('.assistant-prompts button').forEach(item => { item.disabled = true; });
    if (displayQuestion) chatMessages.push({ role: 'user', text: displayQuestion });
    chatMessages.push({ role: 'assistant', text: 'Sto preparando una risposta locale…', pending: true });
    renderChat();
    saveChat();
    $ai('assistantInput').value = '';
    $ai('assistantSaveNote').classList.add('hidden');
    try {
      const response = await window.__TAURI__.core.invoke('ask_qwen', { prompt });
      lastAnswer = cleanAssistantAnswer(response);
      chatMessages[chatMessages.length - 1] = { role: 'assistant', text: lastAnswer || 'Non è arrivata una risposta. Prova con un passaggio più breve.' };
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

  document.addEventListener('DOMContentLoaded', refreshModelState, { once: true });
  if (document.readyState !== 'loading') refreshModelState();
})();
