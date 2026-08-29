'use client';

import React from 'react';

import Modal from '../Modal';
import styles from './LudoRules.module.css';

interface LudoRulesProps {
  onClose: () => void;
}

/**
 * Les règles, telles qu'on les joue au Sénégal.
 *
 * Elles s'écartent assez du Ludo répandu ailleurs pour qu'on ne puisse pas les
 * deviner : un pion pris change de camp d'écurie, empiler expose au lieu de
 * protéger, et l'allée d'un adversaire s'ouvre à qui vient y prendre. Sans ce
 * texte, on découvre chacune de ces règles en la subissant.
 *
 * L'ordre suit celui d'une partie : sortir, avancer, prendre, rentrer.
 */
const LudoRules: React.FC<LudoRulesProps> = ({ onClose }) => (
  <Modal title="Règles du Ludo" onClose={onClose}>
    <p className={styles.lead}>
      Le premier à ramener ses quatre pions au centre gagne. Ces règles sont
      celles du Sénégal : plusieurs diffèrent du Ludo joué ailleurs.
    </p>

    <section className={styles.rule}>
      <h3>Sortir de l’écurie</h3>
      <p>
        Il faut un <strong>6</strong> pour mettre un pion en jeu. Il se pose sur
        votre porte — la case de votre couleur, devant votre écurie.
      </p>
    </section>

    <section className={styles.rule}>
      <h3>Les deux dés</h3>
      <p>
        Chaque dé se joue à part : deux pions différents, ou le même deux fois
        de suite. Un <strong>double-six</strong> vous rend la main, trois fois
        au plus.
      </p>
    </section>

    <section className={`${styles.rule} ${styles.key}`}>
      <h3>La capture fait un prisonnier</h3>
      <p>
        Tomber sur un pion adverse ne le renvoie pas chez lui : il rejoint{' '}
        <strong>votre écurie</strong>, où il reste prisonnier.
      </p>
      <p>
        Son propriétaire devra un <strong>6</strong> pour le ramener chez lui,
        puis un <strong>second</strong> pour le remettre en jeu. Se faire
        prendre coûte donc deux six.
      </p>
    </section>

    <section className={`${styles.rule} ${styles.key}`}>
      <h3>Empiler est dangereux</h3>
      <p>
        Deux de vos pions sur la même case se font prendre{' '}
        <strong>ensemble</strong> — un seul adversaire les emmène tous les deux.
      </p>
      <p>
        Sauf sur <strong>votre porte</strong> : là, ils forment un barrage que
        rien ne franchit.
      </p>
    </section>

    <section className={styles.rule}>
      <h3>Forcer un barrage</h3>
      <p>
        Il faut autant de <strong>six</strong> que le barrage compte de pions :
        deux pions, deux six ; trois pions, trois six.
      </p>
      <p>
        Deux dés n’en donnent jamais trois d’un coup — ils s’additionnent d’un
        lancer à l’autre, ce que la relance du double-six permet.
      </p>
    </section>

    <section className={`${styles.rule} ${styles.key}`}>
      <h3>Entrer chez l’adversaire</h3>
      <p>
        L’allée d’un adversaire n’est pas un sanctuaire : on peut y entrer pour
        prendre un pion sur le point de rentrer.
      </p>
      <p>
        Mais <strong>uniquement s’il y a une prise</strong>, et seulement en
        arrivant sur son seuil — jamais en en repartant. Une fois dedans, il
        faut un <strong>6 par case</strong> pour en ressortir.
      </p>
    </section>

    <section className={styles.rule}>
      <h3>Rentrer chez soi</h3>
      <p>
        Arrivé devant votre allée, vous pouvez entrer… ou passer devant et
        repartir pour un tour. Un pion sur le circuit menace encore ; un pion
        rentré ne fait plus que compter.
      </p>
      <p>
        Dans l’allée, le compte exact mène au centre — ou un{' '}
        <strong>6</strong>, d’où que vous soyez.
      </p>
    </section>

    <p className={styles.note}>
      Sur le plateau : un liseré rouge marque un barrage, un pointillé prévient
      que deux pions sont exposés, et un pion grisé est prisonnier.
    </p>
  </Modal>
);

export default LudoRules;
