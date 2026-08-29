/**
 * Le schéma des comptes, exécuté pour de vrai.
 *
 * Les règles d'économie vivent désormais en SQL : c'est le serveur qui accorde
 * les cauris, et le client ne peut plus les recalculer. Un barème qui ne
 * s'exécute nulle part avant la production est un pari — le premier bug trouvé
 * ici (« malformed array literal »), invisible à l'analyse syntaxique, n'était
 * pas dans un chemin exotique mais dans la fin de partie ordinaire.
 *
 * PGlite fournit un vrai PostgreSQL en WebAssembly : pas de service à
 * installer, pas de conteneur à lancer. On y rejoue ce que Supabase apporte de
 * son côté — le schéma `auth`, ses rôles, `auth.uid()` — puis on exerce chaque
 * chemin des fonctions, et l'on compare le catalogue du serveur à celui du jeu.
 *
 *   npm run test:sql
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

import { CATALOG } from '../src/lib/shop.ts';
import { REWARDS } from '../src/lib/economy.ts';

const ici = dirname(fileURLToPath(import.meta.url));

/**
 * Ce que Supabase fournit et que le schéma suppose présent. `auth.uid()` y lit
 * un réglage de session au lieu d'un jeton : c'est le seul moyen de changer de
 * joueur d'un appel à l'autre.
 */
const SOCLE_SUPABASE = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique
  );

  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;

  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
  end $$;
