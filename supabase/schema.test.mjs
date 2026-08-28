/**
 * Le schéma des comptes, exécuté pour de vrai.
 *
 * Les règles d'économie vivent désormais en SQL : c'est le serveur qui accorde
 * les étoiles, et le client ne peut plus les recalculer. Un barème qui ne
 * s'exécute nulle part avant la production est un pari — le premier bug trouvé
 * ici (« malformed array literal »), invisible à l'analyse syntaxique, n'était
 * pas dans un chemin exotique mais dans la fin de partie ordinaire.
 *
 * PGlite fournit un vrai PostgreSQL en WebAssembly : pas de service à
 * installer, pas de conteneur à lancer. On y rejoue ce que Supabase apporte de
 * son côté — le schéma `auth`, ses rôles, `auth.uid()` — puis on exerce chaque
 * chemin des sept fonctions.
 *
 *   npm run test:sql
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

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
    assert.equal(p.stars, 0);
    assert.deepEqual(p.unlocked, ['cauri']);
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
    assert.equal(r.stars, 35);
    assert.equal((await profil(uid)).earned, 35);
  });

  test('une défaite rapporte quand même la participation', async () => {
    await nouveauJoueur('omar');
    const r = await jouer({ result: 'loss' });

    assert.deepEqual(r.rewards, ['played']);
    assert.equal(r.stars, 10);
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
    const avant = (await profil(uid)).stars;

    const r = await jouer({ id: 'partie-unique', result: 'win' });

    assert.equal(r.duplicate, true);
    assert.deepEqual(r.rewards, []);
    assert.equal((await profil(uid)).stars, avant, 'le solde ne bouge pas');
  });

  test('le défi du jour ne passe pas par le barème des parties', async () => {
    const uid = await nouveauJoueur('sokhna');
    const r = await jouer({ mode: 'daily', result: 'win' });

    assert.deepEqual(r.rewards, []);
    assert.equal((await profil(uid)).stars, 0);
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
    assert.equal(rows[0].r.stars, 20);
    assert.equal((await profil(uid)).visit_streak, 1);
  });

  test('revenir le même jour ne rapporte rien', async () => {
    await nouveauJoueur('cheikh');
    await db.query('select public.claim_daily_visit() as r');
    const { rows } = await db.query('select public.claim_daily_visit() as r');

    assert.deepEqual(rows[0].r.rewards, []);
    assert.equal(rows[0].r.stars, 20);
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
    assert.equal(rows[0].r.stars, 520, '20 pour la venue, 500 pour la semaine');
  });
});

describe('défi du jour', () => {
  test('un défi résolu rapporte et ouvre la série', async () => {
    const uid = await nouveauJoueur('seynabou');
    const { rows } = await db.query('select public.record_daily($1, $2) as r', [10, true]);

    assert.deepEqual(rows[0].r.rewards, ['daily-solved']);
    assert.equal(rows[0].r.stars, 50);
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
    assert.equal((await profil(uid)).stars, 50, 'pas de second versement');
  });
});

describe('déblocage des pions', () => {
  const enrichir = async (uid, stars) =>
    db.query('update public.profiles set stars = $2 where id = $1', [uid, stars]);

  test('un achat débite le solde et ajoute le jeu', async () => {
    const uid = await nouveauJoueur('astou');
    await enrichir(uid, 1000);

    const { rows } = await db.query('select public.unlock_piece_set($1) as r', ['sabar']);
    assert.equal(rows[0].r.stars, 700);
    assert.ok(rows[0].r.unlocked.includes('sabar'));
  });

  test('un solde insuffisant refuse l’achat', async () => {
    const uid = await nouveauJoueur('malick');
    await enrichir(uid, 10);

    await assert.rejects(
      () => db.query('select public.unlock_piece_set($1)', ['jetons']),
      /solde insuffisant/,
    );
    assert.equal((await profil(uid)).stars, 10, 'rien n’est débité');
  });

  test('on ne paie jamais deux fois le même jeu', async () => {
    const uid = await nouveauJoueur('nafi');
    await enrichir(uid, 1000);
    await db.query('select public.unlock_piece_set($1)', ['sabar']);
    const apresPremier = (await profil(uid)).stars;

    await db.query('select public.unlock_piece_set($1)', ['sabar']);
    assert.equal((await profil(uid)).stars, apresPremier);
  });

  test('un jeu de pions inconnu est refusé', async () => {
    await nouveauJoueur('bakary');
    await assert.rejects(
      () => db.query('select public.unlock_piece_set($1)', ['licorne']),
      /inconnu/,
    );
  });

  test('le solde ne peut pas devenir négatif', async () => {
    const uid = await nouveauJoueur('salif');
    await enrichir(uid, 300);
    await db.query('select public.unlock_piece_set($1)', ['sabar']);

    assert.equal((await profil(uid)).stars, 0);
  });
});

describe('choix des pions', () => {
  test('on met en jeu ce qu’on possède', async () => {
    const uid = await nouveauJoueur('dieynaba');
    await db.query('update public.profiles set stars = 1000 where id = $1', [uid]);
    await db.query('select public.unlock_piece_set($1)', ['sabar']);
    await db.query('select public.set_piece_set($1)', ['sabar']);

    assert.equal((await profil(uid)).piece_set, 'sabar');
  });

  test('un jeu non acquis est refusé', async () => {
    const uid = await nouveauJoueur('ousmane');
    await assert.rejects(
      () => db.query('select public.set_piece_set($1)', ['donjon']),
      /non debloque/,
    );
    assert.equal((await profil(uid)).piece_set, 'cauri');
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
    assert.equal(rows[0].r.stars, 250);
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
    assert.equal((await profil(uid)).stars, 100, 'la seconde reprise ne crédite rien');
  });

  test('un solde gonflé est plafonné', async () => {
    const uid = await nouveauJoueur('adama');
    await db.query('select public.import_local_progress($1, $2)', [
      5_000_000,
      JSON.stringify([]),
    ]);

    assert.equal((await profil(uid)).stars, 1000, 'le plafond tient');
  });

  test('un solde négatif ne retire rien', async () => {
    const uid = await nouveauJoueur('fallou');
    await db.query('select public.import_local_progress($1, $2)', [-500, JSON.stringify([])]);

    assert.equal((await profil(uid)).stars, 0);
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
        and p.proname in ('record_game', 'claim_daily_visit', 'unlock_piece_set',
                          'record_daily', 'set_piece_set', 'import_local_progress',
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

    for (const interdit of ['stars', 'earned', 'id']) {
      assert.ok(!colonnes.includes(interdit), `${interdit} ne doit pas être exposé`);
    }
  });
});
