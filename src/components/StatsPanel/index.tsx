'use client';

import React, { useMemo, useState } from 'react';
import Modal from '../Modal';
import { useGameContext } from '@/context/GameContext';
import { OPPONENTS } from '../HomeScreen';
import {
  computeStats,
  filterByGame,
  formatWhen,
  type GameKindId,
} from '@/lib/history';
import styles from './StatsPanel.module.css';

interface StatsPanelProps {
  onClose: () => void;
}

const FILTERS: ReadonlyArray<{ id: GameKindId | 'all'; label: string }> = [
  { id: 'all', label: 'Tout' },
  { id: 'dames', label: 'Dames' },
  { id: 'morpion', label: 'Morpion' },
];

const RESULT_LABEL = { win: 'Gagnée', loss: 'Perdue', draw: 'Nulle' } as const;

const MODE_LABEL = {
  solo: 'Solo',
  pass: 'À deux',
  online: 'En ligne',
  daily: 'Défi',
} as const;

/** Le nom d'adversaire stocké pour les dames est un niveau : on le rend lisible. */
const opponentLabel = (raw: string): string =>
  OPPONENTS.find((entry) => entry.id === raw)?.name ?? raw;

const StatsPanel: React.FC<StatsPanelProps> = ({ onClose }) => {
  const { history, clearHistory } = useGameContext();
  const [filter, setFilter] = useState<GameKindId | 'all'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const entries = useMemo(
    () => (filter === 'all' ? history : filterByGame(history, filter)),
    [history, filter],
  );
  const stats = useMemo(() => computeStats(entries), [entries]);

  return (
    <Modal title="Vos parties" onClose={onClose}>
      <div className={styles.panel}>
        <div className={styles.filters} role="group">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`${styles.filter} ${filter === entry.id ? styles.filterOn : ''}`}
              onClick={() => setFilter(entry.id)}
              aria-pressed={filter === entry.id}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {stats.played === 0 ? (
          <p className={styles.empty}>
            Aucune partie enregistrée pour l’instant. Jouez, et tout s’inscrira ici.
          </p>
        ) : (
          <>
            <div className={styles.figures}>
              <div className={styles.figure}>
                <span className={styles.value}>{stats.played}</span>
                <span className={styles.caption}>parties</span>
              </div>
              <div className={styles.figure}>
                <span className={`${styles.value} ${styles.win}`}>
                  {Math.round(stats.winRate * 100)}%
                </span>
                <span className={styles.caption}>de victoires</span>
              </div>
              <div className={styles.figure}>
                <span className={styles.value}>{stats.currentStreak}</span>
                <span className={styles.caption}>série en cours</span>
              </div>
              <div className={styles.figure}>
                <span className={`${styles.value} ${styles.best}`}>
                  {stats.bestStreak}
                </span>
                <span className={styles.caption}>meilleure série</span>
              </div>
            </div>

            {/* La barre donne l'équilibre du bilan sans lire trois nombres. */}
            <div className={styles.bar} aria-hidden="true">
              <span className={styles.barWin} style={{ flexGrow: stats.wins }} />
              <span className={styles.barDraw} style={{ flexGrow: stats.draws }} />
              <span className={styles.barLoss} style={{ flexGrow: stats.losses }} />
            </div>
            <p className={styles.legend}>
              {stats.wins} gagnée{stats.wins > 1 ? 's' : ''} · {stats.draws} nulle
              {stats.draws > 1 ? 's' : ''} · {stats.losses} perdue
              {stats.losses > 1 ? 's' : ''}
            </p>

            <ol className={styles.list}>
              {entries.slice(0, 20).map((entry) => (
                <li key={entry.id} className={styles.row}>
                  <span
                    className={`${styles.dot} ${styles[entry.result]}`}
                    aria-hidden="true"
                  />
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {RESULT_LABEL[entry.result]} contre {opponentLabel(entry.opponent)}
                    </span>
                    <span className={styles.rowMeta}>
                      {entry.game === 'dames' ? 'Dames' : 'Morpion'} ·{' '}
                      {MODE_LABEL[entry.mode]}
                      {entry.detail ? ` · ${entry.detail}` : ''}
                    </span>
                  </span>
                  <span className={styles.rowWhen}>{formatWhen(entry.playedAt)}</span>
                </li>
              ))}
            </ol>

            {confirmClear ? (
              <div className={styles.confirm}>
                <p className={styles.confirmText}>
                  Effacer définitivement les {history.length} parties enregistrées ?
                </p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => {
                      clearHistory();
                      setConfirmClear(false);
                    }}
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => setConfirmClear(false)}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setConfirmClear(true)}
              >
                Effacer l’historique
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default StatsPanel;
