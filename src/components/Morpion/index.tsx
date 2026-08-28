'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import MultiplayerMenu from '../MultiplayerMenu';
import PlayerBar from '../PlayerBar';
import Toast from '../Toast';
import { useGameContext, type GameMode } from '@/context/GameContext';
import { createClock } from '@/lib/clock';
import { play, vibrate } from '@/lib/sound';
import {
  MORPION_OPPONENTS,
  PIECES_PER_PLAYER,
  availableMoves,
  createMorpion,
  findBestMorpionMove,
  morpionThinkingDelay,
  playMorpion,
  type Mark,
  type MorpionDifficulty,
  type MorpionMove,
  type MorpionState,
} from '@/lib/morpion';
import styles from './Morpion.module.css';

/** Le joueur humain a toujours les croix ; l'adversaire prend les ronds. */
const HUMAN: Mark = 'X';
const AI: Mark = 'O';

interface MorpionProps {
  mode: Extract<GameMode, 'solo' | 'pass' | 'online'>;
  difficulty: MorpionDifficulty;
}

/**
 * Le serveur ne connaît que « blanc » et « noir » : il attribue le premier au
 * créateur de la salle. On fait donc jouer les croix au blanc, les ronds au
 * noir, et la même salle sert indifféremment aux dames et au morpion.
 */
const markOf = (side: 'white' | 'black' | null): Mark => (side === 'black' ? 'O' : 'X');
const sideOf = (mark: Mark): 'white' | 'black' => (mark === 'X' ? 'white' : 'black');

