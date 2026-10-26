let noteDraftQuote = '';
let noteDraftLocation = 0;
let noteDraftCfi = '';

function updateNoteQuotePreview() {
  let preview = $('noteQuotePreview');
  if (!preview) {
    preview = document.createElement('blockquote');
    preview.id = 'noteQuotePreview';
    preview.className = 'note-quote-preview hidden';
    $('noteInput').before(preview);
  }
  preview.textContent = noteDraftQuote;
  preview.classList.toggle('hidden', !noteDraftQuote);
}

function beginNoteDraft({ quote = '', location = current?.progress || 0, cfi = '', id = null, text = '' } = {}) {
  activeNoteId = id;
  noteDraftQuote = quote;
  noteDraftLocation = location;
  noteDraftCfi = cfi;
  $('noteInput').value = text;
  $('composerLocation').textContent = `EPUB · ${Math.round(location * 100)}%`;
  updateNoteQuotePreview();
  $('noteComposer').classList.remove('hidden');
  $('noteInput').focus();
}

window.newNote = function () {
  beginNoteDraft({ location: current?.progress || 0, cfi: current?.cfi || '' });
};

window.addSelectionNote = function () {
  const passage = selectedPassage;
  if (!passage) return;
  const draft = {
    quote: passage.text,
    location: passage.location ?? (current?.progress || 0),
    cfi: passage.cfi || ''
  };
  hideSelectionMenu();
  $('sidePanel').classList.add('open');
  $('panelBackdrop').classList.remove('hidden');
  showTab('notes');
  beginNoteDraft(draft);
};

window.editNote = function (id) {
  const note = currentNotes.find(item => item.id === id);
  if (!note) return;
  const legacyQuoteOnly = note.quote && note.text === note.quote;
  beginNoteDraft({
    id,
    quote: note.quote || '',
    location: note.location || 0,
    cfi: note.cfi || '',
    text: legacyQuoteOnly ? '' : note.text
  });
};

window.cancelNote = function () {
  $('noteComposer').classList.add('hidden');
  $('noteInput').value = '';
  noteDraftQuote = '';
  noteDraftLocation = 0;
  noteDraftCfi = '';
  activeNoteId = null;
};

window.saveNote = async function () {
  const comment = $('noteInput').value.trim();
  if (!comment) {
    toast('Aggiungi un commento prima di salvare');
    return;
  }
  let note = activeNoteId ? currentNotes.find(item => item.id === activeNoteId) : null;
  if (note) {
    note.text = comment;
    note.quote = noteDraftQuote || undefined;
    note.location = noteDraftLocation;
    note.cfi = noteDraftCfi || undefined;
    note.updated = Date.now();
  } else {
    note = {
      id: uid(),
      bookId: current.id,
      text: comment,
      quote: noteDraftQuote || undefined,
      location: noteDraftLocation,
      cfi: noteDraftCfi || undefined,
      updated: Date.now()
    };
    currentNotes.unshift(note);
  }
  await put('notes', note);
  window.cancelNote();
  renderNotes();
  toast('Commento salvato');
};

window.renderNotes = function () {
  const list = $('notesList');
  list.replaceChildren();
  $('notesCount').textContent = currentNotes.length
    ? `${currentNotes.length} ${currentNotes.length === 1 ? 'nota' : 'note'}`
    : 'Le tue note';
  $('noteBadge').textContent = currentNotes.length ? ` · ${currentNotes.length}` : '';
  if (!currentNotes.length) {
    list.innerHTML = '<div class="notes-empty">Le tue note appariranno qui.<br>Aggiungi un commento a un passaggio o alla pagina corrente.</div>';
    return;
  }
  for (const note of currentNotes) {
    const card = document.createElement('article');
    card.className = 'note-card';
    const location = document.createElement('div');
    location.className = 'note-loc';
    location.textContent = `EPUB · ${Math.round((note.location || 0) * 100)}%`;
    card.append(location);
    const quoteText = note.quote || (note.text && note.text === note.quote ? note.text : '');
    if (quoteText) {
      const quote = document.createElement('blockquote');
      quote.className = 'note-card-quote';
      quote.textContent = quoteText;
      card.append(quote);
    }
    const comment = document.createElement('div');
    if (note.quote && note.text === note.quote) {
      comment.className = 'note-card-no-comment';
      comment.textContent = 'Nessun commento aggiunto';
    } else {
      comment.className = 'note-text note-card-comment';
      comment.textContent = note.text;
    }
    card.append(comment);
    const actions = document.createElement('div');
    actions.className = 'note-actions';
    const edit = document.createElement('button');
    edit.className = 'text-action';
    edit.textContent = 'Modifica';
    edit.onclick = () => window.editNote(note.id);
    const removeButton = document.createElement('button');
    removeButton.className = 'text-action';
    removeButton.textContent = 'Elimina';
    removeButton.onclick = () => deleteNote(note.id);
    actions.append(edit, removeButton);
    card.append(actions);
    list.append(card);
  }
};