`;

let db;

/** Ouvre une session au nom d'un joueur. */
const seConnecter = async (uid) => db.query(`set test.uid = '${uid}'`);

/** Crée un compte et son profil, puis rend son identifiant. */
const nouveauJoueur = async (handle) => {
  const { rows } = await db.query(
    'insert into auth.users (email) values ($1) returning id',
    [`${handle}@joueurs.dame-sen.app`],
  );
  const uid = rows[0].id;
  await seConnecter(uid);
  await db.query('select * from public.create_profile($1, $2)', [handle, handle]);
  return uid;
};

const profil = async (uid) => {
  const { rows } = await db.query('select * from public.profiles where id = $1', [uid]);
  return rows[0];
};

/** Joue une partie terminée, comme le fait le jeu à la fin d'un affrontement. */
const jouer = async (options = {}) => {
  const {
    id = Math.random().toString(36).slice(2),
    game = 'dames',
    mode = 'solo',
    result = 'win',
    opponent = 'medium',
    detail = null,
    playedAt = Date.now(),
  } = options;

  const { rows } = await db.query(
    'select public.record_game($1, $2, $3, $4, $5, $6, $7) as r',
    [id, game, mode, result, opponent, detail, playedAt],
  );
  return rows[0].r;
};

before(async () => {
  db = await PGlite.create();
  await db.exec(SOCLE_SUPABASE);
  await db.exec(readFileSync(join(ici, 'schema.sql'), 'utf8'));
});

describe('création du profil', () => {
  test('un compte tout neuf part avec les pions offerts et rien d’autre', async () => {
    const uid = await nouveauJoueur('amadou');
    const p = await profil(uid);

    assert.equal(p.handle, 'amadou');
    assert.equal(p.coins, 0);
    // Les articles offerts ne figurent pas dans l'inventaire : ils se
    // reconnaissent à leur prix nul, ce qui évite de les recopier partout.
    assert.deepEqual(p.owned, []);
    assert.equal(p.piece_set, 'cauri');
    assert.equal(p.board_theme, 'bois');
    assert.equal(p.imported, false);
  });

  test('le pseudo est rangé en minuscules', async () => {
    const uid = await nouveauJoueur('NDEYE');
    assert.equal((await profil(uid)).handle, 'ndeye');
  });

  test('rappeler la fonction ne crée pas un second profil', async () => {
    const uid = await nouveauJoueur('moussa');
    await db.query('select * from public.create_profile($1, $2)', ['moussa', 'Moussa Ba']);

    const { rows } = await db.query(
      'select count(*)::int as n from public.profiles where id = $1',
      [uid],
    );
    assert.equal(rows[0].n, 1);
    assert.equal((await profil(uid)).display_name, 'Moussa Ba');
  });

  test('sans compte connecté, la fonction refuse', async () => {
    await db.query("set test.uid = ''");
    await assert.rejects(
      () => db.query('select * from public.create_profile($1, $2)', ['x', 'x']),
      /non authentifie/,
    );
  });
});

describe('fin de partie', () => {
  test('une victoire rapporte la participation et la prime', async () => {
    const uid = await nouveauJoueur('fatou');
    const r = await jouer({ result: 'win' });

    assert.deepEqual(r.rewards, ['played', 'win']);
    assert.equal(r.coins, 35);
    assert.equal((await profil(uid)).earned, 35);
  });

  test('une défaite rapporte quand même la participation', async () => {
    await nouveauJoueur('omar');
    const r = await jouer({ result: 'loss' });

    assert.deepEqual(r.rewards, ['played']);
    assert.equal(r.coins, 10);
  });

  test('la troisième victoire d’affilée déclenche le palier', async () => {
    await nouveauJoueur('awa');
    await jouer({ result: 'win', playedAt: 1000 });
    await jouer({ result: 'win', playedAt: 2000 });
    const r = await jouer({ result: 'win', playedAt: 3000 });

    assert.ok(r.rewards.includes('streak'), 'le palier doit tomber');
    assert.equal(r.streak, 3);
  });

  test('une défaite casse la série', async () => {
    await nouveauJoueur('ibrahima');
    await jouer({ result: 'win', playedAt: 1000 });
    await jouer({ result: 'win', playedAt: 2000 });
    await jouer({ result: 'loss', playedAt: 3000 });
    const r = await jouer({ result: 'win', playedAt: 4000 });

    assert.ok(!r.rewards.includes('streak'));
    assert.equal(r.streak, 1);
  });

  test('renvoyer la même partie ne rapporte pas deux fois', async () => {
    const uid = await nouveauJoueur('khady');
    await jouer({ id: 'partie-unique', result: 'win' });
    const avant = (await profil(uid)).coins;

    const r = await jouer({ id: 'partie-unique', result: 'win' });

    assert.equal(r.duplicate, true);
    assert.deepEqual(r.rewards, []);
    assert.equal((await profil(uid)).coins, avant, 'le solde ne bouge pas');
  });

  test('le défi du jour ne passe pas par le barème des parties', async () => {
    const uid = await nouveauJoueur('sokhna');
    const r = await jouer({ mode: 'daily', result: 'win' });

    assert.deepEqual(r.rewards, []);
    assert.equal((await profil(uid)).coins, 0);
  });

  test('les parties du défi ne comptent pas dans la série', async () => {
    await nouveauJoueur('mamadou');
    await jouer({ result: 'win', playedAt: 1000 });
    await jouer({ mode: 'daily', result: 'loss', playedAt: 2000 });
    await jouer({ result: 'win', playedAt: 3000 });
    const r = await jouer({ result: 'win', playedAt: 4000 });

    assert.equal(r.streak, 3, 'le défi ne doit ni casser ni gonfler la série');
  });

  test('un résultat inconnu est refusé', async () => {
    await nouveauJoueur('aliou');
    await assert.rejects(() => jouer({ result: 'abandon' }), /games_result_check/);
  });
});

describe('venue du jour', () => {
  test('la première venue est récompensée', async () => {
    const uid = await nouveauJoueur('binta');
    const { rows } = await db.query('select public.claim_daily_visit() as r');

    assert.deepEqual(rows[0].r.rewards, ['daily-login']);
    assert.equal(rows[0].r.coins, 20);
    assert.equal((await profil(uid)).visit_streak, 1);
  });

  test('revenir le même jour ne rapporte rien', async () => {
    await nouveauJoueur('cheikh');
    await db.query('select public.claim_daily_visit() as r');
    const { rows } = await db.query('select public.claim_daily_visit() as r');

    assert.deepEqual(rows[0].r.rewards, []);
    assert.equal(rows[0].r.coins, 20);
  });

  test('la série monte de jour en jour', async () => {
    const uid = await nouveauJoueur('yacine');
    await db.query('select public.claim_daily_visit()');

    // On recule la dernière venue d'un jour pour simuler le lendemain.
    await db.query(
      'update public.profiles set last_visit_day = last_visit_day - 1 where id = $1',
      [uid],
    );
    const { rows } = await db.query('select public.claim_daily_visit() as r');

    assert.equal(rows[0].r.visitStreak, 2);
  });

  test('un jour manqué remet la série à un', async () => {
    const uid = await nouveauJoueur('demba');
    await db.query('select public.claim_daily_visit()');
    await db.query(
      'update public.profiles set last_visit_day = last_visit_day - 5, visit_streak = 4 where id = $1',
      [uid],
    );
    const { rows } = await db.query('select public.claim_daily_visit() as r');

    assert.equal(rows[0].r.visitStreak, 1);
  });

  test('le septième jour d’affilée verse la prime', async () => {
    const uid = await nouveauJoueur('rama');
    // Six venues consécutives déjà faites, la dernière datant d'hier.
    await db.query(
      `update public.profiles
         set visit_streak = 6,
             last_visit_day = floor(extract(epoch from now()) / 86400)::integer - 1
       where id = $1`,
      [uid],
    );
    const { rows } = await db.query('select public.claim_daily_visit() as r');

    assert.ok(
      rows[0].r.rewards.includes('daily-login-week'),
      'la prime hebdomadaire doit tomber au septième jour',
    );
    assert.equal(rows[0].r.coins, 520, '20 pour la venue, 500 pour la semaine');
  });
});

describe('défi du jour', () => {
  test('un défi résolu rapporte et ouvre la série', async () => {
    const uid = await nouveauJoueur('seynabou');
    const { rows } = await db.query('select public.record_daily($1, $2) as r', [10, true]);

    assert.deepEqual(rows[0].r.rewards, ['daily-solved']);
    assert.equal(rows[0].r.coins, 50);
    assert.equal((await profil(uid)).daily_solved_count, 1);
  });

  test('un défi manqué ne rapporte rien et casse la série', async () => {
    const uid = await nouveauJoueur('pape');
    await db.query('select public.record_daily($1, $2)', [10, true]);
    const { rows } = await db.query('select public.record_daily($1, $2) as r', [11, false]);

    assert.deepEqual(rows[0].r.rewards, []);
    assert.equal(rows[0].r.dailyStreak, 0);
    assert.equal((await profil(uid)).daily_solved_count, 1);
  });

  test('deux jours de suite font monter la série', async () => {
    await nouveauJoueur('coumba');
    await db.query('select public.record_daily($1, $2)', [20, true]);
    const { rows } = await db.query('select public.record_daily($1, $2) as r', [21, true]);

    assert.equal(rows[0].r.dailyStreak, 2);
  });

  test('le même défi ne compte qu’une fois', async () => {
    const uid = await nouveauJoueur('modou');
    await db.query('select public.record_daily($1, $2)', [30, true]);
    const { rows } = await db.query('select public.record_daily($1, $2) as r', [30, true]);

    assert.deepEqual(rows[0].r.rewards, []);
    assert.equal((await profil(uid)).coins, 50, 'pas de second versement');
  });
});

describe('boutique', () => {
  const enrichir = async (uid, coins) =>
    db.query('update public.profiles set coins = $2 where id = $1', [uid, coins]);

  const acheter = async (item) => {
    const { rows } = await db.query('select public.buy_item($1) as r', [item]);
    return rows[0].r;
  };

  test('un achat débite le solde et ajoute l’article', async () => {
    const uid = await nouveauJoueur('astou');
    await enrichir(uid, 1000);

    const r = await acheter('pieces:sabar');
    assert.equal(r.coins, 850);
    assert.ok(r.owned.includes('pieces:sabar'));
  });

  test('toutes les familles s’achètent de la même façon', async () => {
    const uid = await nouveauJoueur('fama');
    await enrichir(uid, 10_000);

    for (const item of ['board:wax', 'frame:laiton', 'title:arene', 'feature:indices']) {
      const r = await acheter(item);
      assert.ok(r.owned.includes(item), `${item} devrait être acquis`);
    }
    // 1600 + 400 + 700 + 600
    assert.equal((await profil(uid)).coins, 10_000 - 3300);
  });

  test('un solde insuffisant refuse l’achat', async () => {
    const uid = await nouveauJoueur('malick');
    await enrichir(uid, 10);

    await assert.rejects(() => acheter('pieces:envol'), /solde insuffisant/);
    assert.equal((await profil(uid)).coins, 10, 'rien n’est débité');
  });

  test('on ne paie jamais deux fois le même article', async () => {
    const uid = await nouveauJoueur('nafi');
    await enrichir(uid, 1000);
    await acheter('pieces:sabar');
    const apresPremier = (await profil(uid)).coins;

    await acheter('pieces:sabar');
    assert.equal((await profil(uid)).coins, apresPremier);
  });

  test('un article offert ne débite rien', async () => {
    const uid = await nouveauJoueur('tidiane');
    await enrichir(uid, 500);
    await acheter('pieces:cauri');

    assert.equal((await profil(uid)).coins, 500);
  });

  test('un article inconnu est refusé', async () => {
    await nouveauJoueur('bakary');
    await assert.rejects(() => acheter('pieces:licorne'), /inconnu/);
    await assert.rejects(() => acheter('licorne'), /inconnu/);
  });

  test('le solde ne peut pas devenir négatif', async () => {
    const uid = await nouveauJoueur('salif');
    await enrichir(uid, 150);
    await acheter('pieces:sabar');

    assert.equal((await profil(uid)).coins, 0);
  });

  test('le catalogue du serveur est lisible sans compte', async () => {
    const { rows } = await db.query('select count(*)::int as n from public.catalog');
    assert.ok(rows[0].n > 30, 'le catalogue doit être rempli');
  });
});

describe('tenue du joueur', () => {
  const porter = (pieces, board, frame, title) =>
    db.query('select public.set_loadout($1, $2, $3, $4) as r', [
      pieces,
      board,
      frame,
      title,
    ]);

  test('on porte ce qu’on possède', async () => {
    const uid = await nouveauJoueur('dieynaba');
    await db.query('update public.profiles set coins = 5000 where id = $1', [uid]);
    await db.query('select public.buy_item($1)', ['pieces:sabar']);
    await db.query('select public.buy_item($1)', ['board:wax']);
    await db.query('select public.buy_item($1)', ['title:arene']);

    await porter('sabar', 'wax', null, 'arene');

    const p = await profil(uid);
    assert.equal(p.piece_set, 'sabar');
    assert.equal(p.board_theme, 'wax');
    assert.equal(p.title, 'arene');
  });

  test('les articles offerts se portent sans achat', async () => {
    const uid = await nouveauJoueur('ndiaga');
    await porter('cauri', 'bois', null, null);

    assert.equal((await profil(uid)).piece_set, 'cauri');
  });

  test('un article non acquis est refusé, quelle que soit sa famille', async () => {
    const uid = await nouveauJoueur('ousmane');

    await assert.rejects(() => porter('donjon', null, null, null), /non possede/);
    await assert.rejects(() => porter(null, 'laiton', null, null), /non possede/);
    await assert.rejects(() => porter(null, null, 'braise', null), /non possede/);
    await assert.rejects(() => porter(null, null, null, 'damier'), /non possede/);

    const p = await profil(uid);
    assert.equal(p.piece_set, 'cauri');
    assert.equal(p.board_theme, 'bois');
  });

  test('ne rien passer laisse la tenue en place', async () => {
    const uid = await nouveauJoueur('mame');
    await db.query('update public.profiles set coins = 1000 where id = $1', [uid]);
    await db.query('select public.buy_item($1)', ['pieces:sabar']);
    await porter('sabar', null, null, null);

    await porter(null, null, null, null);
    assert.equal((await profil(uid)).piece_set, 'sabar', 'les pions ne bougent pas');
  });
});

describe('reprise d’une base d’avant la boutique', () => {
  test('les anciens noms et identifiants sont repris sans perte', async () => {
    // On refait ce qu'une base installée avant la boutique contenait, puis on
    // rejoue le schéma : c'est exactement ce que fera une mise à jour.
    const vieille = await PGlite.create();
    await vieille.exec(SOCLE_SUPABASE);
    await vieille.exec(`
      create table public.profiles (
        id uuid primary key references auth.users on delete cascade,
        handle text not null unique,
        display_name text not null,
        stars integer not null default 0,
        earned integer not null default 0,
        unlocked text[] not null default array['cauri'],
        piece_set text not null default 'cauri',
        last_visit_day integer not null default 0,
        visit_streak integer not null default 0,
        daily_last_number integer not null default 0,
        daily_streak integer not null default 0,
        daily_solved_count integer not null default 0,
        imported boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    const { rows } = await vieille.query(
      "insert into auth.users (email) values ('vieux@x.app') returning id",
    );
    const uid = rows[0].id;
    await vieille.query(
      `insert into public.profiles (id, handle, display_name, stars, unlocked)
       values ($1, 'vieux', 'Vieux', 740, array['cauri', 'sabar', 'donjon'])`,
      [uid],
    );

    await vieille.exec(readFileSync(join(ici, 'schema.sql'), 'utf8'));

    const { rows: apres } = await vieille.query(
      'select coins, owned from public.profiles where id = $1',
      [uid],
    );

    assert.equal(apres[0].coins, 740, 'le solde survit au changement de nom');
    assert.deepEqual(
      [...apres[0].owned].sort(),
      ['pieces:donjon', 'pieces:sabar'],
      'les achats sont repris avec leur famille, et l’article offert écarté',
    );
  });
});

