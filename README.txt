STREET COINS — PROTOTIPO 4
Correzioni caricamento monete:
- Quattro istanze Overpass in fallback sequenziale.
- Query semplificata, timeout esteso e cache riutilizzata solo con risultati non vuoti.
- Dopo un errore, niente tentativi automatici ripetuti a ogni aggiornamento GPS: attende 45 secondi.
- Il messaggio mostra il motivo tecnico (es. server 429/504 o errore di rete).
- Il pulsante ↻ forza un nuovo tentativo.
GPS e caricamento strade sono separati: il GPS può funzionare anche quando Overpass non risponde.
Carica la cartella street_coins_prototipo_v4 su Netlify.
