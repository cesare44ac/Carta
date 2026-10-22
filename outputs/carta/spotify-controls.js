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
  let hasSpotifySession = false;
  const controls = [previous, toggle, next];
  const setEnabled = enabled => controls.forEach(button => { button.disabled = !enabled; });

  async function refreshSpotify() {
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
    window.setTimeout(refreshSpotify, 250);
  }

  previous.addEventListener('click', () => control('previous'));
  toggle.addEventListener('click', () => control('toggle'));
  next.addEventListener('click', () => control('next'));
  open.addEventListener('click', async () => {
    try { await invoke('open_spotify_app'); }
    catch { artist.textContent = 'Spotify non è installato o non può essere aperto'; }
  });

  refreshSpotify();
  window.setInterval(refreshSpotify, 2500);
})();
