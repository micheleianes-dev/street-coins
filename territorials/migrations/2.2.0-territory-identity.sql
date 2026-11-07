-- Territorials 2.2.0: identità del territorio e avatar pubblici
alter table public.territorials_zones
  add column if not exists territory_name text,
  add column if not exists owner_avatar_url text;

update public.territorials_zones
set territory_name = coalesce(nullif(territory_name, ''), 'Territorio di ' || owner_name)
where territory_name is null or territory_name = '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('territory-avatars', 'territory-avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Territory avatars are publicly readable" on storage.objects;
create policy "Territory avatars are publicly readable" on storage.objects for select using (bucket_id='territory-avatars');

drop policy if exists "Players upload their own territory avatar" on storage.objects;
create policy "Players upload their own territory avatar" on storage.objects for insert to authenticated with check (bucket_id='territory-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Players update their own territory avatar" on storage.objects;
create policy "Players update their own territory avatar" on storage.objects for update to authenticated using (bucket_id='territory-avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='territory-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Players delete their own territory avatar" on storage.objects;
create policy "Players delete their own territory avatar" on storage.objects for delete to authenticated using (bucket_id='territory-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
