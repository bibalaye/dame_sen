/**
 * Sons du jeu.
 *
 * Les timbres étaient synthétisés faute d'échantillons ; on joue désormais de
 * vrais enregistrements — carte posée, jetons qui s'entrechoquent, dé lancé.
 * Ils sont plus justes qu'un oscillateur, et pèsent quelques dizaines de
 * kilo-octets.
 *
 * Le fichier reste tolérant : si le navigateur refuse de lire (autoplay bloqué,
 * format non géré), le jeu continue sans un mot.
 */

export type Sound =
  | 'move'
  | 'capture'
  | 'promote'
  | 'win'
  | 'lose'
  | 'illegal'
  | 'click'
  | 'select';

const SFX_DIR = '/assets/sfx';

/** Fichier et volume de chaque son, réglés les uns par rapport aux autres. */
const CATALOGUE: Readonly<Record<Sound, { src: string; volume: number }>> = {
  move: { src: `${SFX_DIR}/place.ogg`, volume: 0.55 },
  capture: { src: `${SFX_DIR}/capture.ogg`, volume: 0.7 },
  promote: { src: `${SFX_DIR}/promote.ogg`, volume: 0.6 },
  win: { src: `${SFX_DIR}/capture2.ogg`, volume: 0.75 },
  lose: { src: `${SFX_DIR}/slide.ogg`, volume: 0.5 },
  illegal: { src: `${SFX_DIR}/switch.ogg`, volume: 0.35 },
  click: { src: `${SFX_DIR}/click.ogg`, volume: 0.4 },
  select: { src: `${SFX_DIR}/tap.ogg`, volume: 0.45 },
};

let muted = false;
const STORAGE_KEY = 'dame-sen:muted';

/**
 * Un pool par son : rejouer le même échantillon avant la fin du précédent
 * couperait le premier. Deux exemplaires suffisent au rythme du jeu.
 */
const POOL_SIZE = 2;
const pools = new Map<Sound, HTMLAudioElement[]>();
const cursors = new Map<Sound, number>();

const acquire = (sound: Sound): HTMLAudioElement | null => {
  if (typeof window === 'undefined') return null;

  let pool = pools.get(sound);
  if (!pool) {
    const { src, volume } = CATALOGUE[sound];
    pool = Array.from({ length: POOL_SIZE }, () => {
      const audio = new Audio(src);
      audio.volume = volume;
      audio.preload = 'auto';
      return audio;
    });
    pools.set(sound, pool);
    cursors.set(sound, 0);
  }

  const index = cursors.get(sound) ?? 0;
  cursors.set(sound, (index + 1) % pool.length);
  return pool[index];
};

export const isMuted = (): boolean => muted;

export const loadMutePreference = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Navigation privée ou stockage refusé : le son reste actif.
    muted = false;
  }
  return muted;
};

export const setMuted = (next: boolean): void => {
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // Sans stockage, la préférence vaut pour la session en cours.
  }
};

/**
 * Joue un son. `intensity` monte la hauteur d'un demi-ton par cran : une rafle
 * gagne ainsi en tension à chaque prise enchaînée.
 */
export const play = (sound: Sound, intensity = 0): void => {
  if (muted) return;

  const audio = acquire(sound);
  if (!audio) return;

  try {
    audio.currentTime = 0;
    // Le navigateur borne la vitesse ; au-delà de deux, le son se déforme.
    audio.playbackRate = Math.min(2, 1 + Math.min(intensity, 6) * 0.06);
    const started = audio.play();
    // Lecture refusée tant que l'utilisateur n'a pas interagi : sans importance.
    if (started) void started.catch(() => undefined);
  } catch {
    // Élément audio indisponible : le jeu continue en silence.
  }
};

/** Charge les échantillons pour que le premier coup ne soit pas muet. */
export const preloadSounds = (): void => {
  if (typeof window === 'undefined') return;
  (Object.keys(CATALOGUE) as Sound[]).forEach((sound) => acquire(sound));
};

/**
 * Vibration courte sur mobile. Elle double le retour sonore pour les joueurs
 * qui coupent le son — c'est-à-dire la majorité dans les transports.
 */
export const vibrate = (pattern: number | number[]): void => {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Certains navigateurs refusent hors interaction : sans conséquence.
  }
};
