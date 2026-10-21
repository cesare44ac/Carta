# Carta

Carta è un lettore desktop EPUB per Windows, con libreria, note, evidenziazioni e modalità di lettura personalizzabili.

## Scaricare l'app

Gli installer Windows sono pubblicati nella sezione **Releases** di GitHub. Scarica il file `.exe` dell'ultima versione e avvialo. Se il runtime WebView2 non è presente, l'installer ne scarica il bootstrapper.

## Pubblicare una nuova versione

1. Aggiorna il numero versione in `package.json`, `desktop/src-tauri/tauri.conf.json` e `desktop/src-tauri/Cargo.toml` (mantieni gli stessi tre numeri). Aggiorna anche la versione del pacchetto Carta in `desktop/src-tauri/Cargo.lock`.
2. Crea e invia un tag con lo stesso numero, per esempio `v1.0.2`.
3. GitHub Actions compila l'installer Windows e lo allega a una Release. Il workflow richiede solo il token automatico del repository.

La build di release è configurata in `.github/workflows/release-windows.yml`. Per ora il workflow produce l'installer NSIS per Windows x64.

## Sviluppare

Servono Node.js 22, pnpm 9.15.5, Rust per il target Windows MSVC, Microsoft C++ Build Tools e WebView2.

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
