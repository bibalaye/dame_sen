'use client';

import React, { useState } from 'react';
import { useGameContext, type GameKind, type GameMode } from '@/context/GameContext';
import { TIME_CONTROLS, type TimeControl } from '@/lib/clock';
import { MORPION_OPPONENTS } from '@/lib/morpion';
import type { Difficulty } from '@/lib/ai';
import styles from './HomeScreen.module.css';

export const OPPONENTS: ReadonlyArray<{
  id: Difficulty;
  name: string;
  tagline: string;
}> = [
  { id: 'easy', name: 'Le neveu', tagline: 'Joue vite, réfléchit peu' },
  { id: 'medium', name: 'La marchande', tagline: 'Ne rate jamais une prise' },
  { id: 'hard', name: 'Le tonton', tagline: 'Voit venir les rafles' },
  { id: 'expert', name: 'Le vieux', tagline: 'Sous le manguier depuis 40 ans' },
];

const GAMES: ReadonlyArray<{ id: GameKind; name: string; detail: string }> = [
  { id: 'dames', name: 'Dames', detail: 'Plateau 5×5, rafles et dames' },
  { id: 'morpion', name: 'Morpion', detail: 'Trois marques alignées' },
];

const MODES: ReadonlyArray<{
  id: GameMode;
  title: string;
  detail: string;
  /** Modes réservés aux dames : le morpion n'a ni défi ni jeu en ligne. */
  damesOnly?: boolean;
}> = [
  {
    id: 'daily',
    title: 'Défi du jour',
    detail: 'Une position, la même pour tous, trois essais',
    damesOnly: true,
  },
  {
    id: 'solo',
    title: 'Jouer seul',
    detail: 'Contre un adversaire à votre mesure',
  },
  {
    id: 'pass',
    title: 'Autour du plateau',
    detail: 'À deux sur le même appareil',
  },
  {
    id: 'online',
    title: 'À distance',
    detail: 'Créez une partie et partagez le lien',
    damesOnly: true,
  },
];

const TIME_OPTIONS: readonly TimeControl[] = ['none', 'blitz', 'bullet'];

const HomeScreen: React.FC = () => {
  const { startGame } = useGameContext();
  const [kind, setKind] = useState<GameKind>('dames');
  const [mode, setMode] = useState<GameMode>('solo');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [timeControl, setTimeControl] = useState<TimeControl>('none');

  const modes = MODES.filter((entry) => kind === 'dames' || !entry.damesOnly);

  // Le morpion propose trois adversaires, les dames quatre.
  const opponents =
    kind === 'dames'
      ? OPPONENTS
      : MORPION_OPPONENTS.map((entry) => ({
          id: entry.id as Difficulty,
          name: entry.name,
          tagline: entry.tagline,
        }));

  const handleKind = (next: GameKind) => {
    setKind(next);
    // Un mode propre aux dames n'a plus de sens sur la grille de morpion.
    if (next === 'morpion') {
      if (mode === 'daily' || mode === 'online') setMode('solo');
      if (difficulty === 'expert') setDifficulty('hard');
    }
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Jeux de plateau du Sénégal</p>
        <h1 className={styles.title}>
          {kind === 'dames' ? 'Dames sénégalaises' : 'Morpion'}
        </h1>
        <p className={styles.pitch}>
          {kind === 'dames'
            ? 'Cinq cases sur cinq, tout en lignes droites. La prise est obligatoire, et une rafle bien vue renverse une partie.'
            : 'Trois marques à aligner. Simple à apprendre — et impossible à battre contre le vieux.'}
        </p>
      </header>

      <div className={styles.panel}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Le jeu</legend>
          <div className={styles.games}>
            {GAMES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`${styles.game} ${kind === entry.id ? styles.gameActive : ''}`}
                onClick={() => handleKind(entry.id)}
                aria-pressed={kind === entry.id}
              >
                <span className={styles.gameName}>{entry.name}</span>
                <span className={styles.gameDetail}>{entry.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Comment jouer</legend>
          <div className={styles.modes}>
            {modes.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`${styles.mode} ${mode === entry.id ? styles.modeActive : ''}`}
                onClick={() => setMode(entry.id)}
                aria-pressed={mode === entry.id}
              >
                <span className={styles.modeTitle}>{entry.title}</span>
                <span className={styles.modeDetail}>{entry.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {mode === 'solo' && (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>Contre qui</legend>
            <div className={styles.chips}>
              {opponents.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`${styles.chip} ${
                    difficulty === entry.id ? styles.chipActive : ''
                  }`}
                  onClick={() => setDifficulty(entry.id)}
                  aria-pressed={difficulty === entry.id}
                >
                  <span className={styles.chipName}>{entry.name}</span>
                  <span className={styles.chipTag}>{entry.tagline}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {kind === 'dames' && mode !== 'daily' && (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>Rythme</legend>
            <div className={styles.chips}>
              {TIME_OPTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.chip} ${
                    timeControl === id ? styles.chipActive : ''
                  }`}
                  onClick={() => setTimeControl(id)}
                  aria-pressed={timeControl === id}
                >
                  <span className={styles.chipName}>{TIME_CONTROLS[id].label}</span>
                  <span className={styles.chipTag}>{TIME_CONTROLS[id].description}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <button
          type="button"
          className={styles.play}
          onClick={() => startGame({ kind, mode, difficulty, timeControl })}
        >
          {mode === 'online'
            ? 'Créer ou rejoindre'
            : mode === 'daily'
              ? 'Relever le défi'
              : 'Commencer la partie'}
        </button>
      </div>
    </div>
  );
};

export default HomeScreen;
