'use client';

import { GameProvider } from '@/context/GameContext';
import GameBoard from '@/components/GameBoard';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#f9f5eb]">
      <div className="pattern pattern-1 fixed w-[150px] h-[150px] top-[10%] left-[5%] opacity-10 -z-10 transform rotate-[15deg]"></div>
      <div className="pattern pattern-2 fixed w-[150px] h-[150px] bottom-[10%] right-[5%] opacity-10 -z-10 transform rotate-[-15deg]"></div>
      
      <GameProvider>
        <GameBoard />
      </GameProvider>
    </main>
  );

}
