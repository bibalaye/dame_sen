'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import StatsPanel from '../StatsPanel';
import Shop from '../Shop';
import RulesPicker from '../RulesPicker';
import AccountPanel from '../AccountPanel';
import FriendsPanel from '../FriendsPanel';
import { computeStats } from '@/lib/history';
import { useGameContext, type GameKind, type GameMode } from '@/context/GameContext';
import { useAccount } from '@/context/AccountContext';
import { useFriends } from '@/context/FriendsContext';
import { TIME_CONTROLS, type TimeControl } from '@/lib/clock';
import { MORPION_OPPONENTS, type MorpionVariant } from '@/lib/morpion';
import { DEFAULT_RULES, type RuleSet } from '@/lib/engine';
import type { Difficulty } from '@/lib/ai';
import { formatCoins } from '@/lib/economy';
import { play } from '@/lib/sound';
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

const GAMES: ReadonlyArray<{ id: GameKind; name: string; detail: string }> = [
  { id: 'dames', name: 'Dames', detail: '5×5 · rafles' },
  { id: 'morpion', name: 'Morpion', detail: '3 pions · 2 phases' },
];

const MODES: ReadonlyArray<{
  id: GameMode;
  label: string;
  detail: string;
  /** Le défi du jour repose sur une position de dames. */
  damesOnly?: boolean;
}> = [
  { id: 'solo', label: 'Solo', detail: 'Contre la machine' },
  { id: 'pass', label: 'À deux', detail: 'Sur cet appareil' },
  { id: 'online', label: 'En ligne', detail: 'Par lien partagé' },
  { id: 'daily', label: 'Défi', detail: 'Le puzzle du jour', damesOnly: true },
];

const TIME_OPTIONS: readonly TimeControl[] = ['none', 'blitz', 'bullet'];

const MORPION_VARIANTS: ReadonlyArray<{
  id: MorpionVariant;
  label: string;
  detail: string;
}> = [
  {
    id: 'moving-heart',
    label: 'Cœur mouvant',
    detail: 'Une case est condamnée et se déplace tous les trois tours',
  },
  {
    id: 'classic',
    label: 'Classique',
    detail: 'Les huit alignements comptent en permanence',
  },
];