describe('reprise d’une progression hors compte', () => {
  const parties = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `local-${i}`,
      game: 'dames',
      mode: 'solo',
      result: 'win',
      opponent: 'medium',
      detail: null,
      playedAt: 1000 + i,
    }));

  test('les parties et les étoiles rejoignent le compte', async () => {
    const uid = await nouveauJoueur('mariama');
    const { rows } = await db.query('select public.import_local_progress($1, $2) as r', [
      250,
      JSON.stringify(parties(4)),
    ]);

    assert.equal(rows[0].r.imported, true);
    assert.equal(rows[0].r.coins, 250);
    assert.equal(rows[0].r.games, 4);
    assert.equal((await profil(uid)).imported, true);
  });

  test('la reprise ne se fait qu’une fois', async () => {
    const uid = await nouveauJoueur('samba');
    await db.query('select public.import_local_progress($1, $2)', [
      100,
      JSON.stringify(parties(2)),
    ]);
    const { rows } = await db.query('select public.import_local_progress($1, $2) as r', [
      900,
      JSON.stringify(parties(2)),
    ]);

    assert.equal(rows[0].r.imported, false);
    assert.equal((await profil(uid)).coins, 100, 'la seconde reprise ne crédite rien');
  });

  test('un solde gonflé est plafonné', async () => {
    const uid = await nouveauJoueur('adama');
    await db.query('select public.import_local_progress($1, $2)', [
      5_000_000,
      JSON.stringify([]),
    ]);

    assert.equal((await profil(uid)).coins, 1000, 'le plafond tient');
  });

  test('un solde négatif ne retire rien', async () => {
    const uid = await nouveauJoueur('fallou');
    await db.query('select public.import_local_progress($1, $2)', [-500, JSON.stringify([])]);

    assert.equal((await profil(uid)).coins, 0);
  });

  test('une partie abîmée est écartée sans faire échouer la reprise', async () => {
    await nouveauJoueur('aissatou');
    const melange = [
      ...parties(2),
      { id: 'sans-date', game: 'dames', mode: 'solo', result: 'win' },
      { id: 'jeu-inconnu', game: 'echecs', mode: 'solo', result: 'win', playedAt: 5 },
      { game: 'dames', mode: 'solo', result: 'win', playedAt: 6 },
    ];

    const { rows } = await db.query('select public.import_local_progress($1, $2) as r', [
      0,
      JSON.stringify(melange),
    ]);
    assert.equal(rows[0].r.games, 2, 'seules les entrées valides passent');
  });
});

