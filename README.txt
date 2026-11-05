STREET COINS V10

- Il GPS è obbligatorio: senza coordinate GPS l'app non cerca strade e non genera monete.
- Niente città predefinite, posizioni inventate o ricerca manuale sulla mappa.
- Monete generate esclusivamente dalla geometria stradale OpenStreetMap, con spaziatura nominale di 50 metri.
- I server cartografici vengono interrogati contemporaneamente: il caricamento termina entro circa 12 secondi, con un messaggio in caso di errore.
- GPS con timeout di 20 secondi; messaggi distinti per permesso negato, posizione assente o GPS lento.
- Raccolta automatica sospesa se la precisione GPS supera 35 metri.
- Versione V9 sempre visibile in basso a sinistra.
- Cache-busting su app.js, styles.css e manifest; service worker precedente disattivato.

V10: aggiornati gli endpoint Overpass; usa Private.coffee, Overpass Europe e overpass-api.de.
