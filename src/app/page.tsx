'use client';

import GameBoard from '@/components/GameBoard';
import HomeScreen from '@/components/HomeScreen';
import Morpion from '@/components/Morpion';
import { useGameContext } from '@/context/GameContext';
import type { MorpionDifficulty } from '@/lib/morpion';

/**
 * Trois écrans : l'accueil, la table de dames, la grille de morpion. Le jeu
 * choisi et le mode viennent du contexte, renseignés au lancement.
 */
export default function Page() {
  const { screen, kind, mode, difficulty, morpionVariant } = useGameContext();

  if (screen === 'home') {
    return (
      <main>
        <HomeScreen />
      </main>
    );
  }

  if (kind === 'morpion') {
    // Le morpion connaît tous les modes sauf le défi du jour.
    const localMode = mode === 'daily' ? 'solo' : mode;
    // Les niveaux des dames comptent quatre paliers, le morpion trois.
    const level: MorpionDifficulty =
      difficulty === 'easy' ? 'easy' : difficulty === 'medium' ? 'medium' : 'hard';

    return (
      <main>
        <Morpion mode={localMode} difficulty={level} variant={morpionVariant} />
      </main>
    );
  }

  return (
    <main>
      <GameBoard />
    </main>
  );
}
