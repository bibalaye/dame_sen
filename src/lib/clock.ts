/**
 * Pendule de jeu.
 *
 * Le temps qui descend est le générateur de tension le moins cher qui existe :
 * il transforme une réflexion en décision. La logique est pure et pilotée par
 * un horodatage fourni par l'appelant, ce qui la rend testable sans attendre.
 */

import type { Player } from './engine.ts';

export type TimeControl = 'none' | 'blitz' | 'bullet';

export interface TimeControlConfig {
  readonly label: string;
  readonly description: string;
  /** Temps initial par joueur, en millisecondes. */
  readonly initialMs: number;
  /** Temps ajouté après chaque coup joué, en millisecondes. */
  readonly incrementMs: number;
}

export const TIME_CONTROLS: Readonly<Record<TimeControl, TimeControlConfig>> = {
  none: {
    label: 'Sans limite',
    description: 'Prenez le temps de réfléchir',
    initialMs: 0,
    incrementMs: 0,
  },
  blitz: {
    label: 'Blitz',
    description: '3 minutes, +2 s par coup',
    initialMs: 3 * 60_000,
    incrementMs: 2_000,
  },
  bullet: {
    label: 'Éclair',
    description: '60 secondes, sans ajout',
    initialMs: 60_000,
    incrementMs: 0,
  },
};

export interface ClockState {
  readonly control: TimeControl;
  readonly remaining: Readonly<Record<Player, number>>;
  /** Joueur dont la pendule tourne, ou `null` quand elle est à l'arrêt. */
  readonly running: Player | null;
  /** Horodatage de la dernière mise à jour, en millisecondes. */
  readonly since: number;
}

export const createClock = (control: TimeControl, now: number): ClockState => ({
  control,
  remaining: {
    white: TIME_CONTROLS[control].initialMs,
    black: TIME_CONTROLS[control].initialMs,
  },
  running: null,
  since: now,
});

export const isClockEnabled = (clock: ClockState): boolean =>
  clock.control !== 'none';

/** Décompte le temps écoulé pour le joueur dont la pendule tourne. */
export const tickClock = (clock: ClockState, now: number): ClockState => {
  if (!isClockEnabled(clock) || !clock.running) {
    return { ...clock, since: now };
  }

  const elapsed = Math.max(0, now - clock.since);
  if (elapsed === 0) return clock;

  const player = clock.running;
  const left = Math.max(0, clock.remaining[player] - elapsed);

  return {
    ...clock,
    remaining: { ...clock.remaining, [player]: left },
    running: left === 0 ? null : clock.running,
    since: now,
  };
};

/** Démarre la pendule d'un joueur, sans rien décompter. */
export const startClock = (
  clock: ClockState,
  player: Player,
  now: number,
): ClockState =>
  isClockEnabled(clock) ? { ...clock, running: player, since: now } : clock;

export const stopClock = (clock: ClockState, now: number): ClockState => {
  const ticked = tickClock(clock, now);
  return { ...ticked, running: null };
};

/**
 * Passe la main : le temps écoulé est décompté au joueur qui vient de jouer,
 * son incrément lui est crédité, puis la pendule adverse démarre.
 */
export const switchClock = (
  clock: ClockState,
  played: Player,
  next: Player,
  now: number,
): ClockState => {
  if (!isClockEnabled(clock)) return clock;

  const ticked = tickClock(clock, now);
  const increment = TIME_CONTROLS[clock.control].incrementMs;

  // Un joueur tombé au drapeau ne reçoit pas d'incrément.
  const credited =
    ticked.remaining[played] > 0
      ? ticked.remaining[played] + increment
      : ticked.remaining[played];

  return {
    ...ticked,
    remaining: { ...ticked.remaining, [played]: credited },
    running: ticked.remaining[played] > 0 ? next : null,
    since: now,
  };
};

/** Le joueur qui a épuisé son temps, s'il y en a un. */
export const flaggedPlayer = (clock: ClockState): Player | null => {
  if (!isClockEnabled(clock)) return null;
  if (clock.remaining.white <= 0) return 'white';
  if (clock.remaining.black <= 0) return 'black';
  return null;
};

/** Format d'affichage : `2:05`, ou `9.4` sous les dix secondes. */
export const formatTime = (ms: number): string => {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    return (clamped / 1000).toFixed(1);
  }
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** Vrai quand il reste moins de dix secondes : l'affichage passe en alerte. */
export const isCritical = (ms: number): boolean => ms > 0 && ms < 10_000;
