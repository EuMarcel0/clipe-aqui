-- Corrige vazamento: SELECT público (is_public) era OR com “own clips”,
-- então a biblioteca listava clips públicos de outros usuários.
-- Share passa a usar RPC security definer.

drop policy if exists "Public can read shared clips" on public.clips;

-- Autenticado: só os próprios clips (já existe, reforçamos)
drop policy if exists "Users read own clips" on public.clips;
create policy "Users read own clips"
  on public.clips for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own clips" on public.clips;
create policy "Users insert own clips"
  on public.clips for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own clips" on public.clips;
create policy "Users update own clips"
  on public.clips for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own clips" on public.clips;
create policy "Users delete own clips"
  on public.clips for delete
  to authenticated
  using (auth.uid() = user_id);

-- Link /s/:token — leitura pontual sem abrir a tabela toda
create or replace function public.get_public_clip_by_token(p_token text)
returns setof public.clips
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.clips
  where share_token = p_token
    and is_public = true
  limit 1;
$$;

revoke all on function public.get_public_clip_by_token(text) from public;
grant execute on function public.get_public_clip_by_token(text) to anon, authenticated;
