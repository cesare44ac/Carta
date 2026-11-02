(() => {
  const invoke = (command, args) => window.__TAURI__?.core?.invoke(command, args);
  const title = document.getElementById('spotifyTrackTitle');
  const artist = document.getElementById('spotifyTrackArtist');
  const previous = document.getElementById('spotifyPrevious');
  const toggle = document.getElementById('spotifyToggle');
  const next = document.getElementById('spotifyNext');
  const open = document.getElementById('spotifyOpen');
  if (!title || !artist) return;

  let pollBusy = false;
  let pollTimer = 0;
  let hasSpotifySession = false;
  const controls = [previous, toggle, next];
  const setEnabled = enabled => controls.forEach(button => { button.disabled = !enabled; });

  async function refreshSpotify() {
    if (document.hidden || !document.body.classList.contains('reading')) return;
    if (pollBusy) return;
    pollBusy = true;
    try {
      const playback = await invoke('get_spotify_playback');
      hasSpotifySession = Boolean(playback);
      if (!playback) {
        title.textContent = 'Spotify';
        artist.textContent = 'Apri Spotify per iniziare';
        toggle.textContent = '▶';
        toggle.setAttribute('aria-label', 'Riproduci o metti in pausa');
        setEnabled(false);
        return;
      }
      title.textContent = playback.title || 'Brano in riproduzione';
      artist.textContent = playback.artist || 'Spotify';
      toggle.textContent = playback.playing ? 'Ⅱ' : '▶';
      toggle.setAttribute('aria-label', playback.playing ? 'Metti in pausa' : 'Riprendi la riproduzione');
      toggle.title = playback.playing ? 'Metti in pausa' : 'Riprendi';
      setEnabled(true);
    } catch {
      title.textContent = 'Spotify';
      artist.textContent = 'Controlli disponibili nell’app desktop';
      setEnabled(false);
    } finally {
      pollBusy = false;
    }
  }

  async function control(action) {
    if (!hasSpotifySession) return;
    controls.forEach(button => { button.disabled = true; });
    try {
      await invoke('spotify_media_control', { action });
    } catch (error) {
      artist.textContent = String(error || 'Comando Spotify non riuscito');
    }
    schedulePoll(250);
  }

  function schedulePoll(delay) {
    window.clearTimeout(pollTimer);
    if (document.hidden || !document.body.classList.contains('reading')) return;
    pollTimer = window.setTimeout(async () => {
      await refreshSpotify();
      schedulePoll(hasSpotifySession ? 10000 : 30000);
    }, delay);
  }

  function syncPolling() {
    if (document.hidden || !document.body.classList.contains('reading')) {
      window.clearTimeout(pollTimer);
      pollTimer = 0;
      return;
    }
    schedulePoll(150);
  }

  previous.addEventListener('click', () => control('previous'));
  toggle.addEventListener('click', () => control('toggle'));
  next.addEventListener('click', () => control('next'));
  open.addEventListener('click', async () => {
    try { await invoke('open_spotify_app'); }
    catch { artist.textContent = 'Spotify non è installato o non può essere aperto'; }
  });

  const readerObserver = new MutationObserver(syncPolling);
  readerObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const readerView = document.getElementById('readerView');
  if (readerView) readerObserver.observe(readerView, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', syncPolling);
  syncPolling();
})();
