-- =============================================================================
-- Dame Sen — schéma des comptes joueurs et de la boutique
-- =============================================================================
--
-- À exécuter dans l'éditeur SQL de Supabase (SQL Editor > New query).
-- Le script est réexécutable : il ne détruit rien, migre ce qui doit l'être, et
-- doit être rejoué après chaque mise à jour de ce fichier.
--
-- Principe de sécurité
-- --------------------
-- Le navigateur détient un jeton qui lui permet d'appeler l'API directement.
-- Si on laissait le client écrire son propre solde, se donner un million de
-- cauris tiendrait en une ligne dans la console. Toutes les tables sont donc en
-- lecture seule pour le joueur, et chaque gain passe par une fonction
-- « security definer » qui applique le barème côté serveur.
--
-- Le barème est écrit deux fois : ici, et dans src/lib/economy.ts. Le client
-- l'affiche, le serveur en décide. Un test compare les deux (npm run test:sql).
-- =============================================================================

-- --- Profils ----------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,

  -- Forme canonique du pseudo : minuscules, sans accent. Unique.
  handle text not null unique,
  -- Pseudo tel que le joueur l'a écrit, avec sa casse et ses accents.
  display_name text not null,

  coins integer not null default 0 check (coins >= 0),
  earned integer not null default 0 check (earned >= 0),

  -- Articles possédés, toutes familles confondues : « pieces:sabar »,
  -- « board:wax », « title:arene »… Une seule colonne évite une migration à
  -- chaque nouvelle famille d'articles.
  owned text[] not null default array[]::text[],

  -- Ce que le joueur porte.
  piece_set text not null default 'cauri',
  board_theme text not null default 'bois',
  frame text,
  title text,

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

-- --- Reprise des bases installées avant la boutique --------------------------

-- « stars » est devenu « coins », et « unlocked » — qui ne listait que des jeux
-- de pions — est devenu « owned », qui liste des articles préfixés par leur
-- famille. Sans cette reprise, une base déjà en service perdrait les deux.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'stars'
  ) then
    alter table public.profiles rename column stars to coins;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'unlocked'
  ) then
    alter table public.profiles rename column unlocked to owned;

    -- Les anciens identifiants n'avaient pas de famille : « sabar » désignait
    -- forcément des pions.
    update public.profiles
      set owned = (
        select coalesce(array_agg(
          case when item like '%:%' then item else 'pieces:' || item end
        ), array[]::text[])
        from unnest(owned) as item
        where item <> 'cauri'
      );
  end if;
end $$;

alter table public.profiles add column if not exists board_theme text not null default 'bois';
alter table public.profiles add column if not exists frame text;
alter table public.profiles add column if not exists title text;

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

-- --- Catalogue ---------------------------------------------------------------

-- Les prix vivent dans une table, pas dans une fonction : ajouter un article ne
-- doit pas demander de réécrire du code, et un test peut comparer cette table
-- au catalogue de src/lib/shop.ts.
create table if not exists public.catalog (
  id text primary key,
  kind text not null check (kind in ('pieces', 'board', 'feature', 'frame', 'title')),
  price integer not null check (price >= 0)
);

insert into public.catalog (id, kind, price) values
  -- Pions
  ('pieces:cauri',      'pieces', 0),
  ('pieces:sabar',      'pieces', 150),
  ('pieces:teranga',    'pieces', 250),
  ('pieces:sable',      'pieces', 250),
  ('pieces:baobab',     'pieces', 500),
  ('pieces:jetons',     'pieces', 500),
  ('pieces:village',    'pieces', 700),
  ('pieces:quilles',    'pieces', 700),
  ('pieces:donjon',     'pieces', 900),
  ('pieces:pirogue',    'pieces', 1400),
  ('pieces:lutte',      'pieces', 1400),
  ('pieces:goree',      'pieces', 1800),
  ('pieces:casino',     'pieces', 1800),
  ('pieces:ter',        'pieces', 3000),
  ('pieces:drapeaux',   'pieces', 3000),
  ('pieces:envol',      'pieces', 4000),
  -- Plateaux
  ('board:bois',        'board', 0),
  ('board:sable',       'board', 200),
  ('board:ebene',       'board', 600),
  ('board:laterite',    'board', 800),
  ('board:pierre',      'board', 800),
  ('board:wax',         'board', 1600),
  ('board:nuit',        'board', 1600),
  ('board:laiton',      'board', 3500),
  -- Cadres
  ('frame:laiton',      'frame', 400),
  ('frame:foret',       'frame', 400),
  ('frame:indigo',      'frame', 1000),
  ('frame:braise',      'frame', 2500),
  -- Titres
  ('title:teranga',     'title', 300),
  ('title:arene',       'title', 700),
  ('title:damier',      'title', 1500),
  ('title:baol',        'title', 1500),
  ('title:sans-pitie',  'title', 3000),
  -- Fonctions
  ('feature:indices',   'feature', 600),
  ('feature:retour',    'feature', 1200)
