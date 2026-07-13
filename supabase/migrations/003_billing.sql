-- Clipe Aqui — billing: free 10 lifetime creates + créditos Stripe
-- Rode no SQL Editor do Supabase após 002_users.sql

alter table public.users
  add column if not exists credits integer not null default 0
    check (credits >= 0),
  add column if not exists lifetime_clips_created integer not null default 0
    check (lifetime_clips_created >= 0),
  add column if not exists stripe_customer_id text;

comment on column public.users.credits is 'Créditos pagos restantes (1 crédito = 1 clip criado)';
comment on column public.users.lifetime_clips_created is 'Total de clips já criados (lifetime; apagar não volta)';

-- Eventos Stripe (idempotência do webhook)
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

-- Backfill: conta clips existentes como creates já usados
update public.users u
set lifetime_clips_created = greatest(
  u.lifetime_clips_created,
  coalesce((
    select count(*)::integer from public.clips c where c.user_id = u.id
  ), 0)
);

-- Client autenticado só edita perfil — nunca credits / lifetime / stripe
revoke update on table public.users from authenticated;
grant update (email, full_name, whatsapp, updated_at) on table public.users to authenticated;

-- INSERT pelo client não pode inventar créditos
create or replace function public.users_billing_on_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    new.credits := 0;
    new.lifetime_clips_created := coalesce(
      (select count(*)::integer from public.clips c where c.user_id = new.id),
      0
    );
    new.stripe_customer_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists users_billing_on_insert on public.users;
create trigger users_billing_on_insert
  before insert on public.users
  for each row execute function public.users_billing_on_insert();

-- Status de billing do usuário logado
create or replace function public.get_billing_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  free_limit int := 10;
  u public.users%rowtype;
  free_left int;
  can_create boolean;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  select * into u from public.users where id = uid;
  if not found then
    insert into public.users (id, email)
    values (uid, '')
    returning * into u;
  end if;

  free_left := greatest(0, free_limit - u.lifetime_clips_created);
  can_create := free_left > 0 or u.credits > 0;

  return jsonb_build_object(
    'free_limit', free_limit,
    'lifetime_clips_created', u.lifetime_clips_created,
    'free_remaining', free_left,
    'credits', u.credits,
    'can_create', can_create
  );
end;
$$;

revoke all on function public.get_billing_status() from public;
grant execute on function public.get_billing_status() to authenticated;

-- Cria clip consumindo free lifetime ou 1 crédito
create or replace function public.create_clip_with_quota(
  p_title text,
  p_source_filename text,
  p_duration_seconds numeric,
  p_start_seconds numeric,
  p_end_seconds numeric
)
returns public.clips
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  free_limit int := 10;
  u public.users%rowtype;
  new_clip public.clips;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  select * into u from public.users where id = uid for update;
  if not found then
    insert into public.users (id, email)
    values (uid, '')
    returning * into u;
    select * into u from public.users where id = uid for update;
  end if;

  if u.lifetime_clips_created < free_limit then
    update public.users
    set lifetime_clips_created = lifetime_clips_created + 1,
        updated_at = now()
    where id = uid;
  elsif u.credits > 0 then
    update public.users
    set credits = credits - 1,
        lifetime_clips_created = lifetime_clips_created + 1,
        updated_at = now()
    where id = uid;
  else
    raise exception 'QUOTA_EXCEEDED'
      using hint = 'Limite grátis de 10 clips atingido. Compre créditos para continuar.';
  end if;

  insert into public.clips (
    user_id,
    title,
    source_filename,
    duration_seconds,
    start_seconds,
    end_seconds,
    status
  )
  values (
    uid,
    coalesce(nullif(trim(p_title), ''), 'Clip sem título'),
    p_source_filename,
    p_duration_seconds,
    coalesce(p_start_seconds, 0),
    p_end_seconds,
    'processing'
  )
  returning * into new_clip;

  return new_clip;
end;
$$;

revoke all on function public.create_clip_with_quota(text, text, numeric, numeric, numeric) from public;
grant execute on function public.create_clip_with_quota(text, text, numeric, numeric, numeric) to authenticated;
