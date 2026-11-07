-- Territorials v1.4.0: ogni giocatore può possedere una sola zona.
-- Se esistono già più zone per lo stesso proprietario, risolvere i duplicati prima di eseguire questa migrazione.
create unique index if not exists territorials_zones_one_per_owner_idx
 on public.territorials_zones(owner_id);
