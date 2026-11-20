(() => {
  const PDF_LIMIT = 512 * 1024 * 1024;
  const MARKDOWN_LIMIT = 16 * 1024 * 1024;
  const MAX_PDF_PAGES = 5000;
  const MAX_MARKDOWN_LINES = 50_000;
  const MAX_CANVAS_EDGE = 8192;
  const MAX_CANVAS_PIXELS = 16_000_000;
  const RETAIN_PAGE_DISTANCE = 2;
  const HIGHLIGHT_PALETTE = new Set(highlightPalette.map(item => item.color));
  let pdfModulePromise;
  let reader = null;

  const originalImportFiles = window.importFiles;
  const originalOpenBook = window.openBook;
  const originalCloseReader = window.closeReader;
  const originalRenderBookCards = window.renderBookCards;
  const originalUpdateProgress = window.updateProgress;
  const originalUpdateStats = window.updateStats;
  const originalRenderNotes = window.renderNotes;
  const originalRenderHighlights = window.renderHighlights;
  const originalMatchingHighlights = window.matchingHighlights;
  const originalHighlightSelection = window.highlightSelection;
  const originalRemoveHighlight = window.removeHighlight;
  const originalRemoveSelectedHighlight = window.removeSelectedHighlight;
  const originalApplyEPUBHighlight = window.applyEPUBHighlight;
  const originalSeekToProgress = window.seekToProgress;
  const originalTurn = window.turn;
  const originalShowTab = window.showTab;
  const originalReturnFromCitation = window.returnFromCitation;
  let marginNoteRenderToken = 0;

  function getStoredFile(id) {
    return new Promise((resolve, reject) => {
      const request = store('files').get(id);
      request.onsuccess = () => request.result?.file ? resolve(request.result.file) : reject(new Error('File non trovato nella libreria'));
      request.onerror = () => reject(request.error || new Error('Impossibile leggere il file salvato'));
    });
  }

  function showReader(book) {
    marginNoteRenderToken += 1;
    document.body.classList.add('reading');
    document.body.classList.toggle('pdf-reader-open', book.type === 'pdf');
    document.documentElement.classList.toggle('pdf-reader-open', book.type === 'pdf');
    $('libraryView').classList.add('hidden');
    $('readerView').classList.remove('hidden');
    $('readerTitle').textContent = book.title;
    $('citationReturn').classList.add('hidden');
    citationReturnCfi = null;
    $('sidePanel').classList.remove('open');
    $('panelBackdrop').classList.add('hidden');
    const [notes, highlights] = [currentNotes, currentHighlights];
    $('epubContent').classList.add('hidden');
    $('paperWrap').classList.add('hidden');
    $('pdfDocument').classList.add('hidden');
    $('markdownDocument').classList.add('hidden');
    $('stageScroll').classList.add('document-scroll');
    $('pdfPageControls').classList.toggle('hidden', book.type !== 'pdf');
    $('pdfIndexTab').hidden = book.type !== 'pdf';
    $('pdfZoomControls').classList.toggle('hidden', book.type !== 'pdf');
    $('epubSettings').classList.add('hidden');
    $('pdfSettings').classList.toggle('hidden', book.type !== 'pdf');
    $('markdownSettings').classList.toggle('hidden', book.type !== 'markdown');
    $('readerView').classList.toggle('document-reader-pdf', book.type === 'pdf');
    $('readerView').classList.toggle('document-reader-markdown', book.type === 'markdown');
    $('stageScroll').scrollTop = 0;
    $('readingNotesLayer').replaceChildren();
    if (notes && highlights) {
      currentNotes = notes;
      currentHighlights = highlights;
    }
  }

  async function loadBookData(book) {
    const [currentBookNotes, currentBookHighlights] = await Promise.all([
      byBook('notes', book.id), byBook('highlights', book.id)
    ]);
    currentNotes = currentBookNotes.sort((a, b) => (b.updated || 0) - (a.updated || 0));
    currentHighlights = currentBookHighlights;
    sessionStart = Date.now();
    sessionMinutes = 0;
    sessionProgress = book.progress || 0;
    sessionWords = 0;
    lastProgress = book.progress || 0;
    readingSpeed = book.speed || 200;
    $('readerView').classList.remove('hidden');
    $('libraryView').classList.add('hidden');
    document.body.classList.add('reading');
    $('readerTitle').textContent = book.title;
    renderNotes();
    renderHighlights();
    showTab('notes');
    syncEpubControls();
  }

  function clearReaderMode() {
    document.body.classList.remove('pdf-reader-open');
    document.documentElement.classList.remove('pdf-reader-open');
    $('stageScroll').classList.remove('document-scroll');
    $('readerView').classList.remove('document-reader-pdf', 'document-reader-markdown');
    $('epubSettings').classList.remove('hidden');
    $('pdfSettings').classList.add('hidden');
    $('markdownSettings').classList.add('hidden');
    $('paperWrap').classList.remove('hidden');
    $('epubContent').classList.remove('hidden');
    $('pdfDocument').classList.add('hidden');
    $('markdownDocument').classList.add('hidden');
  }

  async function importLocalDocuments(files) {
    const acceptedEpubs = [];
    const selectedFiles = Array.from(files || []);
    for (const file of selectedFiles) {
      const extension = file.name.split('.').pop().toLowerCase();
      const type = extension === 'pdf' ? 'pdf' : extension === 'md' || extension === 'markdown' ? 'markdown' : null;
      if (!type) {
        if (extension === 'epub') acceptedEpubs.push(file);
        else toast('Formato non supportato. Scegli un file EPUB, PDF o Markdown.');
        continue;
      }
      const limit = type === 'pdf' ? PDF_LIMIT : MARKDOWN_LIMIT;
      if (file.size <= 0 || file.size > limit) {
        toast(type === 'pdf' ? 'Il PDF supera il limite di 512 MiB o non contiene dati.' : 'Il file Markdown supera il limite di 16 MiB o non contiene dati.');
        continue;
      }
      if (type === 'pdf') {
        const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
        const signature = new TextDecoder('latin1').decode(header);
        if (!signature.includes('%PDF-')) {
          toast('Il file selezionato non contiene un’intestazione PDF valida.');
          continue;
        }
      }
      const palette = [['#e6e9df', '#495740'], ['#e4e9ec', '#3f5666'], ['#eee4e0', '#735650'], ['#e8e3ed', '#54476b'], ['#eee9d9', '#6c6243']];
      const [cover, color] = palette[books.length % palette.length];
      const id = uid();
      const book = {
        id,
        title: file.name.replace(/\.(pdf|md|markdown)$/i, ''),
        type,
        size: file.size,
        added: Date.now(),
        progress: 0,
        current: type === 'pdf' ? 1 : 0,
        speed: 200,
        elapsed: 0,
        cover,
        color
      };
      try {
        showLoading('Aggiungo alla libreria…', type === 'pdf' ? 'Salvo il PDF su questo dispositivo' : 'Salvo il documento Markdown');
        await put('files', { id, file });
        await put('books', book);
        books.push(book);
        renderLibrary();
        toast(type === 'pdf' ? 'PDF aggiunto alla libreria' : 'Documento Markdown aggiunto alla libreria');
      } catch {
        toast('Impossibile salvare il file: spazio esaurito?');
      } finally {
        hideLoading();
      }
    }
    if (acceptedEpubs.length) await originalImportFiles(acceptedEpubs);
  }

  window.importFiles = importLocalDocuments;
  window.renderBookCards = function (items, grid) {
    originalRenderBookCards(items, grid);
    const cards = [...grid.querySelectorAll('.book-card')];
    cards.forEach((card, index) => {
      const type = items[index]?.type;
      const format = card.querySelector('.format');
      if (format && type === 'pdf') format.textContent = 'PDF';
      else if (format && type === 'markdown') format.textContent = 'MARKDOWN';
    });
  };

  async function loadPdfModule() {
    if (!pdfModulePromise) {
      const source = new URL('./vendor/pdfjs/pdf.min.mjs', document.baseURI).href;
      pdfModulePromise = import(source).then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.compat.mjs', document.baseURI).href;
        return pdfjs;
      });
    }
    return pdfModulePromise;
  }

  function pageBaseWidth(page) {
    return page.getViewport({ scale: 1 }).width || 612;
  }

  function targetPageWidth() {
    const stage = $('stageScroll');
    const available = Math.max(360, stage.clientWidth - 52);
    return Math.round(Math.min(980, available) * (reader?.zoom || 1));
  }

  function buildPdfSlots(total, firstRatio) {
    const root = $('pdfDocument');
    root.replaceChildren();
    root.classList.remove('hidden');
    reader.pageWidth = targetPageWidth();
    reader.slots = [];
    const fragment = document.createDocumentFragment();
    for (let number = 1; number <= total; number += 1) {
      const page = document.createElement('article');
      page.className = 'pdf-page';
      page.dataset.page = String(number);
      page.setAttribute('aria-label', `Pagina ${number}`);
      page.style.width = `${reader.pageWidth}px`;
      page.style.aspectRatio = number === 1 ? String(firstRatio) : String(firstRatio);
      const placeholder = document.createElement('div');
      placeholder.className = 'pdf-placeholder';
      placeholder.textContent = `Pagina ${number}`;
      page.append(placeholder);
      fragment.append(page);
      reader.slots.push(page);
    }
    root.append(fragment);
    reader.pageObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const page = Number(entry.target.dataset.page);
        if (entry.isIntersecting) enqueuePdfPage(page);
      }
    }, { root: $('stageScroll'), rootMargin: '90% 0px', threshold: 0.01 });
    reader.slots.forEach(slot => reader.pageObserver.observe(slot));
    reader.resizeObserver = new ResizeObserver(() => resizePdfPages());
    reader.resizeObserver.observe($('stageScroll'));
    reader.abort = new AbortController();
    $('stageScroll').addEventListener('scroll', onPdfScroll, { passive: true, signal: reader.abort.signal });
    $('pdfDocument').addEventListener('mousedown', beginPdfTextDrag, { signal: reader.abort.signal });
    document.addEventListener('mousemove', movePdfTextDrag, { signal: reader.abort.signal });
    document.addEventListener('mouseup', endPdfTextDrag, { signal: reader.abort.signal });
    window.addEventListener('blur', endPdfTextDrag, { signal: reader.abort.signal });
    document.addEventListener('mouseup', onDocumentSelection, { signal: reader.abort.signal });
    document.addEventListener('keyup', onDocumentSelection, { signal: reader.abort.signal });
    document.addEventListener('selectionchange', onSelectionChange, { signal: reader.abort.signal });
    reader.total = total;
    $('pdfPageCount').textContent = String(total);
    $('pdfPageJump').max = String(total);
    $('pdfPageJump').value = String(Math.max(1, Math.min(total, Number(current.current) || 1)));
    const target = Math.max(1, Math.min(total, Number(current.current) || Math.ceil((current.progress || 0) * total) + 1));
    requestAnimationFrame(() => {
      jumpToPdfPage(target, 'auto', { saveReturn: false });
      onPdfScroll();
    });
  }

  function ensurePdfPage(number) {
    if (reader.pagePromises.has(number)) return reader.pagePromises.get(number);
    const promise = reader.pdf.getPage(number).then(page => {
      reader.pageCache.set(number, page);
      return page;
    });
    reader.pagePromises.set(number, promise);
    return promise;
  }

  function enqueuePdfPage(number) {
    if (!reader || reader.mode !== 'pdf' || reader.rendered.has(number) || reader.queued.has(number)) return;
    reader.queued.add(number);
    reader.queue.push(number);
    pumpPdfQueue();
  }

  async function pumpPdfQueue() {
    if (!reader) return;
    while (reader.activeRenders < 2 && reader.queue.length) {
      reader.queue.sort((a, b) => Math.abs(a - reader.currentPage) - Math.abs(b - reader.currentPage));
      const number = reader.queue.shift();
      reader.queued.delete(number);
      if (Math.abs(number - reader.currentPage) > RETAIN_PAGE_DISTANCE) continue;
      reader.activeRenders += 1;
      renderPdfPage(number).catch(error => {
        if (reader?.mode === 'pdf' && !/cancel/i.test(String(error?.message))) console.warn('Rendering pagina PDF non riuscito', number, error);
      }).finally(() => {
        if (!reader) return;
        reader.activeRenders = Math.max(0, reader.activeRenders - 1);
        cleanupPdfPages();
        pumpPdfQueue();
      });
    }
  }

  function pageElement(number) {
    return reader?.slots[number - 1];
  }

  function preserveAnchorWhileResize(page, apply) {
    const scroller = $('stageScroll');
    const anchor = pageElement(reader.currentPage) || page;
    const before = anchor?.getBoundingClientRect().top;
    apply();
    if (anchor && Number.isFinite(before)) requestAnimationFrame(() => {
      if (reader && anchor.isConnected) scroller.scrollTop += anchor.getBoundingClientRect().top - before;
    });
  }

  async function renderPdfPage(number) {
    if (!reader || reader.mode !== 'pdf') return;
    const activeReader = reader;
    const layoutVersion = activeReader.layoutVersion;
    const slot = pageElement(number);
    const page = await ensurePdfPage(number);
    if (reader !== activeReader || activeReader.mode !== 'pdf' || !slot?.isConnected) return;
    const base = page.getViewport({ scale: 1 });
    const cssWidth = activeReader.pageWidth;
    const scale = cssWidth / base.width;
    const viewport = page.getViewport({ scale });
    const oldRatio = slot.style.aspectRatio;
    const ratio = `${viewport.width} / ${viewport.height}`;
    if (oldRatio !== ratio) preserveAnchorWhileResize(slot, () => { slot.style.aspectRatio = ratio; });
    slot.replaceChildren();
    slot.style.width = `${cssWidth}px`;
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(Math.max(2, window.devicePixelRatio || 1), 3, MAX_CANVAS_EDGE / viewport.width, MAX_CANVAS_EDGE / viewport.height, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    slot.append(canvas);
    const highlightLayer = document.createElement('div');
    highlightLayer.className = 'pdf-highlights-layer';
    highlightLayer.dataset.page = String(number);
    slot.append(highlightLayer);
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer pdf-text-layer';
    textLayer.style.setProperty('--scale-factor', String(scale));
    textLayer.style.setProperty('--total-scale-factor', String(scale));
    slot.append(textLayer);
    const pageBadge = document.createElement('span');
    pageBadge.className = 'pdf-page-badge';
    pageBadge.textContent = `${number} / ${activeReader.total}`;
    slot.append(pageBadge);
    const renderTask = page.render({ canvasContext: context, viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0], background: '#ffffff' });
    activeReader.renderTasks.set(number, renderTask);
    await renderTask.promise;
    if (reader !== activeReader || activeReader.mode !== 'pdf' || !slot.isConnected || activeReader.layoutVersion !== layoutVersion) return;
    const pdfModule = await loadPdfModule();
    const textContent = page.streamTextContent({ includeMarkedContent: true });
    const textLayerBuilder = new pdfModule.TextLayer({ textContentSource: textContent, container: textLayer, viewport });
    await textLayerBuilder.render();
    if (reader !== activeReader || activeReader.mode !== 'pdf' || !slot.isConnected || activeReader.layoutVersion !== layoutVersion) return;
    activeReader.renderTasks.delete(number);
    activeReader.rendered.add(number);
    highlightLayer.replaceChildren();
    drawPdfHighlights(number);
    activeReader.pageText.set(number, textLayerBuilder.textContentItemsStr.join(' ').replace(/\s+/g, ' ').trim());
    if (number === activeReader.currentPage) window.dispatchEvent(new CustomEvent('carta:document-page', { detail: { type: 'pdf', page: number } }));
  }

  function cleanupPdfPages() {
    if (!reader || reader.mode !== 'pdf') return;
    const distance = RETAIN_PAGE_DISTANCE;
    for (const number of [...reader.rendered]) {
      if (Math.abs(number - reader.currentPage) <= distance) continue;
      const slot = pageElement(number);
      for (const task of [reader.renderTasks.get(number)]) {
        try { task?.cancel(); } catch {}
      }
      reader.renderTasks.delete(number);
      reader.rendered.delete(number);
      reader.pageCache.get(number)?.cleanup?.();
      reader.pageCache.delete(number);
      reader.pagePromises.delete(number);
      reader.pageText.delete(number);
      if (slot) {
        slot.replaceChildren();
        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-placeholder';
        placeholder.textContent = `Pagina ${number}`;
        slot.append(placeholder);
      }
    }
    reader.queue = reader.queue.filter(number => Math.abs(number - reader.currentPage) <= distance);
    reader.queued = new Set(reader.queue);
  }

  function resizePdfPages() {
    if (!reader || reader.mode !== 'pdf') return;
    const width = targetPageWidth();
    if (Math.abs(width - reader.pageWidth) < 3) return;
    const anchor = pageElement(reader.currentPage);
    const oldBounds = anchor?.getBoundingClientRect();
    const withinPage = Math.max(0, Math.min(1, current.pageOffset || 0));
    reader.layoutVersion += 1;
    reader.pageWidth = width;
    const affected = new Set([...reader.rendered, ...reader.renderTasks.keys()]);
    for (const number of affected) {
      const slot = pageElement(number);
      if (!slot) continue;
      const task = reader.renderTasks.get(number);
      try { task?.cancel(); } catch {}
      reader.renderTasks.delete(number);
      reader.rendered.delete(number);
      slot.replaceChildren();
      const placeholder = document.createElement('div');
      placeholder.className = 'pdf-placeholder';
      placeholder.textContent = `Pagina ${number}`;
      slot.append(placeholder);
      if (Math.abs(number - reader.currentPage) <= RETAIN_PAGE_DISTANCE) enqueuePdfPage(number);
    }
    for (const slot of reader.slots) slot.style.width = `${width}px`;
    requestAnimationFrame(() => {
      if (!reader || reader.mode !== 'pdf' || !anchor?.isConnected || !oldBounds) return;
      const newBounds = anchor.getBoundingClientRect();
      $('stageScroll').scrollTop += newBounds.top - oldBounds.top + (newBounds.height - oldBounds.height) * withinPage;
      onPdfScroll();
    });
    for (let number = Math.max(1, reader.currentPage - 2); number <= Math.min(reader.total, reader.currentPage + 2); number += 1) enqueuePdfPage(number);
  }

  function pdfProgressForPosition() {
    if (!reader || reader.mode !== 'pdf') return 0;
    const scroller = $('stageScroll');
    const topEdge = scroller.getBoundingClientRect().top + 12;
    let low = 0, high = reader.slots.length - 1, active = null;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const slot = reader.slots[middle];
      if (slot.getBoundingClientRect().bottom > topEdge) { active = slot; high = middle - 1; }
      else low = middle + 1;
    }
    if (!active) active = reader.slots[reader.slots.length - 1];
    const page = Math.max(1, Number(active?.dataset.page) || 1);
    const bounds = active?.getBoundingClientRect();
    const height = bounds?.height || active?.offsetHeight || 1;
    const within = Math.max(0, Math.min(0.999, (topEdge - (bounds?.top || topEdge)) / height));
    return { page, within, progress: Math.max(0, Math.min(1, (page - 1 + within) / reader.total)) };
  }

  let progressSaveTimer = 0;
  let pdfScrollFrame = 0;
  function onPdfScroll() {
    if (!reader || reader.mode !== 'pdf') return;
    if (pdfScrollFrame) return;
    const activeReader = reader;
    pdfScrollFrame = requestAnimationFrame(() => {
      pdfScrollFrame = 0;
      if (reader !== activeReader) return;
      updatePdfScrollPosition();
    });
  }

  function updatePdfScrollPosition() {
    if (!reader || reader.mode !== 'pdf') return;
    const position = pdfProgressForPosition();
    if (!position) return;
    const previousPage = reader.currentPage;
    reader.currentPage = position.page;
    current.current = position.page;
    current.pageOffset = position.within;
    current.progress = position.progress;
    if (previousPage !== position.page && document.activeElement !== $('pdfPageJump')) $('pdfPageJump').value = String(position.page);
    if (reader.pendingJumpPage === position.page) reader.pendingJumpPage = null;
    $('pdfIndexCurrent').textContent = `PDF · pagina ${position.page}`;
    const displayedProgress = Math.round(position.progress * 100);
    if (previousPage !== position.page || reader.lastDisplayedProgress !== displayedProgress) {
      reader.lastDisplayedProgress = displayedProgress;
      window.updateProgress(position.progress);
    }
    if (reader.lastRecordedPage !== position.page || Math.abs(position.progress - reader.lastRecordedProgress) >= 0.002) {
      clearTimeout(progressSaveTimer);
      progressSaveTimer = setTimeout(() => {
        if (!reader || current?.id !== reader.bookId) return;
        reader.lastRecordedPage = position.page;
        reader.lastRecordedProgress = position.progress;
        recordProgress(position.progress);
      }, 350);
    }
    if (previousPage !== position.page) {
      cleanupPdfPages();
      pumpPdfQueue();
    }
  }

  function preservePdfReturnSpot() {
    if (!reader || reader.mode !== 'pdf' || reader.returnSpot) return;
    reader.returnSpot = {
      scrollTop: $('stageScroll').scrollTop,
      page: reader.currentPage,
      pageOffset: Number(current.pageOffset) || 0
    };
    $('citationReturn').classList.remove('hidden');
  }

  function returnToReadingSpot() {
    if (!reader || reader.mode !== 'pdf' || !reader.returnSpot) return false;
    const spot = reader.returnSpot;
    reader.returnSpot = null;
    $('citationReturn').classList.add('hidden');
    $('stageScroll').scrollTo({ top: spot.scrollTop, behavior: 'auto' });
    requestAnimationFrame(() => updatePdfScrollPosition());
    return true;
  }

  window.returnFromCitation = function () {
    if (reader?.mode === 'pdf' && returnToReadingSpot()) return;
    return originalReturnFromCitation?.();
  };

  function jumpToPdfPage(page, behavior = 'smooth', { saveReturn = true } = {}) {
    if (!reader || reader.mode !== 'pdf') return;
    const number = Math.max(1, Math.min(reader.total, Math.round(Number(page) || 1)));
    const slot = reader.slots[number - 1];
    if (!slot) return;
    reader.pendingJumpPage = number;
    const scroller = $('stageScroll');
    const slotTop = slot.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const targetTop = Math.max(0, scroller.scrollTop + slotTop - 16);
    if (saveReturn && Math.abs(targetTop - scroller.scrollTop) > 48) preservePdfReturnSpot();
    scroller.scrollTo({ top: targetTop, behavior: behavior === 'auto' ? 'auto' : 'smooth' });
    enqueuePdfPage(number);
  }

  function renderPdfIndex() {
    if (!current || current.type !== 'pdf') return;
    const page = reader?.mode === 'pdf' ? reader.currentPage : Number(current.current) || 1;
    $('pdfIndexCurrent').textContent = `PDF · pagina ${page}`;
    const list = $('pdfIndexList');
    list.replaceChildren();
    const entries = [...(current.pdfIndex || [])].sort((a, b) => a.page - b.page || a.created - b.created);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'notes-empty';
      empty.textContent = 'Salva le pagine dell’indice o le sezioni che vuoi ritrovare rapidamente.';
      list.append(empty);
      return;
    }
    for (const entry of entries) {
      const item = document.createElement('article');
      item.className = 'pdf-index-item';
      const copy = document.createElement('div');
      copy.className = 'pdf-index-copy';
      const title = document.createElement('strong');
      title.textContent = entry.title || `Pagina ${entry.page}`;
      const label = document.createElement('span');
      label.textContent = `Pagina ${entry.page}`;
      copy.append(title, label);
      const actions = document.createElement('div');
      actions.className = 'pdf-index-actions';
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'text-action';
      jump.textContent = 'Apri';
      jump.onclick = () => {
        jumpToPdfPage(entry.page);
        closePanel();
      };
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'text-action delete';
      removeButton.textContent = 'Rimuovi';
      removeButton.onclick = async () => {
        current.pdfIndex = (current.pdfIndex || []).filter(saved => saved.id !== entry.id);
        await put('books', current);
        renderPdfIndex();
      };
      actions.append(jump, removeButton);
      item.append(copy, actions);
      list.append(item);
    }
  }

  window.savePdfIndexPage = async function (event) {
    event?.preventDefault();
    if (!current || current.type !== 'pdf' || !reader || reader.mode !== 'pdf') return;
    const title = $('pdfIndexTitle').value.trim().slice(0, 80);
    const page = reader.currentPage;
    const entries = current.pdfIndex || (current.pdfIndex = []);
    const savedTitle = title || `Pagina ${page}`;
    const existing = entries.find(entry => entry.page === page && entry.title === savedTitle);
    if (!existing) entries.push({ id: uid(), title: savedTitle, page, created: Date.now() });
    await put('books', current);
    $('pdfIndexTitle').value = '';
    renderPdfIndex();
    toast(existing ? 'Questa pagina è già salvata' : 'Pagina aggiunta all’indice');
  };

  window.showTab = function (tab) {
    if (tab === 'pdfIndex' && reader?.mode !== 'pdf') tab = 'notes';
    originalShowTab?.(tab);
    $('pdfIndexPane').classList.toggle('hidden', tab !== 'pdfIndex');
    $('pdfIndexTab').classList.toggle('active', tab === 'pdfIndex');
    if (tab === 'pdfIndex') renderPdfIndex();
  };

  $('pdfIndexForm').addEventListener('submit', window.savePdfIndexPage);

  // Resolve empty space to the nearest text caret, never to a page element.
  // Browser hit testing on an absolutely positioned PDF text layer can otherwise
  // jump to the first/last child of the page when the pointer leaves a glyph.
  function pdfCaretAt(x, y, starting = false) {
    const candidates = [];
    for (const layer of $('pdfDocument').querySelectorAll('.pdf-text-layer')) {
      const page = layer.closest('.pdf-page');
      const pageBounds = page.getBoundingClientRect();
      if (starting && (x < pageBounds.left || x > pageBounds.right || y < pageBounds.top || y > pageBounds.bottom)) continue;
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.data.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const bounds of range.getClientRects()) {
          if (bounds.width < .5 || bounds.height < .5) continue;
          const dx = Math.max(bounds.left - x, 0, x - bounds.right);
          const dy = Math.max(bounds.top - y, 0, y - bounds.bottom);
          candidates.push({ node, bounds, dx, dy });
        }
      }
    }
    if (!candidates.length) return null;
    const nearestY = candidates.reduce((nearest, item) => Math.min(nearest, item.dy), Infinity);
    const row = candidates.filter(item => item.dy <= nearestY + 2);
    row.sort((a, b) => a.dx - b.dx || a.dy - b.dy);
    const hit = row[0];
    if (starting && (hit.dx > 12 || hit.dy > 5)) return null;
    const px = Math.max(hit.bounds.left + .1, Math.min(hit.bounds.right - .1, x));
    const py = (hit.bounds.top + hit.bounds.bottom) / 2;
    const caret = document.caretPositionFromPoint?.(px, py);
    const fallback = !caret && document.caretRangeFromPoint?.(px, py);
    const node = caret?.offsetNode || fallback?.startContainer;
    const offset = caret?.offset ?? fallback?.startOffset;
    if (node === hit.node) return { node, offset };
    // Coordinate APIs sometimes hit another overlapping formula span. Find a
    // character boundary in the chosen text node instead.
    let bestOffset = 0, bestDistance = Infinity;
    const range = document.createRange();
    for (let index = 0; index <= hit.node.length; index += 1) {
      range.setStart(hit.node, index);
      range.setEnd(hit.node, index);
      const rect = range.getBoundingClientRect();
      const distance = Math.abs(rect.left - px);
      if (distance < bestDistance) { bestDistance = distance; bestOffset = index; }
    }
    return { node: hit.node, offset: bestOffset };
  }

  function beginPdfTextDrag(event) {
    if (reader?.mode !== 'pdf' || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
    const caret = pdfCaretAt(event.clientX, event.clientY, true);
    if (!caret) {
      event.preventDefault();
      document.getSelection()?.removeAllRanges();
      return;
    }
    // Keep native double-click word selection and keyboard selection.
    if (event.detail > 1) return;
    event.preventDefault();
    const selection = document.getSelection();
    const anchor = event.shiftKey && selection?.anchorNode?.parentElement?.closest('.pdf-text-layer')
      ? { node: selection.anchorNode, offset: selection.anchorOffset } : caret;
    reader.textDrag = { anchor, x: event.clientX, y: event.clientY };
    reader.textDrag.frame = requestAnimationFrame(scrollPdfTextDrag);
    selection.setBaseAndExtent(anchor.node, anchor.offset, caret.node, caret.offset);
  }

  function movePdfTextDrag(event) {
    if (!reader?.textDrag) return;
    if (!(event.buttons & 1)) { endPdfTextDrag(); return; }
    event.preventDefault();
    reader.textDrag.x = event.clientX;
    reader.textDrag.y = event.clientY;
    extendPdfTextDrag();
  }

  function extendPdfTextDrag() {
    const { anchor, x, y } = reader.textDrag;
    const caret = pdfCaretAt(x, y);
    if (caret && anchor.node.isConnected) document.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, caret.node, caret.offset);
  }

  function scrollPdfTextDrag() {
    if (!reader?.textDrag) return;
    const drag = reader.textDrag;
    const scroller = $('stageScroll');
    const bounds = scroller.getBoundingClientRect();
    if (drag.x >= bounds.left && drag.x <= bounds.right) {
      const speed = drag.y < bounds.top + 28 ? -Math.min(22, (bounds.top + 28 - drag.y) / 3)
        : drag.y > bounds.bottom - 28 ? Math.min(22, (drag.y - bounds.bottom + 28) / 3) : 0;
      const before = scroller.scrollTop;
      if (speed) scroller.scrollTop += speed;
      if (scroller.scrollTop !== before) extendPdfTextDrag();
    }
    drag.frame = requestAnimationFrame(scrollPdfTextDrag);
  }

  function endPdfTextDrag() {
    if (reader?.textDrag) cancelAnimationFrame(reader.textDrag.frame);
    if (reader) reader.textDrag = null;
  }

  // PDF formulas split a visual line into separate runs, fonts and baselines.
  // Group one passage into rows, allowing whitespace around operators and small
  // subscripts, while leaving distant columns and adjacent rows separate.
  function pdfLineRects(rects, width, height) {
    const rows = [];
    const pixels = rects.filter(rect => rect.w > 0 && rect.h > 0).map(rect => ({
      x: rect.x * width, y: rect.y * height, w: rect.w * width, h: rect.h * height
    })).sort((a, b) => b.h - a.h);
    for (const rect of pixels) {
      const center = rect.y + rect.h / 2;
      let row = rows.find(item => Math.abs(center - item.center) <= item.height * .65);
      if (!row) { row = { center, height: rect.h, rects: [] }; rows.push(row); }
      row.rects.push(rect);
    }
    const bands = [];
    for (const row of rows) {
      let band = null;
      for (const rect of row.rects.sort((a, b) => a.x - b.x)) {
        if (!band || rect.x - (band.x + band.w) > row.height * 2.5) {
          band = { ...rect };
          bands.push(band);
        } else {
          const right = Math.max(band.x + band.w, rect.x + rect.w);
          const bottom = Math.max(band.y + band.h, rect.y + rect.h);
          band.y = Math.min(band.y, rect.y);
          band.w = right - band.x;
          band.h = bottom - band.y;
        }
      }
    }
    return bands.map(rect => ({ x: rect.x / width, y: rect.y / height, w: rect.w / width, h: rect.h / height }));
  }

  // Element rects describe whole PDF text runs. Measure only the selected
  // characters in each text node so a word never inherits its line's box.
  function pdfSelectionRects(range) {
    const rects = [];
    const walker = document.createTreeWalker($('pdfDocument'), NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest('.pdf-text-layer') && range.intersectsNode(node)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      let start = node === range.startContainer ? range.startOffset : 0;
      let end = node === range.endContainer ? range.endOffset : node.length;
      while (start < end && /\s/.test(node.data[start])) start += 1;
      while (end > start && /\s/.test(node.data[end - 1])) end -= 1;
      if (start === end) continue;
      const fragment = document.createRange();
      fragment.setStart(node, start);
      fragment.setEnd(node, end);
      rects.push(...fragment.getClientRects());
    }
    return rects;
  }

  function capturePdfSelection() {
    if (!reader || reader.mode !== 'pdf') return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
    const range = selection.getRangeAt(0);
    if (!$('pdfDocument').contains(range.commonAncestorContainer)) return;
    const selectedText = selection.toString().replace(/\s+/g, ' ').trim();
    const segmentsByPage = new Map();
    for (const rect of pdfSelectionRects(range)) {
      if (rect.width < 0.5 || rect.height < 0.5) continue;
      const slot = reader.slots.find(page => {
        const bounds = page.getBoundingClientRect();
        return rect.top < bounds.bottom && rect.bottom > bounds.top && rect.left < bounds.right && rect.right > bounds.left;
      });
      if (!slot) continue;
      const bounds = slot.getBoundingClientRect();
      const page = Number(slot.dataset.page);
      const list = segmentsByPage.get(page) || [];
      list.push({
        x: Math.max(0, (rect.left - bounds.left) / bounds.width),
        y: Math.max(0, (rect.top - bounds.top) / bounds.height),
        w: Math.min(1, rect.width / bounds.width),
        h: Math.min(1, rect.height / bounds.height)
      });
      segmentsByPage.set(page, list);
    }
    if (!segmentsByPage.size) return;
    const segments = [...segmentsByPage].map(([page, rects]) => ({ page, rects }));
    const firstPage = segments[0].page;
    const passage = {
      type: 'pdf',
      text: selectedText,
      page: firstPage,
      location: Math.max(0, Math.min(1, (firstPage - 1) / reader.total)),
      segments
    };
    const rect = range.getBoundingClientRect();
    window.showSelectionMenu(selectedText, rect, passage);
  }

  function onDocumentSelection(event) {
    if (!reader || !['pdf', 'markdown'].includes(reader.mode)) return;
    if (event?.target?.closest?.('#selectionMenu')) return;
    setTimeout(() => reader?.mode === 'pdf' ? capturePdfSelection() : captureMarkdownSelection(), 0);
  }

  function onSelectionChange() {
    if (!reader || !['pdf', 'markdown'].includes(reader.mode)) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      clearTimeout(reader.selectionTimer);
      reader.selectionTimer = setTimeout(() => {
        if (document.getSelection()?.isCollapsed) window.hideSelectionMenu?.();
      }, 350);
    }
  }

  function mergeRects(rects) {
    const merged = [];
    for (const rect of rects.filter(item => item.w > 0 && item.h > 0).sort((a, b) => a.y - b.y || a.x - b.x)) {
      let candidate = { ...rect };
      let index = merged.findIndex(item => {
        const horizontal = candidate.x <= item.x + item.w + 0.002 && candidate.x + candidate.w + 0.002 >= item.x;
        const vertical = Math.min(candidate.y + candidate.h, item.y + item.h) - Math.max(candidate.y, item.y) > Math.min(candidate.h, item.h) * 0.5;
        return horizontal && vertical;
      });
      while (index >= 0) {
        const item = merged.splice(index, 1)[0];
        const x = Math.min(candidate.x, item.x), y = Math.min(candidate.y, item.y);
        candidate = { x, y, w: Math.max(candidate.x + candidate.w, item.x + item.w) - x, h: Math.max(candidate.y + candidate.h, item.y + item.h) - y };
        index = merged.findIndex(other => candidate.x <= other.x + other.w + 0.002 && candidate.x + candidate.w + 0.002 >= other.x && Math.min(candidate.y + candidate.h, other.y + other.h) - Math.max(candidate.y, other.y) > Math.min(candidate.h, other.h) * 0.5);
      }
      merged.push(candidate);
    }
    return merged;
  }

  function drawPdfHighlights(pageNumber) {
    if (!reader || reader.mode !== 'pdf') return;
    const slot = pageElement(pageNumber);
    const layer = slot?.querySelector('.pdf-highlights-layer');
    if (!layer) return;
    layer.replaceChildren();
    const bounds = slot.getBoundingClientRect();
    for (const highlight of currentHighlights.filter(item => item.type === 'pdf')) {
      const color = safeHighlightColor(highlight.color);
      const rects = (highlight.segments || []).filter(segment => segment.page === pageNumber).flatMap(segment => segment.rects || []);
      // Merge within each passage, so separate highlights never bridge a gap.
      for (const rect of pdfLineRects(rects, bounds.width, bounds.height)) {
        const mark = document.createElement('i');
        mark.className = 'pdf-highlight-rect';
        mark.style.cssText = `left:${rect.x * 100}%;top:${rect.y * 100}%;width:${rect.w * 100}%;height:${rect.h * 100}%;background:${color}`;
        layer.append(mark);
      }
    }
  }

  function markdownTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest('.markdown-highlights-layer') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function rangeOffsets(root, range) {
    const nodes = markdownTextNodes(root);
    let offset = 0, start = null, end = null;
    for (const node of nodes) {
      if (node === range.startContainer) start = offset + range.startOffset;
      if (node === range.endContainer) { end = offset + range.endOffset; break; }
      offset += node.textContent.length;
    }
    return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
  }

  function rangeFromOffsets(root, start, end) {
    const nodes = markdownTextNodes(root);
    const range = document.createRange();
    let position = 0, startFound = false, endFound = false;
    for (const node of nodes) {
      const next = position + node.textContent.length;
      if (!startFound && start <= next) {
        range.setStart(node, Math.max(0, Math.min(node.textContent.length, start - position)));
        startFound = true;
      }
      if (startFound && end <= next) {
        range.setEnd(node, Math.max(0, Math.min(node.textContent.length, end - position)));
        endFound = true;
        break;
      }
      position = next;
    }
    if (!startFound || !endFound) return null;
    return range;
  }

  async function marginAnchorForNote(note) {
    if (note.type === 'pdf' && reader?.mode === 'pdf') {
      const segment = (note.segments || []).find(item => item.page === (note.page || item.page));
      const page = pageElement(segment?.page || note.page || 0);
      if (!page) return null;
      const bounds = page.getBoundingClientRect();
      const rect = segment?.rects?.[0];
      return rect
        ? { x: bounds.left + (rect.x + rect.w / 2) * bounds.width, y: bounds.top + (rect.y + rect.h / 2) * bounds.height }
        : { x: bounds.left + bounds.width * 0.88, y: bounds.top + 72 };
    }
    if (note.type === 'markdown' && reader?.mode === 'markdown') {
      const root = $('markdownDocument');
      let rect;
      if (note.anchor) rect = rangeFromOffsets(root, note.anchor.start, note.anchor.end)?.getBoundingClientRect();
      if (!rect) {
        const bounds = root.getBoundingClientRect();
        return { x: bounds.right - 24, y: bounds.top + Math.max(0, Math.min(1, note.location || 0)) * root.scrollHeight };
      }
      return { x: rect.right, y: rect.top + rect.height / 2 };
    }
    if (note.type === 'epub' && note.cfi && doc?.rendition && Math.abs((note.location || 0) - (current?.progress || 0)) <= 0.035) {
      try {
        const range = await doc.getRange(note.cfi);
        const frameDoc = range?.startContainer?.ownerDocument;
        const iframe = doc.rendition.getContents().find(item => item.document === frameDoc)?.document?.defaultView?.frameElement;
        const rect = range?.getBoundingClientRect();
        const frame = iframe?.getBoundingClientRect();
        if (!rect || !frame || rect.width <= 0 || rect.height <= 0) return null;
        return { x: frame.left + rect.right, y: frame.top + rect.top + rect.height / 2 };
      } catch { return null; }
    }
    return null;
  }

  async function renderMarginNotes() {
    const layer = $('readingNotesLayer');
    const stage = layer?.parentElement;
    if (!layer || !stage || !current) return;
    const bookId = current.id;
    const token = ++marginNoteRenderToken;
    const stageBounds = stage.getBoundingClientRect();
    const notes = currentNotes.filter(note => note.quote || note.anchor || note.segments || note.cfi || note.type === 'pdf');
    const anchored = (await Promise.all(notes.map(async note => ({ note, point: await marginAnchorForNote(note) })))).filter(item => item.point);
    if (token !== marginNoteRenderToken || current?.id !== bookId) return;
    layer.replaceChildren();
    const visible = anchored.map(({ note, point }) => ({ note, x: point.x - stageBounds.left, y: point.y - stageBounds.top }))
      .filter(item => item.y >= -8 && item.y <= stageBounds.height + 8)
      .sort((a, b) => a.y - b.y);
    stage.classList.toggle('has-margin-notes', visible.length > 0);
    if (!visible.length) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('reading-note-connectors');
    svg.setAttribute('width', String(stage.clientWidth));
    svg.setAttribute('height', String(stage.clientHeight));
    svg.setAttribute('viewBox', `0 0 ${stage.clientWidth} ${stage.clientHeight}`);
    layer.append(svg);
    const cards = [];
    for (const item of visible) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'reading-note-callout';
      card.setAttribute('aria-label', `Apri nota: ${(item.note.text || item.note.quote || '').slice(0, 100)}`);
      const meta = document.createElement('span');
      meta.className = 'reading-note-meta';
      meta.textContent = item.note.type === 'pdf' ? `PDF · pagina ${item.note.page || reader?.currentPage || 1}` : item.note.type === 'markdown' ? 'Markdown' : 'EPUB';
      const text = document.createElement('span');
      text.className = 'reading-note-text';
      text.textContent = item.note.text || item.note.quote || 'Nota senza commento';
      card.append(meta, text);
      card.onclick = () => {
        window.showTab('notes');
        $('sidePanel').classList.add('open');
        $('panelBackdrop').classList.remove('hidden');
        window.editNote(item.note.id);
      };
      layer.append(card);
      const width = card.getBoundingClientRect().width;
      const left = Math.max(8, stage.clientWidth - width - 12);
      const top = Math.max(8, Math.min(stage.clientHeight - card.offsetHeight - 8, item.y - 18));
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      cards.push({ card, item, left, top, width, height: card.offsetHeight });
    }
    let previousBottom = 0;
    for (const entry of cards) {
      entry.top = Math.max(entry.top, previousBottom ? previousBottom + 7 : 8);
      entry.top = Math.min(entry.top, Math.max(8, stage.clientHeight - entry.height - 8));
      entry.card.style.top = `${entry.top}px`;
      previousBottom = entry.top + entry.height;
      const endX = entry.item.x < entry.left ? entry.left : entry.left + entry.width;
      const endY = entry.top + Math.min(entry.height / 2, 25);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${Math.max(0, entry.item.x)} ${Math.max(0, entry.item.y)} C ${(entry.item.x + endX) / 2} ${entry.item.y}, ${(entry.item.x + endX) / 2} ${endY}, ${endX} ${endY}`);
      path.setAttribute('class', 'reading-note-line');
      svg.append(path);
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const arrowDirection = entry.item.x < entry.left ? 1 : -1;
      arrow.setAttribute('points', `${entry.item.x},${entry.item.y} ${entry.item.x + arrowDirection * 6},${entry.item.y - 3} ${entry.item.x + arrowDirection * 6},${entry.item.y + 3}`);
      arrow.setAttribute('class', 'reading-note-arrow');
      svg.append(arrow);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(Math.max(0, entry.item.x)));
      dot.setAttribute('cy', String(Math.max(0, entry.item.y)));
      dot.setAttribute('r', '3');
      dot.setAttribute('class', 'reading-note-dot');
      svg.append(dot);
    }
  }

  let marginNoteFrame = 0;
  let marginNoteTimer = 0;
  function scheduleMarginNotes() {
    if (marginNoteFrame || marginNoteTimer) return;
    marginNoteTimer = setTimeout(() => {
      marginNoteTimer = 0;
      marginNoteFrame = requestAnimationFrame(() => {
        marginNoteFrame = 0;
        renderMarginNotes();
      });
    }, 90);
  }

  window.documentReaders = window.documentReaders || {};
  window.documentReaders.renderMarginNotes = renderMarginNotes;
  $('stageScroll').addEventListener('scroll', scheduleMarginNotes, { passive: true });
  window.addEventListener('resize', scheduleMarginNotes, { passive: true });

  const marginObserver = new ResizeObserver(scheduleMarginNotes);
  marginObserver.observe($('stageScroll'));

  function markdownRangeRects(range) {
    const root = $('markdownDocument');
    const bounds = root.getBoundingClientRect();
    return [...range.getClientRects()].filter(rect => rect.width > 0.5 && rect.height > 0.5).map(rect => ({
      x: rect.left - bounds.left + root.scrollLeft,
      y: rect.top - bounds.top + root.scrollTop,
      w: rect.width,
      h: rect.height
    }));
  }

  function drawMarkdownHighlights() {
    if (!reader || reader.mode !== 'markdown') return;
    const root = $('markdownDocument');
    const layer = root.querySelector('.markdown-highlights-layer');
    if (!layer) return;
    layer.replaceChildren();
    const byColor = new Map();
    for (const highlight of currentHighlights.filter(item => item.type === 'markdown' && item.anchor)) {
      const range = rangeFromOffsets(root, highlight.anchor.start, highlight.anchor.end);
      if (!range) continue;
      const color = safeHighlightColor(highlight.color);
      const list = byColor.get(color) || [];
      list.push(...markdownRangeRects(range));
      byColor.set(color, list);
    }
    for (const [color, rects] of byColor) {
      for (const rect of mergeRects(rects)) {
        const mark = document.createElement('i');
        mark.className = 'markdown-highlight-rect';
        mark.style.cssText = `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;background:${color}`;
        layer.append(mark);
      }
    }
  }

  function captureMarkdownSelection() {
    if (!reader || reader.mode !== 'markdown') return;
    const root = $('markdownDocument');
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const anchor = rangeOffsets(root, range);
    if (!anchor || anchor.end <= anchor.start) return;
    const rect = range.getBoundingClientRect();
    const passage = {
      type: 'markdown',
      text: selection.toString().replace(/\s+/g, ' ').trim(),
      anchor,
      location: Math.max(0, Math.min(1, anchor.start / Math.max(1, root.textContent.length)))
    };
    window.showSelectionMenu(passage.text, rect, passage);
  }

  function updateMarkdownProgress() {
    if (!reader || reader.mode !== 'markdown') return;
    const scroller = $('stageScroll');
    const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const progress = Math.max(0, Math.min(1, scroller.scrollTop / max));
    current.progress = progress;
    current.current = Math.floor(progress * Math.max(0, current.total - 1)) + 1;
    window.updateProgress(progress);
    clearTimeout(progressSaveTimer);
    progressSaveTimer = setTimeout(() => {
      if (reader?.mode === 'markdown') recordProgress(current.progress || 0);
    }, 350);
  }

  function createReaderState(mode, book) {
    if (reader) destroyDocumentReader();
    reader = {
      mode,
      bookId: book.id,
      zoom: Math.max(0.65, Math.min(1.8, Number(localStorage.getItem('carta-pdf-zoom-v1')) || 1)),
      pageWidth: 0,
      currentPage: 1,
      total: 0,
      slots: [],
      pageObserver: null,
      resizeObserver: null,
      abort: null,
      pdf: null,
      pagePromises: new Map(),
      pageCache: new Map(),
      rendered: new Set(),
      renderTasks: new Map(),
      queue: [],
      queued: new Set(),
      activeRenders: 0,
      layoutVersion: 0,
      pageText: new Map(),
      lastRecordedPage: book.current || 1,
      lastRecordedProgress: book.progress || 0
    };
    return reader;
  }

  function destroyDocumentReader() {
    if (!reader) return;
    endPdfTextDrag();
    if (pdfScrollFrame) cancelAnimationFrame(pdfScrollFrame);
    pdfScrollFrame = 0;
    clearTimeout(progressSaveTimer);
    clearTimeout(reader.selectionTimer);
    reader.pageObserver?.disconnect();
    reader.resizeObserver?.disconnect();
    reader.abort?.abort();
    for (const task of reader.renderTasks.values()) { try { task.cancel(); } catch {} }
    if (reader.markdownResize) reader.markdownResize.disconnect();
    const loadingTask = reader.loadingTask;
    reader = null;
    if (loadingTask) loadingTask.destroy().catch(() => {});
    $('pdfDocument')?.replaceChildren();
    $('markdownDocument')?.replaceChildren();
    window.hideSelectionMenu?.();
  }

  async function openPdf(book, file) {
    showLoading('Apro il PDF…', 'Preparo le pagine per lo scorrimento continuo');
    const state = createReaderState('pdf', book);
    try {
      const pdfjs = await loadPdfModule();
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjs.getDocument({
        data,
        cMapUrl: new URL('./vendor/pdfjs/cmaps/', document.baseURI).href,
        cMapPacked: true,
        iccUrl: new URL('./vendor/pdfjs/iccs/', document.baseURI).href,
        standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', document.baseURI).href,
        wasmUrl: new URL('./vendor/pdfjs/wasm/', document.baseURI).href,
        imageResourcesPath: new URL('./vendor/pdfjs/image_decoders/', document.baseURI).href,
        useWasm: false,
        enableXfa: false,
        isEvalSupported: false,
        maxImageSize: 16_000_000,
        canvasMaxAreaInBytes: MAX_CANVAS_PIXELS
      });
      state.loadingTask = task;
      state.pdf = await task.promise;
      if (reader !== state) { await task.destroy(); return; }
      if (state.pdf.numPages > MAX_PDF_PAGES) throw new Error(`Il PDF supera il limite di ${MAX_PDF_PAGES} pagine.`);
      const first = await state.pdf.getPage(1);
      const viewport = first.getViewport({ scale: 1 });
      state.total = state.pdf.numPages;
      state.currentPage = Math.max(1, Math.min(state.total, Number(book.current) || Math.ceil((book.progress || 0) * state.total) + 1));
      current.total = state.total;
      current.wordCount = Math.max(250, state.total * 300);
      current.current = state.currentPage;
      $('positionSetting').textContent = `${state.currentPage} / ${state.total}`;
      buildPdfSlots(state.total, viewport.width / viewport.height);
      $('pdfZoomRange').value = String(Math.round(state.zoom * 100));
      $('pdfZoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
      $('pdfZoomSetting').textContent = `${Math.round(state.zoom * 100)}%`;
      window.updateProgress(current.progress || 0);
      renderNotes();
      renderHighlights();
      hideLoading();
    } catch (error) {
      destroyDocumentReader();
      hideLoading();
      throw new Error(`PDF non leggibile: ${error?.message || 'documento danneggiato o protetto'}`);
    }
  }

  function markdownFragment(source) {
    if (!window.marked || !window.DOMPurify) throw new Error('Lettore Markdown non disponibile');
    const html = window.marked.parse(source, { gfm: true, breaks: false, async: false });
    return window.DOMPurify.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'del', 'code', 'pre', 'hr', 'br', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
      ALLOWED_ATTR: ['href', 'title', 'start', 'colspan', 'rowspan', 'align'],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['img', 'svg', 'math', 'iframe', 'video', 'audio', 'script', 'style', 'form', 'input', 'button', 'object', 'embed']
    });
  }

  async function openMarkdown(book, file) {
    showLoading('Apro il documento…', 'Formatto il contenuto Markdown in locale');
    const state = createReaderState('markdown', book);
    try {
      const source = await file.text();
      if (reader !== state) return;
      if (source.split(/\r\n|\n|\r/).length > MAX_MARKDOWN_LINES) throw new Error(`Il documento supera il limite di ${MAX_MARKDOWN_LINES} righe.`);
      const root = $('markdownDocument');
      root.replaceChildren(markdownFragment(source));
      root.classList.remove('hidden');
      const overlay = document.createElement('div');
      overlay.className = 'markdown-highlights-layer';
      overlay.setAttribute('aria-hidden', 'true');
      root.append(overlay);
      root.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (link) {
          event.preventDefault();
          toast('I collegamenti esterni non vengono aperti dal lettore.');
        }
      }, { signal: (state.abort = new AbortController()).signal });
      $('stageScroll').addEventListener('scroll', updateMarkdownProgress, { passive: true, signal: state.abort.signal });
      document.addEventListener('mouseup', onDocumentSelection, { signal: state.abort.signal });
      document.addEventListener('keyup', onDocumentSelection, { signal: state.abort.signal });
      document.addEventListener('selectionchange', onSelectionChange, { signal: state.abort.signal });
      state.source = source;
      state.total = 1;
      current.total = 1;
      const cleanText = root.textContent.replace(/\s+/g, ' ').trim();
      current.wordCount = Math.max(1, cleanText.split(/\s+/u).filter(Boolean).length);
      current.current = 1;
      requestAnimationFrame(() => {
        if (reader !== state) return;
        const max = Math.max(1, $('stageScroll').scrollHeight - $('stageScroll').clientHeight);
        $('stageScroll').scrollTop = max * Math.max(0, Math.min(1, book.progress || 0));
        updateMarkdownProgress();
        drawMarkdownHighlights();
      });
      state.markdownResize = new ResizeObserver(() => drawMarkdownHighlights());
      state.markdownResize.observe(root);
      renderNotes();
      renderHighlights();
      window.updateProgress(book.progress || 0);
      hideLoading();
    } catch (error) {
      destroyDocumentReader();
      hideLoading();
      throw error;
    }
  }

  async function openDocumentBook(id) {
    const book = books.find(item => item.id === id);
    if (!book) return;
    current = book;
    showLoading('Apro il documento…', 'Preparo il lettore');
    try {
      const file = await getStoredFile(id);
      showReader(book);
      await loadBookData(book);
      if (book.type === 'pdf') await openPdf(book, file);
      else await openMarkdown(book, file);
      setTheme(theme);
      updateStats();
    } catch (error) {
      hideLoading();
      destroyDocumentReader();
      await window.closeReader();
      toast(`Impossibile aprire il documento: ${error?.message || 'formato non valido'}`);
    }
  }

  window.openBook = async function (id) {
    const book = books.find(item => item.id === id);
    if (!book || book.type === 'epub') {
      marginNoteRenderToken += 1;
      $('pdfIndexTab').hidden = true;
      $('pdfIndexPane').classList.add('hidden');
      $('readingNotesLayer').replaceChildren();
      return originalOpenBook(id);
    }
    return openDocumentBook(id);
  };

  window.closeReader = async function () {
    marginNoteRenderToken += 1;
    destroyDocumentReader();
    clearReaderMode();
    await originalCloseReader();
  };

  window.updateProgress = function (progress) {
    originalUpdateProgress(progress);
    if (!reader || current?.id !== reader.bookId) return;
    const scrubber = $('progressScrubber');
    const percentageJump = document.querySelector('.reader-jump input');
    if (scrubber) { scrubber.disabled = false; scrubber.title = 'Scegli la posizione nel documento'; }
    if (percentageJump) { percentageJump.disabled = false; percentageJump.title = 'Inserisci una percentuale da 0 a 100'; }
    if (reader.mode === 'pdf') {
      const page = Math.max(1, Math.min(reader.total, current.current || 1));
      $('pageLabel').textContent = `${page}/${reader.total}`;
      $('positionSetting').textContent = `${page} / ${reader.total}`;
      $('progressLabel').textContent = `${Math.round(progress * 100)}%`;
    } else {
      $('pageLabel').textContent = `${Math.round(progress * 100)}%`;
      $('positionSetting').textContent = `${Math.round(progress * 100)}% del documento`;
      $('progressLabel').textContent = `${Math.round(progress * 100)}%`;
    }
  };

  window.updateStats = function () {
    originalUpdateStats();
    if (!current || !reader || current.id !== reader.bookId) return;
    const format = reader.mode === 'pdf' ? 'PDF' : 'Markdown';
    $('bookDetails').textContent = `${format}\nImportato il ${new Date(current.added).toLocaleDateString('it-IT')}\nLe note vengono salvate automaticamente.`;
  };

  window.matchingHighlights = function (passage) {
    if (!passage || passage.type === 'epub') return originalMatchingHighlights(passage);
    return currentHighlights.filter(item => {
      if (item.type !== passage.type) return false;
      if (passage.type === 'markdown') return Boolean(item.anchor && passage.anchor && item.anchor.start < passage.anchor.end && item.anchor.end > passage.anchor.start);
      const textMatches = item.text === passage.text || item.text?.includes(passage.text) || passage.text?.includes(item.text || '\u0000');
      if (!textMatches) return false;
      const selected = passage.segments || [];
      return selected.some(segment => (item.segments || []).some(saved => saved.page === segment.page && saved.rects.some(a => segment.rects.some(b => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y))));
    });
  };

  window.highlightSelection = async function (color) {
    const passage = selectedPassage;
    if (!passage || passage.type === 'epub') return originalHighlightSelection(color);
    const safeColor = HIGHLIGHT_PALETTE.has(color) ? color : (highlightPalette[0]?.color || '#f1d55e');
    const matches = window.matchingHighlights(passage);
    if (matches.length) {
      for (const item of matches) {
        item.color = safeColor;
        item.updated = Date.now();
        await put('highlights', item);
      }
      drawAllDocumentHighlights();
      renderHighlights();
      window.hideSelectionMenu();
      toast('Colore dell’evidenziazione aggiornato');
      return;
    }
    const item = {
      id: uid(),
      bookId: current.id,
      type: passage.type,
      text: passage.text,
      created: Date.now(),
      updated: Date.now(),
      location: passage.location ?? (current.progress || 0),
      color: safeColor,
      page: passage.page || undefined,
      segments: passage.segments || undefined,
      anchor: passage.anchor || undefined
    };
    await put('highlights', item);
    currentHighlights.push(item);
    drawAllDocumentHighlights();
    renderHighlights();
    window.hideSelectionMenu();
    document.getSelection()?.removeAllRanges();
    toast('Passaggio evidenziato');
  };

  window.removeHighlight = async function (id, notify = true) {
    const item = currentHighlights.find(highlight => highlight.id === id);
    if (!item || item.type === 'epub') return originalRemoveHighlight(id, notify);
    await remove('highlights', id);
    currentHighlights = currentHighlights.filter(highlight => highlight.id !== id);
    drawAllDocumentHighlights();
    renderHighlights();
    if (notify) toast('Evidenziazione rimossa');
  };

  window.removeSelectedHighlight = async function () {
    const passage = selectedPassage;
    if (!passage || passage.type === 'epub') return originalRemoveSelectedHighlight();
    const matches = window.matchingHighlights(passage);
    for (const item of matches) await window.removeHighlight(item.id, false);
    window.hideSelectionMenu();
    toast(matches.length ? 'Evidenziazione rimossa' : 'Nessuna evidenziazione selezionata');
  };

  window.applyEPUBHighlight = function (item) {
    if (item?.type === 'epub') originalApplyEPUBHighlight(item);
    else drawAllDocumentHighlights();
  };

  function drawAllDocumentHighlights() {
    if (!reader) return;
    if (reader.mode === 'pdf') for (const number of reader.rendered) drawPdfHighlights(number);
    if (reader.mode === 'markdown') drawMarkdownHighlights();
  }

  window.renderHighlights = function () {
    originalRenderHighlights();
    const cards = [...$('highlightsList').querySelectorAll('.highlight-card')];
    cards.forEach((card, index) => {
      const item = currentHighlights[index];
      if (!item) return;
      const location = card.querySelector('.note-loc');
      if (location) location.textContent = item.type === 'pdf' ? `PDF · pagina ${item.page || 1}` : item.type === 'markdown' ? `Markdown · ${Math.round((item.location || 0) * 100)}%` : `EPUB · ${Math.round((item.location || 0) * 100)}%`;
      const jump = card.querySelector('.highlight-card-actions .text-action');
      if (jump) jump.onclick = () => jumpToAnchor(item);
    });
    drawAllDocumentHighlights();
  };

  window.renderNotes = function () {
    originalRenderNotes();
    const cards = [...$('notesList').querySelectorAll('.note-card')];
    cards.forEach(card => {
      const note = currentNotes.find(item => item.id === card.dataset.noteId);
      if (!note) return;
      const location = card.querySelector('.note-loc');
      if (location) location.textContent = note.type === 'pdf' ? `PDF · pagina ${note.page || 1}` : note.type === 'markdown' ? `Markdown · ${Math.round((note.location || 0) * 100)}%` : `EPUB · ${Math.round((note.location || 0) * 100)}%`;
      const actions = card.querySelector('.note-actions');
      if (actions && !actions.querySelector('.document-note-jump')) {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'text-action document-note-jump';
        jump.textContent = 'Vai al passaggio';
        jump.onclick = () => jumpToAnchor(note);
        actions.prepend(jump);
      }
    });
    renderMarginNotes();
  };

  function jumpToAnchor(item) {
    const type = item.type || 'epub';
    if (type === 'epub') return doc?.rendition?.display(item.cfi);
    if (!reader || reader.bookId !== current?.id) return;
    if (reader.mode === 'pdf') return jumpToPdfPage(item.page || item.segments?.[0]?.page || 1);
    if (reader.mode === 'markdown' && item.anchor) {
      const range = rangeFromOffsets($('markdownDocument'), item.anchor.start, item.anchor.end);
      const bounds = range?.getBoundingClientRect();
      if (!bounds) return;
      const scrollBounds = $('stageScroll').getBoundingClientRect();
      $('stageScroll').scrollTo({ top: $('stageScroll').scrollTop + bounds.top - scrollBounds.top - 80, behavior: 'smooth' });
    } else if (reader.mode === 'markdown') {
      $('stageScroll').scrollTo({ top: item.location * $('stageScroll').scrollHeight, behavior: 'smooth' });
    }
  }

  window.seekToProgress = async function (value) {
    if (!reader || !['pdf', 'markdown'].includes(reader.mode)) return originalSeekToProgress(value);
    const progress = Math.max(0, Math.min(1, Number(value) / (Number(value) > 1 ? 1000 : 1)));
    if (reader.mode === 'pdf') jumpToPdfPage(Math.max(1, Math.ceil(progress * reader.total)), 'auto');
    else {
      const scroller = $('stageScroll');
      scroller.scrollTop = Math.max(0, (scroller.scrollHeight - scroller.clientHeight) * progress);
      updateMarkdownProgress();
    }
  };

  window.turn = function (direction) {
    if (!reader || !['pdf', 'markdown'].includes(reader.mode)) return originalTurn(direction);
    if (reader.mode === 'pdf') jumpToPdfPage(reader.currentPage + Math.sign(direction));
    else {
      const scroller = $('stageScroll');
      scroller.scrollBy({ top: Math.sign(direction) * scroller.clientHeight * 0.85, behavior: 'smooth' });
    }
  };

  window.documentReaders = {
    get current() { return reader; },
    jumpToAnchor,
    renderMarginNotes,
    returnToReadingSpot,
    getCurrentText(bookId = current?.id) {
      if (!reader || current?.id !== bookId || reader.bookId !== bookId) return '';
      if (reader.mode === 'pdf') return (reader.pageText.get(reader.currentPage) || '').slice(0, 9000);
      if (reader.mode === 'markdown') return ($('markdownDocument')?.innerText || '').slice(0, 9000);
      return '';
    },
    async setPdfZoom(value) {
      if (!reader || reader.mode !== 'pdf') return;
      reader.zoom = Math.max(0.65, Math.min(1.8, Number(value) / 100));
      localStorage.setItem('carta-pdf-zoom-v1', String(reader.zoom));
      $('pdfZoomRange').value = String(Math.round(reader.zoom * 100));
      $('pdfZoomLabel').textContent = `${Math.round(reader.zoom * 100)}%`;
      $('pdfZoomSetting').textContent = `${Math.round(reader.zoom * 100)}%`;
      resizePdfPages();
    }
  };

  $('pdfZoomRange').addEventListener('input', event => window.documentReaders.setPdfZoom(event.target.value));
  $('pdfZoomOut').addEventListener('click', () => window.documentReaders.setPdfZoom(Math.round((reader?.zoom || 1) * 100) - 10));
  $('pdfZoomIn').addEventListener('click', () => window.documentReaders.setPdfZoom(Math.round((reader?.zoom || 1) * 100) + 10));
  $('pdfFitWidth').addEventListener('click', () => window.documentReaders.setPdfZoom(100));
  $('pdfPageJump').addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 5); });
  const commitPdfPageJump = () => {
    const input = $('pdfPageJump');
    const raw = input.value.trim();
    if (!raw || !reader || reader.mode !== 'pdf') {
      input.value = String(reader?.currentPage || 1);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      input.value = String(reader.currentPage);
      return;
    }
    const page = Math.max(1, Math.min(reader.total, Math.round(parsed)));
    input.value = String(page);
    const now = Date.now();
    if (input.dataset.lastCommitPage === String(page) && now - Number(input.dataset.lastCommitAt || 0) < 700) return;
    input.dataset.lastCommitPage = String(page);
    input.dataset.lastCommitAt = String(now);
    jumpToPdfPage(page, 'smooth');
  };
  $('pdfPageJump').addEventListener('change', commitPdfPageJump);
  $('pdfPageJump').addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
    if (event.key === 'Enter') { event.preventDefault(); commitPdfPageJump(); event.target.blur(); }
  });
})();
