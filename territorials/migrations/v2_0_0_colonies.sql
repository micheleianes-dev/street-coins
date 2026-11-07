-- Territorials v2.0.0: stato persistente della colonia e produzione offline.
create table if not exists public.territorials_colonies (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 population integer not null default 1 check (population >= 1),
 assignments jsonb not null default '{}'::jsonb,
 inventory jsonb not null default '{}'::jsonb,
 last_tick timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.territorials_colonies enable row level security;

drop policy if exists "Players can read own colony" on public.territorials_colonies;
create policy "Players can read own colony" on public.territorials_colonies for select using (auth.uid() = owner_id);

drop policy if exists "Players can create own colony" on public.territorials_colonies;
create policy "Players can create own colony" on public.territorials_colonies for insert with check (auth.uid() = owner_id);

drop policy if exists "Players can update own colony" on public.territorials_colonies;
create policy "Players can update own colony" on public.territorials_colonies for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Players can delete own colony" on public.territorials_colonies;
create policy "Players can delete own colony" on public.territorials_colonies for delete using (auth.uid() = owner_id);
