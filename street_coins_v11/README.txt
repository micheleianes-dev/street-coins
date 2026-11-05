STREET COINS V11
- Collegamento Supabase già configurato con Project URL e Publishable key.
- Login e registrazione giocatori via Supabase Auth.
- Raccolte personali nella tabella coin_collections.
- Pannello admin per modificare coordinate, colore e immagine delle monete.
- Primo accesso admin: premi il pulsante Admin e poi "Crea 100 monete fisse a Trento".
- Le 100 posizioni vengono generate una sola volta da geometrie stradali OSM e salvate nella tabella coins.
- Richiede tabelle, RLS, grants e bucket coin-images già creati nei passaggi precedenti.
