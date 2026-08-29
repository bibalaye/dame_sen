'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

import Modal from '../Modal';
import { play, vibrate } from '@/lib/sound';
import {
  LUDO_PLAYERS,
  createLudoGame,
  earnsExtraRoll,
  endTurn,
  isCaptive,
  blockadeOwner,
  legalLudoMoves,
  pawnsOnSquare,
  playLudoMove,
  seatsFor,
  turnIsOver,
  rollDice,
  rollInto,
  sameSpot,
  type LudoMove,
  type LudoPlayerId,
  type LudoState,
  type Pawn,
} from '@/lib/ludo';
import { chooseLudoMove, type LudoDifficulty } from '@/lib/ludoAi';
import {
  CENTER,
  GRID,
  LUDO_COLORS,
  LUDO_NAMES,
  TRACK_CELLS,
  finishedCell,
  homeCells,
  stableArea,
  stableCells,
  startOwner,
  type Cell,
} from '@/lib/ludoBoard';
import styles from './Ludo.module.css';

interface LudoProps {
  mode: 'solo' | 'pass';
  difficulty: LudoDifficulty;
  /** Nombre de joueurs assis autour du plateau. */
  playerCount?: number;
  onExit: () => void;
  /** Consigne la partie terminée. */
  onFinish?: (won: boolean) => void;
}

/** Le joueur qui tient l'appareil en solo. */
const HUMAN: LudoPlayerId = 0;

/** Temps de réflexion affiché pour l'adversaire, en millisecondes. */
const AI_DELAY = 620;
/** Le temps de voir les dés avant que la partie ne reprenne. */
const ROLL_PAUSE = 480;

const PAWN_IMAGE: Readonly<Record<LudoPlayerId, string>> = {
  0: '/assets/pieces/pawn-red.png',
  1: '/assets/pieces/pawn-green.png',
  2: '/assets/pieces/pawn-blue.png',
  3: '/assets/pieces/pawn-yellow.png',
};

/** Où se dessine un pion, selon l'endroit où il se trouve. */
const cellOf = (state: LudoState, index: number): Cell => {
  const pawn = state.pawns[index];
  const spot = pawn.spot;

  if (spot.zone === 'track') return TRACK_CELLS[spot.square];
  if (spot.zone === 'home') return homeCells(spot.host)[spot.step];
  if (spot.zone === 'finished') {
    const avant = state.pawns
      .slice(0, index)
      .filter((p) => p.owner === pawn.owner && p.spot.zone === 'finished').length;
    return finishedCell(pawn.owner, avant);
  }

  // À l'écurie : chaque pion prend une place, chez son propriétaire ou chez son
  // ravisseur. On compte ceux qui l'y ont précédé pour ne pas les superposer.
  const places = stableCells(spot.host);
  const rang = state.pawns
    .slice(0, index)
    .filter((p) => p.spot.zone === 'stable' && p.spot.host === spot.host).length;

  return places[Math.min(rang, places.length - 1)];
};

