-- Clipe Aqui — schema (não altera tabelas existentes)
-- Rode no SQL Editor do Supabase

create extension if not exists "pgcrypto";

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  title text not null default 'Sem título',
  source_filename text,
  duration_seconds numeric(10, 3),
  start_seconds numeric(10, 3) not null default 0,
  end_seconds numeric(10, 3),
  s3_key text,
  s3_url text,
  thumbnail_url text,
  captions jsonb default '[]'::jsonb,
  captions_vtt text,
  share_token text unique default encode(gen_random_bytes(12), 'hex'),
  is_public boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'ready', 'failed')),
  transcription_cost_usd numeric(10, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clips_user_id_idx on public.clips (user_id);
create index if not exists clips_share_token_idx on public.clips (share_token);
create index if not exists clips_created_at_idx on public.clips (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clips_set_updated_at on public.clips;
create trigger clips_set_updated_at
  before update on public.clips
  for each row execute function public.set_updated_at();

alter table public.clips enable row level security;

drop policy if exists "Users read own clips" on public.clips;
create policy "Users read own clips"
  on public.clips for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own clips" on public.clips;
create policy "Users insert own clips"
  on public.clips for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own clips" on public.clips;
create policy "Users update own clips"
  on public.clips for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own clips" on public.clips;
create policy "Users delete own clips"
  on public.clips for delete
  using (auth.uid() = user_id);

drop policy if exists "Public can read shared clips" on public.clips;
create policy "Public can read shared clips"
  on public.clips for select
  using (is_public = true and share_token is not null);
