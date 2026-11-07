-- Territorials v1.2.0: zone persistenti con proprietario
create table if not exists public.territorials_zones (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 owner_name text not null check (char_length(owner_name) between 1 and 40),
 points jsonb not null check (jsonb_typeof(points)='array' and jsonb_array_length(points)>=3),
 area_m2 numeric not null check (area_m2>=0),
 perimeter_m numeric not null check (perimeter_m>=0),
 distance_m numeric not null check (distance_m>=0),
 created_at timestamptz not null default now()
);
create index if not exists territorials_zones_owner_idx on public.territorials_zones(owner_id);
create index if not exists territorials_zones_created_idx on public.territorials_zones(created_at desc);
alter table public.territorials_zones enable row level security;
drop policy if exists "Authenticated users can view territories" on public.territorials_zones;
create policy "Authenticated users can view territories" on public.territorials_zones for select to authenticated using (true);
drop policy if exists "Players can create own territories" on public.territorials_zones;
create policy "Players can create own territories" on public.territorials_zones for insert to authenticated with check (auth.uid()=owner_id);
drop policy if exists "Players can update own territories" on public.territorials_zones;
create policy "Players can update own territories" on public.territorials_zones for update to authenticated using (auth.uid()=owner_id) with check (auth.uid()=owner_id);
drop policy if exists "Players can delete own territories" on public.territorials_zones;
create policy "Players can delete own territories" on public.territorials_zones for delete to authenticated using (auth.uid()=owner_id);