const Ludo: React.FC<LudoProps> = ({
  mode,
  difficulty,
  playerCount = 4,
  onExit,
  onFinish,
}) => {
  const [state, setState] = useState<LudoState>(() => createLudoGame(playerCount));
  /** Les coins occupés : à deux, on s'assoit en diagonale. */
  const sieges = seatsFor(playerCount);
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const finished = state.status.kind !== 'playing';

  /** À deux sur un appareil, chacun joue son tour ; en solo, seul le rouge. */
  const isHuman = mode === 'pass' || state.current === HUMAN;

  const moves = useMemo(() => legalLudoMoves(state), [state]);

  /** Les coups du pion choisi : c'est ce qu'on met en évidence sur le plateau. */
  const movesForSelected = useMemo(
    () => (selected === null ? [] : moves.filter((m) => m.pawn === selected)),
    [moves, selected],
  );

  const playablePawns = useMemo(
    () => new Set(moves.map((m) => m.pawn)),
    [moves],
  );

  // --- Déroulement ---------------------------------------------------------

  /**
   * Joue un coup, et garde le pion sous la main s'il lui reste un dé.
   *
   * Le désélectionner obligeait à le retrouver et à le recliquer entre les deux
   * dés — au point qu'on croyait ne plus pouvoir enchaîner avec le même pion
   * après une prise. C'est pourtant le geste le plus courant : avancer de trois
   * pour prendre, puis de cinq pour s'éloigner.
   */
  const applyMove = useCallback((move: LudoMove) => {
    /*
     * Le nouvel état se calcule ici plutôt que dans la mise à jour : jouer un
     * son ou changer la sélection depuis l'intérieur d'un `setState` sont des
     * effets de bord, et React se réserve le droit d'y passer deux fois.
     */
    const current = stateRef.current;
    const next = playLudoMove(current, move);
    if (next === current) return;

    if (move.captures?.length) {
      play('capture');
      vibrate(30);
    } else {
      play('move');
    }

    // Le pion reste choisi tant qu'il a de quoi jouer ; sinon la main se libère
    // pour un autre.
    const encore = legalLudoMoves(next).some((m) => m.pawn === move.pawn);
    setSelected(encore ? move.pawn : null);

    stateRef.current = next;
    setState(next);
  }, []);

  const roll = useCallback(() => {
    if (rolling) return;
    setRolling(true);
    setNotice(null);
    play('select');

    setTimeout(() => {
      setState((current) => rollInto(current, rollDice()));
      setRolling(false);
    }, ROLL_PAUSE);
  }, [rolling]);

  /*
   * Fin de tour : le moteur seul en décide. Le composant s'en remettait à
   * `dice.length`, ce qui ne distinguait pas « pas encore lancé » de « tout
   * joué » — et le joueur qui sortait le premier gardait la main indéfiniment.
   */
  const tourFini = turnIsOver(state);

  useEffect(() => {
    if (finished || rolling || !tourFini) return;

    const relance = earnsExtraRoll(state.rolled, state.extraRolls);
    const timer = setTimeout(() => {
      setNotice(relance ? 'Six : vous rejouez.' : null);
      setState((current) => endTurn(current, relance));
    }, moves.length === 0 ? 700 : 420);

    return () => clearTimeout(timer);
  }, [tourFini, state.rolled, state.extraRolls, moves.length, finished, rolling]);

  /**
   * L'adversaire lance puis joue ; la fin de son tour est réglée par l'effet
   * ci-dessus, comme pour un joueur humain. Deux chemins pour la même règle
   * finiraient par diverger.
   */
  useEffect(() => {
    if (finished || isHuman || rolling || tourFini) return;

    const timer = setTimeout(() => {
      const current = stateRef.current;

      if (current.rolled.length === 0) {
        setState(rollInto(current, rollDice()));
        return;
      }

      const choix = chooseLudoMove(current, difficulty);
      if (choix) applyMove(choix);
    }, AI_DELAY);

    return () => clearTimeout(timer);
  }, [state, finished, isHuman, rolling, tourFini, difficulty, applyMove]);

  // La partie terminée se signale une seule fois.
  const reported = useRef(false);
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;

    play(state.status.kind === 'win' && state.status.winner === HUMAN ? 'win' : 'lose');
    if (state.status.kind === 'win') onFinish?.(state.status.winner === HUMAN);
  }, [finished, state.status, onFinish]);

  // --- Interaction ---------------------------------------------------------

  const handlePawn = (index: number) => {
    if (!isHuman || finished) return;

    const propres = moves.filter((m) => m.pawn === index);
    if (propres.length === 0) return;

    // Recliquer le pion choisi le relâche : c'est la seule façon de changer
    // d'avis une fois les destinations affichées.
    if (index === selected) {
      play('click');
      setSelected(null);
      return;
    }

    // Un seul coup possible : inutile de demander où aller.
    if (propres.length === 1) {
      applyMove(propres[0]);
      return;
    }

    play('click');
    setSelected(index);
  };

  const handleTarget = (spot: LudoMove['to']) => {
    const move = movesForSelected.find((m) => sameSpot(m.to, spot));
    if (move) applyMove(move);
  };

  // --- Rendu ----------------------------------------------------------------

  /** Les cases mises en évidence pour le pion choisi. */
  const targets = movesForSelected.map((m) => ({
    cell:
      m.to.zone === 'track'
        ? TRACK_CELLS[m.to.square]
        : m.to.zone === 'home'
          ? homeCells(m.to.host)[m.to.step]
          : CENTER,
    spot: m.to,
  }));

  const cases: React.ReactNode[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const square = TRACK_CELLS.findIndex((c) => c.row === row && c.col === col);
      const proprietaire = square === -1 ? null : startOwner(square);

      const allee = LUDO_PLAYERS.find((p) =>
        homeCells(p).some((c) => c.row === row && c.col === col),
      );

      const cible = targets.find((t) => t.cell.row === row && t.cell.col === col);
      const centre = row === CENTER.row && col === CENTER.col;

      const classes = [
        styles.cell,
        square !== -1 ? styles.track : '',
        allee !== undefined ? styles.lane : '',
        centre ? styles.center : '',
        cible ? styles.target : '',
      ]
        .filter(Boolean)
        .join(' ');

      const teinte =
        proprietaire !== null
          ? LUDO_COLORS[proprietaire]
          : allee !== undefined
            ? LUDO_COLORS[allee]
            : undefined;

      cases.push(
        cible ? (
          <button
            key={`${row}-${col}`}
            type="button"
            className={classes}
            style={{ gridRow: row + 1, gridColumn: col + 1, background: teinte }}
            onClick={() => handleTarget(cible.spot)}
            aria-label={
              cible.spot.zone === 'track' && pawnsOnSquare(state, cible.spot.square).length
                ? 'Attraper ici'
                : 'Jouer ici'
            }
          />
        ) : (
          <div
            key={`${row}-${col}`}
            className={classes}
            style={{ gridRow: row + 1, gridColumn: col + 1, background: teinte }}
          />
        ),
      );
    }
  }

  /** Les pions, groupés par case pour gérer les empilements. */
  const parCase = new Map<string, number[]>();
  state.pawns.forEach((_, index) => {
    const cell = cellOf(state, index);
    const cle = `${cell.row},${cell.col}`;
    parCase.set(cle, [...(parCase.get(cle) ?? []), index]);
  });

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={`uiRound ${styles.back}`} onClick={onExit}>
          ✕
        </button>

        <div className={styles.turn}>
          <span
            className={styles.dot}
            style={{ background: LUDO_COLORS[state.current] }}
            aria-hidden="true"
          />
          <span>
            {isHuman ? 'À vous' : `${LUDO_NAMES[state.current]} joue`}
          </span>
        </div>
      </header>

      <div className={styles.boardWrapper}>
        {/*
          Une fois un pion choisi, on désigne une case : plus aucun pion ne doit
          intercepter le clic, pas même les siens. Sans cela, une case occupée
          restait impossible à toucher — celle-là même où l'on veut aller
          prendre.
        */}
        <div className={`${styles.board} ${selected !== null ? styles.picking : ''}`}>
          {/*
            Les quatre camps sont dessinés même quand deux joueurs seulement
            s'affrontent : un plateau amputé de ses coins ne ressemble plus à un
            plateau. Les camps inoccupés sont simplement plus pâles, et n'ont
            pas de pions.
          */}
          {LUDO_PLAYERS.map((player) => {
            const area = stableArea(player);
            const assis = sieges.includes(player);

            return (
              <div
                key={`stable-${player}`}
                className={`${styles.stable} ${assis ? '' : styles.stableEmpty}`}
                style={{
                  gridRow: `${area.row + 1} / span ${area.size}`,
                  gridColumn: `${area.col + 1} / span ${area.size}`,
                  borderColor: LUDO_COLORS[player],
                  background: `color-mix(in srgb, ${LUDO_COLORS[player]} ${
                    assis ? 18 : 7
                  }%, var(--surface))`,
                }}
              />
            );
          })}

          {cases}

          {/* Les pions, par-dessus */}
          {[...parCase.entries()].map(([cle, indices]) => {
            const [row, col] = cle.split(',').map(Number);
            const premier = indices[0];

            return (
              <div
                key={cle}
                className={styles.pawnSlot}
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
              >
                {indices.slice(0, 2).map((index, rang) => {
                  const pawn: Pawn = state.pawns[index];
                  const jouable = playablePawns.has(index) && isHuman;

                  return (
                    <button
                      key={index}
                      type="button"
                      className={[
                        styles.pawn,
                        jouable ? styles.playable : '',
                        selected === index ? styles.selected : '',
                        isCaptive(pawn) ? styles.captive : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ transform: `translate(${rang * 5}px, ${rang * -5}px)` }}
                      onClick={() => handlePawn(index)}
                      disabled={!jouable}
                      aria-label={`Pion ${LUDO_NAMES[pawn.owner]}`}
                    >
                      <Image src={PAWN_IMAGE[pawn.owner]} width={40} height={40} alt="" />
                    </button>
                  );
                })}

                {indices.length > 2 && (
                  <span className={styles.stack} aria-hidden="true">
                    {indices.length}
                  </span>
                )}
                {/*
                  Le liseré ne marque qu'un vrai barrage — à la porte de son
                  propriétaire. Ailleurs, deux pions empilés ne protègent rien :
                  les signaler pareillement laisserait croire le contraire.
                */}
                {state.pawns[premier].spot.zone === 'track' &&
                  blockadeOwner(state, state.pawns[premier].spot.square) !== null && (
                    <span className={styles.blockade} aria-hidden="true" />
                  )}

                {/* Deux pions hors de leur porte partent ensemble si on les
                    prend : le danger doit se voir. */}
                {indices.length >= 2 &&
                  state.pawns[premier].spot.zone === 'track' &&
                  blockadeOwner(state, state.pawns[premier].spot.square) === null && (
                    <span className={styles.exposed} aria-hidden="true" />
                  )}
              </div>
            );
          })}
        </div>
      </div>

      <footer className={styles.bottom}>
        <div className={styles.dice}>
          {state.rolled.length === 0 ? (
            <button
              type="button"
              className={`uiButton ${styles.roll}`}
              onClick={roll}
              disabled={!isHuman || finished || rolling}
            >
              {rolling ? '…' : 'Lancer les dés'}
            </button>
          ) : (
            state.dice.map((die, i) => (
              <span key={i} className={styles.die}>
                <Image src={`/assets/dice/die-${die}.png`} width={46} height={46} alt={`${die}`} />
              </span>
            ))
          )}
        </div>

        {notice && <p className={styles.notice}>{notice}</p>}

        {state.rolled.length > 0 && isHuman && moves.length > 0 && !tourFini && (
          <p className={styles.hint}>
            {selected === null
              ? 'Touchez un pion à déplacer.'
              : 'Touchez la case d’arrivée.'}
          </p>
        )}
      </footer>

      {finished && state.status.kind === 'win' && (
        <Modal variant="center" dismissible={false} onClose={onExit}>
          <div className={styles.over}>
            <h2>
              {state.status.winner === HUMAN
                ? 'Vous gagnez !'
                : `${LUDO_NAMES[state.status.winner]} l’emporte`}
            </h2>
            <button type="button" className={`uiButton ${styles.again}`} onClick={onExit}>
              Retour
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Ludo;
