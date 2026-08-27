'use client';

import React, { useEffect, useRef } from 'react';
import styles from './RulesPanel.module.css';

interface RulesPanelProps {
  onClose: () => void;
}

const RULES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Le plateau',
    body: 'Cinq cases sur cinq. Les blancs occupent le bas, les noirs le haut. Les blancs commencent.',
  },
  {
    title: 'Les déplacements',
    body: 'Un pion avance d’une case vers le camp adverse, ou se décale d’une case à gauche ou à droite. Il ne recule jamais. Tout se joue en ligne droite : jamais en diagonale.',
  },
  {
    title: 'Les prises',
    body: 'On prend en sautant par-dessus une pièce adverse voisine, dans les quatre directions, si la case juste derrière est libre. Prendre est obligatoire : quand une prise existe, les pièces concernées sont mises en avant et les autres s’effacent.',
  },
  {
    title: 'Les rafles',
    body: 'Si la pièce qui vient de prendre peut reprendre, elle continue et le tour ne change pas. C’est le meilleur moment du jeu : une rafle peut renverser une partie.',
  },
  {
    title: 'La dame',
    body: 'Un pion qui atteint la dernière rangée adverse devient dame, ce qui met fin à son tour. La dame glisse sur plusieurs cases dans les quatre directions et prend la première pièce adverse de sa ligne.',
  },
  {
    title: 'La fin de partie',
    body: 'On gagne en prenant toutes les pièces adverses, ou en bloquant l’adversaire au point qu’il n’ait plus aucun coup. La partie est nulle après 25 coups sans prise ni promotion, ou si la même position revient trois fois.',
  },
];

const RulesPanel: React.FC<RulesPanelProps> = ({ onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
      onClick={onClose}
    >
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <h2 id="rules-title" className={styles.title}>
          Règles du jeu
        </h2>

        <dl className={styles.list}>
          {RULES.map((rule) => (
            <div key={rule.title} className={styles.rule}>
              <dt className={styles.ruleTitle}>{rule.title}</dt>
              <dd className={styles.ruleBody}>{rule.body}</dd>
            </div>
          ))}
        </dl>

        <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
          J’ai compris
        </button>
      </div>
    </div>
  );
};

export default RulesPanel;
