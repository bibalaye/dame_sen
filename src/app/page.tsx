'use client';

import GameBoard from '@/components/GameBoard';
import HomeScreen from '@/components/HomeScreen';
import { useGameContext } from '@/context/GameContext';

/**
 * Deux écrans seulement : on choisit comment jouer, puis on joue. Le menu
 * multijoueur ne s'affiche plus en permanence sous le plateau.
 */
const Home = () => {
  const { screen } = useGameContext();
  return screen === 'home' ? <HomeScreen /> : <GameBoard />;
};

export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Home />
    </main>
  );
}
