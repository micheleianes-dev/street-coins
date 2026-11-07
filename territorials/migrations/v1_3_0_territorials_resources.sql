-- Territorials v1.3.0: risorse rilevate da OpenStreetMap per ogni territorio
alter table public.territorials_zones
 add column if not exists resources jsonb not null default '{"status":"unknown","items":[]}'::jsonb;
comment on column public.territorials_zones.resources is 'Risorse cartografiche OSM: categorie e superfici effettivamente mappate nel poligono.';
