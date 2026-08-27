/**
 * Sons du jeu, synthétisés à la volée.
 *
 * Aucun fichier audio : tout est fabriqué avec l'API Web Audio. Le jeu reste
 * léger, fonctionne hors-ligne et ne dépend d'aucun asset à héberger. Les
 * timbres cherchent la matière du plateau réel — bois posé, choc sec, note
 * grave à la promotion — plutôt que des bips de synthèse.
 */

type Sound = 'move' | 'capture' | 'promote' | 'win' | 'lose' | 'illegal';

let context: AudioContext | null = null;
let muted = false;

const STORAGE_KEY = 'dame-sen:muted';

/** Le navigateur exige un geste de l'utilisateur avant de produire du son. */
const getContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;

  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }

  if (context.state === 'suspended') void context.resume();
  return context;
};

export const isMuted = (): boolean => muted;

export const loadMutePreference = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Navigation privée ou stockage refusé : on joue le son par défaut.
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

/** Bruit blanc filtré : la matière des sons percussifs (bois, choc). */
const noiseBurst = (
  ctx: AudioContext,
  at: number,
  duration: number,
  frequency: number,
  gain: number,
) => {
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Décroissance exponentielle : l'attaque claque, la queue s'éteint vite.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.5);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 1.4;

  const amp = ctx.createGain();
  amp.gain.value = gain;

  source.connect(filter).connect(amp).connect(ctx.destination);
  source.start(at);
  source.stop(at + duration);
};

/** Note tenue, pour les moments qui doivent chanter plutôt que claquer. */
const tone = (
  ctx: AudioContext,
  at: number,
  duration: number,
  frequency: number,
  gain: number,
  type: OscillatorType = 'triangle',
) => {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration);
};

/**
 * Joue un son du jeu. `intensity` sert à la rafle : chaque prise enchaînée
 * monte d'un demi-ton, ce qui fait grimper la tension toute seule.
 */
export const play = (sound: Sound, intensity = 0): void => {
  if (muted) return;
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const step = Math.pow(2, Math.min(intensity, 8) / 12);

  switch (sound) {
    case 'move':
      // Une pièce de bois posée sur la planche.
      noiseBurst(ctx, now, 0.07, 1500, 0.28);
      tone(ctx, now, 0.09, 190, 0.1, 'sine');
      break;

    case 'capture':
      // Le choc de la prise, puis la pièce qui roule hors du plateau.
      noiseBurst(ctx, now, 0.12, 900 * step, 0.4);
      tone(ctx, now, 0.16, 130 * step, 0.16, 'square');
      tone(ctx, now + 0.05, 0.14, 320 * step, 0.09);
      break;

    case 'promote':
      // Trois notes qui montent : la pièce prend du galon.
      tone(ctx, now, 0.22, 392, 0.14);
      tone(ctx, now + 0.09, 0.22, 523, 0.14);
      tone(ctx, now + 0.18, 0.36, 659, 0.16);
      break;

    case 'win':
      [523, 659, 784, 1047].forEach((frequency, index) => {
        tone(ctx, now + index * 0.11, 0.4, frequency, 0.15);
      });
      [0, 0.11, 0.22, 0.33].forEach((offset) => {
        noiseBurst(ctx, now + offset, 0.1, 2400, 0.12);
      });
      break;

    case 'lose':
      [392, 349, 294].forEach((frequency, index) => {
        tone(ctx, now + index * 0.14, 0.42, frequency, 0.13);
      });
      break;

    case 'illegal':
      tone(ctx, now, 0.1, 140, 0.1, 'sawtooth');
      break;
  }
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
