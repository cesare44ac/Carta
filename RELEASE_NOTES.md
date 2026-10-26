# Carta 2.1.9

Carta è un lettore desktop per libri EPUB, con annotazioni e assistente AI locale.

## Lettura e annotazioni

- Importazione e lettura di libri EPUB, con avanzamento salvato, stima del tempo rimanente e scelta rapida della posizione.
- Testo regolabile per colonne, dimensione e spaziatura.
- Note collegate ai passaggi e raccolta separata delle evidenziazioni, con colori selezionabili.
- Pannelli laterali richiudibili e assistente AI agganciabile accanto al libro.

## Assistente e integrazioni

- Chat persistente con Qwen, in grado di spiegare, tradurre e riassumere passaggi del libro.
- Comandi per cercare contenuti nella libreria, aggiungere note o evidenziazioni e controllare la lettura.
- Ricerca online facoltativa con risultati da Google Books e Wikipedia.
- Controlli Spotify disponibili durante la lettura.

## Interfaccia

- Interfaccia in italiano e inglese.
- Modalità scura rinnovata, sfumatura lilla laterale e logo aggiornato.
- Barra superiore compatta con pagina, avanzamento, stima di lettura e controlli essenziali.

## Correzioni in questa versione

- Corretto il ridimensionamento delle immagini EPUB nella build desktop: i limiti vengono applicati direttamente a immagini e figure per evitare che invadano il testo delle pagine vicine.
- Migliorato il ridisegno del libro quando cambia la larghezza dell’area di lettura.

## Download

Installer Windows x64 in formato NSIS. Qwen non è incluso nell’installer: viene scaricato dall’app solo quando l’utente lo richiede. Se WebView2 manca, l’installer avvia il bootstrapper Microsoft.