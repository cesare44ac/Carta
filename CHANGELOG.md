# Registro delle modifiche

## 1.0.12

- Collegati i pulsanti AI agli eventi desktop Tauri, così funzionano anche con la CSP della build di produzione.

## 1.0.11

- Aggiornate le GitHub Actions al runtime Node.js 24 per eliminare gli avvisi di deprecazione.
- L'assistente mostra ora il motivo restituito da Tauri quando non riesce a verificare lo stato del modello Qwen.

## 1.0.10

- Aggiunta una chat AI locale per ogni libro, con cronologia salvata sul dispositivo e comando per iniziare una nuova conversazione.
- Resi più sicuri i suggerimenti rapidi AI limitando il testo inviato, impedendo richieste simultanee e contenendo la lunghezza delle risposte.
- Aggiunto il rendering LaTeX locale con KaTeX, comprese formule su più righe.
- Aggiunti i controlli Spotify nella barra di lettura.
- Aggiunti i permessi Tauri per gli eventi di avanzamento del download di Qwen.
- L’assistente Qwen resta facoltativo: il modello viene scaricato dall’utente e non è incluso nell’installer.
