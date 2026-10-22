# Carta

Carta è un lettore desktop per libri EPUB, pensato per una lettura tranquilla e annotazioni rapide. Include una libreria locale, note, evidenziazioni, avanzamento della lettura, temi chiaro/scuro/seppia e controlli Spotify.

Il lettore attualmente supporta EPUB; i PDF non sono supportati.

## Assistente AI

Carta include Qwen3.5-2B quantizzato, eseguito localmente. L’assistente può spiegare, tradurre e riassumere passaggi, rispondere in una chat separata per libro e interpretare formule LaTeX. Le conversazioni restano salvate sul dispositivo. Il modello GGUF (circa 1,31 GB) viene scaricato solo quando l’utente lo richiede e non è incluso nell’installer. Una volta scaricato, le richieste AI non richiedono Internet.

## Scaricare l'app

Gli installer Windows sono pubblicati nella sezione **Releases** di GitHub. Scarica il file `.exe` dell'ultima versione e avvialo. Se il runtime WebView2 non è presente, l'installer ne scarica il bootstrapper.

## Pubblicare una nuova versione

1. Aggiorna la versione patch in `package.json`, `desktop/src-tauri/tauri.conf.json` e `desktop/src-tauri/Cargo.toml`; mantieni i numeri allineati e aggiorna anche il pacchetto Carta in `desktop/src-tauri/Cargo.lock`.
2. Crea e invia un tag corrispondente, per esempio `v1.0.10`.
3. GitHub Actions compila l'installer Windows e lo allega a una Release. Il workflow richiede solo il token automatico del repository.

La build di release è configurata in `.github/workflows/release-windows.yml`. Per ora il workflow produce l'installer NSIS per Windows x64.

## Sviluppare

Per sviluppare e compilare dal sorgente servono Node.js 22, pnpm 9.15.5, Rust per Windows MSVC, Microsoft C++ Build Tools, CMake, LLVM con `libclang.dll` e WebView2. L’installer per gli utenti non richiede Rust, CMake o LLVM.

```powershell
pnpm install
pnpm start
```

Per creare manualmente l'installer:

```powershell
pnpm build
```

Il file viene creato in `desktop/src-tauri/target/release/bundle/nsis/`.

Il codice dell'interfaccia è in `outputs/carta`; il progetto desktop Tauri è in `desktop/src-tauri`.

Le note di rilascio si trovano in [CHANGELOG.md](CHANGELOG.md). I dettagli per lo sviluppo Windows sono in [README-DESKTOP.md](README-DESKTOP.md).
