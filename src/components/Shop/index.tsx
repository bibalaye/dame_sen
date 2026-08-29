'use client';

import React, { useState } from 'react';
import Image from 'next/image';

import Modal from '../Modal';
import { useGameContext } from '@/context/GameContext';
import { useAccount } from '@/context/AccountContext';
import { formatCoins } from '@/lib/economy';
import { BOARD_THEMES, findBoardTheme } from '@/lib/boards';
import { findPieceSet, type PieceSetId } from '@/lib/pieceSets';
import { RARITY_LABELS, RARITY_TOKENS } from '@/lib/rarity';
import {
  FRAMES,
  KIND_LABELS,
  KIND_ORDER,
  TITLES,
  itemsOfKind,
  localId,
  type FrameId,
  type ItemKind,
  type ShopItem,
  type TitleId,
} from '@/lib/shop';
import type { BoardThemeId } from '@/lib/boards';
import styles from './Shop.module.css';

interface ShopProps {
  onClose: () => void;
}

/**
 * Aperçu d'un article.
 *
 * On n'achète pas un nom : chaque famille se montre telle qu'elle apparaîtra en
 * jeu — les pions sur un fragment de damier, un plateau par ses vraies
 * couleurs, un cadre autour d'une initiale.
 */
const Apercu: React.FC<{ item: ShopItem; initiale: string }> = ({ item, initiale }) => {
  const local = localId(item.id);

  if (item.kind === 'pieces') {
    const set = findPieceSet(local as PieceSetId);
    return (
      <span className={styles.previewBoard}>
        <Image src={set.light} width={64} height={64} alt="" />
        <Image src={set.dark} width={64} height={64} alt="" />
        <Image className={styles.king} src={set.lightKing} width={64} height={64} alt="" />
      </span>
    );
  }

  if (item.kind === 'board') {
    const theme = findBoardTheme(local as BoardThemeId);
    return (
      <span
        className={styles.previewSquares}
        style={{
          background: `linear-gradient(135deg, ${theme.frameLight}, ${theme.frameDark})`,
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            style={{
              background:
                (i + Math.floor(i / 3)) % 2 ? theme.squareDark : theme.squareLight,
            }}
          />
        ))}
      </span>
    );
  }

  if (item.kind === 'frame') {
    const frame = FRAMES.find((entry) => entry.id === item.id);
    return (
      <span className={styles.previewFrame}>
        {/* L'initiale du joueur, pas une lettre au hasard : on voit ce que le
            cadre donnera sur son propre profil. */}
        <span style={{ borderColor: frame?.color ?? 'var(--line)' }}>{initiale}</span>
      </span>
    );
  }

  if (item.kind === 'title') {
    const title = TITLES.find((entry) => entry.id === item.id);
    return <span className={styles.previewTitle}>{title?.label}</span>;
  }

  return (
    <span className={styles.previewFeature} aria-hidden="true">
      {local === 'indices' ? '💡' : '↩'}
    </span>
  );
};

/**
 * La boutique.
 *
 * Tout ce qui s'achète tient ici, rangé par rayon. Rien n'y change une règle du
 * jeu : les deux fonctions vendues n'agissent qu'en solo, et le reste est du
 * décor. Un joueur qui ne dépense jamais rien ne joue pas un moins bon jeu.
 */
const Shop: React.FC<ShopProps> = ({ onClose }) => {
  const {
    wallet,
    buyItem,
    ownsItem,
    loadout,
    setPieceSet,
    setBoardTheme,
    setFrame,
    setTitle,
  } = useGameContext();

  const [rayon, setRayon] = useState<ItemKind>('pieces');

  const { account } = useAccount();
  const initiale = (account?.displayName ?? 'A').slice(0, 1).toUpperCase();

  /** Ce qui est porté dans chaque famille, pour marquer l'article en cours. */
  const porte = (item: ShopItem): boolean => {
    const local = localId(item.id);
    if (item.kind === 'pieces') return loadout.pieces === local;
    if (item.kind === 'board') return loadout.board === local;
    if (item.kind === 'frame') return loadout.frame === local;
    if (item.kind === 'title') return loadout.title === local;
    // Une fonction s'applique dès qu'on l'a : elle ne se porte pas.
    return false;
  };

  /** Un article acquis se met en jeu ; sinon, il s'achète. */
  const activer = (item: ShopItem) => {
    if (!ownsItem(item.id)) {
      buyItem(item.id);
      return;
    }

    const local = localId(item.id);
    if (item.kind === 'pieces') setPieceSet(local as PieceSetId);
    else if (item.kind === 'board') setBoardTheme(local as BoardThemeId);
    // Recliquer sur le cadre ou le titre porté le retire : c'est le seul moyen
    // de revenir à un profil sobre sans article « aucun » dans la grille.
    else if (item.kind === 'frame') {
      setFrame(loadout.frame === local ? null : (local as FrameId));
    } else if (item.kind === 'title') {
      setTitle(loadout.title === local ? null : (local as TitleId));
    }
  };

  const articles = itemsOfKind(rayon);

  return (
    <Modal title="Boutique" onClose={onClose}>
      <div className={styles.purse}>
        <Image src="/assets/pieces/disc-yellow.png" alt="" width={22} height={22} />
        <strong>{formatCoins(wallet.coins)}</strong>
        <span>cauris</span>
      </div>

      <div className={styles.tabs} role="tablist">
        {KIND_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={rayon === kind}
            className={`${styles.tab} ${rayon === kind ? styles.tabOn : ''}`}
            onClick={() => setRayon(kind)}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {articles.map((item) => {
          const acquis = ownsItem(item.id);
          const enJeu = porte(item);
          const abordable = acquis || wallet.coins >= item.price;

          return (
            <button
              key={item.id}
              type="button"
              className={[
                styles.card,
                enJeu ? styles.cardOn : '',
                acquis ? '' : styles.cardLocked,
                acquis || abordable ? '' : styles.cardOut,
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--rarity': RARITY_TOKENS[item.rarity] } as React.CSSProperties}
              onClick={() => activer(item)}
              disabled={!acquis && !abordable}
              aria-pressed={enJeu}
            >
              <span className={styles.rarity}>{RARITY_LABELS[item.rarity]}</span>

              <span className={styles.preview}>
                <Apercu item={item} initiale={initiale} />
              </span>

              <span className={styles.name}>{item.name}</span>
              <span className={styles.detail}>{item.detail}</span>

              <span className={styles.footer}>
                {enJeu ? (
                  <span className={styles.worn}>En jeu</span>
                ) : acquis ? (
                  <span className={styles.owned}>
                    {item.kind === 'feature' ? 'Acquis' : 'Mettre'}
                  </span>
                ) : (
                  <span className={abordable ? styles.price : styles.priceOut}>
                    {formatCoins(item.price)} cauris
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <p className={styles.note}>
        Les cauris se gagnent en jouant. Rien ici ne change une règle : les deux
        fonctions n’agissent qu’en solo, jamais contre un adversaire humain.
      </p>
    </Modal>
  );
};

export default Shop;
export { BOARD_THEMES };