describe('verrouillage des écritures', () => {
  test('aucune politique n’autorise l’écriture directe', async () => {
    const { rows } = await db.query(`
      select tablename, cmd
      from pg_policies
      where schemaname = 'public' and cmd <> 'SELECT'
    `);
    assert.deepEqual(rows, [], 'seule la lecture doit être ouverte au client');
  });

  test('les deux tables sont protégées', async () => {
    const { rows } = await db.query(`
      select relname from pg_class
      where relname in ('profiles', 'games') and relrowsecurity = false
    `);
    assert.deepEqual(rows, [], 'la sécurité au niveau ligne doit être active');
  });

  test('anon ne peut exécuter aucune fonction de gain', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('record_game', 'claim_daily_visit', 'buy_item',
                          'record_daily', 'set_loadout', 'import_local_progress',
                          'create_profile')
        and has_function_privilege('anon', p.oid, 'execute')
    `);
    assert.deepEqual(rows, [], 'aucune ne doit être ouverte à un visiteur anonyme');
  });

  test('le classement ne laisse filtrer ni solde ni identifiant', async () => {
    const { rows } = await db.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'leaderboard'
    `);
    const colonnes = rows.map((r) => r.column_name);

    for (const interdit of ['coins', 'earned', 'id']) {
      assert.ok(!colonnes.includes(interdit), `${interdit} ne doit pas être exposé`);
    }
  });
});