on conflict (id) do update set price = excluded.price, kind = excluded.kind;

-- --- Verrouillage en écriture ------------------------------------------------

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.catalog enable row level security;

drop policy if exists "profil visible par son proprietaire" on public.profiles;
create policy "profil visible par son proprietaire"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "parties visibles par leur joueur" on public.games;
create policy "parties visibles par leur joueur"
  on public.games for select
  using (auth.uid() = player_id);

-- Le catalogue se lit librement : les prix s'affichent avant tout achat.
drop policy if exists "catalogue lisible" on public.catalog;
create policy "catalogue lisible"
  on public.catalog for select
  using (true);

-- Aucune politique d'insert, d'update ni de delete nulle part : l'absence de
-- politique vaut refus. Tout passe par les fonctions ci-dessous.

-- --- Classement --------------------------------------------------------------

-- Une vue n'expose que le nécessaire : pas de solde, pas d'identifiant de
-- compte. Le titre en fait partie — c'est ce que le joueur a choisi de montrer.
--
-- On la supprime avant de la recréer : « create or replace view » ne sait
-- qu'ajouter des colonnes à la fin, jamais en insérer au milieu. Sans ce drop,
-- rejouer ce fichier sur une base installée avant les titres échoue — et comme
-- l'éditeur SQL exécute tout d'un bloc, plus rien ne s'applique ensuite.
drop view if exists public.leaderboard;

create or replace view public.leaderboard
with (security_invoker = off) as
  select
    p.display_name,
    p.handle,
    p.title,
    p.frame,
    count(*) filter (where g.result = 'win') as wins,
    count(*) as played,
    p.daily_streak
  from public.profiles p
  join public.games g on g.player_id = p.id
  group by p.id, p.display_name, p.handle, p.title, p.frame, p.daily_streak
  having count(*) >= 5
  order by wins desc, played asc
  limit 100;

grant select on public.leaderboard to authenticated;

-- --- Formes qui ont changé ---------------------------------------------------

-- PostgreSQL refuse de « remplacer » ce dont la forme change : une fonction ne
-- peut pas voir un paramètre renommé, ni une vue ses colonnes réordonnées. Il
-- faut donc supprimer d'abord — et le faire ici, avant les créations, sans quoi
-- rejouer ce fichier sur une base antérieure échoue au milieu. L'éditeur SQL
-- exécutant tout d'un bloc, plus rien ne s'appliquerait ensuite.
drop function if exists public.import_local_progress(integer, jsonb);
drop function if exists public.unlock_piece_set(text);
drop function if exists public.set_piece_set(text);
drop function if exists public.piece_set_price(text);

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

/* Prix d'un article. Renvoie null pour un identifiant inconnu : l'appelant doit
   refuser plutôt que d'offrir l'article. */
create or replace function public.item_price(p_item text)
returns integer
language sql
stable
as $$
  select price from public.catalog where id = p_item;
$$;

