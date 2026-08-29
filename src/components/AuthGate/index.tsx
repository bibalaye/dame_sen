'use client';

import React from 'react';

import AuthForm from '../AuthForm';
import { useAccount } from '@/context/AccountContext';
import styles from './AuthGate.module.css';

/**
 * La porte d'entrée du jeu.
 *
 * Le compte est requis : la progression, le classement et les amis n'existent
 * qu'attachés à quelqu'un. On demande donc un pseudo avant la première partie
 * plutôt qu'après — un joueur qui a déjà gagné des cauris avant de s'inscrire
 * ne comprendrait pas qu'on les lui redemande.
 *
 * Une exception, et une seule : sans serveur configuré, aucun compte ne peut
 * exister. Bloquer là rendrait le jeu injouable pour qui l'installe sans clés,
 * alors on laisse passer en le disant clairement.
 */
const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConfigured, isLoading, account } = useAccount();

  if (!isConfigured || account) return <>{children}</>;

  // On ne montre pas le formulaire avant de savoir si une session existe :
  // l'afficher puis le retirer aussitôt ferait clignoter la page à chaque
  // ouverture pour un joueur déjà connecté.
  if (isLoading) {
    return (
      <div className={styles.screen}>
        <p className={styles.waiting}>Un instant…</p>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.brand}>Teraanga Games</p>
          <h1 className={styles.title}>Jeux de plateau du Sénégal</h1>
          <p className={styles.lead}>
            Choisissez un pseudo pour garder vos parties, vos cauris et vos amis
            d’un appareil à l’autre.
          </p>
        </header>

        <div className={`uiPanel ${styles.panel}`}>
          <AuthForm />
        </div>
      </div>
    </div>
  );
};

export default AuthGate;
