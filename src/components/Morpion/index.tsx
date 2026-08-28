'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import PlayerBar from '../PlayerBar';
import Toast from '../Toast';
import { useGameContext, type GameMode } from '@/context/GameContext';
import { createClock } from '@/lib/clock';
import { play, vibrate } from '@/lib/sound';
import {
  MORPION_OPPONENTS,
  createMorpion,
  findBestMorpionMove,
  morpionThinkingDelay,
  playMorpion,
  type Mark,
  type MorpionDifficulty,
  type MorpionState,
} from '@/lib/morpion';
import styles from './Morpion.module.css';

/** Le joueur humain a toujours les croix ; l'adversaire prend les ronds. */
const HUMAN: Mark = 'X';
const AI: Mark = 'O';

interface MorpionProps {
  mode: Extract<GameMode, 'solo' | 'pass'>;
  difficulty: MorpionDifficulty;
}

const Morpion: React.FC<MorpionProps> = ({ mode, difficulty }) => {
  const { goHome, muted, toggleMute } = useGameContext();

  const [state, setState] = useState<MorpionState>(() => createMorpion());
  const [series, setSeries] = useState({ X: 0, O: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const character = MORPION_OPPONENTS.find((entry) => entry.id === difficulty);
  const finished = state.status.kind !== 'playing';
  const winningLine = state.status.kind === 'win' ? state.status.line : null;

  const reset = useCallback(() => {
    const fresh = createMorpion();
    stateRef.current = fresh;
    setState(fresh);
    setIsThinking(false);
  }, []);

  const commit = useCallback((index: number) => {
    const next = playMorpion(stateRef.current, index);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
    play('move');
    vibrate(10);
  }, []);

  // Le tour de l'adversaire, avec un temps de réflexion : répondre au quart de
  // seconde donne l'impression d'un mur, pas d'un joueur.
  useEffect(() => {
    if (mode !== 'solo' || finished || state.current !== AI) return;

    setIsThinking(true);
    const timer = setTimeout(() => {
      const move = findBestMorpionMove(stateRef.current, difficulty);
      setIsThinking(false);
      if (move !== null) commit(move);
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
    play(mode === 'pass' || winner === HUMAN ? 'win' : 'lose');
  }, [state, mode]);

  const handleCell = (index: number) => {
    if (finished || state.grid[index]) return;
    if (mode === 'solo' && state.current !== HUMAN) return;
    commit(index);
  };

  const names =
    mode === 'solo'
      ? { X: 'Vous', O: character?.name ?? 'Ordinateur' }
      : { X: 'Croix', O: 'Ronds' };

  const alert = !finished && state.lastMove === null ? 'Alignez trois marques' : '';

  // Le morpion se joue sans pendule : on en fournit une désactivée.
  const clock = createClock('none', 0);
  const marksLeft = (mark: Mark) => 5 - state.grid.filter((cell) => cell === mark).length;

  const heading =
    state.status.kind === 'draw'
      ? 'Match nul'
      : state.status.kind === 'win'
        ? mode === 'pass'
          ? `Les ${state.status.winner === 'X' ? 'croix' : 'ronds'} gagnent`
          : state.status.winner === HUMAN
            ? 'Vous gagnez !'
            : 'Partie perdue'
        : '';

  const detail =
    state.status.kind === 'draw'
      ? difficulty === 'hard' && mode === 'solo'
        ? 'Le nul est le meilleur résultat possible contre lui.'
        : 'Personne ne prend l’avantage.'
      : state.status.kind === 'win'
        ? mode === 'pass'
          ? 'Passez l’appareil pour la revanche.'
          : state.status.winner === HUMAN
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
          Morpion · {mode === 'pass' ? 'à deux' : (character?.name ?? '')}
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
          pieces={marksLeft('O')}
          total={5}
          isActive={state.current === 'O' && !finished}
          isThinking={isThinking}
          clock={clock}
        />

        <div className={styles.stage}>
          <Toast message={alert} mute={finished} />

          <div className={styles.grid} role="grid" aria-label="Grille de morpion">
            {state.grid.map((cell, index) => (
              <button
                key={index}
                type="button"
                className={[
                  styles.cell,
                  cell === 'X' ? styles.cross : '',
                  cell === 'O' ? styles.round : '',
                  winningLine?.includes(index) ? styles.winning : '',
                  state.lastMove === index ? styles.last : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleCell(index)}
                disabled={finished || cell !== null}
                aria-label={`Case ${index + 1}, ${
                  cell === 'X' ? 'croix' : cell === 'O' ? 'rond' : 'libre'
                }`}
              >
                <span className={styles.mark} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        <PlayerBar
          side="white"
          name={names.X}
          subtitle="les croix"
          pieces={marksLeft('X')}
          total={5}
          isActive={state.current === 'X' && !finished}
          clock={clock}
        />
      </main>

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
              <button type="button" className={styles.primary} onClick={reset}>
                Revanche
              </button>
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
