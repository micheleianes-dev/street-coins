-- STREET COINS V38: progressi personali e distanza a piedi
-- Eseguire una sola volta nel Supabase SQL Editor prima di pubblicare V38.
begin;
create table if not exists public.player_progress (
 user_id uuid primary key references auth.users(id) on delete cascade,
 walking_distance_m double precision not null default 0 check (walking_distance_m >= 0),
 updated_at timestamptz not null default now()
);
alter table public.player_progress enable row level security;
drop policy if exists "Players read own progress" on public.player_progress;
create policy "Players read own progress" on public.player_progress
 for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Players insert own progress" on public.player_progress;
create policy "Players insert own progress" on public.player_progress
 for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Players update own progress" on public.player_progress;
create policy "Players update own progress" on public.player_progress
 for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.player_progress to authenticated;
commit;
select user_id, walking_distance_m, updated_at from public.player_progress;
