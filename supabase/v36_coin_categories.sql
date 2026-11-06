-- STREET COINS V36: categorie delle monete
-- Eseguire una sola volta nel Supabase SQL Editor prima di usare V36.

begin;

alter table public.coins
  add column if not exists category text not null default 'Generale';

update public.coins
set category = 'Generale'
where category is null or btrim(category) = '';

-- Le monete già esistenti mantengono il colore attuale e vengono assegnate
-- alla categoria Generale. Le nuove categorie assumono il colore scelto in Admin.

commit;

select id, code, name, category, color
from public.coins
order by category, code;