window.showSelectionMenu = function (text, rect, passage) {
  if (!text?.trim()) return;
  selectedPassage = passage;
  const menu = $('selectionMenu');
  const colors = $('highlightColors');
  colors.replaceChildren();
  for (const item of highlightPalette) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'highlight-color';
    button.style.background = item.color;
    button.title = item.name;
    button.setAttribute('aria-label', `Evidenzia in ${item.name.toLowerCase()}`);
    button.onclick = () => highlightSelection(item.color);
    colors.append(button);
  }
  $('removeHighlightAction').classList.toggle('hidden', !matchingHighlights(passage).length);
  const noteButton = menu.querySelector('.selection-note');
  if (noteButton) noteButton.textContent = 'Nota';
  $('dictionaryDirections')?.classList.add('hidden');
  menu.classList.remove('hidden');
  const left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, rect.left));
  const top = rect.bottom + 10 + menu.offsetHeight < window.innerHeight
    ? rect.bottom + 8
    : Math.max(8, rect.top - menu.offsetHeight - 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
};

(() => {
  const menu = $('selectionMenu');
  const dictionaryButton = menu?.querySelector('.dictionary-action');
  const directions = $('dictionaryDirections');
  if (!dictionaryButton || !directions) return;

  dictionaryButton.addEventListener('click', () => {
    directions.classList.toggle('hidden');
    if (!directions.classList.contains('hidden')) {
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, rect.left))}px`;
      menu.style.top = `${Math.max(8, Math.min(window.innerHeight - rect.height - 8, rect.top))}px`;
    }
  });

  directions.addEventListener('click', async (event) => {
    const option = event.target.closest('[data-direction]');
    if (!option || !selectedPassage?.text) return;
    const direction = option.dataset.direction;
    const root = `https://dictionary.cambridge.org/it/dizionario/${direction}/`;
    const word = selectedPassage.text.trim().replace(/\s+/g, ' ').slice(0, 120);
    const url = root + encodeURIComponent(word);
    try {
      if (window.__TAURI__?.core?.invoke) {
        await window.__TAURI__.core.invoke('open_dictionary_url', { url });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      window.hideSelectionMenu?.();
    } catch (error) {
      window.toast?.(error?.message || 'Impossibile aprire il dizionario');
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.dictionary-action, .dictionary-directions')) {
      directions.classList.add('hidden');
    }
  });
})();

window.applyEpubThemeToDocument = function (frameDoc) {
  const body = frameDoc?.body;
  const root = frameDoc?.documentElement;
  if (!body || !root) return;
  const colors = {
    light: ['#292a26', '#fffefa'],
    sepia: ['#453827', '#f7edda'],
    dark: ['#c9c9c7', '#17181a']
  }[theme];
  const linkColor = { light: '#315d4b', sepia: '#69502f', dark: '#b9b4cc' }[theme];
  const systemFont = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
  for (const element of [root, body, ...body.querySelectorAll('*')]) {
    element.style.setProperty('color', colors[0], 'important');
    element.style.setProperty('font-family', systemFont, 'important');
    element.style.setProperty('line-height', String(lineSpacing), 'important');
  }
  root.style.setProperty('font-size', `${fontSize}px`, 'important');
  body.style.setProperty('font-size', `${fontSize}px`, 'important');
  const pageBackground = theme === 'dark' ? 'transparent' : colors[1];
  root.style.setProperty('background-color', pageBackground, 'important');
  body.style.setProperty('background-color', pageBackground, 'important');
  root.style.setProperty('background-image', 'none', 'important');
  body.style.setProperty('background-image', 'none', 'important');
  for (const link of body.querySelectorAll('a')) {
    link.style.setProperty('color', linkColor, 'important');
    link.style.setProperty('text-decoration', 'underline', 'important');
    link.style.setProperty('text-decoration-color', linkColor, 'important');
  }
};

window.applyEpubTheme = function () {
  if (!doc?.rendition) return;
  for (const content of doc.rendition.getContents()) {
    window.applyEpubThemeToDocument(content.document);
  }
  doc.rendition.resize();
};

function addEPUBScrollbarStyle(view) {
  const frameDoc = view?.iframe?.contentDocument;
  if (!frameDoc?.head || frameDoc.getElementById('carta-reader-scrollbar-style')) return;
  const style = frameDoc.createElement('style');
  style.id = 'carta-reader-scrollbar-style';
  style.textContent = [
    '* { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, currentColor 22%, transparent) transparent; }',
    '::selection, ::-moz-selection { background: #dce4d2 !important; color: #30332e !important; }',
    '::-webkit-scrollbar { width: 5px; height: 5px; }',
    '::-webkit-scrollbar-track { background: transparent; }',
    '::-webkit-scrollbar-thumb { background: color-mix(in srgb, currentColor 22%, transparent); border-radius: 999px; }'
  ].join(String.fromCharCode(10));
  frameDoc.head.append(style);
}
const originalOpenEPUB = window.openEPUB;
window.openEPUB = async function (file) {
  await originalOpenEPUB(file);
  if (!doc?.rendition) return;
  doc.rendition.on('rendered', (_section, view) => {
    window.applyEpubThemeToDocument(view?.iframe?.contentDocument);
    addEPUBScrollbarStyle(view);
  });
  for (const content of doc.rendition.getContents()) {
    window.applyEpubThemeToDocument(content.document);
    addEPUBScrollbarStyle({ iframe: content.document.defaultView?.frameElement });
  }
};

