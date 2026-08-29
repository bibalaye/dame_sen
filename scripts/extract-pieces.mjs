/**
 * Extraction des pièces depuis le lot Kenney vers public/assets/pieces.
 *
 * Le lot fournit 19 silhouettes en 7 couleurs, chacune en trois états. Deux
 * nous intéressent :
 *
 *   border{NN} -> la pièce simple, le pion
 *   multi{NN}  -> la même pièce empilée, la dame
 *
 * Cette correspondance n'est pas un choix esthétique : aux dames, une dame est
 * littéralement un pion posé sur un autre. Le lot en fournit déjà le dessin.
 *
 * Le script ne réécrit que ce qui manque, et se relance sans dommage :
 *
 *   node scripts/extract-pieces.mjs
 */

import { copyFileSync, existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = 'assets/kenney_boardgame/PNG';
const CIBLE = 'public/assets/pieces';

/**
 * Les silhouettes retenues. Le numéro est celui du lot ; le nom est celui sous
 * lequel le jeu les désigne. On privilégie ce qui ancre le jeu quelque part —
 * une pirogue et un lutteur disent le Sénégal, un cône ne dit rien.
 */
const FORMES = {
  quille: '03', // la silhouette à tête ronde
  lutteur: '06', // les bras écartés
  case: '07', // la maison à toit pointu : une case de village
  fort: '10', // la tour crénelée : Gorée
  jeton: '12', // le jeton plat
  pirogue: '14', // la pirogue de pêche
  avion: '15',
  train: '16', // le TER
  fanion: '17',
};

/**
 * Les numéros 01, 09 et 11 sont volontairement absents : ils sont déjà en
 * place sous les noms `pawn`, `tower` et `disc`. Le 13, lui, est un second
 * jeton que rien ne distingue du 12 à la taille où le jeu l'affiche.
 *
 * Attention aux séries `single` : pour les véhicules, leur version empilée est
 * identique à la simple, ce qui rendrait une dame indiscernable d'un pion. On
 * n'utilise donc que `border` et `multi`, dont l'empilement est réel.
 */

const COULEURS = {
  white: 'White',
  black: 'Black',
  blue: 'Blue',
  green: 'Green',
  purple: 'Purple',
  red: 'Red',
  yellow: 'Yellow',
};

mkdirSync(CIBLE, { recursive: true });

let copies = 0;
let deja = 0;
let manquants = [];

for (const [forme, numero] of Object.entries(FORMES)) {
  for (const [couleur, Couleur] of Object.entries(COULEURS)) {
    const dossier = join(SOURCE, `Pieces (${Couleur})`);

    const paires = [
      [`piece${Couleur}_border${numero}.png`, `${forme}-${couleur}.png`],
      [`piece${Couleur}_multi${numero}.png`, `${forme}-${couleur}-king.png`],
    ];

    for (const [source, cible] of paires) {
      const depuis = join(dossier, source);
      const vers = join(CIBLE, cible);

      if (!existsSync(depuis)) {
        manquants.push(source);
        continue;
      }
      if (existsSync(vers)) {
        deja++;
        continue;
      }

      copyFileSync(depuis, vers);
      copies++;
    }
  }
}

console.log(`${copies} fichiers copiés, ${deja} déjà présents`);
if (manquants.length > 0) {
  console.log(`${manquants.length} introuvables dans le lot :`, manquants.slice(0, 5));
}

// Contrôle : une pièce sans sa dame casserait l'affichage en cours de partie.
const orphelines = [];
for (const forme of Object.keys(FORMES)) {
  for (const couleur of Object.keys(COULEURS)) {
    const pion = join(CIBLE, `${forme}-${couleur}.png`);
    const dame = join(CIBLE, `${forme}-${couleur}-king.png`);
    if (existsSync(pion) !== existsSync(dame)) orphelines.push(`${forme}-${couleur}`);
  }
}

if (orphelines.length > 0) {
  console.error('Pièces sans leur dame :', orphelines);
  process.exit(1);
}

// Contrôle : une dame identique à son pion rendrait la promotion invisible.
const indiscernables = [];
for (const forme of Object.keys(FORMES)) {
  for (const couleur of Object.keys(COULEURS)) {
    const pion = join(CIBLE, `${forme}-${couleur}.png`);
    const dame = join(CIBLE, `${forme}-${couleur}-king.png`);
    if (!existsSync(pion)) continue;
    if (readFileSync(pion).equals(readFileSync(dame))) {
      indiscernables.push(`${forme}-${couleur}`);
    }
  }
}

if (indiscernables.length > 0) {
  console.error('Dames indiscernables de leur pion :', indiscernables);
  process.exit(1);
}

// Contrôle : le doublon se cherche sur tout le dossier, pas seulement sur ce
// que ce script vient d'écrire — une forme peut déjà s'y trouver sous un autre
// nom, et deux entrées identiques dans la boutique s'y verraient tout de suite.
const empreintes = new Map();
const doublons = [];
for (const fichier of readdirSync(CIBLE)) {
  const cle = readFileSync(join(CIBLE, fichier)).toString('base64');
  if (empreintes.has(cle)) doublons.push(`${fichier} = ${empreintes.get(cle)}`);
  else empreintes.set(cle, fichier);
}

if (doublons.length > 0) {
  console.error(`${doublons.length} doublons :`, doublons.slice(0, 8));
  process.exit(1);
}

console.log('Chaque dame se distingue de son pion, et aucun fichier n’est en double.');

// --- Dés du ludo -------------------------------------------------------------

const DES = 'public/assets/dice';
mkdirSync(DES, { recursive: true });

let desCopies = 0;
for (let face = 1; face <= 6; face++) {
  const depuis = join(SOURCE, '..', 'Dice', `dieWhite_border${face}.png`);
  const vers = join(DES, `die-${face}.png`);

  // Le dé blanc bordé se lit sur n'importe quel fond, contrairement au rouge.
  if (existsSync(depuis) && !existsSync(vers)) {
    copyFileSync(depuis, vers);
    desCopies++;
  }
}

console.log(desCopies > 0 ? `${desCopies} faces de dé copiées` : 'Dés déjà en place.');
