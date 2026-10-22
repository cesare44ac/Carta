# Carta per Windows

Carta usa Tauri 2 per la finestra desktop e WebView2 per mostrare il lettore EPUB. L'interfaccia in `outputs/carta` viene incorporata direttamente nel pacchetto.

## Prerequisiti

- Node.js 22 o successivo e pnpm
- Rust con il target MSVC
- Microsoft C++ Build Tools e WebView2 Runtime

## Avvio in sviluppo

Installa le dipendenze con `pnpm install`, poi avvia Carta con `pnpm start`.

## Creare l'installer

Esegui `pnpm build`. L'installer NSIS per Windows viene creato in `desktop/src-tauri/target/release/bundle/nsis`.

Il pacchetto usa il WebView2 già installato su Windows; l'installer scarica il bootstrapper WebView2 solo se il runtime manca.

## Controlli Spotify

Durante la lettura, la barra superiore mostra il brano in riproduzione e offre i comandi precedente, pausa/ripresa e successivo. Su Windows Carta legge e controlla la sessione multimediale locale di Spotify tramite i controlli di sistema: Spotify deve essere installato e in esecuzione sullo stesso PC. Non servono un account sviluppatore Spotify, chiavi API o un accesso separato. Il pulsante **Apri** avvia Spotify quando non è ancora aperto.

## Assistente AI locale

Carta usa Qwen3.5-2B in formato GGUF quantizzato Q4_K_M tramite `llama.cpp`. Il modello (circa 1,31 GB) viene scaricato su richiesta nella cartella dati dell’app e non viene incluso nell’installer. Dopo il download, spiegazioni, traduzioni, riassunti e domande sui passaggi del libro vengono elaborati sul PC; Internet serve solo per scaricare il modello. La chat è salvata localmente per ciascun libro e può essere azzerata con **Nuova chat**. Le formule LaTeX nelle risposte vengono visualizzate con KaTeX incluso nell’app. Il download del modello è fissato a una revisione e verificato con SHA-256. Qwen usa la licenza Apache 2.0; `llama.cpp` è MIT.

Per compilare Carta dal sorgente, oltre ai prerequisiti sopra serve LLVM con `libclang.dll` accessibile a `bindgen`, insieme a CMake e agli strumenti C++ MSVC: il binding Rust compila `llama.cpp` nell’app. Chi installa l’installer non deve installare questi strumenti.