-- --- Création du profil ------------------------------------------------------

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
-- téléphone ne doit pas distribuer de cauris.
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
    return jsonb_build_object('rewards', v_rewards, 'coins', v_profile.coins);
  end if;

  if v_profile.last_visit_day = v_today - 1 then
    v_streak := v_profile.visit_streak + 1;
  else
    v_streak := 1;
  end if;

  v_rewards := array['daily-login'];
  if v_streak % 7 = 0 then
    v_rewards := array_append(v_rewards, 'daily-login-week');
  end if;

  foreach v_reason in array v_rewards loop
    v_gain := v_gain + public.reward_amount(v_reason);
  end loop;

  update public.profiles
    set last_visit_day = v_today,
        visit_streak = v_streak,
        coins = coins + v_gain,
        earned = earned + v_gain,
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object(
    'rewards', v_rewards,
    'coins', v_profile.coins,
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
  v_coins integer;
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
    select coins into v_coins from public.profiles where id = v_uid;
    return jsonb_build_object('rewards', array[]::text[], 'coins', v_coins,
                              'duplicate', true);
  end if;

  -- Le défi du jour a son propre barème, réglé ailleurs.
  if p_mode = 'daily' then
    select coins into v_coins from public.profiles where id = v_uid;
    return jsonb_build_object('rewards', array[]::text[], 'coins', v_coins);
  end if;

  if p_result = 'win' then
    v_rewards := array_append(v_rewards, 'win');

    -- Série en cours : les victoires postérieures au dernier faux pas.
    select coalesce(max(played_at), 0) into v_last_setback
      from public.games
      where player_id = v_uid and result <> 'win' and mode <> 'daily';

    select count(*) into v_streak
      from public.games
      where player_id = v_uid and result = 'win' and mode <> 'daily'
        and played_at > v_last_setback;

    if v_streak > 0 and v_streak % 3 = 0 then
      v_rewards := array_append(v_rewards, 'streak');
    end if;
  end if;

  foreach v_reason in array v_rewards loop
    v_gain := v_gain + public.reward_amount(v_reason);
  end loop;

  update public.profiles
    set coins = coins + v_gain,
        earned = earned + v_gain,
        updated_at = now()
    where id = v_uid
    returning coins into v_coins;

  return jsonb_build_object('rewards', v_rewards, 'coins', v_coins,
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
    return jsonb_build_object('rewards', v_rewards, 'coins', v_profile.coins,
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
        coins = coins + v_gain,
        earned = earned + v_gain,
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object('rewards', v_rewards, 'coins', v_profile.coins,
                            'dailyStreak', v_streak);
end;
$$;

-- --- Boutique ----------------------------------------------------------------

create or replace function public.buy_item(p_item text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_price integer := public.item_price(p_item);
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;
  if v_price is null then
    raise exception 'article inconnu';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;

  -- Déjà acquis, ou offert : on ne débite rien et on ne se plaint pas.
  if p_item = any(v_profile.owned) or v_price = 0 then
    return jsonb_build_object('coins', v_profile.coins, 'owned', v_profile.owned);
  end if;

  if v_profile.coins < v_price then
    raise exception 'solde insuffisant';
  end if;

  update public.profiles
    set coins = coins - v_price,
        owned = array_append(owned, p_item),
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object('coins', v_profile.coins, 'owned', v_profile.owned);
end;
$$;

/* Change ce que le joueur porte. Chaque valeur nulle laisse le réglage en
   place : on peut ne changer que le plateau sans toucher au reste. */
create or replace function public.set_loadout(
  p_pieces text,
  p_board text,
  p_frame text,
  p_title text
)
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

  select * into v_profile from public.profiles where id = v_uid for update;

  -- On ne porte que ce qu'on possède : sans ce contrôle, l'achat ne servirait
  -- à rien. Les articles offerts ne figurent pas dans l'inventaire, d'où la
  -- comparaison de prix.
  if p_pieces is not null
     and not ('pieces:' || p_pieces = any(v_profile.owned))
     and coalesce(public.item_price('pieces:' || p_pieces), -1) <> 0 then
    raise exception 'article non possede';
  end if;

  if p_board is not null
     and not ('board:' || p_board = any(v_profile.owned))
     and coalesce(public.item_price('board:' || p_board), -1) <> 0 then
    raise exception 'article non possede';
  end if;

  if p_frame is not null and not ('frame:' || p_frame = any(v_profile.owned)) then
    raise exception 'article non possede';
  end if;

  if p_title is not null and not ('title:' || p_title = any(v_profile.owned)) then
    raise exception 'article non possede';
  end if;

  update public.profiles
    set piece_set = coalesce(p_pieces, piece_set),
        board_theme = coalesce(p_board, board_theme),
        frame = p_frame,
        title = p_title,
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object(
    'pieces', v_profile.piece_set,
    'board', v_profile.board_theme,
    'frame', v_profile.frame,
    'title', v_profile.title
  );
end;
$$;

-- --- Reprise d'une progression hors compte ------------------------------------

-- Le contenu du navigateur se modifie à la main. Le solde repris est donc
-- plafonné, et l'opération refusée au second appel.
create or replace function public.import_local_progress(
  p_coins integer,
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
  v_coins integer := least(greatest(coalesce(p_coins, 0), 0), v_cap);
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
    set coins = coins + v_coins,
        earned = earned + v_coins,
        imported = true,
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

  return jsonb_build_object('imported', true, 'coins', v_profile.coins,
                            'games', v_count);
end;
$$;

-- --- Droits ------------------------------------------------------------------

revoke all on function public.create_profile(text, text) from public, anon;
revoke all on function public.claim_daily_visit() from public, anon;
revoke all on function public.record_game(text, text, text, text, text, text, bigint) from public, anon;
revoke all on function public.record_daily(integer, boolean) from public, anon;
revoke all on function public.buy_item(text) from public, anon;
revoke all on function public.set_loadout(text, text, text, text) from public, anon;
revoke all on function public.import_local_progress(integer, jsonb) from public, anon;

grant execute on function public.create_profile(text, text) to authenticated;
grant execute on function public.claim_daily_visit() to authenticated;
grant execute on function public.record_game(text, text, text, text, text, text, bigint) to authenticated;
grant execute on function public.record_daily(integer, boolean) to authenticated;
grant execute on function public.buy_item(text) to authenticated;
grant execute on function public.set_loadout(text, text, text, text) to authenticated;
grant execute on function public.import_local_progress(integer, jsonb) to authenticated;

grant select on public.catalog to anon, authenticated;

-- =============================================================================
-- Amis et invitations
-- =============================================================================
--
-- Partager un code de salle à six caractères marchait, mais demandait de passer
-- par une autre application pour l'envoyer. Une liste d'amis permet d'inviter
-- en un geste, depuis le jeu.
-- =============================================================================

-- Une seule ligne par paire, quel que soit qui a demandé. Chercher une amitié
-- se fait donc dans les deux sens — c'est le prix d'une table sans doublon, et
-- il vaut mieux que deux lignes à garder d'accord.
create table if not exists public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),

  primary key (requester_id, addressee_id),
  constraint pas_ami_avec_soi_meme check (requester_id <> addressee_id)
);

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);

/* Invitations à rejoindre une salle. Le code de salle vient du serveur de
   parties, qui ne connaît pas les comptes : cette table fait le lien entre les
   deux, sans que l'un ait à connaître l'autre. */
create table if not exists public.game_invites (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  room_id text not null,
  game text not null check (game in ('dames', 'morpion')),
  created_at timestamptz not null default now()
);

create index if not exists game_invites_to_idx
  on public.game_invites (to_id, created_at desc);

alter table public.friendships enable row level security;
alter table public.game_invites enable row level security;

drop policy if exists "amities visibles par les deux" on public.friendships;
create policy "amities visibles par les deux"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "invitations visibles par les deux" on public.game_invites;
create policy "invitations visibles par les deux"
  on public.game_invites for select
  using (auth.uid() = to_id or auth.uid() = from_id);

-- Le client doit être prévenu d'une invitation sans interroger le serveur en
-- boucle. Sans cette publication, l'abonnement temps réel ne reçoit rien.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'game_invites'
     )
  then
    alter publication supabase_realtime add table public.game_invites;
  end if;
end $$;

-- --- Recherche ---------------------------------------------------------------

/* Cherche un joueur par son pseudo. On n'expose que ce que le classement montre
   déjà, jamais un solde ni un identifiant de compte. Deux caractères au
   minimum : sans cela, une seule lettre listerait la moitié des joueurs. */
create or replace function public.search_players(p_query text)
returns table (handle text, display_name text, title text, frame text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;
  if length(v_q) < 2 then
    return;
  end if;

  return query
    select p.handle, p.display_name, p.title, p.frame
    from public.profiles p
    where p.id <> v_uid
      and p.handle like v_q || '%'
    order by p.handle
    limit 10;
end;
$$;

-- --- Demandes d'amitié -------------------------------------------------------

create or replace function public.send_friend_request(p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_autre uuid;
  v_existant public.friendships;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  select id into v_autre from public.profiles where handle = lower(p_handle);
  if v_autre is null then
    raise exception 'joueur introuvable';
  end if;
  if v_autre = v_uid then
    raise exception 'pas soi meme';
  end if;

  select * into v_existant from public.friendships
    where (requester_id = v_uid and addressee_id = v_autre)
       or (requester_id = v_autre and addressee_id = v_uid);

  if found then
    -- L'autre avait déjà demandé : sa demande vaut acceptation, plutôt que de
    -- laisser deux personnes s'attendre l'une l'autre.
    if v_existant.status = 'pending' and v_existant.requester_id = v_autre then
      update public.friendships set status = 'accepted'
        where requester_id = v_autre and addressee_id = v_uid;
      return jsonb_build_object('status', 'accepted');
    end if;
    return jsonb_build_object('status', v_existant.status);
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_uid, v_autre);

  return jsonb_build_object('status', 'pending');
end;
$$;

create or replace function public.respond_friend_request(
  p_handle text,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_autre uuid;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  select id into v_autre from public.profiles where handle = lower(p_handle);
  if v_autre is null then
    raise exception 'joueur introuvable';
  end if;

  -- On ne répond qu'aux demandes reçues : accepter à la place de l'autre
  -- reviendrait à s'ajouter soi-même à sa liste.
  if p_accept then
    update public.friendships set status = 'accepted'
      where requester_id = v_autre and addressee_id = v_uid and status = 'pending';
  else
    delete from public.friendships
      where requester_id = v_autre and addressee_id = v_uid and status = 'pending';
  end if;

  return jsonb_build_object('accepted', p_accept);
end;
$$;

create or replace function public.remove_friend(p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_autre uuid;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  select id into v_autre from public.profiles where handle = lower(p_handle);
  if v_autre is null then
    raise exception 'joueur introuvable';
  end if;

  delete from public.friendships
    where (requester_id = v_uid and addressee_id = v_autre)
       or (requester_id = v_autre and addressee_id = v_uid);

  return jsonb_build_object('removed', true);
end;
$$;

/* La liste, en un seul appel : les amis, les demandes reçues, les demandes
   envoyées. Trois requêtes séparées obligeraient l'écran à trois allers-retours
   pour afficher une seule fenêtre. */
create or replace function public.list_friends()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  return jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'handle', p.handle, 'displayName', p.display_name,
        'title', p.title, 'frame', p.frame
      ) order by p.handle)
      from public.friendships f
      join public.profiles p
        on p.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
      where f.status = 'accepted'
        and (f.requester_id = v_uid or f.addressee_id = v_uid)
    ), '[]'::jsonb),

    'received', coalesce((
      select jsonb_agg(jsonb_build_object(
        'handle', p.handle, 'displayName', p.display_name,
        'title', p.title, 'frame', p.frame
      ) order by p.handle)
      from public.friendships f
      join public.profiles p on p.id = f.requester_id
      where f.status = 'pending' and f.addressee_id = v_uid
    ), '[]'::jsonb),

    'sent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'handle', p.handle, 'displayName', p.display_name,
        'title', p.title, 'frame', p.frame
      ) order by p.handle)
      from public.friendships f
      join public.profiles p on p.id = f.addressee_id
      where f.status = 'pending' and f.requester_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

