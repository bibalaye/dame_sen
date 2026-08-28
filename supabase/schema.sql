-- =============================================================================
-- Dame Sen — schéma des comptes joueurs
-- =============================================================================
--
-- À exécuter une fois dans l'éditeur SQL de Supabase (SQL Editor > New query).
-- Le script est réexécutable : il ne détruit rien et ignore ce qui existe déjà.
--
-- Principe de sécurité
-- --------------------
-- Le navigateur détient un jeton qui lui permet d'appeler l'API directement.
-- Si on laissait le client écrire son propre solde, se donner un million
-- d'étoiles tiendrait en une ligne dans la console. Toutes les tables sont donc
-- en lecture seule pour le joueur, et chaque gain passe par une fonction
-- « security definer » qui applique le barème côté serveur.
--
-- Le barème est écrit deux fois : ici, et dans src/lib/economy.ts. Le client
-- l'affiche, le serveur en décide. Toute modification doit toucher les deux.
-- =============================================================================

-- --- Profils ----------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,

  -- Forme canonique du pseudo : minuscules, sans accent. Unique.
  handle text not null unique,
  -- Pseudo tel que le joueur l'a écrit, avec sa casse et ses accents.
  display_name text not null,

  stars integer not null default 0 check (stars >= 0),
  earned integer not null default 0 check (earned >= 0),
  unlocked text[] not null default array['cauri'],
  piece_set text not null default 'cauri',

  last_visit_day integer not null default 0,
  visit_streak integer not null default 0,

  daily_last_number integer not null default 0,
  daily_streak integer not null default 0,
  daily_solved_count integer not null default 0,

  -- La reprise d'une progression hors compte n'a lieu qu'une fois.
  imported boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --- Parties ----------------------------------------------------------------

create table if not exists public.games (
  -- Identifiant produit par le client à partir de l'horodatage : deux
  -- appareils ne le produisent pas identique pour deux parties différentes,
  -- et rejouer l'envoi de la même partie reste sans effet.
  id text not null,
  player_id uuid not null references public.profiles(id) on delete cascade,

  game text not null check (game in ('dames', 'morpion')),
  mode text not null check (mode in ('solo', 'pass', 'online', 'daily')),
  result text not null check (result in ('win', 'loss', 'draw')),
  opponent text not null default '',
  detail text,
  played_at bigint not null,

  primary key (player_id, id)
);

create index if not exists games_player_played_at_idx
  on public.games (player_id, played_at desc);

-- --- Verrouillage en écriture ------------------------------------------------

alter table public.profiles enable row level security;
alter table public.games enable row level security;

-- Un joueur lit son profil entier.
drop policy if exists "profil visible par son proprietaire" on public.profiles;
create policy "profil visible par son proprietaire"
  on public.profiles for select
  using (auth.uid() = id);

-- Aucune politique d'insert, d'update ni de delete sur profiles ni sur games :
-- l'absence de politique vaut refus. Tout passe par les fonctions ci-dessous.

drop policy if exists "parties visibles par leur joueur" on public.games;
create policy "parties visibles par leur joueur"
  on public.games for select
  using (auth.uid() = player_id);

-- --- Classement --------------------------------------------------------------

-- Une vue n'expose que le nécessaire : pas de solde, pas d'identifiant de
-- compte. Elle est en « security invoker » désactivé afin de rester lisible par
-- tous les joueurs connectés, sans ouvrir la table des profils.
create or replace view public.leaderboard
with (security_invoker = off) as
  select
    p.display_name,
    p.handle,
    count(*) filter (where g.result = 'win') as wins,
    count(*) as played,
    p.daily_streak
  from public.profiles p
  join public.games g on g.player_id = p.id
  group by p.id, p.display_name, p.handle, p.daily_streak
  having count(*) >= 5
  order by wins desc, played asc
  limit 100;

grant select on public.leaderboard to authenticated;

-- --- Barème (miroir de src/lib/economy.ts) -----------------------------------

create or replace function public.reward_amount(reason text)
returns integer
language sql
immutable
as $$
  select case reason
    when 'played'            then 10
    when 'win'               then 25
    when 'streak'            then 100
    when 'daily-solved'      then 50
    when 'daily-login'       then 20
    when 'daily-login-week'  then 500
    else 0
  end;
$$;

create or replace function public.piece_set_price(set_id text)
returns integer
language sql
immutable
as $$
  select case set_id
    when 'cauri'   then 0
    when 'sabar'   then 300
    when 'teranga' then 600
    when 'baobab'  then 1000
    when 'donjon'  then 1500
    when 'jetons'  then 2000
    else null
  end;
$$;

-- --- Création du profil ------------------------------------------------------