describe('le serveur et le client disent la même chose', () => {
  test('chaque article du catalogue a le même prix des deux côtés', async () => {
    const { rows } = await db.query('select id, kind, price from public.catalog');
    const serveur = new Map(rows.map((r) => [r.id, r.price]));

    const ecarts = [];
    for (const item of CATALOG) {
      if (!serveur.has(item.id)) {
        ecarts.push(`${item.id} absent du serveur`);
      } else if (serveur.get(item.id) !== item.price) {
        ecarts.push(`${item.id} : ${item.price} ici, ${serveur.get(item.id)} là-bas`);
      }
    }
    for (const id of serveur.keys()) {
      if (!CATALOG.some((item) => item.id === id)) {
        ecarts.push(`${id} absent du catalogue du jeu`);
      }
    }

    assert.deepEqual(ecarts, [], 'un prix affiché mais non appliqué trompe le joueur');
  });

  test('chaque gain vaut la même chose des deux côtés', async () => {
    const ecarts = [];
    for (const [reason, montant] of Object.entries(REWARDS)) {
      const { rows } = await db.query('select public.reward_amount($1) as v', [reason]);
      if (rows[0].v !== montant) {
        ecarts.push(`${reason} : ${montant} ici, ${rows[0].v} là-bas`);
      }
    }
    assert.deepEqual(ecarts, [], 'le barème doit être identique');
  });

  test('la famille déclarée correspond au préfixe de l’identifiant', async () => {
    const { rows } = await db.query('select id, kind from public.catalog');
    for (const row of rows) {
      assert.equal(
        row.id.slice(0, row.id.indexOf(':')),
        row.kind,
        `${row.id} annonce une famille que son identifiant contredit`,
      );
    }
  });
});

describe('recherche de joueurs', () => {
  test('on trouve par le début du pseudo', async () => {
    await nouveauJoueur('mareme');
    await nouveauJoueur('marieme');
    await nouveauJoueur('ousseynou');

    const { rows } = await db.query('select * from public.search_players($1)', ['mar']);
    const trouves = rows.map((r) => r.handle);

    assert.ok(trouves.includes('mareme'));
    assert.ok(trouves.includes('marieme'));
    assert.ok(!trouves.includes('ousseynou'));
  });

  test('on ne se trouve jamais soi-même', async () => {
    await nouveauJoueur('babacar');
    const { rows } = await db.query('select * from public.search_players($1)', ['babacar']);

    assert.ok(!rows.some((r) => r.handle === 'babacar'));
  });

  test('une seule lettre ne cherche rien', async () => {
    await nouveauJoueur('zator');
    const { rows } = await db.query('select * from public.search_players($1)', ['z']);

    assert.equal(rows.length, 0, 'sans quoi une lettre listerait la moitié des joueurs');
  });

  test('la recherche ne laisse filtrer aucun solde', async () => {
    await nouveauJoueur('kine');
    const { rows } = await db.query('select * from public.search_players($1)', ['ki']);

    for (const row of rows) {
      assert.deepEqual(
        Object.keys(row).sort(),
        ['display_name', 'frame', 'handle', 'title'],
        'seul ce que le classement montre déjà doit sortir',
      );
    }
  });
});

