-- Free: corte máximo 50s quando ainda não tem créditos pagos

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
  free_max_seconds numeric := 50;
  clip_len numeric;
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

  clip_len := greatest(0, coalesce(p_end_seconds, 0) - coalesce(p_start_seconds, 0));

  -- Sem créditos = free → teto de duração
  if coalesce(u.credits, 0) <= 0 and clip_len > free_max_seconds + 0.05 then
    raise exception 'FREE_CLIP_TOO_LONG'
      using hint = format(
        'No plano free o corte máximo é de %s segundos. Compre créditos para clips maiores.',
        free_max_seconds
      );
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