-- Appelée juste après l'inscription. Le pseudo canonique vient déjà de
-- l'adresse interne fabriquée par le client, mais on ne s'y fie pas : c'est
-- l'unicité de la colonne qui tranche.
create or replace function public.create_profile(
  p_handle text,
  p_display_name text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  insert into public.profiles (id, handle, display_name)
  values (v_uid, lower(p_handle), left(p_display_name, 20))
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

-- --- Venue du jour -----------------------------------------------------------

-- Le jour est calculé ici, pas chez le client : avancer l'horloge de son
-- téléphone ne doit pas distribuer d'étoiles.
create or replace function public.claim_daily_visit()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_today integer := floor(extract(epoch from now()) / 86400)::integer;
  v_profile public.profiles;
  v_streak integer;
  v_rewards text[] := array[]::text[];
  v_gain integer := 0;
  v_reason text;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profil introuvable';
  end if;

  -- Déjà passé aujourd'hui : rien à donner.
  if v_profile.last_visit_day = v_today then
    return jsonb_build_object('rewards', v_rewards, 'stars', v_profile.stars);
  end if;

  if v_profile.last_visit_day = v_today - 1 then
    v_streak := v_profile.visit_streak + 1;
  else
    v_streak := 1;
  end if;

  v_rewards := array['daily-login'];
  if v_streak % 7 = 0 then
    v_rewards := v_rewards || 'daily-login-week';
  end if;

  foreach v_reason in array v_rewards loop
    v_gain := v_gain + public.reward_amount(v_reason);
  end loop;

  update public.profiles
    set last_visit_day = v_today,
        visit_streak = v_streak,
        stars = stars + v_gain,
        earned = earned + v_gain,
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object(
    'rewards', v_rewards,
    'stars', v_profile.stars,
    'visitStreak', v_streak
  );
end;
$$;

-- --- Enregistrement d'une partie ---------------------------------------------

create or replace function public.record_game(
  p_id text,
  p_game text,
  p_mode text,
  p_result text,
  p_opponent text,
  p_detail text,
  p_played_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_inserted integer;
  v_last_setback bigint;
  v_streak integer;
  v_rewards text[] := array['played'];
  v_gain integer := 0;
  v_reason text;
  v_stars integer;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  insert into public.games (id, player_id, game, mode, result, opponent, detail, played_at)
  values (p_id, v_uid, p_game, p_mode, p_result, left(coalesce(p_opponent, ''), 40),
          left(p_detail, 120), p_played_at)
  on conflict (player_id, id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Renvoyer la même partie deux fois ne rapporte rien : sans cela, un appel
  -- rejoué par le réseau créditerait autant de fois qu'il est répété.
  if v_inserted = 0 then
    select stars into v_stars from public.profiles where id = v_uid;
    return jsonb_build_object('rewards', array[]::text[], 'stars', v_stars,
                              'duplicate', true);
  end if;

  -- Le défi du jour a son propre barème, réglé ailleurs.
  if p_mode = 'daily' then
    select stars into v_stars from public.profiles where id = v_uid;
    return jsonb_build_object('rewards', array[]::text[], 'stars', v_stars);
  end if;

  if p_result = 'win' then
    v_rewards := v_rewards || 'win';

    -- Série en cours : les victoires postérieures au dernier faux pas.
    select coalesce(max(played_at), 0) into v_last_setback
      from public.games
      where player_id = v_uid and result <> 'win' and mode <> 'daily';

    select count(*) into v_streak
      from public.games
      where player_id = v_uid and result = 'win' and mode <> 'daily'
        and played_at > v_last_setback;

    if v_streak > 0 and v_streak % 3 = 0 then
      v_rewards := v_rewards || 'streak';
    end if;
  end if;

  foreach v_reason in array v_rewards loop
    v_gain := v_gain + public.reward_amount(v_reason);
  end loop;

  update public.profiles
    set stars = stars + v_gain,
        earned = earned + v_gain,
        updated_at = now()
    where id = v_uid
    returning stars into v_stars;

  return jsonb_build_object('rewards', v_rewards, 'stars', v_stars,
                            'streak', coalesce(v_streak, 0));
end;
$$;

-- --- Défi du jour ------------------------------------------------------------

create or replace function public.record_daily(
  p_number integer,
  p_solved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_streak integer;
  v_gain integer := 0;
  v_rewards text[] := array[]::text[];
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;

  -- Le même défi ne compte qu'une fois, quel que soit le nombre d'essais.
  if v_profile.daily_last_number = p_number then
    return jsonb_build_object('rewards', v_rewards, 'stars', v_profile.stars,
                              'dailyStreak', v_profile.daily_streak);
  end if;

  if p_solved and v_profile.daily_last_number = p_number - 1 then
    v_streak := v_profile.daily_streak + 1;
  elsif p_solved then
    v_streak := 1;
  else
    v_streak := 0;
  end if;

  if p_solved then
    v_rewards := array['daily-solved'];
    v_gain := public.reward_amount('daily-solved');
  end if;

  update public.profiles
    set daily_last_number = p_number,
        daily_streak = v_streak,
        daily_solved_count = daily_solved_count + (case when p_solved then 1 else 0 end),
        stars = stars + v_gain,
        earned = earned + v_gain,
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object('rewards', v_rewards, 'stars', v_profile.stars,
                            'dailyStreak', v_streak);
end;
$$;

-- --- Déblocage et choix des pions --------------------------------------------

create or replace function public.unlock_piece_set(p_set_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_price integer := public.piece_set_price(p_set_id);
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;
  if v_price is null then
    raise exception 'jeu de pions inconnu';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;

  if p_set_id = any(v_profile.unlocked) then
    return jsonb_build_object('stars', v_profile.stars, 'unlocked', v_profile.unlocked);
  end if;
  if v_profile.stars < v_price then
    raise exception 'solde insuffisant';
  end if;

  update public.profiles
    set stars = stars - v_price,
        unlocked = unlocked || p_set_id,
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object('stars', v_profile.stars, 'unlocked', v_profile.unlocked);
end;
$$;

create or replace function public.set_piece_set(p_set_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  -- On ne met en jeu que ce qui est acquis : sans ce contrôle, le déblocage ne
  -- servirait à rien.
  if not (p_set_id = any(v_profile.unlocked)) then
    raise exception 'jeu de pions non debloque';
  end if;

  update public.profiles
    set piece_set = p_set_id, updated_at = now()
    where id = v_uid;

  return jsonb_build_object('pieceSet', p_set_id);
end;
$$;

-- --- Reprise d'une progression hors compte ------------------------------------

-- Le contenu du navigateur se modifie à la main. Le solde repris est donc
-- plafonné, et l'opération refusée au second appel. Rien d'argent réel n'étant
-- en jeu, ce garde-fou simple vaut mieux qu'un dispositif compliqué.
create or replace function public.import_local_progress(
  p_stars integer,
  p_games jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_cap constant integer := 1000;
  v_stars integer := least(greatest(coalesce(p_stars, 0), 0), v_cap);
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;

  if v_profile.imported then
    return jsonb_build_object('imported', false, 'reason', 'deja repris');
  end if;

  insert into public.games (id, player_id, game, mode, result, opponent, detail, played_at)
  select
    entry->>'id',
    v_uid,
    entry->>'game',
    entry->>'mode',
    entry->>'result',
    left(coalesce(entry->>'opponent', ''), 40),
    left(entry->>'detail', 120),
    (entry->>'playedAt')::bigint
  from (
    select value as entry
    from jsonb_array_elements(coalesce(p_games, '[]'::jsonb))
    limit 200
  ) as source
  -- Une entrée abîmée ne doit pas faire échouer toute la reprise : on écarte
  -- ce qui ne rentre pas dans les colonnes plutôt que de laisser lever.
  where entry->>'id' is not null
    and entry->>'playedAt' ~ '^[0-9]+$'
    and entry->>'game' in ('dames', 'morpion')
    and entry->>'mode' in ('solo', 'pass', 'online', 'daily')
    and entry->>'result' in ('win', 'loss', 'draw')
  on conflict (player_id, id) do nothing;

  get diagnostics v_count = row_count;

  update public.profiles
    set stars = stars + v_stars,
        earned = earned + v_stars,
        imported = true,
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object('imported', true, 'stars', v_profile.stars,
                            'games', v_count);
end;
$$;

-- --- Droits ------------------------------------------------------------------

-- Seuls les comptes connectés appellent ces fonctions. La clé publique du site
-- ne donne rien de plus qu'un compte anonyme.
revoke all on function public.create_profile(text, text) from public, anon;
revoke all on function public.claim_daily_visit() from public, anon;
revoke all on function public.record_game(text, text, text, text, text, text, bigint) from public, anon;
revoke all on function public.record_daily(integer, boolean) from public, anon;
revoke all on function public.unlock_piece_set(text) from public, anon;
revoke all on function public.set_piece_set(text) from public, anon;
revoke all on function public.import_local_progress(integer, jsonb) from public, anon;

grant execute on function public.create_profile(text, text) to authenticated;
grant execute on function public.claim_daily_visit() to authenticated;
grant execute on function public.record_game(text, text, text, text, text, text, bigint) to authenticated;
grant execute on function public.record_daily(integer, boolean) to authenticated;
grant execute on function public.unlock_piece_set(text) to authenticated;
grant execute on function public.set_piece_set(text) to authenticated;
grant execute on function public.import_local_progress(integer, jsonb) to authenticated;
