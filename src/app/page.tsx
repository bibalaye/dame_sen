'use client';

import GameBoard from '@/components/GameBoard';
import HomeScreen from '@/components/HomeScreen';
import { useGameContext } from '@/context/GameContext';

/**
 * Deux écrans seulement : on choisit comment jouer, puis on joue. L'écran de
 * partie occupe toute la hauteur, le plateau au centre.
 */
export default function Page() {
  const { screen } = useGameContext();
  return <main>{screen === 'home' ? <HomeScreen /> : <GameBoard />}</main>;
}
