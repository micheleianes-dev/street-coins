-- STREET COINS V34: data di raccolta e storage avatar
-- Eseguire una sola volta nel Supabase SQL Editor prima di usare le nuove funzioni.

begin;

alter table public.coin_collections
  add column if not exists collected_at timestamptz not null default now();

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='coin_collections' and column_name='created_at') then
    execute 'update public.coin_collections set collected_at = created_at where created_at is not null';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true, file_size_limit=2097152, allowed_mime_types=array['image/png','image/jpeg','image/webp'];

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable" on storage.objects for select using (bucket_id='avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar" on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar" on storage.objects for update to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar" on storage.objects for delete to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

commit;

select coin_id, user_id, collected_at from public.coin_collections order by collected_at desc limit 20;
