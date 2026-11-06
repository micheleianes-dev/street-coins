-- STREET COINS V37: anagrafica categorie
-- Eseguire una sola volta nel Supabase SQL Editor prima di pubblicare V37.
begin;
create table if not exists public.categories (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 description text not null default '',
 color text not null default '#ff6eae',
 image_path text,
 created_at timestamptz not null default now(),
 constraint categories_color_format check (color ~ '^#[0-9A-Fa-f]{6}$')
);
alter table public.categories enable row level security;
drop policy if exists "Categories are readable by everyone" on public.categories;
create policy "Categories are readable by everyone" on public.categories for select using (true);
drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories" on public.categories for all
 using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
 with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
insert into public.categories(name,description,color)
select distinct coalesce(nullif(btrim(category),''),'Generale'),
       case when coalesce(nullif(btrim(category),''),'Generale')='Generale' then 'Categoria predefinita' else '' end,
       coalesce((select c.color from public.coins c where coalesce(nullif(btrim(c.category),''),'Generale')=coalesce(nullif(btrim(coins.category),''),'Generale') order by c.code limit 1),'#ff6eae')
from public.coins
on conflict(name) do nothing;
insert into public.categories(name,description,color) values('Generale','Categoria predefinita','#ff6eae') on conflict(name) do nothing;
commit;
select * from public.categories order by name;