describe('amitiés', () => {
  /** Deux comptes prêts à s'ajouter. */
  const deuxJoueurs = async (a, b) => {
    const uidA = await nouveauJoueur(a);
    const uidB = await nouveauJoueur(b);
    return { uidA, uidB };
  };

  const demander = (handle) =>
    db.query('select public.send_friend_request($1) as r', [handle]);

  const lister = async () => {
    const { rows } = await db.query('select public.list_friends() as r');
    return rows[0].r;
  };

  test('une demande reste en attente', async () => {
    const { uidA } = await deuxJoueurs('anta', 'birane');
    await seConnecter(uidA);
    const { rows } = await demander('birane');

    assert.equal(rows[0].r.status, 'pending');
    assert.equal((await lister()).sent.length, 1);
    assert.equal((await lister()).friends.length, 0);
  });

  test('le destinataire voit la demande arriver', async () => {
    const { uidA, uidB } = await deuxJoueurs('codou', 'daouda');
    await seConnecter(uidA);
    await demander('daouda');

    await seConnecter(uidB);
    const listeB = await lister();

    assert.equal(listeB.received.length, 1);
    assert.equal(listeB.received[0].handle, 'codou');
  });

  test('accepter lie les deux joueurs', async () => {
    const { uidA, uidB } = await deuxJoueurs('elhadji', 'fatima');
    await seConnecter(uidA);
    await demander('fatima');

    await seConnecter(uidB);
    await db.query('select public.respond_friend_request($1, $2)', ['elhadji', true]);

    const listeB = await lister();
    assert.equal(listeB.friends.length, 1);
    assert.equal(listeB.received.length, 0);

    // L'amitié vaut dans les deux sens, sans seconde ligne à tenir à jour.
    await seConnecter(uidA);
    const listeA = await lister();
    assert.equal(listeA.friends.length, 1);
    assert.equal(listeA.friends[0].handle, 'fatima');
  });

  test('refuser efface la demande sans lier personne', async () => {
    const { uidA, uidB } = await deuxJoueurs('gora', 'hawa');
    await seConnecter(uidA);
    await demander('hawa');

    await seConnecter(uidB);
    await db.query('select public.respond_friend_request($1, $2)', ['gora', false]);

    assert.equal((await lister()).friends.length, 0);
    assert.equal((await lister()).received.length, 0);

    await seConnecter(uidA);
    assert.equal((await lister()).sent.length, 0);
  });

  test('deux demandes croisées valent acceptation', async () => {
    const { uidA, uidB } = await deuxJoueurs('ismaila', 'jamila');
    await seConnecter(uidA);
    await demander('jamila');

    // Jamila ne voit pas la demande et envoie la sienne : les faire s'attendre
    // l'un l'autre serait absurde.
    await seConnecter(uidB);
    const { rows } = await demander('ismaila');

    assert.equal(rows[0].r.status, 'accepted');
    assert.equal((await lister()).friends.length, 1);
  });

  test('on ne peut pas accepter sa propre demande', async () => {
    const { uidA } = await deuxJoueurs('khadim', 'lamine');
    await seConnecter(uidA);
    await demander('lamine');

    // Amadou tente de répondre à la place de Lamine.
    await db.query('select public.respond_friend_request($1, $2)', ['lamine', true]);

    assert.equal((await lister()).friends.length, 0, 'rien ne doit avoir été lié');
  });

  test('on ne s’ajoute pas soi-même', async () => {
    const uid = await nouveauJoueur('mansour');
    await seConnecter(uid);
    await assert.rejects(() => demander('mansour'), /pas soi meme/);
  });

  test('un pseudo inconnu est refusé', async () => {
    const uid = await nouveauJoueur('ndongo');
    await seConnecter(uid);
    await assert.rejects(() => demander('personne_du_tout'), /introuvable/);
  });

  test('redemander ne crée pas de doublon', async () => {
    const { uidA } = await deuxJoueurs('oumy', 'pathe');
    await seConnecter(uidA);
    await demander('pathe');
    await demander('pathe');

    assert.equal((await lister()).sent.length, 1);
  });

  test('retirer un ami vaut des deux côtés', async () => {
    const { uidA, uidB } = await deuxJoueurs('rokhaya', 'saliou');
    await seConnecter(uidA);
    await demander('saliou');
    await seConnecter(uidB);
    await db.query('select public.respond_friend_request($1, $2)', ['rokhaya', true]);

    await db.query('select public.remove_friend($1)', ['rokhaya']);
    assert.equal((await lister()).friends.length, 0);

    await seConnecter(uidA);
    assert.equal((await lister()).friends.length, 0, 'l’autre non plus n’a plus d’ami');
  });
});

