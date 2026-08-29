/**
 * Ce que produit un doigt posé sur un pion.
 *
 * La règle tenait dans un gestionnaire de clic, et elle s'y est trompée deux
 * fois : un pion resté choisi après un coup se désélectionnait quand on le
 * retouchait pour l'avancer, et l'on croyait le coup refusé. Une décision qui
 * se trompe mérite d'être écrite à part, où elle se teste.
 *
 * Trois issues seulement : jouer, choisir, relâcher.
 */

import type { LudoMove } from './ludo.ts';

export type TapOutcome =
  /** Le coup part sans autre question. */
  | { readonly kind: 'play'; readonly move: LudoMove }
  /** Le pion devient celui qu'on déplace ; ses cases s'affichent. */
  | { readonly kind: 'select'; readonly pawn: number }
  /** Le pion cesse d'être choisi. */
  | { readonly kind: 'release' }
  /** Rien à faire de ce pion. */
  | { readonly kind: 'ignore' };

/**
 * Décide ce que vaut un appui sur un pion.
 *
 * Deux principes :
 *
 *   — un pion qui n'a qu'un coup se joue au doigt, qu'il soit déjà choisi ou
 *     non. C'est le cas le plus fréquent après une prise, quand il ne reste
 *     qu'un dé : redemander où aller serait une question sans réponse possible.
 *   — toucher un autre pion le choisit sur-le-champ. Obliger à relâcher le
 *     précédent d'abord ferait payer deux gestes le moindre changement d'avis.
 *
 * On ne relâche donc que sur le pion déjà choisi, et seulement s'il lui reste
 * plusieurs destinations — là, le doigt ne peut vouloir dire qu'« annuler ».
 */
export const resolvePawnTap = (
  moves: readonly LudoMove[],
  selected: number | null,
  pawn: number,
): TapOutcome => {
  const propres = moves.filter((move) => move.pawn === pawn);
  if (propres.length === 0) return { kind: 'ignore' };

  if (propres.length === 1) return { kind: 'play', move: propres[0] };

  return pawn === selected ? { kind: 'release' } : { kind: 'select', pawn };
};
