/**
 * L'adversaire artificiel du Ludo.
 *
 * Le negamax des dames ne s'applique pas ici : il suppose deux joueurs, aucun
 * hasard, et une somme nulle — trois conditions qu'un jeu de dés à quatre
 * dément. Explorer l'arbre demanderait de développer un nœud de chance à
 * chaque tour, pour un gain douteux.
 *
 * Une heuristique suffit, et pour une raison précise : le facteur de
 * branchement est minuscule. À chaque dé, au plus quatre pions sont jouables.
 * Ce qui décide d'une partie de Ludo n'est pas la profondeur de calcul mais
 * l'ordre des priorités — prendre plutôt qu'avancer, se garder d'être à portée,
 * ne pas laisser un pion seul devant un adversaire.
 *
 * Le module est pur : la source de hasard est fournie, ce qui rend le choix
 * reproductible et donc testable.
 */

import {
  HOME_LENGTH,
  PIECES_PER_PLAYER,
  TRACK,
  START_SQUARE,
  legalLudoMoves,
  progressOf,
  type LudoMove,
  type LudoPlayerId,
  type LudoState,
  type Pawn,
} from './ludo.ts';

export type LudoDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Part de coups joués au hasard. Un adversaire qui ne se trompe jamais n'est
 * pas plus fort à ce jeu — il est seulement décourageant.
 */
const BLUNDER: Readonly<Record<LudoDifficulty, number>> = {
  easy: 0.6,
  medium: 0.2,
  hard: 0,
};

/**
 * Barème des intentions. Les écarts comptent plus que les valeurs : prendre un
 * pion doit l'emporter sur toute avance, et un pion presque rentré vaut
 * beaucoup plus qu'un qui vient de sortir.
 */
const SCORES = {
  /** Prendre : l'adversaire devra deux six pour revoir ce pion. */
  capture: 100,
  /** Prendre dans une allée : la victime était à quelques cases du but. */
  raid: 130,
  /** Rentrer un pion : un acquis que rien ne reprend. */
  finish: 95,
  /** Récupérer un prisonnier. */
  free: 85,
  /** Se dégager d'une allée adverse, où l'on ne fait rien de bon. */
  escape: 75,
  /** Ressortir de sa propre allée : on rend des cases déjà gagnées. */
  leaveOwnHome: -55,
  /** Mettre un pion en jeu. */
  enter: 60,
  /** Entrer dans sa propre allée : plus rien ne peut l'y atteindre… ou presque. */
  homeEntry: 45,
  /** Former un barrage : on tient le passage. */
  blockade: 35,
  /** Quitter une case menacée. */
  flee: 28,
  /** Se poser à portée d'un adversaire. */
  exposed: -40,
  /** Par case gagnée : départage les coups équivalents. */
  perStep: 1,
} as const;

/** Portée d'un dé : un adversaire situé de 1 à 6 cases derrière peut frapper. */
const REACH = 6;

const trackSquare = (pawn: Pawn): number | null =>
  pawn.spot.zone === 'track' ? pawn.spot.square : null;

/**
 * Nombre d'adversaires en mesure d'atteindre cette case au prochain dé.
 *
 * On ne regarde que les six cases en amont : au-delà, il faudrait deux dés, et
 * s'en garder rendrait le jeu impossible à jouer.
 */
export const threatsOn = (
  state: LudoState,
  square: number,
  forPlayer: LudoPlayerId,
): number => {
  let menaces = 0;

  for (const pawn of state.pawns) {
    if (pawn.owner === forPlayer) continue;

    const depuis = trackSquare(pawn);
    if (depuis === null) continue;

    const ecart = (square - depuis + TRACK) % TRACK;
    if (ecart >= 1 && ecart <= REACH) menaces++;
  }

  return menaces;
};

/**
 * Vrai si le coup pose deux pions du joueur sur la même case.
 *
 * Ce n'est un barrage qu'à sa propre porte. Ailleurs, c'est le contraire d'une
 * protection : un adversaire qui tombe dessus prend les deux d'un coup.
 */
const empile = (state: LudoState, move: LudoMove): boolean => {
  if (move.to.zone !== 'track') return false;

  const cible = move.to.square;
  return state.pawns.some(
    (p, i) =>
      i !== move.pawn &&
      p.owner === state.current &&
      p.spot.zone === 'track' &&
      p.spot.square === cible,
  );
};

/** Vrai si l'empilement se fait à la porte du joueur, là où il protège. */
const formeBarrage = (state: LudoState, move: LudoMove): boolean =>
  move.to.zone === 'track' &&
  move.to.square === START_SQUARE[state.current] &&
  empile(state, move);

/**
 * Ce que vaut un coup. Le score n'a pas d'unité : seul l'ordre compte.
 *
 * Exporté pour être testable — c'est là que tient toute la force du joueur
 * artificiel, et une erreur de signe y passerait inaperçue autrement.
 */
