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
