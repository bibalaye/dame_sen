'use client';

import React, { useState } from 'react';
import { useGameContext, type GameMode } from '@/context/GameContext';
import { TIME_CONTROLS, type TimeControl } from '@/lib/clock';
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

const MODES: ReadonlyArray<{
  id: GameMode;
  title: string;
  detail: string;
}> = [
  {
    id: 'solo',
    title: 'Jouer seul',
    detail: 'Quatre adversaires, du neveu au vieux',
  },
  {
    id: 'pass',
    title: 'Autour du plateau',
    detail: 'À deux sur le même appareil, la planche pivote',
  },
  {
    id: 'online',
    title: 'À distance',
    detail: 'Créez une partie et partagez le code',
  },
];

const TIME_OPTIONS: readonly TimeControl[] = ['none', 'blitz', 'bullet'];

const HomeScreen: React.FC = () => {
  const { startGame } = useGameContext();
  const [mode, setMode] = useState<GameMode>('solo');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [timeControl, setTimeControl] = useState<TimeControl>('none');

  const handleStart = () => {
    startGame({ mode, difficulty, timeControl });
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Le jeu traditionnel du Sénégal</p>
        <h1 className={styles.title}>Dames sénégalaises</h1>
        <p className={styles.pitch}>
          Cinq cases sur cinq, tout en lignes droites. La prise est obligatoire,
          et une rafle bien vue renverse une partie.
        </p>
      </header>

      <div className={styles.panel}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Comment jouer</legend>
          <div className={styles.modes}>
            {MODES.map((entry) => (
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
              {OPPONENTS.map((entry) => (
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

        <button type="button" className={styles.play} onClick={handleStart}>
          {mode === 'online' ? 'Créer ou rejoindre' : 'Commencer la partie'}
        </button>
      </div>
    </div>
  );
};

export default HomeScreen;