-- --- Invitations à jouer -----------------------------------------------------

/* Invite un ami dans une salle déjà créée. Réservé aux amis : sans cela,
   n'importe qui pourrait faire sonner l'écran de n'importe qui. */
create or replace function public.invite_friend(
  p_handle text,
  p_room text,
  p_game text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_autre uuid;
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;
  if p_game not in ('dames', 'morpion') then
    raise exception 'jeu inconnu';
  end if;

  select id into v_autre from public.profiles where handle = lower(p_handle);
  if v_autre is null then
    raise exception 'joueur introuvable';
  end if;

  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = v_uid and addressee_id = v_autre)
        or (requester_id = v_autre and addressee_id = v_uid))
  ) then
    raise exception 'pas ami';
  end if;

  -- Une invitation ne vaut que le temps qu'on reste devant l'écran. Purger ici
  -- évite une tâche planifiée pour une table qui reste minuscule.
  delete from public.game_invites where created_at < now() - interval '10 minutes';

  -- Une seule invitation en attente par paire : cliquer trois fois ne doit pas
  -- faire sonner trois fois.
  delete from public.game_invites where from_id = v_uid and to_id = v_autre;

  insert into public.game_invites (from_id, to_id, room_id, game)
  values (v_uid, v_autre, left(p_room, 12), p_game);

  return jsonb_build_object('sent', true);