describe('invitations à jouer', () => {
  /** Deux amis déjà liés, prêts à s'inviter. */
  const deuxAmis = async (a, b) => {
    const uidA = await nouveauJoueur(a);
    const uidB = await nouveauJoueur(b);

    await seConnecter(uidA);
    await db.query('select public.send_friend_request($1)', [b]);
    await seConnecter(uidB);
    await db.query('select public.respond_friend_request($1, $2)', [a, true]);

    return { uidA, uidB };
  };

  const invites = async () => {
    const { rows } = await db.query('select public.pending_invites() as r');
    return rows[0].r;
  };

  test('un ami reçoit le code de la salle', async () => {
    const { uidA, uidB } = await deuxAmis('tabara', 'useynu');
    await seConnecter(uidA);
    await db.query('select public.invite_friend($1, $2, $3)', ['useynu', 'ABC123', 'dames']);

    await seConnecter(uidB);
    const recues = await invites();

    assert.equal(recues.length, 1);
    assert.equal(recues[0].roomId, 'ABC123');
    assert.equal(recues[0].game, 'dames');
    assert.equal(recues[0].handle, 'tabara');
  });

  test('on n’invite que ses amis', async () => {
    const uidA = await nouveauJoueur('vieux');
    await nouveauJoueur('waly');
    await seConnecter(uidA);

    await assert.rejects(
      () => db.query('select public.invite_friend($1, $2, $3)', ['waly', 'ABC123', 'dames']),
      /pas ami/,
      'sans quoi n’importe qui ferait sonner l’écran de n’importe qui',
    );
  });

  test('cliquer trois fois ne fait pas sonner trois fois', async () => {
    const { uidA, uidB } = await deuxAmis('yande', 'zator2');
    await seConnecter(uidA);
    for (const salle of ['AAA111', 'BBB222', 'CCC333']) {
      await db.query('select public.invite_friend($1, $2, $3)', ['zator2', salle, 'dames']);
    }

    await seConnecter(uidB);
    const recues = await invites();

    assert.equal(recues.length, 1, 'une seule invitation en attente par paire');
    assert.equal(recues[0].roomId, 'CCC333', 'la plus récente');
  });

  test('l’expéditeur ne voit pas sa propre invitation dans ses reçues', async () => {
    const { uidA } = await deuxAmis('adja', 'bara');
    await seConnecter(uidA);
    await db.query('select public.invite_friend($1, $2, $3)', ['bara', 'XYZ789', 'morpion']);

    assert.equal((await invites()).length, 0);
  });

  test('une invitation se referme', async () => {
    const { uidA, uidB } = await deuxAmis('cheikhouna', 'diarra');
    await seConnecter(uidA);
    await db.query('select public.invite_friend($1, $2, $3)', ['diarra', 'QWE456', 'dames']);

    await seConnecter(uidB);
    const recues = await invites();
    await db.query('select public.dismiss_invite($1)', [recues[0].id]);

    assert.equal((await invites()).length, 0);
  });

  test('on ne referme pas l’invitation d’un autre', async () => {
    const { uidA, uidB } = await deuxAmis('elimane', 'fary');
    await seConnecter(uidA);
    await db.query('select public.invite_friend($1, $2, $3)', ['fary', 'RTY123', 'dames']);

    await seConnecter(uidB);
    const recues = await invites();

    // L'expéditeur tente d'effacer l'invitation reçue par l'autre.
    await seConnecter(uidA);
    await db.query('select public.dismiss_invite($1)', [recues[0].id]);

    await seConnecter(uidB);
    assert.equal((await invites()).length, 1, 'elle est toujours là');
  });

  test('une invitation périmée ne s’affiche plus', async () => {
    const { uidA, uidB } = await deuxAmis('gorgui', 'houleye');
    await seConnecter(uidA);
    await db.query('select public.invite_friend($1, $2, $3)', ['houleye', 'OLD999', 'dames']);

    // On la vieillit de vingt minutes : la fenêtre est de dix.
    await db.query(
      "update public.game_invites set created_at = now() - interval '20 minutes' where to_id = $1",
      [uidB],
    );

    await seConnecter(uidB);
    assert.equal((await invites()).length, 0);
  });

  test('un jeu inconnu est refusé', async () => {
    const { uidA } = await deuxAmis('ibou', 'jules');
    await seConnecter(uidA);

    await assert.rejects(
      () => db.query('select public.invite_friend($1, $2, $3)', ['jules', 'AAA111', 'echecs']),
      /jeu inconnu/,
    );
  });
});

