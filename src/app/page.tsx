'use client';

import AuthGate from '@/components/AuthGate';
import GameBoard from '@/components/GameBoard';
import InviteBanner from '@/components/InviteBanner';
import HomeScreen from '@/components/HomeScreen';
import Morpion from '@/components/Morpion';
import Ludo from '@/components/Ludo';
import { useGameContext } from '@/context/GameContext';
import type { MorpionDifficulty } from '@/lib/morpion';

/**
 * Trois écrans : l'accueil, la table de dames, la grille de morpion. Le jeu
 * choisi et le mode viennent du contexte, renseignés au lancement.
 *
 * Tous passent par la porte d'entrée : sans compte, on ne joue pas.
 */
export default function Page() {
  const {
    screen,
    kind,
    mode,
    difficulty,
    morpionVariant,
    ludoPlayers,
    goHome,
    recordGame,
  } = useGameContext();

  if (screen === 'home') {
    return (
      <AuthGate>
        <main>
          <InviteBanner />
          <HomeScreen />
        </main>
      </AuthGate>
    );
  }

  if (kind === 'ludo') {
    // Le ludo tient son propre état : il ne partage ni plateau ni moteur avec
    // les deux autres, et ne connaît pour l'instant que le solo et le duel
    // sur un même appareil.
    return (
      <AuthGate>
        <main>
          <InviteBanner />
          <Ludo
            mode={mode === 'pass' ? 'pass' : 'solo'}
            playerCount={ludoPlayers}
            difficulty={
              difficulty === 'easy' ? 'easy' : difficulty === 'medium' ? 'medium' : 'hard'
            }
            onExit={goHome}
            onFinish={(won) =>
              recordGame({
                game: 'ludo',
                mode: mode === 'pass' ? 'pass' : 'solo',
                result: won ? 'win' : 'loss',
                opponent: mode === 'pass' ? 'Duel local' : difficulty,
                playedAt: Date.now(),
              })
            }
          />
        </main>
      </AuthGate>
    );
  }

  if (kind === 'morpion') {
    // Le morpion connaît tous les modes sauf le défi du jour.
    const localMode = mode === 'daily' ? 'solo' : mode;
    // Les niveaux des dames comptent quatre paliers, le morpion trois.
    const level: MorpionDifficulty =
      difficulty === 'easy' ? 'easy' : difficulty === 'medium' ? 'medium' : 'hard';

    return (
      <AuthGate>
        <main>
          <InviteBanner />
          <Morpion mode={localMode} difficulty={level} variant={morpionVariant} />
        </main>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <main>
        <InviteBanner />
        <GameBoard />
      </main>
    </AuthGate>
  );
}
