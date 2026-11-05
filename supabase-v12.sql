alter table public.coins
  add column if not exists name text not null default '',
  add column if not exists description text not null default '';
