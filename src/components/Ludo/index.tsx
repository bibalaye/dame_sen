'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

import Modal from '../Modal';
import LudoRules from '../LudoRules';
import { play, vibrate } from '@/lib/sound';
import {
  LUDO_PLAYERS,
  PIECES_PER_PLAYER,
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
import { resolvePawnTap } from '@/lib/ludoTap';
import {
  CENTER,
  GRID,
  LUDO_COLORS,
  LUDO_NAMES,
  TRACK_CELLS,
  homeCells,
  stableArea,
  startOwner,
  type Cell,
} from '@/lib/ludoBoard';
import { getMovePath, cellOfPawn } from '@/lib/ludoAnimation';
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

const PAWN_IMAGE: Readonly<Record<LudoPlayerId, string>> = {
  0: '/assets/pieces/pawn-red.png',
  1: '/assets/pieces/pawn-green.png',
  2: '/assets/pieces/pawn-blue.png',
  3: '/assets/pieces/pawn-yellow.png',
};

interface AnimatingPawn {
  pawnIndex: number;
  owner: LudoPlayerId;
  path: Cell[];
  stepIndex: number;
  move: LudoMove;
}

const Ludo: React.FC<LudoProps> = ({
  mode,
  difficulty,
  playerCount = 4,
  onExit,
  onFinish,
}) => {
  const [state, setState] = useState<LudoState>(() => createLudoGame(playerCount));
  const sieges = useMemo(() => seatsFor(playerCount), [playerCount]);
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('Bonne partie ! Touchez pour lancer.');
  const [isHighlightAnnouncement, setIsHighlightAnnouncement] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rollingDiceValues, setRollingDiceValues] = useState<[number, number]>([1, 1]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [speed, setSpeed] = useState<1 | 1.5>(1);
  const [captureBurstCell, setCaptureBurstCell] = useState<Cell | null>(null);

  // Animation pas-à-pas
  const [animatingPawn, setAnimatingPawn] = useState<AnimatingPawn | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const isAnimatingRef = useRef(false);
  isAnimatingRef.current = animatingPawn !== null;

  const finished = state.status.kind !== 'playing';
  const isHuman = mode === 'pass' || state.current === HUMAN;

  const moves = useMemo(() => legalLudoMoves(state), [state]);

  const movesForSelected = useMemo(
    () => (selected === null ? [] : moves.filter((m) => m.pawn === selected)),
    [moves, selected],
  );

  const playablePawns = useMemo(
    () => new Set(moves.map((m) => m.pawn)),
    [moves],
  );

  // Timing constants ajustés par la vitesse
  const HOP_INTERVAL = speed === 1.5 ? 110 : 160;
  const AI_THINK_DELAY = speed === 1.5 ? 450 : 700;
  const AUTO_DELAY = speed === 1.5 ? 350 : 550;
  const TURN_END_DELAY = speed === 1.5 ? 400 : 650;
  const ROLL_DURATION = speed === 1.5 ? 450 : 650;

  // Calcul du coup évident
  const coupEvident = useMemo(() => {
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    const pions = new Set(moves.map((m) => m.pawn));
    if (pions.size > 1) return null;

    return chooseLudoMove(state, 'hard');
  }, [moves, state]);

  // --- Exécution d'un coup avec animation fluide pas-à-pas -------------------

  const finalizeMove = useCallback((move: LudoMove) => {
    const current = stateRef.current;
    const next = playLudoMove(current, move);
    if (next === current) {
      setAnimatingPawn(null);
      return;
    }

    const mover = current.pawns[move.pawn];
    const moverName = LUDO_NAMES[mover.owner];

    if (move.captures?.length) {
      play('capture');
      vibrate([40, 30, 40]);
      const captured = current.pawns[move.captures[0]];
      const capturedName = LUDO_NAMES[captured.owner];
      setAnnouncement(`💥 ${moverName} capture le pion de ${capturedName} !`);
      setIsHighlightAnnouncement(true);

      const targetCell = cellOfPawn(current, move.pawn);
      setCaptureBurstCell(targetCell);
      setTimeout(() => setCaptureBurstCell(null), 500);
    } else if (move.to.zone === 'finished') {
      play('win');
      setAnnouncement(`👑 ${moverName} rentre un pion au centre !`);
      setIsHighlightAnnouncement(true);
    } else {
      play('move');
    }

    const encore = legalLudoMoves(next).some((m) => m.pawn === move.pawn);
    setSelected(encore ? move.pawn : null);

    stateRef.current = next;
    setState(next);
    setAnimatingPawn(null);
  }, []);

  const executeMove = useCallback((move: LudoMove) => {
    if (isAnimatingRef.current) return;

    const current = stateRef.current;
    const path = getMovePath(current, move);

    if (path.length <= 1) {
      finalizeMove(move);
      return;
    }

    const mover = current.pawns[move.pawn];
    setAnimatingPawn({
      pawnIndex: move.pawn,
      owner: mover.owner,
      path,
      stepIndex: 0,
      move,
    });
  }, [finalizeMove]);

  // Horloge de saut pas-à-pas pour l'animation
  useEffect(() => {
    if (!animatingPawn) return;

    if (animatingPawn.stepIndex < animatingPawn.path.length - 1) {
      const timer = setTimeout(() => {
        play('move', animatingPawn.stepIndex);
        setAnimatingPawn((prev) => {
          if (!prev) return null;
          return { ...prev, stepIndex: prev.stepIndex + 1 };
        });
      }, HOP_INTERVAL);
      return () => clearTimeout(timer);
    } else {
      // Arrivée sur la case finale
      const timer = setTimeout(() => {
        finalizeMove(animatingPawn.move);
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [animatingPawn, HOP_INTERVAL, finalizeMove]);

  // --- Lancer de dés --------------------------------------------------------

  const roll = useCallback(() => {
    if (rolling || isAnimatingRef.current || finished) return;
    setRolling(true);
    setNotice(null);
    play('select');
    setAnnouncement(`🎲 Lancer des dés en cours...`);
    setIsHighlightAnnouncement(false);

    // Roulement animé des dés
    const interval = setInterval(() => {
      setRollingDiceValues([
        1 + Math.floor(Math.random() * 6),
        1 + Math.floor(Math.random() * 6),
      ]);
    }, 60);

    setTimeout(() => {
      clearInterval(interval);
      const newDice = rollDice();
      const current = stateRef.current;
      const next = rollInto(current, newDice);
      stateRef.current = next;
      setState(next);
      setRolling(false);

      const isDouble = newDice[0] === 6 && newDice[1] === 6;
      const playerName = isHuman && current.current === HUMAN ? 'Vous' : LUDO_NAMES[current.current];

      if (isDouble) {
        play('promote');
        vibrate([50, 40, 50]);
        setAnnouncement(`⚡ DOUBLE SIX ! ${playerName} rejoue !`);
        setIsHighlightAnnouncement(true);
      } else {
        play('click');
        setAnnouncement(`🎲 ${playerName} a fait ${newDice[0]} et ${newDice[1]}`);
        setIsHighlightAnnouncement(false);
      }
    }, ROLL_DURATION);
  }, [rolling, finished, isHuman, ROLL_DURATION]);

  const tourFini = turnIsOver(state);
  const peutLancer = isHuman && !finished && !rolling && !animatingPawn && state.rolled.length === 0;

  // Fin de tour et passage au joueur suivant
  useEffect(() => {
    if (finished || rolling || animatingPawn || !tourFini) return;

    const relance = earnsExtraRoll(state.rolled, state.extraRolls);
    const timer = setTimeout(() => {
      if (relance) {
        setNotice('Double-six : vous rejouez !');
        setAnnouncement(`⚡ Relance pour ${LUDO_NAMES[state.current]} !`);
      } else {
        setNotice(null);
      }
      setState((current) => endTurn(current, relance));
    }, moves.length === 0 ? TURN_END_DELAY + 200 : TURN_END_DELAY);

    return () => clearTimeout(timer);
  }, [tourFini, state, moves.length, finished, rolling, animatingPawn, TURN_END_DELAY]);

  // Coup évident automatique pour le joueur humain
  useEffect(() => {
    if (finished || rolling || tourFini || animatingPawn) return;
    if (!isHuman || !coupEvident) return;

    const timer = setTimeout(() => {
      executeMove(coupEvident);
    }, AUTO_DELAY);
    return () => clearTimeout(timer);
  }, [coupEvident, isHuman, finished, rolling, tourFini, animatingPawn, executeMove, AUTO_DELAY]);

  // Intelligence Artificielle (Déroulement rythmé et naturel)
  useEffect(() => {
    if (finished || isHuman || rolling || tourFini || animatingPawn) return;

    const timer = setTimeout(() => {
      const current = stateRef.current;

      if (current.rolled.length === 0) {
        roll();
        return;
      }

      const choix = chooseLudoMove(current, difficulty);
      if (choix) {
        setSelected(choix.pawn);
        setTimeout(() => {
          executeMove(choix);
        }, 220);
      }
    }, AI_THINK_DELAY);

    return () => clearTimeout(timer);
  }, [state, finished, isHuman, rolling, tourFini, animatingPawn, difficulty, executeMove, roll, AI_THINK_DELAY]);

  // Fin de partie
  const reported = useRef(false);
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;

    play(state.status.kind === 'win' && state.status.winner === HUMAN ? 'win' : 'lose');
    if (state.status.kind === 'win') onFinish?.(state.status.winner === HUMAN);
  }, [finished, state.status, onFinish]);

  // --- Interaction ---------------------------------------------------------

  const handlePawn = (index: number) => {
    if (!isHuman || finished || animatingPawn || rolling) return;

    const issue = resolvePawnTap(moves, selected, index);

    if (issue.kind === 'play') {
      executeMove(issue.move);
    } else if (issue.kind === 'select') {
      play('click');
      setSelected(issue.pawn);
    } else if (issue.kind === 'release') {
      play('click');
      setSelected(null);
    }
  };

  const handleTarget = (spot: LudoMove['to']) => {
    if (animatingPawn || rolling) return;
    const move = movesForSelected.find((m) => sameSpot(m.to, spot));
    if (move) executeMove(move);
  };

  // --- Rendu & Trajectoires -------------------------------------------------

  const targets = useMemo(
    () =>
      movesForSelected.map((m) => ({
        cell:
          m.to.zone === 'track'
            ? TRACK_CELLS[m.to.square]
            : m.to.zone === 'home'
              ? homeCells(m.to.host)[m.to.step]
              : CENTER,
        spot: m.to,
      })),
    [movesForSelected],
  );

  // Ensemble des cases de la trajectoire pour le pion choisi
  const pathCellsSet = useMemo(() => {
    const set = new Set<string>();
    if (selected !== null) {
      for (const move of movesForSelected) {
        const path = getMovePath(state, move);
        for (let i = 1; i < path.length - 1; i++) {
          set.add(`${path[i].row},${path[i].col}`);
        }
      }
    }
    return set;
  }, [selected, movesForSelected, state]);

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
      const isPath = pathCellsSet.has(`${row},${col}`);
      const isStart = proprietaire !== null;

      const classes = [
        styles.cell,
        square !== -1 ? styles.track : '',
        isStart ? styles.startGate : '',
        allee !== undefined ? styles.lane : '',
        centre ? styles.center : '',
        cible ? styles.target : '',
        isPath ? styles.pathDot : '',
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
            style={{
              gridRow: row + 1,
              gridColumn: col + 1,
              background: teinte ? `color-mix(in srgb, ${teinte} 35%, var(--surface))` : undefined,
              color: teinte,
            }}
            onClick={() => handleTarget(cible.spot)}
            aria-label={
              cible.spot.zone === 'track' && pawnsOnSquare(state, cible.spot.square).length
                ? 'Prendre le pion ici'
                : 'Avancer ici'
            }
          />
        ) : (
          <div
            key={`${row}-${col}`}
            className={classes}
            style={{
              gridRow: row + 1,
              gridColumn: col + 1,
              background: teinte ? `color-mix(in srgb, ${teinte} 25%, var(--surface))` : undefined,
              color: teinte,
            }}
          />
        ),
      );
    }
  }

  // Regroupement des pions par case (en masquant temporairement le pion en cours de vol)
  const parCase = new Map<string, number[]>();
  state.pawns.forEach((_, index) => {
    if (animatingPawn && animatingPawn.pawnIndex === index) return;
    const cell = cellOfPawn(state, index);
    const cle = `${cell.row},${cell.col}`;
    parCase.set(cle, [...(parCase.get(cle) ?? []), index]);
  });

  return (
    <div className={styles.screen}>
      {/* --- En-tête --- */}
      <header className={styles.top}>
        <button
          type="button"
          className={`uiRound ${styles.actionBtn}`}
          onClick={onExit}
          aria-label="Quitter"
        >
          ✕
        </button>

        <button
          type="button"
          className={`uiRound ${styles.actionBtn}`}
          onClick={() => setRulesOpen(true)}
          aria-label="Règles du jeu"
        >
          ?
        </button>

        <button
          type="button"
          className={`uiRound ${styles.speedBtn}`}
          onClick={() => setSpeed((s) => (s === 1 ? 1.5 : 1))}
          aria-label="Vitesse d'animation"
          title={`Vitesse actuelle : ${speed}x`}
        >
          {speed === 1 ? '⚡ 1x' : '⚡ 1.5x'}
        </button>

        <ul className={styles.players}>
          {sieges.map((player) => {
            const rentres = state.pawns.filter(
              (p) => p.owner === player && p.spot.zone === 'finished',
            ).length;
            const captifs = state.pawns.filter(
              (p) => p.owner === player && isCaptive(p),
            ).length;

            return (
              <li
                key={player}
                className={`${styles.player} ${
                  state.current === player ? styles.playerOn : ''
                }`}
                style={{
                  borderColor: LUDO_COLORS[player],
                  ['--player-glow' as string]: LUDO_COLORS[player],
                }}
              >
                <span
                  className={styles.dot}
                  style={{ background: LUDO_COLORS[player], color: LUDO_COLORS[player] }}
                  aria-hidden="true"
                />
                <span className={styles.playerName}>
                  {mode === 'solo' && player === HUMAN ? 'Vous' : LUDO_NAMES[player]}
                </span>
                <div className={styles.playerStats}>
                  <div className={styles.finishedIcons}>
                    {Array.from({ length: PIECES_PER_PLAYER }).map((_, i) => (
                      <span
                        key={i}
                        className={i < rentres ? styles.starFilled : styles.starEmpty}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  {captifs > 0 && (
                    <span className={styles.captives} title="pions prisonniers">
                      ⛓{captifs}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </header>

      {/* --- Bannière de notification stylée --- */}
      <div className={styles.announcementBox}>
        <div
          className={`${styles.announcement} ${
            isHighlightAnnouncement ? styles.announcementHighlight : ''
          }`}
        >
          {announcement}
        </div>
      </div>

      {/* --- Plateau de jeu --- */}
      <div
        className={styles.boardWrapper}
        onClick={peutLancer ? roll : undefined}
        role={peutLancer ? 'button' : undefined}
        tabIndex={peutLancer ? 0 : undefined}
        aria-label={peutLancer ? 'Lancer les dés' : undefined}
        onKeyDown={(event) => {
          if (peutLancer && (event.key === 'Enter' || event.key === ' ')) roll();
        }}
      >
        <div className={styles.board}>
          {/* Écuries des 4 camps */}
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
                    assis ? 22 : 8
                  }%, rgba(20, 12, 6, 0.95))`,
                }}
              />
            );
          })}

          {cases}

          {/* Calque du pion en plein saut animé (Hop & Bounce) */}
          {animatingPawn && (
            <div className={styles.animatingPawnLayer}>
              <div
                key="active-animated-pawn"
                className={styles.animatingPawn}
                style={{
                  gridRow: animatingPawn.path[animatingPawn.stepIndex].row + 1,
                  gridColumn: animatingPawn.path[animatingPawn.stepIndex].col + 1,
                }}
              >
                <Image
                  src={PAWN_IMAGE[animatingPawn.owner]}
                  width={46}
                  height={46}
                  alt="Pion en mouvement"
                />
              </div>
            </div>
          )}

          {/* Onde de choc lors d'une capture */}
          {captureBurstCell && (
            <div
              className={styles.captureBurst}
              style={{
                gridRow: captureBurstCell.row + 1,
                gridColumn: captureBurstCell.col + 1,
              }}
            />
          )}

          {/* Pions posés sur le plateau */}
          {[...parCase.entries()].map(([cle, indices]) => {
            const [row, col] = cle.split(',').map(Number);
            const premier = indices[0];
            const surCible = targets.some((t) => t.cell.row === row && t.cell.col === col);

            return (
              <div
                key={cle}
                className={`${styles.pawnSlot} ${surCible ? styles.onTarget : ''}`}
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
              >
                {indices.slice(0, 2).map((index, rang) => {
                  const pawn: Pawn = state.pawns[index];
                  const jouable = playablePawns.has(index) && isHuman && !animatingPawn;
                  const isSelectedPawn = selected === index;
                  const captive = isCaptive(pawn);

                  return (
                    <button
                      key={index}
                      type="button"
                      className={[
                        styles.pawn,
                        jouable ? styles.playable : '',
                        isSelectedPawn ? styles.selected : '',
                        captive ? styles.captive : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        transform: `translate(${rang * 6}px, ${rang * -6}px)`,
                      }}
                      onClick={() => handlePawn(index)}
                      disabled={!jouable}
                      aria-label={`Pion ${LUDO_NAMES[pawn.owner]}`}
                    >
                      <Image src={PAWN_IMAGE[pawn.owner]} width={42} height={42} alt="" />
                      {captive && (
                        <span className={styles.captiveBadge} aria-label="prisonnier">
                          ⛓
                        </span>
                      )}
                    </button>
                  );
                })}

                {indices.length > 2 && (
                  <span className={styles.stack} aria-hidden="true">
                    +{indices.length - 1}
                  </span>
                )}

                {/* Barrage fortifié à la porte de départ */}
                {state.pawns[premier].spot.zone === 'track' &&
                  blockadeOwner(state, state.pawns[premier].spot.square) !== null && (
                    <span className={styles.blockade} aria-hidden="true" />
                  )}

                {/* Pions empilés exposés hors de la porte */}
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

      {/* --- Dés & Commandes en bas --- */}
      <footer className={styles.bottom}>
        <div className={styles.diceContainer}>
          {state.rolled.length === 0 && !rolling ? (
            <button
              type="button"
              className={`uiButton ${styles.rollBtn}`}
              onClick={roll}
              disabled={!isHuman || finished || rolling || animatingPawn !== null}
            >
              <span className={styles.diceIcon}>🎲</span> Lancer les dés
            </button>
          ) : (
            (rolling ? rollingDiceValues : state.rolled).map((die, i) => {
              const isUsed = !rolling && !state.dice.includes(die);
              return (
                <span
                  key={i}
                  className={`${styles.die} ${rolling ? styles.dieRolling : ''} ${
                    isUsed ? styles.dieUsed : styles.dieActive
                  }`}
                >
                  <Image
                    src={`/assets/dice/die-${die}.png`}
                    width={48}
                    height={48}
                    alt={`Dé ${die}`}
                  />
                </span>
              );
            })
          )}
        </div>

        {notice && <p className={styles.notice}>{notice}</p>}

        {peutLancer && <p className={styles.hint}>Touchez le plateau ou le bouton pour lancer.</p>}

        {state.rolled.length > 0 &&
          isHuman &&
          moves.length > 0 &&
          !tourFini &&
          !coupEvident && (
            <p className={styles.hint}>
              {selected === null
                ? `${playablePawns.size} pions prêts — touchez le pion à déplacer.`
                : 'Touchez la case d’arrivée lumineuse 🎯'}
            </p>
          )}
      </footer>

      {rulesOpen && <LudoRules onClose={() => setRulesOpen(false)} />}

      {/* --- Modale Fin de Partie --- */}
      {finished && state.status.kind === 'win' && (
        <Modal variant="center" dismissible={false} onClose={onExit}>
          <div className={styles.over}>
            <div className={styles.overCrown}>👑</div>
            <h2>
              {state.status.winner === HUMAN
                ? 'Victoire Royale !'
                : `${LUDO_NAMES[state.status.winner]} l’emporte !`}
            </h2>
            <button type="button" className={`uiButton ${styles.again}`} onClick={onExit}>
              Rejouer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Ludo;