const Morpion: React.FC<MorpionProps> = ({ mode, difficulty }) => {
  const {
    goHome,
    muted,
    toggleMute,
    socket,
    playerType,
    roomId,
    opponent,
    isWaitingForOpponent,
    isGameStarted,
    makeMove: sendMove,
  } = useGameContext();

  const online = mode === 'online';
  /** La marque que ce joueur contrôle : croix pour l'hôte, ronds pour l'invité. */
  const myMark = online ? markOf(playerType) : HUMAN;

  const [state, setState] = useState<MorpionState>(() => createMorpion());
  const [selected, setSelected] = useState<number | null>(null);
  const [series, setSeries] = useState({ X: 0, O: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const character = MORPION_OPPONENTS.find((entry) => entry.id === difficulty);
  const finished = state.status.kind !== 'playing';
  const winningLine = state.status.kind === 'win' ? state.status.line : null;
  const isMoving = state.phase === 'movement';

  const reset = useCallback(() => {
    const fresh = createMorpion();
    stateRef.current = fresh;
    setState(fresh);
    setSelected(null);
    setIsThinking(false);
  }, []);

  const commit = useCallback(
    (move: MorpionMove, byPlayer = true) => {
      const next = playMorpion(stateRef.current, move);
      if (next === stateRef.current) return;

      stateRef.current = next;
      setState(next);
      setSelected(null);
      play('move');
      vibrate(10);

      // En ligne, on transmet le coup et à qui revient le trait ensuite.
      if (byPlayer && online) {
        sendMove(move, sideOf(next.current));
      }
    },
    [online, sendMove],
  );

  // Le coup de l'adversaire distant passe par le moteur : un coup illégal est
  // signalé et ignoré, jamais appliqué tel quel.
  useEffect(() => {
    if (!online || !socket) return;

    const handleOpponentMove = ({ move }: { move: MorpionMove }) => {
      const next = playMorpion(stateRef.current, move);
      if (next === stateRef.current) {
        console.warn('Coup adverse refusé par le moteur', move);
        return;
      }
      stateRef.current = next;
      setState(next);
      setSelected(null);
      play('move');
    };

    socket.on('opponent-move', handleOpponentMove);
    return () => {
      socket.off('opponent-move', handleOpponentMove);
    };
  }, [online, socket]);

  // Les deux joueurs sont là : on repart d'une grille vide, de part et d'autre.
  useEffect(() => {
    if (online && isGameStarted) reset();
    // `reset` est stable ; le relancer à chaque rendu couperait la partie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, isGameStarted]);

  // Le tour de l'adversaire artificiel, avec un temps de réflexion : répondre au
  // quart de seconde donne l'impression d'un mur, pas d'un joueur.
  useEffect(() => {
    if (mode !== 'solo' || finished || state.current !== AI) return;

    setIsThinking(true);
    const timer = setTimeout(() => {
      const move = findBestMorpionMove(stateRef.current, difficulty);
      setIsThinking(false);
      if (move) commit(move, false);
    }, morpionThinkingDelay());

    return () => {
      clearTimeout(timer);
      setIsThinking(false);
    };
  }, [state, mode, finished, difficulty, commit]);

  // Le score de la série ne bouge qu'une fois par partie.
  const counted = useRef<MorpionState | null>(null);
  useEffect(() => {
    if (state.status.kind !== 'win' || counted.current === state) return;
    counted.current = state;

    const { winner } = state.status;
    setSeries((current) => ({ ...current, [winner]: current[winner] + 1 }));
    play(mode === 'pass' || winner === (online ? myMark : HUMAN) ? 'win' : 'lose');
  }, [state, mode, online, myMark]);

  const canAct =
    !finished &&
    (mode === 'pass' ||
      (online ? state.current === myMark && !!opponent : state.current === HUMAN));
  const moves = canAct ? availableMoves(state) : [];

  /** Cases où le pion sélectionné peut se rendre : toutes les cases libres. */
  const destinations = new Set(
    moves
      .filter((move) => move.type === 'move' && move.from === selected)
      .map((move) => move.to),
  );

  /** Pions que le joueur peut prendre en main. */
  const movable = new Set(
    moves.filter((move) => move.type === 'move').map((move) => move.from),
  );

  const handleCell = (index: number) => {
    if (!canAct) return;

    if (state.phase === 'placement') {
      commit({ type: 'place', to: index });
      return;
    }

    // Phase 2 : on prend d'abord un pion, puis on désigne sa destination.
    if (selected !== null && destinations.has(index)) {
      commit({ type: 'move', from: selected, to: index });
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    if (movable.has(index)) {
      setSelected(index);
      return;
    }
    if (state.grid[index] === state.current) {
      // Un pion à soi, mais bloqué : on le dit plutôt que d'ignorer le geste.
      play('illegal');
      setSelected(null);
    }
  };

  const names =
    mode === 'solo'
      ? { X: 'Vous', O: character?.name ?? 'Ordinateur' }
      : online
        ? myMark === 'X'
          ? { X: 'Vous', O: opponent ?? 'Adversaire' }
          : { X: opponent ?? 'Adversaire', O: 'Vous' }
        : { X: 'Croix', O: 'Ronds' };

  const placedTotal = state.placed.X + state.placed.O;
  const alert = !finished
    ? state.phase === 'placement'
      ? placedTotal === 0
        ? 'Posez vos trois pions'
        : ''
      : placedTotal === PIECES_PER_PLAYER * 2 && state.lastMove?.type === 'place'
        ? 'Pions en place — déplacez-en un où vous voulez'
        : ''
    : '';

  // Le morpion se joue sans pendule : on en fournit une désactivée.
  const clock = createClock('none', 0);

  const heading =
    state.status.kind === 'draw'
      ? 'Match nul'
      : state.status.kind === 'win'
        ? mode === 'pass'
          ? `Les ${state.status.winner === 'X' ? 'croix' : 'ronds'} gagnent`
          : state.status.winner === (online ? myMark : HUMAN)
            ? 'Vous gagnez !'
            : 'Partie perdue'
        : '';

  const detail =
    state.status.kind === 'draw'
      ? state.status.reason === 'repetition'
        ? 'La même position est revenue trois fois.'
        : 'Cinquante déplacements sans alignement : la partie s’arrête.'
      : state.status.kind === 'win'
        ? mode === 'pass'
          ? 'Passez l’appareil pour la revanche.'
          : state.status.winner === (online ? myMark : HUMAN)
            ? 'Bien joué.'
            : 'Votre adversaire aligne le premier.'
        : '';

  return (
    <div className={styles.screen}>
      <header className={styles.hud}>
        <button
          type="button"
          className={styles.hudBtn}
          onClick={goHome}
          aria-label="Retour à l’accueil"
        >
          ←
        </button>
        <span className={styles.hudTitle}>
          Morpion ·{' '}
          {mode === 'pass'
            ? 'à deux'
            : online
              ? 'en ligne'
              : (character?.name ?? '')}
        </span>
        <button
          type="button"
          className={styles.hudBtn}
          onClick={() => setMenuOpen(true)}
          aria-label="Menu de la partie"
        >
          ⋯
        </button>
      </header>

      <main className={styles.table}>
        <PlayerBar
          side="black"
          name={names.O}
          subtitle={mode === 'solo' ? character?.tagline : 'les ronds'}
          pieces={PIECES_PER_PLAYER - state.placed.O}
          total={PIECES_PER_PLAYER}
          isActive={state.current === 'O' && !finished}
          isThinking={isThinking}
          clock={clock}
        />

        <div className={styles.stage}>
          <Toast message={alert} mute={finished} />

          {/* La bascule de phase est annoncée : le jeu change de rythme. */}
          <span className={`${styles.phase} ${isMoving ? styles.phaseMove : ''}`}>
            {isMoving ? 'Phase 2 · déplacement' : 'Phase 1 · placement'}
          </span>

          <div className={styles.grid} role="grid" aria-label="Grille de morpion">
            {state.grid.map((cell, index) => {
              const isDestination = destinations.has(index);
              const isPlaceable = state.phase === 'placement' && cell === null && canAct;

              return (
                <button
                  key={index}
                  type="button"
                  className={[
                    styles.cell,
                    cell === 'X' ? styles.cross : '',
                    cell === 'O' ? styles.round : '',
                    winningLine?.includes(index) ? styles.winning : '',
                    selected === index ? styles.selected : '',
                    isDestination ? styles.destination : '',
                    isPlaceable ? styles.placeable : '',
                    canAct && movable.has(index) && selected === null
                      ? styles.grabbable
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleCell(index)}
                  disabled={finished}
                  aria-label={`Case ${index + 1}, ${
                    cell === 'X' ? 'croix' : cell === 'O' ? 'rond' : 'libre'
                  }${isDestination ? ', destination possible' : ''}`}
                  aria-pressed={selected === index}
                >
                  <span className={styles.mark} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>

        <PlayerBar
          side="white"
          name={names.X}
          subtitle={
            canAct && isMoving
              ? selected !== null
                ? 'posez-le sur une case libre'
                : 'prenez un pion'
              : online && !canAct && !finished
                ? 'au tour de l’adversaire'
                : 'les croix'
          }
          pieces={PIECES_PER_PLAYER - state.placed.X}
          total={PIECES_PER_PLAYER}
          isActive={state.current === 'X' && !finished}
          clock={clock}
        />
      </main>

      {online && (!roomId || isWaitingForOpponent) && (
        <Modal title="Jouer à distance" dismissible={false} onClose={() => undefined}>
          <MultiplayerMenu />
        </Modal>
      )}

      {finished && (
        <Modal variant="center" dismissible={false} title={heading} onClose={() => undefined}>
          <div className={styles.result}>
            <p className={styles.resultText}>{detail}</p>

            {(series.X > 0 || series.O > 0) && (
              <p className={styles.series}>
                Série&nbsp;: <strong>{series.X}</strong> — <strong>{series.O}</strong>
              </p>
            )}

            <div className={styles.actions}>
              {!online && (
                <button type="button" className={styles.primary} onClick={reset}>
                  Revanche
                </button>
              )}
              <button type="button" className={styles.secondary} onClick={goHome}>
                Accueil
              </button>
            </div>
          </div>
        </Modal>
      )}

      {menuOpen && (
        <Modal title="Partie" onClose={() => setMenuOpen(false)}>
          <div className={styles.menu}>
            {!online && (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuPrimary}`}
                onClick={() => {
                  reset();
                  setMenuOpen(false);
                }}
              >
                Nouvelle partie
              </button>
            )}
            <button type="button" className={styles.menuItem} onClick={toggleMute}>
              {muted ? 'Activer le son' : 'Couper le son'}
            </button>
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuQuit}`}
              onClick={goHome}
            >
              Quitter la partie
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Morpion;
