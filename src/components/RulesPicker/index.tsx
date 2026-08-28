'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Modal from '../Modal';
import { play } from '@/lib/sound';
import { DEFAULT_RULES, type RuleSet } from '@/lib/engine';
import styles from './RulesPicker.module.css';

interface RulesPickerProps {
  rules: RuleSet;
  onChange: (rules: RuleSet) => void;
  onClose: () => void;
}

/**
 * Une règle telle qu'on la présente au joueur.
 *
 * `custom` dit ce qu'on obtient en s'écartant de la coutume : c'est cette
 * phrase-là qu'on lit avant de cocher, pas la définition formelle.
 */
interface RuleEntry {
  readonly key: keyof RuleSet;
  readonly name: string;
  readonly standard: string;
  readonly custom: string;
}

const ENTRIES: readonly RuleEntry[] = [
  {
    key: 'mandatoryCapture',
    name: 'Prise obligatoire',
    standard: 'Dès qu’une prise existe, elle est la seule permise.',
    custom: 'Vous pouvez refuser une prise et jouer autre chose.',
  },
  {
    key: 'backwardMove',
    name: 'Recul des pions',
    standard: 'Un pion avance ou se décale, jamais en arrière.',
    custom: 'Un pion peut revenir sur ses pas.',
  },
  {
    key: 'backwardCapture',
    name: 'Prise dans le dos',
    standard: 'Une pièce dépassée est hors de danger.',
    custom: 'Un pion prend aussi derrière lui, comme la dame.',
  },
  {
    key: 'flyingKing',
    name: 'Dame volante',
    standard: 'Après une prise, la dame s’arrête où elle veut.',
    custom: 'La dame se pose juste derrière la pièce prise.',
  },
  {
    key: 'loneSurvivorKing',
    name: 'Dernière pièce en dame',
    standard: 'Réduit à une pièce, un camp la reçoit en dame.',
    custom: 'Le survivant reste un simple pion.',
  },
  {
    key: 'promotionEndsTurn',
    name: 'La promotion arrête la rafle',
    standard: 'Devenir dame en pleine rafle ne l’interrompt pas.',
    custom: 'Le tour s’arrête dès qu’un pion devient dame.',
  },
  {
    key: 'maximalCapture',
    name: 'Rafle maximale',
    standard: 'Entre deux prises, vous choisissez librement.',
    custom: 'Vous devez prendre la ligne qui rafle le plus.',
  },
];

/** Vrai quand la règle est réglée sur la coutume. */
const isStandard = (rules: RuleSet, key: keyof RuleSet): boolean =>
  rules[key] === DEFAULT_RULES[key];

const RulesPicker: React.FC<RulesPickerProps> = ({ rules, onChange, onClose }) => {
  const [draft, setDraft] = useState<RuleSet>(rules);

  const changed = ENTRIES.filter((entry) => !isStandard(draft, entry.key)).length;

  const toggle = (key: keyof RuleSet) => {
    play('click');
    setDraft((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <Modal title="Règles de la partie" onClose={onClose}>
      <div className={styles.panel}>
        <p className={styles.intro}>
          Cochez ce qui s’applique. Les réglages d’origine sont ceux du jeu
          traditionnel — chaque écart change la façon de jouer, et l’adversaire
          s’y adapte.
        </p>

        <ul className={styles.list}>
          {ENTRIES.map((entry) => {
            const active = draft[entry.key];
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  className={`${styles.rule} ${active ? styles.ruleOn : ''}`}
                  onClick={() => toggle(entry.key)}
                  aria-pressed={active}
                >
                  <Image
                    className={styles.box}
                    src={active ? '/assets/ui/check-on.png' : '/assets/ui/check-off.png'}
                    width={28}
                    height={28}
                    alt=""
                  />
                  <span className={styles.text}>
                    <span className={styles.name}>
                      {entry.name}
                      {!isStandard(draft, entry.key) && (
                        <span className={styles.tag}>modifiée</span>
                      )}
                    </span>
                    <span className={styles.detail}>
                      {active ? entry.standard : entry.custom}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              play('click');
              setDraft(DEFAULT_RULES);
            }}
            disabled={changed === 0}
          >
            Règles d’origine
          </button>

          <button
            type="button"
            className={`uiButton ${styles.apply}`}
            onClick={() => {
              play('select');
              onChange(draft);
              onClose();
            }}
          >
            {changed === 0 ? 'Garder la coutume' : `Appliquer (${changed})`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RulesPicker;
