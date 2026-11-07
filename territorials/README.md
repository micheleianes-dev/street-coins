# Territorials — V1

Prima versione prototipale dello spinoff di Street Coins.

## Funzioni
- Mappa Leaflet con posizione GPS.
- Avvio e annullamento del tracciamento.
- Disegno del percorso GPS in tempo reale.
- Chiusura automatica quando il giocatore torna entro 24 metri dal punto iniziale.
- Creazione e visualizzazione del poligono territoriale.
- Indicatore in sovrimpressione: zona libera / proprio territorio.
- Calcolo indicativo della distanza e dell'area.

## Limiti della V1
- I territori sono conservati solo in memoria durante la sessione: non sono ancora condivisi né salvati su un database.
- Non sono implementati conflitti, sovrapposizioni o notifiche agli altri giocatori.
- La chiusura automatica richiede almeno 5 punti GPS, accuratezza massima 35 m e area stimata di almeno 250 m².
- Il GPS del browser richiede HTTPS e autorizzazione alla posizione.