/** Aperçu du plateau : un jeu se choisit sur image, pas sur mot. */
const BoardPreview: React.FC<{ kind: GameKind }> = ({ kind }) => {
  if (kind === 'morpion') {
    const marks: Record<number, 'x' | 'o'> = { 0: 'x', 4: 'o', 8: 'x', 2: 'o' };
    return (
      <span className={`${styles.preview} ${styles.previewMorpion}`} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={styles.previewCell}>
            {marks[i] && (
              <span
                className={marks[i] === 'x' ? styles.previewCross : styles.previewRound}
              />
            )}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className={`${styles.preview} ${styles.previewDames}`} aria-hidden="true">
      {Array.from({ length: 25 }, (_, i) => {
        const row = Math.floor(i / 5);
        const side = row < 2 ? 'light' : row > 2 ? 'dark' : null;
        return (
          <span
            key={i}
            className={`${styles.previewCell} ${(row + i) % 2 ? styles.previewAlt : ''}`}
          >
            {side && (
              <span
                className={side === 'light' ? styles.previewLight : styles.previewDark}
              />
            )}
          </span>
        );
      })}
    </span>
  );
};

/** Niveau d'un adversaire, en étoiles pleines ou vides. */
const Level: React.FC<{ value: number; total: number }> = ({ value, total }) => (
  <span className={styles.stars} aria-hidden="true">
    {Array.from({ length: total }, (_, i) => (
      <Image
        key={i}
        src={i < value ? '/assets/ui/star.png' : '/assets/ui/star-empty.png'}
        width={15}
        height={14}
        alt=""
      />
    ))}
  </span>
);

const HomeScreen: React.FC = () => {
  const { startGame, history, pieceSet, wallet } = useGameContext();
  const { account } = useAccount();
  const { lists } = useFriends();

  const [accountOpen, setAccountOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<RuleSet>(DEFAULT_RULES);

  // Les demandes reçues se comptent sur le bouton : sans cela, personne
  // n'ouvrirait la fenêtre pour vérifier.
  const demandes = lists.received.length;

  const stats = useMemo(() => computeStats(history), [history]);

  const [kind, setKind] = useState<GameKind>('dames');
  const [mode, setMode] = useState<GameMode>('solo');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [timeControl, setTimeControl] = useState<TimeControl>('none');
  const [morpionVariant, setMorpionVariant] = useState<MorpionVariant>('moving-heart');

  const modes = MODES.filter((entry) => kind === 'dames' || !entry.damesOnly);

  const opponents =
    kind === 'dames'
      ? OPPONENTS
      : MORPION_OPPONENTS.map((entry) => ({
          id: entry.id as Difficulty,
          name: entry.name,
          tagline: entry.tagline,
        }));

  const handleKind = (next: GameKind) => {
    play('click');
    setKind(next);
    if (next === 'morpion') {
      if (mode === 'daily') setMode('solo');
      if (difficulty === 'expert') setDifficulty('hard');
    }
  };

  const cta =
    mode === 'online'
      ? 'Créer ou rejoindre'
      : mode === 'daily'
        ? 'Relever le défi'
        : 'Jouer';

  const chosenOpponent = opponents.find((entry) => entry.id === difficulty);

  const changedRules = (Object.keys(DEFAULT_RULES) as (keyof RuleSet)[]).filter(
    (key) => rules[key] !== DEFAULT_RULES[key],
  ).length;

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.brand}>Teraanga Games</p>
          <h1 className={styles.title}>Jeux de plateau du Sénégal</h1>

          {/* Les amis d'abord : c'est de là que part une partie à deux, et une
              demande en attente doit se voir sans ouvrir la fenêtre. */}
          <button
            type="button"
            className={`uiRound ${styles.friends}`}
            onClick={() => setFriendsOpen(true)}
            aria-label={
              demandes > 0 ? `Amis, ${demandes} demande(s) en attente` : 'Mes amis'
            }
          >
            <Image src="/assets/ui/icon-check.png" alt="" width={17} height={17} />
            {demandes > 0 && <span className={styles.badge}>{demandes}</span>}
          </button>

          {/* Le compte se tient à l'écart du parcours de jeu : visible, jamais
              sur le chemin de qui veut seulement lancer une partie. */}
          <button
            type="button"
            className={`uiRound ${styles.account}`}
            onClick={() => setAccountOpen(true)}
            aria-label={account ? `Compte de ${account.displayName}` : 'Se connecter'}
          >
            {account ? (
              account.displayName.slice(0, 1).toUpperCase()
            ) : (
              <Image src="/assets/ui/star-empty.png" alt="" width={18} height={17} />
            )}
          </button>
        </header>

        {/* Tout le réglage tient dans un seul panneau : une fiche à remplir,
            plutôt qu'une succession de blocs flottant sur le fond. */}
        <div className={`uiPanel ${styles.panel}`}>
          <section className={styles.block}>
            <h2 className={styles.label}>Le jeu</h2>
            <div className={styles.games}>
              {GAMES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`${styles.game} ${kind === entry.id ? styles.gameOn : ''}`}
                  onClick={() => handleKind(entry.id)}
                  aria-pressed={kind === entry.id}
                >
                  <BoardPreview kind={entry.id} />
                  <span className={styles.gameName}>{entry.name}</span>
                  <span className={styles.gameDetail}>{entry.detail}</span>
                </button>
              ))}
            </div>
          </section>

          <hr className="uiDivider" />

          <section className={styles.block}>
            <h2 className={styles.label}>Mode de jeu</h2>
            <div className={styles.segments} role="group">
              {modes.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`${styles.segment} ${mode === entry.id ? styles.segmentOn : ''}`}
                  onClick={() => {
                    play('click');
                    setMode(entry.id);
                  }}
                  aria-pressed={mode === entry.id}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              {modes.find((entry) => entry.id === mode)?.detail}
            </p>
          </section>

          {mode === 'solo' && (
            <>
              <hr className="uiDivider" />
              <section className={styles.block}>
                <h2 className={styles.label}>Adversaire</h2>
                <div className={styles.rail}>
                  {opponents.map((entry, index) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`${styles.card} ${difficulty === entry.id ? styles.cardOn : ''}`}
                      onClick={() => {
                        play('click');
                        setDifficulty(entry.id);
                      }}
                      aria-pressed={difficulty === entry.id}
                    >
                      <Level value={index + 1} total={opponents.length} />
                      <span className={styles.cardName}>{entry.name}</span>
                    </button>
                  ))}
                </div>
                {chosenOpponent && <p className={styles.hint}>{chosenOpponent.tagline}</p>}
              </section>
            </>
          )}

          {kind === 'morpion' && (
            <>
              <hr className="uiDivider" />
              <section className={styles.block}>
                <h2 className={styles.label}>Règle</h2>
                <div className={styles.segments} role="group">
                  {MORPION_VARIANTS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`${styles.segment} ${
                        morpionVariant === entry.id ? styles.segmentOn : ''
                      }`}
                      onClick={() => {
                        play('click');
                        setMorpionVariant(entry.id);
                      }}
                      aria-pressed={morpionVariant === entry.id}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                <p className={styles.hint}>
                  {MORPION_VARIANTS.find((entry) => entry.id === morpionVariant)?.detail}
                </p>
              </section>
            </>
          )}

          {kind === 'dames' && mode !== 'daily' && (
            <>
              <hr className="uiDivider" />
              <section className={styles.block}>
                <h2 className={styles.label}>Règles du jeu</h2>
                <button
                  type="button"
                  className={styles.rulesButton}
                  onClick={() => setRulesOpen(true)}
                >
                  <span className={styles.rulesText}>
                    {changedRules === 0
                      ? 'Règles traditionnelles'
                      : `${changedRules} règle${changedRules > 1 ? 's' : ''} modifiée${changedRules > 1 ? 's' : ''}`}
                  </span>
                  <span className={styles.rulesMore} aria-hidden="true">
                    Choisir ›
                  </span>
                </button>
              </section>

              <hr className="uiDivider" />
              <section className={styles.block}>
                <h2 className={styles.label}>Cadence</h2>
                <div className={styles.segments} role="group">
                  {TIME_OPTIONS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`${styles.segment} ${
                        timeControl === id ? styles.segmentOn : ''
                      }`}
                      onClick={() => {
                        play('click');
                        setTimeControl(id);
                      }}
                      aria-pressed={timeControl === id}
                    >
                      {TIME_CONTROLS[id].label}
                    </button>
                  ))}
                </div>
                <p className={styles.hint}>{TIME_CONTROLS[timeControl].description}</p>
              </section>
            </>
          )}

          <hr className="uiDivider" />

          {/* Deux réglages secondaires, côte à côte pour ne pas allonger la fiche. */}
          <div className={styles.footRow}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => setShopOpen(true)}
            >
              <span className={styles.chipPieces}>
                <Image src={pieceSet.light} alt="" width={22} height={22} />
                <Image src={pieceSet.dark} alt="" width={22} height={22} />
              </span>
              <span className={styles.chipText}>
                Boutique
                <span className={styles.chipStars}>
                  {formatCoins(wallet.coins)} cauris
                </span>
              </span>
            </button>

            <button
              type="button"
              className={styles.chip}
              onClick={() => setStatsOpen(true)}
              disabled={stats.played === 0}
            >
              <span className={styles.chipFigure}>{stats.played}</span>
              <span className={styles.chipText}>
                {stats.played === 0
                  ? 'Aucune partie'
                  : `${Math.round(stats.winRate * 100)}% gagnées`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} />}
      {friendsOpen && <FriendsPanel onClose={() => setFriendsOpen(false)} />}
      {statsOpen && <StatsPanel onClose={() => setStatsOpen(false)} />}
      {shopOpen && <Shop onClose={() => setShopOpen(false)} />}
      {rulesOpen && (
        <RulesPicker
          rules={rules}
          onChange={setRules}
          onClose={() => setRulesOpen(false)}
        />
      )}

      <div className={styles.launcher}>
        <button
          type="button"
          className={`uiButton ${styles.play}`}
          onClick={() => {
            play('select');
            startGame({ kind, mode, difficulty, timeControl, morpionVariant, rules });
          }}
        >
          <Image src="/assets/ui/icon-play.png" alt="" width={18} height={20} />
          {cta}
        </button>
      </div>
    </div>
  );
};

export default HomeScreen;
