import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import {
  DEFAULT_PIECE_SET,
  PIECE_SETS,
  findPieceSet,
  pieceSetImages,
} from '../pieceSets.ts';

describe('jeux de pions', () => {
  test('chaque jeu a deux camps distincts', () => {
    for (const set of PIECE_SETS) {
      assert.notEqual(set.light, set.dark, `${set.id} : les deux camps se ressemblent`);
      assert.ok(set.name.length > 0);
      assert.ok(set.detail.length > 0);
    }
  });

  test('les identifiants sont uniques', () => {
    const ids = PIECE_SETS.map((set) => set.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('le jeu par défaut existe', () => {
    assert.ok(PIECE_SETS.some((set) => set.id === DEFAULT_PIECE_SET));
  });

  test('un identifiant inconnu retombe sur le jeu par défaut', () => {
    assert.equal(findPieceSet(null).id, DEFAULT_PIECE_SET);
    assert.equal(findPieceSet(undefined).id, DEFAULT_PIECE_SET);
    // @ts-expect-error — on vérifie le comportement face à une valeur invalide.
    assert.equal(findPieceSet('inexistant').id, DEFAULT_PIECE_SET);
  });

  test('un identifiant connu retourne le bon jeu', () => {
    for (const set of PIECE_SETS) {
      assert.equal(findPieceSet(set.id).id, set.id);
    }
  });

  test('toutes les images existent réellement sur le disque', () => {
    for (const set of PIECE_SETS) {
      for (const image of pieceSetImages(set)) {
        const chemin = `public${image}`;
        assert.ok(existsSync(chemin), `image manquante : ${chemin} (${set.id})`);
      }
    }
  });
});

describe('sons', () => {
  test('chaque son du catalogue a son fichier', () => {
    // Les noms sont repris du catalogue de sound.ts, qui n'est pas importable
    // ici (il touche à window) : on vérifie les fichiers directement.
    const fichiers = [
      'place.ogg',
      'capture.ogg',
      'capture2.ogg',
      'promote.ogg',
      'slide.ogg',
      'click.ogg',
      'switch.ogg',
      'tap.ogg',
    ];
    for (const nom of fichiers) {
      assert.ok(existsSync(`public/assets/sfx/${nom}`), `son manquant : ${nom}`);
    }
  });
});
