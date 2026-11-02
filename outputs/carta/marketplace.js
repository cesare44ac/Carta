(() => {
  const byId = id => document.getElementById(id);
  const overlay = byId('discoverOverlay');
  const panel = byId('discoverPanel');
  if (!overlay || !panel) return;

  let source = 'all';
  let activeTab = 'research';
  let researchRequest = 0;
  let newsRequest = 0;
  let cachedNewsSource = '';

  function setStatus(id, message) {
    const status = byId(id);
    if (status) status.textContent = message;
  }

  function make(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = String(content);
    return element;
  }

  function showEmpty(container, message) {
    container.replaceChildren(make('div', 'discover-empty', message));
  }

  function invoke(name, args) {
    const tauriInvoke = window.__TAURI__?.core?.invoke;
    if (!tauriInvoke) return Promise.reject(new Error('La ricerca è disponibile nella versione desktop di Carta.'));
    return tauriInvoke(name, args);
  }

  function setOpen(open) {
    overlay.classList.toggle('hidden', !open);
    requestAnimationFrame(() => overlay.classList.toggle('open', open));
    overlay.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('marketplace-open', open);
    if (open) window.setTimeout(() => byId('discoverQuery')?.focus(), 100);
    else byId('discoverOpen')?.focus();
  }

  function setTab(nextTab) {
    activeTab = nextTab === 'news' ? 'news' : 'research';
    const researchActive = activeTab === 'research';
    byId('discoverResearchPane').classList.toggle('hidden', !researchActive);
    byId('discoverNewsPane').classList.toggle('hidden', researchActive);
    byId('discoverResearchTab').classList.toggle('active', researchActive);
    byId('discoverNewsTab').classList.toggle('active', !researchActive);
    byId('discoverResearchTab').setAttribute('aria-selected', String(researchActive));
    byId('discoverNewsTab').setAttribute('aria-selected', String(!researchActive));
    if (!researchActive && cachedNewsSource !== source) loadNews();
  }

  function sourceName(value) {
    return ({ lse: 'LSE', imf: 'IMF', ecb: 'BCE', fed: 'Federal Reserve' })[value] || value || 'OpenAlex';
  }

  function safeLinkButton(label, url, primary) {
    const button = make('button', 'discover-card-action' + (primary ? ' primary' : ''), label);
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await invoke('open_research_result', { url }); }
      catch { window.toast?.('Non riesco ad aprire questo collegamento.'); }
      finally { button.disabled = false; }
    });
    return button;
  }

  function renderResearch(items, requestId) {
    if (requestId !== researchRequest) return;
    const results = byId('discoverResearchResults');
    results.replaceChildren();
    if (!items.length) {
      showEmpty(results, 'Nessun risultato. Prova un argomento più specifico o un’altra fonte.');
      setStatus('discoverResearchStatus', 'Non ho trovato lavori aperti per questa ricerca.');
      return;
    }
    setStatus('discoverResearchStatus', items.length + ' risultati ad accesso aperto');
    for (const item of items) {
      const card = make('article', 'discover-card');
      const top = make('div', 'discover-card-top');
      top.append(make('span', 'discover-source-name', item.source || sourceName(source)));
      top.append(make('span', 'discover-access', 'Accesso aperto'));
      card.append(top, make('h3', '', item.title || 'Senza titolo'));
      const meta = [item.year, item.authors, item.venue].filter(Boolean).join(' · ');
      if (meta) card.append(make('p', 'discover-meta', meta));
      if (item.abstract) card.append(make('p', 'discover-summary', item.abstract));
      const actions = make('div', 'discover-card-actions');
      if (item.landingUrl) actions.append(safeLinkButton('Apri scheda', item.landingUrl, true));
      if (item.pdfUrl && item.pdfUrl !== item.landingUrl) actions.append(safeLinkButton('Apri PDF', item.pdfUrl, false));
      if (actions.childElementCount) card.append(actions);
      results.append(card);
    }
  }

  async function searchResearch() {
    const query = byId('discoverQuery').value.trim();
    const results = byId('discoverResearchResults');
    const requestId = ++researchRequest;
    if (!query) {
      showEmpty(results, 'Inserisci un argomento, un autore o una parte del titolo.');
      setStatus('discoverResearchStatus', 'Ricerca pubblicazioni con una copia ad accesso aperto.');
      return;
    }
    results.replaceChildren();
    setStatus('discoverResearchStatus', 'Cerco pubblicazioni…');
    try {
      const items = await invoke('search_open_access_research', { query, source });
      renderResearch(Array.isArray(items) ? items : [], requestId);
    } catch (error) {
      if (requestId !== researchRequest) return;
      showEmpty(results, 'Catalogo non raggiungibile. Controlla la connessione e riprova.');
      setStatus('discoverResearchStatus', 'Ricerca non riuscita');
    }
  }

  function renderNews(items, requestId) {
    if (requestId !== newsRequest) return;
    const results = byId('discoverNewsResults');
    results.replaceChildren();
    if (!items.length) {
      showEmpty(results, 'Non ci sono aggiornamenti disponibili dalle fonti selezionate. Riprova più tardi.');
      setStatus('discoverNewsStatus', 'Nessun aggiornamento disponibile');
      return;
    }
    setStatus('discoverNewsStatus', items.length + ' aggiornamenti recenti');
    for (const item of items) {
      const card = make('article', 'discover-card');
      const top = make('div', 'discover-card-top');
      top.append(make('span', 'discover-source-name', item.source || 'Fonte istituzionale'));
      if (item.date) top.append(make('time', '', item.date));
      card.append(top, make('h3', '', item.title || 'Aggiornamento'));
      if (item.snippet) card.append(make('p', 'discover-summary', item.snippet));
      if (item.url) {
        const actions = make('div', 'discover-card-actions');
        actions.append(safeLinkButton('Apri la fonte', item.url, true));
        card.append(actions);
      }
      results.append(card);
    }
  }

  async function loadNews(force) {
    if (!force && cachedNewsSource === source) return;
    const requestId = ++newsRequest;
    const results = byId('discoverNewsResults');
    results.replaceChildren();
    setStatus('discoverNewsStatus', 'Carico gli aggiornamenti delle fonti…');
    try {
      const items = await invoke('fetch_research_news', { source });
      if (requestId !== newsRequest) return;
      cachedNewsSource = source;
      renderNews(Array.isArray(items) ? items : [], requestId);
    } catch (error) {
      if (requestId !== newsRequest) return;
      cachedNewsSource = '';
      showEmpty(results, 'Notizie non raggiungibili. Controlla la connessione e riprova.');
      setStatus('discoverNewsStatus', 'Caricamento non riuscito');
    }
  }

  byId('discoverSearchForm').addEventListener('submit', event => {
    event.preventDefault();
    searchResearch();
  });
  byId('discoverClose').addEventListener('click', () => setOpen(false));
  byId('discoverScrim').addEventListener('click', () => setOpen(false));
  byId('discoverResearchTab').addEventListener('click', () => setTab('research'));
  byId('discoverNewsTab').addEventListener('click', () => setTab('news'));
  panel.addEventListener('click', event => {
    const chip = event.target.closest('[data-source]');
    if (chip) {
      source = chip.dataset.source;
      panel.querySelectorAll('[data-source]').forEach(button => button.classList.toggle('active', button === chip));
      cachedNewsSource = '';
      if (activeTab === 'news') loadNews(true);
      else if (byId('discoverQuery').value.trim()) searchResearch();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.classList.contains('hidden')) setOpen(false);
  });

  window.toggleMarketplace = () => setOpen(overlay.classList.contains('hidden'));
  window.closeMarketplace = () => setOpen(false);
})();
