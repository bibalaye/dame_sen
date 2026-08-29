/**
 * Calcul des trajectoires pour l'animation pas-à-pas des pions de Ludo.
 */

import {
  HOME_LENGTH,
  TRACK,
  homeGate,
  type LudoMove,
  type LudoState,
  type Pawn,
} from './ludo.ts';
import {
  CENTER,
  TRACK_CELLS,
  finishedCell,
  homeCells,
  stableCells,
  type Cell,
} from './ludoBoard.ts';

/**
 * Détermine la case courante exacte d'un pion sur la grille 15x15.
 */
export const cellOfPawn = (state: LudoState, pawnIndex: number): Cell => {
  const pawn = state.pawns[pawnIndex];
  if (!pawn) return CENTER;
  const spot = pawn.spot;

  if (spot.zone === 'track') return TRACK_CELLS[spot.square];
  if (spot.zone === 'home') return homeCells(spot.host)[spot.step];
  if (spot.zone === 'finished') {
    const avant = state.pawns
      .slice(0, pawnIndex)
      .filter((p) => p.owner === pawn.owner && p.spot.zone === 'finished').length;
    return finishedCell(pawn.owner, avant);
  }

  // Écurie
  const places = stableCells(spot.host);
  const rang = state.pawns
    .slice(0, pawnIndex)
    .filter((p) => p.spot.zone === 'stable' && p.spot.host === spot.host).length;

  return places[Math.min(rang, places.length - 1)];
};

/**
 * Calcule la séquence ordonnée de toutes les cases traversées par un pion
 * lors de l'exécution d'un coup (de la position actuelle jusqu'à la destination finale).
 */
export const getMovePath = (state: LudoState, move: LudoMove): Cell[] => {
  const pawn: Pawn | undefined = state.pawns[move.pawn];
  if (!pawn) return [];

  const startCell = cellOfPawn(state, move.pawn);
  const path: Cell[] = [startCell];

  // 1. Sortie d'écurie
  if (move.kind === 'enter') {
    if (move.to.zone === 'track') {
      path.push(TRACK_CELLS[move.to.square]);
    }
    return path;
  }

  // 2. Libération d'un pion prisonnier
  if (move.kind === 'free') {
    const places = stableCells(pawn.owner);
    path.push(places[0] ?? startCell);
    return path;
  }

  // 3. Avance classique sur le circuit
  if (move.kind === 'advance' && pawn.spot.zone === 'track') {
    const fromSquare = pawn.spot.square;
    for (let s = 1; s <= move.die; s++) {
      const sq = (fromSquare + s) % TRACK;
      path.push(TRACK_CELLS[sq]);
    }
    return path;
  }

  // 4. Entrée ou progression dans l'allée finale (ou rentrée au centre)
  if (move.kind === 'home') {
    const isFinished = move.to.zone === 'finished';
    const targetStep = isFinished ? HOME_LENGTH : move.to.zone === 'home' ? move.to.step : 0;

    if (pawn.spot.zone === 'track') {
      const fromSquare = pawn.spot.square;
      const versSeuil = (homeGate(pawn.owner) - fromSquare + TRACK) % TRACK;

      // Parcours sur le circuit jusqu'au seuil
      for (let s = 1; s <= versSeuil; s++) {
        const sq = (fromSquare + s) % TRACK;
        path.push(TRACK_CELLS[sq]);
      }

      // Progression dans l'allée
      const alley = homeCells(pawn.owner);
      for (let st = 0; st < Math.min(targetStep, HOME_LENGTH); st++) {
        if (alley[st]) path.push(alley[st]);
      }

      if (isFinished) {
        const avant = state.pawns.filter(
          (p, i) => i !== move.pawn && p.owner === pawn.owner && p.spot.zone === 'finished',
        ).length;
        path.push(finishedCell(pawn.owner, avant));
      }
      return path;
    }

    if (pawn.spot.zone === 'home') {
      const fromStep = pawn.spot.step;
      const alley = homeCells(pawn.owner);

      for (let st = fromStep + 1; st < Math.min(targetStep, HOME_LENGTH); st++) {
        if (alley[st]) path.push(alley[st]);
      }

      if (isFinished) {
        const avant = state.pawns.filter(
          (p, i) => i !== move.pawn && p.owner === pawn.owner && p.spot.zone === 'finished',
        ).length;
        path.push(finishedCell(pawn.owner, avant));
      }
      return path;
    }
  }

  // 5. Incursion chez un adversaire
  if (move.kind === 'raid' && pawn.spot.zone === 'track' && move.to.zone === 'home') {
    const fromSquare = pawn.spot.square;
    const host = move.to.host;
    const targetStep = move.to.step;
    const jusquAuSeuil = (homeGate(host) - fromSquare + TRACK) % TRACK;

    for (let s = 1; s <= jusquAuSeuil; s++) {
      const sq = (fromSquare + s) % TRACK;
      path.push(TRACK_CELLS[sq]);
    }

    const alley = homeCells(host);
    for (let st = 0; st <= targetStep; st++) {
      if (alley[st]) path.push(alley[st]);
    }
    return path;
  }

  // 6. Échappement d'une allée
  if (move.kind === 'escape' && pawn.spot.zone === 'home') {
    const host = pawn.spot.host;
    const fromStep = pawn.spot.step;
    const alley = homeCells(host);

    if (move.to.zone === 'home') {
      const targetStep = move.to.step;
      for (let st = fromStep - 1; st >= targetStep; st--) {
        if (alley[st]) path.push(alley[st]);
      }
    } else if (move.to.zone === 'track') {
      for (let st = fromStep - 1; st >= 0; st--) {
        if (alley[st]) path.push(alley[st]);
      }
      path.push(TRACK_CELLS[move.to.square]);
    }
    return path;
  }

  return path;
};
