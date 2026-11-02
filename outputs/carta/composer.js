(() => {
  'use strict';

  const DB_NAME = 'carta-authoring-v1';
  const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
  const MAX_FONT_BYTES = 10 * 1024 * 1024;
  const FONT_CATALOG = {
    literata: { label: 'Literata', family: 'Carta Literata', stack: "'Carta Literata', Georgia, serif", file: 'literata-latin.woff2', license: 'literata-OFL.txt' },
    lora: { label: 'Lora', family: 'Carta Lora', stack: "'Carta Lora', Georgia, serif", file: 'lora-latin.woff2', license: 'lora-OFL.txt' },
    inter: { label: 'Inter', family: 'Carta Inter', stack: "'Carta Inter', 'Segoe UI', sans-serif", file: 'inter-latin.woff2', license: 'inter-OFL.txt' },
    'source-serif-4': { label: 'Source Serif 4', family: 'Carta Source Serif', stack: "'Carta Source Serif', Georgia, serif", file: 'source-serif-4-latin.woff2', license: 'sourceserif4-OFL.txt' },
    'source-sans-3': { label: 'Source Sans 3', family: 'Carta Source Sans', stack: "'Carta Source Sans', 'Segoe UI', sans-serif", file: 'source-sans-3-latin.woff2', license: 'sourcesans3-OFL.txt' },
    'atkinson-hyperlegible': { label: 'Atkinson Hyperlegible', family: 'Carta Atkinson', stack: "'Carta Atkinson', Arial, sans-serif", file: 'atkinson-hyperlegible-latin.woff2', license: 'atkinsonhyperlegible-OFL.txt' },
    times: { label: 'Times New Roman', family: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
    helvetica: { label: 'Helvetica', family: 'Helvetica', stack: 'Helvetica, Arial, sans-serif' },
  };
  const $ = (id) => document.getElementById(id);
  const byFont = (id) => FONT_CATALOG[id] || FONT_CATALOG.literata;
  const hasDocumentContent = (item) => Boolean(item?.title?.trim() || item?.author?.trim() || item?.source?.trim());
  const emptyDocument = () => ({ id: crypto.randomUUID?.() || `draft-${Date.now()}`, title: '', author: '', source: '', font: 'literata', fontSize: 18, lineHeight: 1.7, paragraphSpace: 0.8, alignment: 'left', updated: 0 });
  let dbPromise;
  let activeDocument = emptyDocument();
  let saveTimer = 0;
  let mode = 'edit';
  const loadedCustomFonts = new Set();

  function notify(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else {
      $('composerSaveState').textContent = message;
      window.setTimeout(() => { $('composerSaveState').textContent = 'Bozza locale'; }, 2400);
    }
  }

  function openDatabase() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('fonts')) db.createObjectStore('fonts', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('Archivio locale non disponibile'));
    });
    return dbPromise;
  }

  async function dbRequest(storeName, action, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, action === 'getAll' || action === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = action === 'put' ? store.put(value) : action === 'delete' ? store.delete(value) : action === 'get' ? store.get(value) : store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Operazione locale non riuscita'));
    });
  }

  function currentStyle() {
    const font = activeDocument.font.startsWith('custom:') ? null : byFont(activeDocument.font);
    const custom = activeDocument.font.startsWith('custom:') ? activeDocument.font.slice(7) : '';
    return {
      font: font?.stack || customFontFamily(custom),
      size: Math.max(14, Math.min(32, Number(activeDocument.fontSize) || 18)),
      line: Math.max(1.2, Math.min(2.4, Number(activeDocument.lineHeight) || 1.7)),
      paragraph: Math.max(0, Math.min(2.2, Number(activeDocument.paragraphSpace) || 0)),
      alignment: ['left', 'justify', 'center', 'right'].includes(activeDocument.alignment) ? activeDocument.alignment : 'left',
    };
  }

  const customFontRecords = new Map();
  function customFontFamily(id) {
    const font = customFontRecords.get(id);
    return font ? `'${font.family}', sans-serif` : FONT_CATALOG.literata.stack;
  }

  function applyTypography() {
    const style = currentStyle();
    const canvas = document.querySelector('.composer-canvas');
    if (!canvas) return;
    canvas.style.setProperty('--composer-font-family', style.font);
    canvas.style.setProperty('--composer-font-size', `${style.size}px`);
    canvas.style.setProperty('--composer-line-height', String(style.line));
    canvas.style.setProperty('--composer-paragraph-space', String(style.paragraph));
    canvas.style.setProperty('--composer-align', style.alignment);
    $('composerTitle').style.setProperty('--composer-font-family', style.font);
    $('composerFontSize').value = String(style.size);
    $('composerLineHeight').value = String(style.line);
    $('composerLineHeightValue').value = style.line.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    $('composerParagraphSpace').value = String(style.paragraph);
    $('composerParagraphSpaceValue').value = style.paragraph.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    $('composerFont').value = activeDocument.font.startsWith('custom:') ? 'literata' : activeDocument.font;
    if (activeDocument.font.startsWith('custom:') && customFontRecords.has(activeDocument.font.slice(7))) $('composerFont').value = activeDocument.font;
    document.querySelector('[data-compose-action="remove-font"]').classList.toggle('hidden', !activeDocument.font.startsWith('custom:'));
    document.querySelectorAll('[data-align]').forEach((button) => {
      const selected = button.dataset.align === style.alignment;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function mathMarkup(source) {
    if (!window.marked || !window.DOMPurify || !window.katex) throw new Error('Anteprima Markdown e LaTeX non disponibile');
    const formulae = [];
    const tokenFor = (tex, display) => {
      const token = `CARTAMATH${formulae.length}TOKEN`;
      formulae.push({ token, tex, display });
      return token;
    };
    const chunks = String(source).split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);
    const transformed = chunks.map((chunk, index) => {
      if (index % 2) return chunk;
      return chunk
        .replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_match, dollarMath, bracketMath) => tokenFor(dollarMath ?? bracketMath, true))
        .replace(/\\\((.+?)\\\)|\$([^\n$]+)\$/g, (_match, parenMath, dollarMath) => tokenFor(parenMath ?? dollarMath, false));
    }).join('');
    let html = window.marked.parse(transformed, { gfm: true, breaks: false, async: false });
    for (const formula of formulae) {
      const mathHtml = window.katex.renderToString(formula.tex.trim(), {
        displayMode: formula.display, throwOnError: false, strict: 'ignore', trust: false,
        maxSize: 10, maxExpand: 1000, output: 'htmlAndMathml',
      });
      html = html.split(formula.token).join(mathHtml);
    }
    return window.DOMPurify.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'script', 'style', 'form', 'input', 'button', 'object', 'embed'],
      FORBID_ATTR: ['srcset'],
    });
  }

  function textNode(tag, className, text) {
    if (!text) return null;
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function renderPreview() {
    const fragment = mathMarkup($('composerSource').value);
    const preview = $('composerPreview');
    const title = textNode('h1', 'preview-title', $('composerTitle').value.trim());
    const author = textNode('p', 'preview-author', $('composerAuthor').value.trim());
    const nodes = [];
    if (title) nodes.push(title);
    if (author) nodes.push(author);
    const printFragment = fragment.cloneNode(true);
    nodes.push(fragment);
    preview.replaceChildren(...nodes);
    updatePrintSurface(printFragment);
    updateWordCount();
  }

  function updatePrintSurface(contentFragment = null) {
    const fragment = contentFragment || mathMarkup($('composerSource').value);
    const surface = $('composerPrintSurface');
    const title = textNode('h1', 'print-title', $('composerTitle').value.trim());
    const author = textNode('p', 'print-author', $('composerAuthor').value.trim());
    surface.replaceChildren(...[title, author, fragment].filter(Boolean));
    const style = currentStyle();
    surface.style.setProperty('--print-font', style.font);
    surface.style.setProperty('--print-size', `${Math.round(style.size * 0.75)}pt`);
    surface.style.setProperty('--print-line-height', String(style.line));
    surface.style.setProperty('--print-paragraph-space', String(style.paragraph));
    surface.style.setProperty('--print-align', style.alignment);
  }

  function updateWordCount() {
    const count = $('composerSource').value.trim().split(/\s+/u).filter(Boolean).length;
    $('composerWordCount').textContent = `${count} ${count === 1 ? 'parola' : 'parole'}`;
  }

  function fillForm(documentData) {
    activeDocument = { ...emptyDocument(), ...documentData };
    $('composerTitle').value = activeDocument.title || '';
    $('composerAuthor').value = activeDocument.author || '';
    $('composerSource').value = activeDocument.source || '';
    applyTypography();
    updateWordCount();
    if (mode === 'preview') renderPreview();
    $('composerSaveState').textContent = activeDocument.updated ? 'Bozza salvata localmente' : 'Bozza locale';
  }

  async function listDrafts() {
    try {
      const drafts = (await dbRequest('drafts', 'getAll')).filter(hasDocumentContent).sort((a, b) => b.updated - a.updated);
      const grid = $('draftGrid');
      grid.replaceChildren();
      $('draftCount').textContent = drafts.length ? `· ${drafts.length}` : '';
      $('draftsSection').classList.toggle('hidden', drafts.length === 0);
      for (const draft of drafts) {
        const card = document.createElement('article');
        card.className = 'draft-card';
        card.setAttribute('role', 'group');
        const title = document.createElement('strong');
        const isEnglish = localStorage.getItem('carta-language') === 'en';
        title.textContent = draft.title || (isEnglish ? 'Untitled' : 'Senza titolo');
        const detail = document.createElement('span');
        const date = new Date(draft.updated).toLocaleDateString(isEnglish ? 'en-US' : 'it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
        detail.textContent = `${date} · ${draft.source.trim().split(/\s+/u).filter(Boolean).length} ${isEnglish ? 'words' : 'parole'}`;
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'draft-delete';
        removeButton.textContent = isEnglish ? 'Delete' : 'Elimina';
        removeButton.setAttribute('aria-label', isEnglish ? `Delete draft ${draft.title || 'untitled'}` : `Elimina la bozza ${draft.title || 'senza titolo'}`);
        removeButton.addEventListener('click', async (event) => {
          event.stopPropagation();
          await dbRequest('drafts', 'delete', draft.id);
          await listDrafts();
          notify('Bozza eliminata');
        });
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'draft-open';
        openButton.append(title, detail);
        openButton.setAttribute('aria-label', isEnglish ? `Open draft ${draft.title || 'untitled'}` : `Apri la bozza ${draft.title || 'senza titolo'}`);
        openButton.addEventListener('click', () => window.openComposer(draft.id));
        card.append(openButton, removeButton);
        grid.append(card);
      }
    } catch {
      // An unavailable draft store must not stop the reading library.
    }
  }

  function scheduleSave() {
    if (!hasDocumentContent({ title: $('composerTitle').value, author: $('composerAuthor').value, source: $('composerSource').value }) && !activeDocument.updated) {
      window.clearTimeout(saveTimer);
      $('composerSaveState').textContent = 'Bozza locale';
      return;
    }
    $('composerSaveState').textContent = 'Modifiche in attesa di salvataggio';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { saveDraft(false).catch(() => {}); }, 650);
  }

  function metadataChanged() {
    if (mode === 'preview') renderPreview();
    scheduleSave();
  }

  async function saveDraft(showMessage = true) {
    window.clearTimeout(saveTimer);
    const hasContent = hasDocumentContent({ title: $('composerTitle').value, author: $('composerAuthor').value, source: $('composerSource').value });
    if (!hasContent && !activeDocument.updated) {
      $('composerSaveState').textContent = 'Bozza locale';
      if (showMessage) notify('Aggiungi un titolo o del testo prima di salvare la bozza');
      return activeDocument;
    }
    activeDocument = {
      ...activeDocument,
      title: $('composerTitle').value.trim().slice(0, 180),
      author: $('composerAuthor').value.trim().slice(0, 120),
      source: $('composerSource').value.slice(0, MAX_DOCUMENT_BYTES),
      updated: Date.now(),
    };
    await dbRequest('drafts', 'put', activeDocument);
    $('composerSaveState').textContent = 'Salvato su questo dispositivo';
    await listDrafts();
    if (showMessage) notify('Bozza salvata su questo dispositivo');
    return activeDocument;
  }

  async function openComposer(draftId = '') {
    try {
      window.closeAiPanel?.();
      if (!$('readerView').classList.contains('hidden')) await window.closeReader?.();
      if (!$('composerView').classList.contains('hidden')) await saveDraft(false).catch(() => {});
      $('libraryView').classList.add('hidden');
      $('composerView').classList.remove('hidden');
      if (draftId) {
        const draft = await dbRequest('drafts', 'get', draftId);
        fillForm(draft || emptyDocument());
      } else fillForm(emptyDocument());
      await loadCustomFonts();
      applyTypography();
      await listDrafts();
      $('composerSource').focus();
    } catch (error) {
      $('composerView').classList.add('hidden');
      $('libraryView').classList.remove('hidden');
      notify(`Impossibile aprire l’editor: ${error.message || 'archivio locale non disponibile'}`);
    }
  }

  async function closeComposer() {
    if (hasDocumentContent({ title: $('composerTitle').value, author: $('composerAuthor').value, source: $('composerSource').value })) {
      try { await saveDraft(false); } catch { /* Keep the editor open state responsive even when local storage is full. */ }
    } else if (activeDocument.updated) await dbRequest('drafts', 'delete', activeDocument.id).catch(() => {});
    $('composerView').classList.add('hidden');
    $('libraryView').classList.remove('hidden');
    await listDrafts();
  }

  function setMode(nextMode) {
    mode = nextMode === 'preview' ? 'preview' : 'edit';
    $('composerSource').classList.toggle('hidden', mode !== 'edit');
    $('composerPreview').classList.toggle('hidden', mode !== 'preview');
    $('composerEditTab').classList.toggle('active', mode === 'edit');
    $('composerPreviewTab').classList.toggle('active', mode === 'preview');
    $('composerEditTab').setAttribute('aria-selected', String(mode === 'edit'));
    $('composerPreviewTab').setAttribute('aria-selected', String(mode === 'preview'));
    if (mode === 'preview') renderPreview();
  }

  function wrapSelection(prefix, suffix = prefix, placeholder = 'testo') {
    const field = $('composerSource');
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = field.value.slice(start, end);
    const content = selected || placeholder;
    const replacement = `${prefix}${content}${suffix}`;
    field.setRangeText(replacement, start, end, 'select');
    const selectionStart = start + prefix.length;
    field.setSelectionRange(selectionStart, selectionStart + content.length);
    field.focus();
    scheduleSave();
  }

  function prefixLines(prefix) {
    const field = $('composerSource');
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const lineStart = field.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndAt = field.value.indexOf('\n', end);
    const lineEnd = lineEndAt === -1 ? field.value.length : lineEndAt;
    const lines = field.value.slice(lineStart, lineEnd).split('\n').map((line) => `${prefix}${line}`);
    field.setRangeText(lines.join('\n'), lineStart, lineEnd, 'select');
    field.focus();
    scheduleSave();
  }

  function insertBlockMath() {
    const field = $('composerSource');
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = field.value.slice(start, end).trim() || 'a^2 + b^2 = c^2';
    const formula = `\n\n$$\n${selected}\n$$\n\n`;
    field.setRangeText(formula, start, end, 'select');
    const selectionStart = start + 5;
    field.setSelectionRange(selectionStart, selectionStart + selected.length);
    field.focus();
    scheduleSave();
  }

  function applyFormat(format) {
    if (format === 'bold') wrapSelection('**', '**', 'testo in grassetto');
    else if (format === 'italic') wrapSelection('*', '*', 'testo in corsivo');
    else if (format === 'strike') wrapSelection('~~', '~~', 'testo barrato');
    else if (format === 'heading') prefixLines('## ');
    else if (format === 'quote') prefixLines('> ');
    else if (format === 'list') prefixLines('- ');
    else if (format === 'link') wrapSelection('[', '](https://)', 'testo del collegamento');
    else if (format === 'inline-math') wrapSelection('\\(', '\\)', 'x^2');
    else if (format === 'block-math') insertBlockMath();
  }

  function xmlEscape(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
  }

  function safeFileName(value) {
    return (String(value || 'documento').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 _.-]/g, '').trim().replace(/[ .]+/g, '-').replace(/-+/g, '-') || 'documento').slice(0, 80);
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function exportMarkdown() {
    const draft = await saveDraft(false);
    const header = [draft.title ? `# ${draft.title}` : '', draft.author ? `\n*${draft.author.replace(/[\r\n]/g, ' ')}*` : ''].filter(Boolean).join('\n\n');
    const content = `${header}${header && draft.source ? '\n\n' : ''}${draft.source}`;
    downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${safeFileName(draft.title)}.md`);
    notify('File Markdown creato');
  }

  function serializeXhtml(fragment) {
    const serializer = new XMLSerializer();
    return [...fragment.childNodes].map((node) => serializer.serializeToString(node)).join('');
  }

  async function exportEpub() {
    try {
      if (!window.JSZip) throw new Error('Componente EPUB non disponibile');
      const draft = await saveDraft(false);
      const content = mathMarkup(draft.source);
      const style = currentStyle();
      const zip = new window.JSZip();
      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE', createFolders: false });
      const title = draft.title || 'Senza titolo';
      const lang = localStorage.getItem('carta-language') === 'en' ? 'en' : 'it';
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      let embeddedFont = FONT_CATALOG[draft.font]?.file ? FONT_CATALOG[draft.font] : null;
      let fontStyle = '';
      let fontManifest = '';
      let katexCss = await fetch('./vendor/katex.min.css').then((response) => {
        if (!response.ok) throw new Error('Stili delle formule non disponibili');
        return response.text();
      });
      const katexFontNames = [...new Set([...katexCss.matchAll(/url\(fonts\/([^\s)]+\.woff2)\)/g)].map((match) => match[1]))];
      for (const [index, fontName] of katexFontNames.entries()) {
        const fontBytes = await fetch(`./vendor/fonts/${fontName}`).then((response) => {
          if (!response.ok) throw new Error(`Font matematico mancante: ${fontName}`);
          return response.arrayBuffer();
        });
        zip.file(`EPUB/fonts/${fontName}`, fontBytes);
        fontManifest += `<item id="katex-font-${index}" href="fonts/${fontName}" media-type="font/woff2"/>`;
      }
      katexCss = katexCss.replaceAll('url(fonts/', 'url(../fonts/')
        .replace(/,url\(\.\.\/fonts\/[^)]+\.woff\) format\("woff"\)/g, '')
        .replace(/,url\(\.\.\/fonts\/[^)]+\.ttf\) format\("truetype"\)/g, '');
      zip.file('EPUB/styles/katex.css', katexCss);
      fontManifest += '<item id="katex-style" href="styles/katex.css" media-type="text/css"/>';
      const katexLicense = await fetch('./vendor/KATEX-LICENSE.txt').then((response) => response.text());
      zip.file('EPUB/fonts/LICENSE-KATEX.txt', katexLicense);
      fontManifest += '<item id="katex-license" href="fonts/LICENSE-KATEX.txt" media-type="text/plain"/>';
      if (embeddedFont) {
        const fontBytes = await fetch(`./fonts/${embeddedFont.file}`).then((response) => {
          if (!response.ok) throw new Error('Font EPUB non disponibile');
          return response.arrayBuffer();
        });
        const licenseText = await fetch(`./fonts/${embeddedFont.license}`).then((response) => response.text());
        zip.file(`EPUB/fonts/${embeddedFont.file}`, fontBytes);
        zip.file('EPUB/fonts/OFL.txt', licenseText);
        fontStyle = `@font-face{font-family:${JSON.stringify(embeddedFont.family)};src:url("../fonts/${embeddedFont.file}") format("woff2");font-weight:400;font-style:normal}`;
        fontManifest += `<item id="book-font" href="fonts/${embeddedFont.file}" media-type="font/woff2"/><item id="font-license" href="fonts/OFL.txt" media-type="text/plain"/>`;
      } else if (draft.font.startsWith('custom:')) {
        const customFont = customFontRecords.get(draft.font.slice(7));
        if (customFont) {
          const fontFile = `personal-${customFont.id}.${customFont.extension}`;
          const fontTypes = { woff2: ['font/woff2', 'woff2'], woff: ['font/woff', 'woff'], ttf: ['font/ttf', 'truetype'], otf: ['font/otf', 'opentype'] };
          const [mediaType, format] = fontTypes[customFont.extension];
          zip.file(`EPUB/fonts/${fontFile}`, customFont.data);
          fontStyle = `@font-face{font-family:${JSON.stringify(customFont.family)};src:url("../fonts/${fontFile}") format("${format}");font-weight:400;font-style:normal}`;
          fontManifest += `<item id="book-font" href="fonts/${fontFile}" media-type="${mediaType}"/>`;
        }
      }
      const css = `${fontStyle}html{color-scheme:light}body{margin:5%;color:#1d1d1d;background:#fff;font-family:${style.font};font-size:${style.size}px;line-height:${style.line};text-align:${style.alignment}}p{margin:0 0 ${style.paragraph}em}h1,h2,h3,h4{line-height:1.25;break-after:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse}th,td{border:1px solid #aaa;padding:.35em .55em}.katex-display{overflow-x:auto;text-align:center}.print-author{color:#555;font-size:.85em}`;
      const titleMarkup = `<h1>${xmlEscape(title)}</h1>`;
      const authorMarkup = draft.author ? `<p class="print-author">${xmlEscape(draft.author)}</p>` : '';
      const bodyMarkup = `${titleMarkup}${authorMarkup}${serializeXhtml(content)}`;
      const xhtml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><title>${xmlEscape(title)}</title><meta charset="utf-8"/><link rel="stylesheet" type="text/css" href="../styles/book.css"/><link rel="stylesheet" type="text/css" href="../styles/katex.css"/></head><body>${bodyMarkup}</body></html>`;
      const nav = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><title>Sommario</title><meta charset="utf-8"/></head><body><nav epub:type="toc" id="toc"><h1>Sommario</h1><ol><li><a href="text/content.xhtml">${xmlEscape(title)}</a></li></ol></nav></body></html>`;
      const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${xmlEscape(draft.id)}</dc:identifier><dc:title>${xmlEscape(title)}</dc:title><dc:language>${lang}</dc:language>${draft.author ? `<dc:creator>${xmlEscape(draft.author)}</dc:creator>` : ''}<meta property="dcterms:modified">${now}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="content" href="text/content.xhtml" media-type="application/xhtml+xml"/><item id="style" href="styles/book.css" media-type="text/css"/>${fontManifest}</manifest><spine><itemref idref="content"/></spine></package>`;
      zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
      zip.file('EPUB/package.opf', opf);
      zip.file('EPUB/nav.xhtml', nav);
      zip.file('EPUB/text/content.xhtml', xhtml);
      zip.file('EPUB/styles/book.css', css);
      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      downloadBlob(blob, `${safeFileName(title)}.epub`);
      notify('File EPUB creato');
    } catch (error) {
      notify(`Impossibile esportare l’EPUB: ${error.message || 'errore inatteso'}`);
    }
  }

  function exportPdf() {
    try {
      updatePrintSurface();
      document.title = safeFileName($('composerTitle').value || 'Carta');
      window.print();
    } catch (error) {
      notify(`Esportazione PDF non disponibile: ${error.message || 'errore di stampa'}`);
    }
  }

  function convertTex(source) {
    let text = source.replace(/\r\n?/g, '\n');
    let title = '';
    let author = '';
    text = text.replace(/\\title\s*\{([^{}]*)\}/, (_match, value) => { title = value.trim(); return ''; });
    text = text.replace(/\\author\s*\{([^{}]*)\}/, (_match, value) => { author = value.trim(); return ''; });
    text = text
      .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^}]*\}\s*$/gm, '')
      .replace(/^\s*\\usepackage(?:\[[^\]]*\])?\{[^}]*\}\s*$/gm, '')
      .replace(/\\begin\{document\}|\\end\{document\}|\\maketitle/g, '')
      .replace(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g, (_match, _env, formula) => `\n\n$$\n${formula.trim()}\n$$\n\n`)
      .replace(/\\begin\{(itemize|enumerate)\}|\\end\{(itemize|enumerate)\}/g, '\n')
      .replace(/\\item\s*/g, '- ')
      .replace(/\\(subsubsection|subsection|section|chapter)\*?\{([^{}]*)\}/g, (_match, level, heading) => `${'#'.repeat(level === 'chapter' ? 1 : level === 'section' ? 2 : level === 'subsection' ? 3 : 4)} ${heading}`)
      .replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
      .replace(/\\textit\{([^{}]*)\}|\\emph\{([^{}]*)\}/g, (_match, italic, emphasis) => `*${italic ?? emphasis}*`)
      .replace(/\\href\{([^{}]*)\}\{([^{}]*)\}/g, '[$2]($1)')
      .replace(/\\url\{([^{}]*)\}/g, '<$1>')
      .replace(/\\label\{[^{}]*\}|\\ref\{([^{}]*)\}|\\cite\{([^{}]*)\}/g, (_match, reference, citation) => reference || citation || '')
      .replace(/\\(newpage|clearpage|pagebreak)\b/g, '\n\n')
      .replace(/\\([%&#_$])/g, '$1')
      .replace(/\n{3,}/g, '\n\n').trim();
    return { title, author, text };
  }

  async function openDocumentFile(file) {
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      notify('Il documento supera il limite di 5 MB.');
      return;
    }
    try {
      const extension = file.name.split('.').pop().toLowerCase();
      const source = await file.text();
      if (extension === 'tex') {
        const converted = convertTex(source);
        activeDocument = { ...emptyDocument(), ...activeDocument, id: emptyDocument().id, title: converted.title || file.name.replace(/\.tex$/i, ''), author: converted.author, source: converted.text, updated: 0 };
      } else {
        activeDocument = { ...emptyDocument(), ...activeDocument, id: emptyDocument().id, title: file.name.replace(/\.(md|markdown|txt)$/i, ''), source, updated: 0 };
      }
      fillForm(activeDocument);
      setMode('edit');
      notify('Documento aperto nell’editor');
    } catch (error) {
      notify(`Impossibile aprire il documento: ${error.message || 'file non valido'}`);
    }
  }

  async function loadCustomFonts() {
    const fonts = await dbRequest('fonts', 'getAll');
    customFontRecords.clear();
    const old = $('composerFont').querySelector('optgroup[data-custom-fonts]');
    old?.remove();
    if (!fonts.length) return;
    const group = document.createElement('optgroup');
    group.label = 'Font personali';
    group.dataset.customFonts = 'true';
    for (const font of fonts) {
      customFontRecords.set(font.id, font);
      if (!loadedCustomFonts.has(font.id)) {
        try {
          const face = new FontFace(font.family, await font.data.arrayBuffer());
          await face.load();
          document.fonts.add(face);
          loadedCustomFonts.add(font.id);
        } catch {
          notify(`Il font ${font.name} non è leggibile. Puoi rimuoverlo e riprovare.`);
        }
      }
      const option = document.createElement('option');
      option.value = `custom:${font.id}`;
      option.textContent = font.name;
      group.append(option);
    }
    $('composerFont').append(group);
    if (activeDocument.font.startsWith('custom:') && customFontRecords.has(activeDocument.font.slice(7))) $('composerFont').value = activeDocument.font;
  }

  async function addCustomFont(file) {
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['woff2', 'woff', 'ttf', 'otf'].includes(extension) || file.size > MAX_FONT_BYTES || file.size === 0) {
      notify('Scegli un file WOFF2, WOFF, TTF o OTF fino a 10 MB.');
      return;
    }
    const id = crypto.randomUUID?.() || `font-${Date.now()}`;
    const name = file.name.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[<>"'`]/g, '').slice(0, 48) || 'Font personale';
    const font = { id, name, family: `Carta personalizzato ${id.slice(0, 8)}`, extension, data: file, added: Date.now() };
    try {
      const face = new FontFace(font.family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      await dbRequest('fonts', 'put', font);
      customFontRecords.set(id, font);
      loadedCustomFonts.add(id);
      const group = $('composerFont').querySelector('optgroup[data-custom-fonts]') || document.createElement('optgroup');
      group.label = 'Font personali';
      group.dataset.customFonts = 'true';
      const option = document.createElement('option');
      option.value = `custom:${id}`;
      option.textContent = name;
      group.append(option);
      if (!group.isConnected) $('composerFont').append(group);
      $('composerFont').value = option.value;
      activeDocument.font = option.value;
      applyTypography();
      scheduleSave();
      notify(`Font ${name} aggiunto`);
    } catch {
      notify('Questo file font non è valido o non può essere caricato.');
    }
  }

  async function removeSelectedCustomFont() {
    const fontId = activeDocument.font.startsWith('custom:') ? activeDocument.font.slice(7) : '';
    if (!fontId) return;
    await dbRequest('fonts', 'delete', fontId);
    const font = customFontRecords.get(fontId);
    if (font) {
      for (const face of document.fonts) if (face.family === font.family) document.fonts.delete(face);
    }
    customFontRecords.delete(fontId);
    loadedCustomFonts.delete(fontId);
    activeDocument.font = 'literata';
    await loadCustomFonts();
    applyTypography();
    scheduleSave();
    notify('Font personale rimosso');
  }

  function action(name) {
    if (name === 'back') closeComposer();
    else if (name === 'open') $('composerFileInput').click();
    else if (name === 'save') saveDraft(true).catch((error) => notify(`Impossibile salvare: ${error.message || 'spazio esaurito'}`));
    else if (name === 'markdown') exportMarkdown().catch((error) => notify(`Impossibile esportare: ${error.message || 'errore inatteso'}`));
    else if (name === 'pdf') exportPdf();
    else if (name === 'epub') exportEpub();
    else if (name === 'preview') setMode('preview');
    else if (name === 'edit') setMode('edit');
    else if (name === 'font') $('composerFontInput').click();
    else if (name === 'remove-font') removeSelectedCustomFont().catch(() => notify('Impossibile rimuovere il font.'));
  }

  document.addEventListener('click', (event) => {
    const composeAction = event.target.closest('[data-compose-action]');
    if (composeAction) action(composeAction.dataset.composeAction);
    const format = event.target.closest('[data-format]');
    if (format) applyFormat(format.dataset.format);
    const alignment = event.target.closest('[data-align]');
    if (alignment) {
      activeDocument.alignment = alignment.dataset.align;
      applyTypography();
      scheduleSave();
    }
  });

  $('composerSource').addEventListener('input', () => { updateWordCount(); scheduleSave(); });
  $('composerTitle').addEventListener('input', metadataChanged);
  $('composerAuthor').addEventListener('input', metadataChanged);
  $('composerFont').addEventListener('change', () => {
    activeDocument.font = $('composerFont').value;
    applyTypography();
    scheduleSave();
  });
  $('composerFontSize').addEventListener('change', () => { activeDocument.fontSize = Number($('composerFontSize').value); applyTypography(); scheduleSave(); });
  $('composerLineHeight').addEventListener('input', () => { activeDocument.lineHeight = Number($('composerLineHeight').value); applyTypography(); scheduleSave(); });
  $('composerParagraphSpace').addEventListener('input', () => { activeDocument.paragraphSpace = Number($('composerParagraphSpace').value); applyTypography(); scheduleSave(); });
  $('composerFileInput').addEventListener('change', async (event) => { await openDocumentFile(event.target.files?.[0]); event.target.value = ''; });
  $('composerFontInput').addEventListener('change', async (event) => { await addCustomFont(event.target.files?.[0]); event.target.value = ''; });
  document.addEventListener('keydown', (event) => {
    if ($('composerView').classList.contains('hidden')) return;
    if (event.key === 'Escape') { event.preventDefault(); closeComposer(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveDraft(true).catch(() => notify('Impossibile salvare la bozza.')); }
  });

  window.openComposer = openComposer;
  window.closeComposer = closeComposer;
  window.exportComposerEpub = exportEpub;
  window.exportComposerPdf = exportPdf;
  window.convertComposerTex = convertTex;
  window.listComposerDrafts = listDrafts;
  window.addComposerFont = () => $('composerFontInput').click();
  window.removeComposerFont = removeSelectedCustomFont;
  window.addEventListener('beforeprint', () => { if (!$('composerView').classList.contains('hidden')) updatePrintSurface(); });
  window.addEventListener('afterprint', () => { document.title = 'Carta — Leggi con calma'; });
  listDrafts().catch(() => {});
})();