const scrubber = document.createElement('input');
scrubber.id = 'progressScrubber';
scrubber.type = 'range';
scrubber.min = '0';
scrubber.max = '1000';
scrubber.step = '1';
scrubber.value = '0';
scrubber.disabled = true;
scrubber.title = 'Caricamento della posizione del libro';
scrubber.setAttribute('aria-label', 'Scegli la posizione nel libro');
scrubber.addEventListener('input', () => {
  const percentage = Math.round(Number(scrubber.value) / 10);
  scrubber.title = `Rilascia per andare al ${percentage}% del libro`;
  $('progressLabel').textContent = `${percentage}% · rilascia per andare`;
  jumpInput.value = String(percentage);
});
scrubber.addEventListener('change', () => window.seekToProgress(scrubber.value));
$('#readerProgressControl').append(scrubber);

const jumpControl = document.createElement('label');
jumpControl.className = 'reader-jump';
const jumpLabel = document.createElement('span');
jumpLabel.textContent = 'Vai al';
const jumpInput = document.createElement('input');
jumpInput.type = 'number';
jumpInput.min = '0';
jumpInput.max = '100';
jumpInput.step = '1';
jumpInput.value = '0';
jumpInput.title = 'Inserisci una percentuale da 0 a 100';
jumpInput.setAttribute('aria-label', 'Vai a una percentuale del libro');
const jumpSuffix = document.createElement('span');
jumpSuffix.textContent = '%';
jumpInput.addEventListener('change', () => {
  const percentage = Math.max(0, Math.min(100, Number(jumpInput.value) || 0));
  jumpInput.value = String(percentage);
  window.seekToProgress(percentage * 10);
});
const commitJump = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    jumpInput.blur();
  }
};
jumpInput.addEventListener('keydown', commitJump);
jumpControl.append(jumpLabel, jumpInput, jumpSuffix);
$('pageLabel').after(jumpControl);

const originalUpdateProgress = window.updateProgress;
window.updateProgress = function (progress) {
  originalUpdateProgress(progress);
  const hasLocations = Boolean(doc?.locations?.total);
  scrubber.disabled = !hasLocations;
  scrubber.title = hasLocations ? 'Scegli la posizione nel libro' : 'Calcolo delle posizioni…';
  if (document.activeElement !== scrubber) {
    scrubber.value = String(Math.round(Math.max(0, Math.min(1, progress || 0)) * 1000));
    $('progressLabel').textContent = `${Math.round(Math.max(0, Math.min(1, progress || 0)) * 100)}% completato`;
  }
  jumpInput.disabled = !hasLocations;
  jumpInput.title = hasLocations ? 'Inserisci una percentuale da 0 a 100' : 'Sto preparando le posizioni del libro';
  if (document.activeElement !== jumpInput) jumpInput.value = String(Math.round(Math.max(0, Math.min(1, progress || 0)) * 100));
};

window.setEpubSeekReady = function (ready) {
  scrubber.disabled = !ready;
  jumpInput.disabled = !ready;
  scrubber.title = ready ? 'Trascina per scegliere la posizione nel libro' : 'Sto preparando le posizioni del libro';
  jumpInput.title = ready ? 'Inserisci una percentuale da 0 a 100' : 'Sto preparando le posizioni del libro';
};

const originalUpdateStats = window.updateStats;
window.updateStats = function () {
  originalUpdateStats?.();
  const progress = $('progressLabel');
  const fullProgress = `${Math.round(Math.max(0, Math.min(1, current?.progress || 0)) * 100)}% completato`;
  progress.textContent = fullProgress.replace(' completato', '');
  progress.title = fullProgress;
  const remaining = $('remainingLabel');
  const fullRemaining = remaining.textContent;
  remaining.textContent = fullRemaining
    .replace(' rimanenti', '')
    .replace(/\s*min\b/g, 'm')
    .replace(/\s*h\s*/g, 'h ');
  remaining.title = fullRemaining;
  const pace = $('paceLabel');
  pace.textContent = pace.textContent.replace(' parole/min', ' ppm').replace('Ritmo iniziale', 'Stima');
  $('.reader-status').title = `${fullProgress} · ${fullRemaining} · ${pace.textContent}`;
};

window.seekToProgress = async function (value) {
  if (!doc?.rendition || !doc.locations?.total) {
    toast('Sto ancora preparando l’indice del libro');
    return;
  }
  const progress = Math.max(0, Math.min(1, Number(value) / 1000));
  try {
    const cfi = doc.locations.cfiFromPercentage(progress);
    await doc.rendition.display(cfi);
    scrubber.value = String(Math.round(progress * 1000));
    scrubber.title = `Posizione: ${Math.round(progress * 100)}%`;
  } catch {
    toast('Impossibile raggiungere questa posizione');
  }
};
