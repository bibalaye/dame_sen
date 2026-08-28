/**
 * Comptes joueurs : identité, validation, identifiant interne.
 *
 * Le joueur s'inscrit avec un pseudo et un mot de passe — pas d'adresse
 * électronique. C'est un choix d'accessibilité : demander un courriel écarte
 * une partie du public visé, et le jeu n'a rien à lui envoyer.
 *
 * Le fournisseur d'authentification, lui, raisonne en adresses. On lui en
 * fabrique donc une à partir du pseudo, invisible du joueur. Ce détour a un
 * avantage inattendu : l'unicité des adresses, garantie par le fournisseur,
 * devient l'unicité des pseudos, sans table ni verrou à écrire.
 *
 * Ce module est pur : il ne connaît ni le réseau, ni le navigateur, ni
 * Supabase. Tout s'y teste sans rien démarrer.
 */

/**
 * Domaine des adresses fabriquées. Un sous-domaine qui ne recevra jamais de
 * courrier : aucune de ces adresses ne doit pouvoir aboutir quelque part.
 */
const INTERNAL_DOMAIN = 'joueurs.dame-sen.app';

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const PASSWORD_MIN = 6;

/**
 * Pseudos que personne ne peut prendre : ils laisseraient croire à une parole
 * officielle. La comparaison se fait sur la forme normalisée, donc « Admin »,
 * « ADMIN » et « ádmin » sont couverts par la seule entrée « admin ».
 */
const RESERVED = new Set([
  'admin',
  'administrateur',
  'moderateur',
  'moderation',
  'dame_sen',
  'damesen',
  'systeme',
  'support',
  'officiel',
  'anonyme',
  'invite',
  'null',
  'undefined',
]);

/**
 * Forme canonique d'un pseudo : ce qui sert à décider si deux joueurs sont le
 * même. Les accents et la casse sont retirés à dessein — « Amadou », « amadou »
 * et « Amádou » ne doivent pas pouvoir coexister, sinon le pseudo devient un
 * déguisement.
 */
export const normalizeHandle = (raw: string): string =>
  raw
    .normalize('NFD')
    // Retire les diacritiques une fois les caractères décomposés.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s.-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

export type Check = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const OK: Check = { ok: true };

export const checkHandle = (raw: string): Check => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Choisissez un pseudo.' };

  const handle = normalizeHandle(trimmed);

  // Un pseudo fait uniquement de signes se vide à la normalisation. Annoncer
  // qu'il est trop court induirait en erreur : c'est le contenu qui manque.
  if (handle.length === 0) {
    return { ok: false, reason: 'Le pseudo doit contenir des lettres ou des chiffres.' };
  }

  if (handle.length < HANDLE_MIN) {
    return {
      ok: false,
      reason: `Le pseudo doit faire au moins ${HANDLE_MIN} caractères.`,
    };
  }
  if (handle.length > HANDLE_MAX) {
    return {
      ok: false,
      reason: `Le pseudo ne peut pas dépasser ${HANDLE_MAX} caractères.`,
    };
  }
  if (RESERVED.has(handle)) {
    return { ok: false, reason: 'Ce pseudo est réservé, choisissez-en un autre.' };
  }

  return OK;
};

export const checkPassword = (raw: string): Check => {
  if (raw.length < PASSWORD_MIN) {
    return {
      ok: false,
      reason: `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`,
    };
  }
  // Aucune exigence de majuscule ni de chiffre : ces règles poussent surtout à
  // écrire le mot de passe sur un papier. La longueur suffit ici — rien
  // d'argent ni de personnel n'est en jeu.
  return OK;
};

/**
 * Adresse remise au fournisseur d'authentification. Déterministe : le même
 * pseudo redonne toujours la même adresse, sinon personne ne se reconnecterait.
 */
export const internalEmail = (rawHandle: string): string =>
  `${normalizeHandle(rawHandle)}@${INTERNAL_DOMAIN}`;

/** Vrai pour une adresse fabriquée par ce module, jamais montrée au joueur. */
export const isInternalEmail = (email: string): boolean =>
  email.endsWith(`@${INTERNAL_DOMAIN}`);

/**
 * Nom affiché : ce que le joueur a tapé, débarrassé des espaces superflus et
 * tronqué. La casse et les accents sont conservés — « Amadou » s'affiche
 * « Amadou », même si son identifiant est « amadou ».
 */
export const displayNameFrom = (raw: string): string =>
  raw.trim().replace(/\s+/g, ' ').slice(0, HANDLE_MAX);

export interface Account {
  readonly id: string;
  /** Forme canonique, unique parmi tous les joueurs. */
  readonly handle: string;
  /** Nom tel que le joueur l'a écrit. */
  readonly displayName: string;
  readonly createdAt: number;
}

/**
 * Traduit les erreurs du fournisseur en français, en restant vague sur ce qui a
 * échoué à la connexion : dire « ce pseudo n'existe pas » indiquerait aux
 * curieux quels comptes existent.
 */
export const explainAuthError = (message: string, action: 'signin' | 'signup'): string => {
  const lowered = message.toLowerCase();

  if (lowered.includes('already registered') || lowered.includes('already been')) {
    return 'Ce pseudo est déjà pris.';
  }
  if (lowered.includes('invalid login') || lowered.includes('invalid credentials')) {
    return 'Pseudo ou mot de passe incorrect.';
  }
  if (lowered.includes('email not confirmed')) {
    return 'Ce compte n’est pas encore activé.';
  }
  if (lowered.includes('rate limit') || lowered.includes('too many')) {
    return 'Trop de tentatives. Réessayez dans un instant.';
  }
  if (lowered.includes('network') || lowered.includes('fetch')) {
    return 'Connexion au serveur impossible. Vérifiez votre réseau.';
  }

  return action === 'signup'
    ? 'La création du compte a échoué.'
    : 'La connexion a échoué.';
};
