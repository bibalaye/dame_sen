'use client';

import React, { useEffect, useState } from 'react';

import Modal from '../Modal';
import { useAccount } from '@/context/AccountContext';
import { fetchLeaderboard, type LeaderboardRow } from '@/lib/supabase/remote';
import styles from './Leaderboard.module.css';

interface LeaderboardProps {
  onClose: () => void;
}

/**
 * Le classement des joueurs.
 *
 * Il ne montre ni solde ni identifiant de compte : seulement un pseudo et des
 * victoires. Un joueur entre au classement à partir de cinq parties — sans ce
 * seuil, une victoire unique placerait n'importe qui en tête.
 */
const Leaderboard: React.FC<LeaderboardProps> = ({ onClose }) => {
  const { account } = useAccount();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchLeaderboard()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal title="Classement" onClose={onClose}>
      {rows === null && <p className={styles.state}>Chargement…</p>}

      {rows !== null && rows.length === 0 && (
        <p className={styles.state}>
          Le classement s’ouvre à partir de cinq parties jouées. Lancez-vous —
          il n’y a encore personne à rattraper.
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <ol className={styles.list}>
          {rows.map((row, index) => {
            const isMine = account?.handle === row.handle;
            return (
              <li
                key={row.handle}
                className={`${styles.row} ${isMine ? styles.mine : ''}`}
              >
                <span className={styles.rank}>{index + 1}</span>
                <span className={styles.who}>
                  {row.displayName}
                  {isMine && <span className={styles.you}>vous</span>}
                </span>
                <span className={styles.score}>
                  <strong>{row.wins}</strong>
                  <span className={styles.played}>/ {row.played}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className={styles.note}>
        Victoires sur parties jouées. Seules les parties enregistrées sur un
        compte y figurent.
      </p>
    </Modal>
  );
};

export default Leaderboard;
