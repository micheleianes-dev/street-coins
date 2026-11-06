-- STREET COINS V48: icone per collezione
-- Eseguire una sola volta nel Supabase SQL Editor prima di pubblicare V48.
begin;
alter table public.categories
  add column if not exists icon_symbol text not null default '✦',
  add column if not exists icon_image_path text;
update public.categories
set icon_symbol='✦'
where icon_symbol is null or btrim(icon_symbol)='';
commit;

select id,name,icon_symbol,icon_image_path
from public.categories
order by name;
