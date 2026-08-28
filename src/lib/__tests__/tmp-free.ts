import {
  availableMoves, bestMove, createMorpion, playMorpion, findBestMorpionMove,
  type MorpionDifficulty,
} from '../morpion.ts';

const seeded = (s: number) => { let v = s >>> 0; return () => (v = (v * 1664525 + 1013904223) >>> 0) / 0x100000000; };

// Branchement en phase 2.
let mid = createMorpion('X');
for (const to of [4, 0, 1, 7, 6, 2]) mid = playMorpion(mid, { type: 'place', to });
console.log('phase :', mid.phase, '| coups en phase 2 :', availableMoves(mid).length);

for (const d of [4, 6, 8]) {
  const t = Date.now();
  bestMove(mid, d);
  console.log(`  profondeur ${d} : ${Date.now() - t} ms`);
}

let s = createMorpion('X');
let g = 0;
const t0 = Date.now();
while (s.status.kind === 'playing' && g++ < 200) {
  const m = bestMove(s);
  if (!m) break;
  s = playMorpion(s, m);
}
console.log('\ndeux joueurs forts :', JSON.stringify(s.status), `en ${g} coups (${Date.now() - t0} ms)`);

const duel = (x: MorpionDifficulty, o: MorpionDifficulty, n: number) => {
  const t = { X: 0, nul: 0, O: 0 };
  for (let seed = 0; seed < n; seed++) {
    const r = seeded(seed + 1);
    let st = createMorpion('X');
    let k = 0;
    while (st.status.kind === 'playing' && k++ < 300) {
      const m = findBestMorpionMove(st, st.current === 'X' ? x : o, r);
      if (!m) break;
      st = playMorpion(st, m);
    }
    if (st.status.kind === 'draw') t.nul++;
    else if (st.status.kind === 'win') t[st.status.winner]++;
  }
  return t;
};

console.log('\nX = premier joueur :');
for (const [x, o, n] of [
  ['medium','easy',30],['easy','medium',30],['medium','medium',30],
  ['medium','hard',10],['hard','medium',10],
] as const) {
  const t = duel(x, o, n);
  console.log(`  ${x.padEnd(6)} vs ${o.padEnd(6)} (${String(n).padStart(2)})  X:${String(t.X).padStart(3)}  nul:${String(t.nul).padStart(3)}  O:${String(t.O).padStart(3)}`);
}