describe('verrouillage des amitiés', () => {
  test('aucune écriture directe n’est ouverte au client', async () => {
    const { rows } = await db.query(`
      select tablename, cmd
      from pg_policies
      where schemaname = 'public'
        and tablename in ('friendships', 'game_invites')
        and cmd <> 'SELECT'
    `);
    assert.deepEqual(rows, [], 'tout doit passer par les fonctions');
  });

  test('anon ne peut exécuter aucune fonction sociale', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('search_players', 'send_friend_request', 'respond_friend_request',
                          'remove_friend', 'list_friends', 'invite_friend',
                          'pending_invites', 'dismiss_invite')
        and has_function_privilege('anon', p.oid, 'execute')
    `);
    assert.deepEqual(rows, [], 'aucune ne doit être ouverte à un visiteur anonyme');
  });
});

describe('le fichier se rejoue sans casser', () => {
  /** Une base neuve, avec seulement ce que Supabase fournit. */
  const baseVierge = async () => {
    const base = await PGlite.create();
    await base.exec(SOCLE_SUPABASE);
    return base;
  };

  const schema = () => readFileSync(join(ici, 'schema.sql'), 'utf8');

  test('l’appliquer deux fois de suite ne change rien', async () => {
    const base = await baseVierge();
    await base.exec(schema());

    // Le second passage est le cas normal : on rejoue le fichier après chaque
    // modification, sur une base qui contient déjà la version précédente.
    await base.exec(schema());

    const { rows } = await base.query('select count(*)::int as n from public.catalog');
    assert.equal(rows[0].n, 35, 'le catalogue ne doit pas se dédoubler');
  });

  test('il s’applique sur une base d’avant les titres et la boutique', async () => {
    const base = await baseVierge();

    /*
     * On rejoue la forme qu'avait le schéma avant la boutique. Deux détails
     * suffisent à le faire échouer, et tous deux se sont produits :
     *
     *   - la vue listait ses colonnes dans un autre ordre, et
     *     « create or replace view » ne sait qu'en ajouter à la fin ;
     *   - la fonction d'import prenait « p_stars », et « create or replace
     *     function » refuse de renommer un paramètre.
     *
     * L'éditeur SQL exécutant tout d'un bloc, la moindre de ces erreurs
     * empêchait le reste du fichier de s'appliquer.
     */
    await base.exec(`
      create table public.profiles (
        id uuid primary key references auth.users on delete cascade,
        handle text not null unique,
        display_name text not null,
        stars integer not null default 0,
        earned integer not null default 0,
        unlocked text[] not null default array['cauri'],
        piece_set text not null default 'cauri',
        last_visit_day integer not null default 0,
        visit_streak integer not null default 0,
        daily_last_number integer not null default 0,
        daily_streak integer not null default 0,
        daily_solved_count integer not null default 0,
        imported boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table public.games (
        id text not null,
        player_id uuid not null references public.profiles(id) on delete cascade,
        game text not null,
        mode text not null,
        result text not null,
        opponent text not null default '',
        detail text,
        played_at bigint not null,
        primary key (player_id, id)
      );

      create view public.leaderboard as
        select p.display_name, p.handle,
               count(*) filter (where g.result = 'win') as wins,
               count(*) as played, p.daily_streak
        from public.profiles p
        join public.games g on g.player_id = p.id
        group by p.id, p.display_name, p.handle, p.daily_streak;

      create function public.import_local_progress(p_stars integer, p_games jsonb)
      returns jsonb language sql as $fn$ select '{}'::jsonb $fn$;
    `);

    await base.exec(schema());

    const { rows: colonnes } = await base.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name in ('coins', 'owned', 'board_theme', 'frame', 'title')
      order by column_name
    `);
    assert.deepEqual(
      colonnes.map((r) => r.column_name),
      ['board_theme', 'coins', 'frame', 'owned', 'title'],
      'toutes les colonnes de la boutique doivent être arrivées',
    );

    const { rows: cat } = await base.query('select count(*)::int as n from public.catalog');
    assert.equal(cat[0].n, 35, 'le catalogue doit être rempli');

    const { rows: fn } = await base.query(`
      select proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname in ('buy_item', 'set_loadout', 'list_friends')
      order by proname
    `);
    assert.deepEqual(
      fn.map((r) => r.proname),
      ['buy_item', 'list_friends', 'set_loadout'],
      'les nouvelles fonctions doivent être créées',
    );
  });

  test('les données d’une base antérieure survivent à la mise à jour', async () => {
    const base = await baseVierge();
    await base.exec(`
      create table public.profiles (
        id uuid primary key references auth.users on delete cascade,
        handle text not null unique,
        display_name text not null,
        stars integer not null default 0,
        earned integer not null default 0,
        unlocked text[] not null default array['cauri'],
        piece_set text not null default 'cauri',
        last_visit_day integer not null default 0,
        visit_streak integer not null default 0,
        daily_last_number integer not null default 0,
        daily_streak integer not null default 0,
        daily_solved_count integer not null default 0,
        imported boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    const { rows } = await base.query(
      "insert into auth.users (email) values ('ancien@x.app') returning id",
    );
    await base.query(
      `insert into public.profiles (id, handle, display_name, stars, unlocked, piece_set)
       values ($1, 'ancien', 'Ancien', 1234, array['cauri', 'sabar'], 'sabar')`,
      [rows[0].id],
    );

    await base.exec(schema());

    const { rows: apres } = await base.query(
      'select coins, owned, piece_set, board_theme from public.profiles where handle = $1',
      ['ancien'],
    );
    assert.equal(apres[0].coins, 1234, 'le solde survit');
    assert.deepEqual(apres[0].owned, ['pieces:sabar'], 'l’achat garde sa famille');
    assert.equal(apres[0].piece_set, 'sabar', 'les pions portés ne changent pas');
    assert.equal(apres[0].board_theme, 'bois', 'le plateau prend sa valeur par défaut');
  });
});
