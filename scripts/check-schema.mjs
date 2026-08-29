/**
 * Vérifie ce que l'instance Supabase contient réellement.
 *
 *   npm run check:schema
 *
 * L'éditeur SQL de Supabase exécute tout d'un bloc : une seule erreur au milieu
 * du fichier et rien ne s'applique ensuite — sans que le jeu le dise autrement
 * que par une panne, plus tard, à l'endroit le moins pratique. Ce script pose la
 * question directement, colonne par colonne et fonction par fonction.
 *
 * Il n'écrit rien et n'a besoin que de la clé publique.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const lireEnv = () => {
  for (const fichier of ['.env.local', '.env']) {
    try {
      return Object.fromEntries(
        readFileSync(fichier, 'utf8')
          .split(/\r?\n/)
          .filter((l) => l && !l.startsWith('#') && l.includes('='))
          .map((l) => {
            const i = l.indexOf('=');
            return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
          }),
      );
    } catch {
      // Fichier absent : on essaie le suivant.
    }
  }
  return {};
};

const env = { ...lireEnv(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log('Aucune clé Supabase : rien à vérifier.');
  console.log('Renseignez .env.local (voir .env.example) pour activer les comptes.');
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Ce que le jeu attend. */
const COLONNES = [
  'coins',
  'earned',
  'owned',
  'piece_set',
  'board_theme',
  'frame',
  'title',
  'last_visit_day',
  'visit_streak',
  'daily_last_number',
  'daily_streak',
  'daily_solved_count',
  'imported',
];

const TABLES = ['profiles', 'games', 'catalog', 'friendships', 'game_invites', 'leaderboard'];

const FONCTIONS = [
  ['create_profile', { p_handle: 'x', p_display_name: 'x' }],
  ['claim_daily_visit', {}],
  [
    'record_game',
    {
      p_id: 'x',
      p_game: 'dames',
      p_mode: 'solo',
      p_result: 'win',
      p_opponent: 'x',
      p_detail: null,
      p_played_at: 1,
    },
  ],
  ['record_daily', { p_number: 1, p_solved: false }],
  ['buy_item', { p_item: 'pieces:sabar' }],
  ['set_loadout', { p_pieces: null, p_board: null, p_frame: null, p_title: null }],
  ['import_local_progress', { p_coins: 0, p_games: [] }],
  ['search_players', { p_query: 'ab' }],
  ['send_friend_request', { p_handle: 'x' }],
  ['respond_friend_request', { p_handle: 'x', p_accept: true }],
  ['remove_friend', { p_handle: 'x' }],
  ['list_friends', {}],
  ['invite_friend', { p_handle: 'x', p_room: 'x', p_game: 'dames' }],
  ['pending_invites', {}],
  ['dismiss_invite', { p_id: '00000000-0000-0000-0000-000000000000' }],
];

const manquants = [];
const ouvertes = [];

console.log(`Instance : ${url.replace(/(https:\/\/.{4}).*/, '$1…')}`);
console.log('');

console.log('Colonnes de profiles');
for (const col of COLONNES) {
  const { error } = await supabase.from('profiles').select(col).limit(1);
  const absente = error?.code === '42703';
  if (absente) manquants.push(`colonne profiles.${col}`);
  console.log(`  ${absente ? '✗' : '·'} ${col}`);
}

console.log('');
console.log('Tables et vues');
for (const table of TABLES) {
  const { error } = await supabase.from(table).select('*').limit(1);
  // PGRST205 : la table n'est pas dans le cache de schéma, donc absente.
  const absente = error?.code === '42P01' || error?.code === 'PGRST205';
  if (absente) manquants.push(`table ${table}`);
  console.log(`  ${absente ? '✗' : '·'} ${table}`);
}

console.log('');
console.log('Fonctions');
for (const [nom, args] of FONCTIONS) {
  const { error } = await supabase.rpc(nom, args);
  const absente = error?.code === 'PGRST202';

  if (absente) manquants.push(`fonction ${nom}`);
  // Sans erreur du tout, la fonction s'exécute pour un visiteur anonyme : les
  // droits n'ont pas été appliqués.
  else if (!error) ouvertes.push(nom);

  console.log(`  ${absente ? '✗' : '·'} ${nom}`);
}

console.log('');

if (manquants.length === 0 && ouvertes.length === 0) {
  console.log('Tout est en place.');
  process.exit(0);
}

if (manquants.length > 0) {
  console.log(`${manquants.length} élément(s) manquant(s) :`);
  for (const item of manquants) console.log(`  - ${item}`);
  console.log('');
  console.log('Recollez supabase/schema.sql en entier dans SQL Editor.');
  console.log('Si l’éditeur signale une erreur, elle arrête tout le reste du fichier.');
}

if (ouvertes.length > 0) {
  console.log('');
  console.log(`${ouvertes.length} fonction(s) exécutables sans compte — droits non appliqués :`);
  for (const nom of ouvertes) console.log(`  - ${nom}`);
}

process.exit(1);