export const scoreLudoMove = (state: LudoState, move: LudoMove): number => {
  const pawn = state.pawns[move.pawn];
  let score = 0;

  // --- Ce que le coup accomplit --------------------------------------------
  for (const index of move.captures ?? []) {
    const proie = state.pawns[index];

    if (move.kind === 'raid') {
      // La victime était dans son allée : elle repart de zéro, et de loin.
      score += SCORES.raid;
      if (proie.spot.zone === 'home') score += proie.spot.step * 6;
    } else {
      // Chaque pion compte : hors de sa porte, deux pions empilés se prennent
      // ensemble, et le coup vaut alors le double.
      score += SCORES.capture;
      // Un pion avancé coûte plus cher à son propriétaire qu'un pion frais.
      score += progressOf(proie);
    }
  }

  if (move.to.zone === 'finished') score += SCORES.finish;
  else if (move.kind === 'free') score += SCORES.free;
  else if (move.kind === 'enter') score += SCORES.enter;
  else if (move.kind === 'home') score += SCORES.homeEntry;
  else if (move.kind === 'escape') {
    /*
     * Se dégager d'une allée adverse est excellent — on n'y fait rien de bon.
     * Ressortir de la sienne est le contraire : on renonce à des cases déjà
     * gagnées. L'un et l'autre portent le même nom de coup, et les confondre
     * ferait faire demi-tour au joueur artificiel à chaque six.
     */
    const chezSoi = pawn.spot.zone === 'home' && pawn.spot.host === pawn.owner;
    score += chezSoi ? SCORES.leaveOwnHome : SCORES.escape;
  }

  if (formeBarrage(state, move)) score += SCORES.blockade;

  // --- Ce que le coup expose ------------------------------------------------
  const depart = trackSquare(pawn);

  if (depart !== null) {
    const menaceAvant = threatsOn(state, depart, state.current);
    // Partir d'une case menacée vaut mieux que d'y rester.
    if (menaceAvant > 0) score += SCORES.flee * menaceAvant;
  }

  if (move.to.zone === 'track') {
    const menaceApres = threatsOn(state, move.to.square, state.current);

    if (menaceApres > 0 && !formeBarrage(state, move)) {
      /*
       * Un barrage ne se prend pas ; ailleurs, s'empiler double la perte au
       * lieu de la conjurer, puisque les deux pions partent ensemble. C'est le
       * piège de cette variante, et l'adversaire doit l'éviter.
       */
      score += SCORES.exposed * menaceApres * (empile(state, move) ? 2 : 1);
    }
  }

  // --- Avancement -----------------------------------------------------------
  score += move.die * SCORES.perStep;

  /*
   * Un pion aventuré chez un adversaire n'avance plus : le sortir de là passe
   * avant de faire progresser un pion déjà libre. Sans ce rappel, il pouvait y
   * rester la partie entière.
   */
  if (pawn.spot.zone === 'home' && pawn.spot.host !== pawn.owner) {
    score += SCORES.escape;
  }

  return score;
};

/**
 * Le coup choisi, ou `null` s'il n'y en a aucun — ce qui arrive souvent au
 * Ludo, où l'on passe son tour faute de six.
 */
export const chooseLudoMove = (
  state: LudoState,
  difficulty: LudoDifficulty = 'medium',
  random: () => number = Math.random,
): LudoMove | null => {
  const moves = legalLudoMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  // La maladresse se joue avant l'évaluation : à quoi bon calculer un coup
  // qu'on ne jouera pas.
  if (random() < BLUNDER[difficulty]) {
    return moves[Math.floor(random() * moves.length)];
  }

  let meilleur = moves[0];
  let meilleurScore = scoreLudoMove(state, meilleur);

  for (const move of moves.slice(1)) {
    const score = scoreLudoMove(state, move);
    if (score > meilleurScore) {
      meilleur = move;
      meilleurScore = score;
    }
  }

  return meilleur;
};

/**
 * Avancement d'un joueur, entre 0 et 1. Sert à l'écran de fin et aux
 * statistiques, pas à la décision.
 */
export const progressRatio = (state: LudoState, player: LudoPlayerId): number => {
  const total = PIECES_PER_PLAYER * (TRACK + HOME_LENGTH);
  let fait = 0;

  for (const pawn of state.pawns) {
    if (pawn.owner !== player) continue;

    if (pawn.spot.zone === 'finished') fait += TRACK + HOME_LENGTH;
    else if (pawn.spot.zone === 'track') fait += progressOf(pawn);
    else if (pawn.spot.zone === 'home' && pawn.spot.host === player) {
      fait += TRACK + pawn.spot.step;
    }
  }

  return fait / total;
};