end;
$$;

/* Les invitations reçues encore valables, avec le nom de qui les envoie. */
create or replace function public.pending_invites()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'roomId', i.room_id, 'game', i.game,
      'handle', p.handle, 'displayName', p.display_name
    ) order by i.created_at desc)
    from public.game_invites i
    join public.profiles p on p.id = i.from_id
    where i.to_id = v_uid
      and i.created_at > now() - interval '10 minutes'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.dismiss_invite(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'non authentifie';
  end if;

  delete from public.game_invites where id = p_id and to_id = v_uid;
  return jsonb_build_object('dismissed', true);
end;
$$;

-- --- Droits ------------------------------------------------------------------

revoke all on function public.search_players(text) from public, anon;
revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(text, boolean) from public, anon;
revoke all on function public.remove_friend(text) from public, anon;
revoke all on function public.list_friends() from public, anon;
revoke all on function public.invite_friend(text, text, text) from public, anon;
revoke all on function public.pending_invites() from public, anon;
revoke all on function public.dismiss_invite(uuid) from public, anon;

grant execute on function public.search_players(text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(text, boolean) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.invite_friend(text, text, text) to authenticated;
grant execute on function public.pending_invites() to authenticated;
grant execute on function public.dismiss_invite(uuid) to authenticated;
