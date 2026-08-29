'use client';

import React, { useEffect, useState } from 'react';

import Modal from '../Modal';
import { useFriends } from '@/context/FriendsContext';
import { FRAMES, TITLES, itemId } from '@/lib/shop';
import type { PlayerCard } from '@/lib/supabase/friends';
import styles from './FriendsPanel.module.css';

interface FriendsPanelProps {
  onClose: () => void;
  /**
   * Salle ouverte : le panneau propose alors d'y inviter, au lieu de se
   * contenter d'afficher la liste.
   */
  room?: { readonly id: string; readonly game: 'dames' | 'morpion' | 'ludo' };
}

const titreDe = (id: string | null) =>
  TITLES.find((entry) => entry.id === itemId('title', id ?? ''))?.label;

const couleurDe = (id: string | null) =>
  FRAMES.find((entry) => entry.id === itemId('frame', id ?? ''))?.color;

/** Un joueur, avec l'initiale encadrée et le titre qu'il porte. */
const Carte: React.FC<{ player: PlayerCard; children?: React.ReactNode }> = ({
  player,
  children,
}) => (
  <li className={styles.row}>
    <span
      className={styles.avatar}
      style={couleurDe(player.frame) ? { borderColor: couleurDe(player.frame) } : undefined}
      aria-hidden="true"
    >
      {player.displayName.slice(0, 1).toUpperCase()}
    </span>

    <span className={styles.identity}>
      <span className={styles.name}>{player.displayName}</span>
      {titreDe(player.title) ? (
        <span className={styles.playerTitle}>{titreDe(player.title)}</span>
      ) : (
        <span className={styles.handle}>@{player.handle}</span>
      )}
    </span>

    <span className={styles.actions}>{children}</span>
  </li>
);

/**
 * Les amis.
 *
 * Inviter quelqu'un demandait de lui faire parvenir un code de six caractères
 * par un autre moyen — donc de quitter le jeu. Ici, on cherche un pseudo une
 * fois, et l'invitation part d'un bouton.
 */
const FriendsPanel: React.FC<FriendsPanelProps> = ({ onClose, room }) => {
  const { lists, isLoading, search, add, respond, remove, invitePlayer } = useFriends();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerCard[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [invited, setInvited] = useState<readonly string[]>([]);

  // La recherche part toute seule après une courte pause : un bouton de plus
  // pour trois lettres tapées n'apporterait rien.
  useEffect(() => {
    const terme = query.trim();
    if (terme.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      void search(terme).then(setResults);
    }, 280);

    return () => clearTimeout(timer);
  }, [query, search]);

  const dejaConnu = (handle: string) =>
    lists.friends.some((entry) => entry.handle === handle) ||
    lists.sent.some((entry) => entry.handle === handle) ||
    lists.received.some((entry) => entry.handle === handle);

  const ajouter = async (handle: string) => {
    const erreur = await add(handle);
    setNotice(erreur ?? 'Demande envoyée.');
    if (!erreur) setQuery('');
  };

  const inviter = async (handle: string) => {
    if (!room) return;
    const erreur = await invitePlayer(handle, room.id, room.game);

    if (erreur) {
      setNotice(erreur);
      return;
    }
    setInvited((current) => [...current, handle]);
    setNotice(null);
  };

  return (
    <Modal title={room ? 'Inviter un ami' : 'Mes amis'} onClose={onClose}>
      {room && (
        <p className={styles.lead}>
          Votre salle est ouverte. Choisissez qui rejoint la partie — il recevra
          l’invitation sans avoir à recopier le code.
        </p>
      )}

      <div className={styles.field}>
        <label htmlFor="amis-recherche">Chercher un joueur</label>
        <input
          id="amis-recherche"
          className="uiInput"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Son pseudo"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {results.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.label}>Résultats</h3>
          <ul className={styles.list}>
            {results.map((player) => (
              <Carte key={player.handle} player={player}>
                {dejaConnu(player.handle) ? (
                  <span className={styles.muted}>Déjà connu</span>
                ) : (
                  <button
                    type="button"
                    className={`uiButton ${styles.small}`}
                    onClick={() => void ajouter(player.handle)}
                  >
                    Ajouter
                  </button>
                )}
              </Carte>
            ))}
          </ul>
        </section>
      )}

      {lists.received.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.label}>Demandes reçues</h3>
          <ul className={styles.list}>
            {lists.received.map((player) => (
              <Carte key={player.handle} player={player}>
                <button
                  type="button"
                  className={`uiButton uiButtonConfirm ${styles.small}`}
                  onClick={() => void respond(player.handle, true)}
                >
                  Accepter
                </button>
                <button
                  type="button"
                  className={`uiButton uiButtonNeutral ${styles.small}`}
                  onClick={() => void respond(player.handle, false)}
                >
                  Refuser
                </button>
              </Carte>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.block}>
        <h3 className={styles.label}>
          Amis {lists.friends.length > 0 && `(${lists.friends.length})`}
        </h3>

        {isLoading && <p className={styles.muted}>Chargement…</p>}

        {!isLoading && lists.friends.length === 0 && (
          <p className={styles.empty}>
            Personne pour l’instant. Cherchez un pseudo ci-dessus pour ajouter
            votre premier ami.
          </p>
        )}

        <ul className={styles.list}>
          {lists.friends.map((player) => (
            <Carte key={player.handle} player={player}>
              {room ? (
                invited.includes(player.handle) ? (
                  <span className={styles.muted}>Invité</span>
                ) : (
                  <button
                    type="button"
                    className={`uiButton ${styles.small}`}
                    onClick={() => void inviter(player.handle)}
                  >
                    Inviter
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className={`uiButton uiButtonNeutral ${styles.small}`}
                  onClick={() => void remove(player.handle)}
                >
                  Retirer
                </button>
              )}
            </Carte>
          ))}
        </ul>
      </section>

      {lists.sent.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.label}>Demandes envoyées</h3>
          <ul className={styles.list}>
            {lists.sent.map((player) => (
              <Carte key={player.handle} player={player}>
                <span className={styles.muted}>En attente</span>
              </Carte>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
};

export default FriendsPanel;
