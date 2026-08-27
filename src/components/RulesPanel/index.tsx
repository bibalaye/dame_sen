'use client';

import React from 'react';
import Modal from '../Modal';
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
    body: 'On prend en sautant par-dessus une pièce adverse voisine, si la case juste derrière est libre. Un pion prend devant lui et sur les côtés, jamais dans son dos : une pièce dépassée ne risque plus rien. Prendre est obligatoire — les pièces concernées sont mises en avant, les autres s’effacent.',
  },
  {
    title: 'Les rafles',
    body: 'Si la pièce qui vient de prendre peut reprendre, elle continue et le tour ne change pas. Un pion qui devient dame au milieu d’une rafle la poursuit, avec sa nouvelle portée. C’est le meilleur moment du jeu : une rafle peut renverser une partie.',
  },
  {
    title: 'La dame',
    body: 'Un pion qui atteint la dernière rangée adverse devient dame. Elle glisse sur plusieurs cases dans les quatre directions, elle seule prend en arrière, et après une prise elle s’arrête où elle veut derrière la pièce capturée. Un camp réduit à une seule pièce la reçoit en dame d’office.',
  },
  {
    title: 'La fin de partie',
    body: 'On gagne en prenant toutes les pièces adverses, ou en bloquant l’adversaire au point qu’il n’ait plus aucun coup. Nulle après 25 coups sans prise ni promotion, ou si la même position revient trois fois.',
  },
];

const RulesPanel: React.FC<RulesPanelProps> = ({ onClose }) => (
  <Modal title="Règles du jeu" onClose={onClose}>
    <dl className={styles.list}>
      {RULES.map((rule) => (
        <div key={rule.title} className={styles.rule}>
          <dt className={styles.ruleTitle}>{rule.title}</dt>
          <dd className={styles.ruleBody}>{rule.body}</dd>
        </div>
      ))}
    </dl>
  </Modal>
);

export default RulesPanel;
