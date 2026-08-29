import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CENTER,
  GRID,
  TRACK_CELLS,
  boardIsSound,
  homeCells,
  rotate,
  stableCells,
  startCell,
  startOwner,
  type Cell,
} from '../ludoBoard.ts';
import {
  HOME_LENGTH,
  LUDO_PLAYERS,
  PIECES_PER_PLAYER,
  START_SQUARE,
  TRACK,

} from '../ludo.ts';

const cle = (cell: Cell) => `${cell.row},${cell.col}`;

describe('rotation', () => {
  test('quatre rotations ramènent au point de départ', () => {
    const depart = { row: 6, col: 1 };
    assert.deepEqual(rotate(rotate(rotate(rotate(depart)))), depart);
  });

  test('le centre est son propre reflet', () => {
    assert.deepEqual(rotate(CENTER), CENTER);
  });

  test('la rotation reste dans la grille', () => {
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const tourne = rotate({ row, col });
        assert.ok(tourne.row >= 0 && tourne.row < GRID, `ligne hors grille : ${tourne.row}`);
        assert.ok(tourne.col >= 0 && tourne.col < GRID, `colonne hors grille : ${tourne.col}`);
      }
    }
  });
});

describe('circuit', () => {
  test('il compte cinquante-deux cases', () => {
    assert.equal(TRACK_CELLS.length, TRACK);
  });

  test('aucune case n’est visitée deux fois', () => {
    const vues = new Set(TRACK_CELLS.map(cle));
    assert.equal(vues.size, TRACK, 'le tracé se recouvre quelque part');
  });

  /*
   * Deux cases se touchent si elles partagent un côté ou un coin.
   *
   * On ne peut pas exiger mieux, et c'est démontrable : la rotation d'un quart
   * de tour sur une grille de côté impair conserve la parité de `row + col`,
   * alors qu'un chemin de treize pas la change. Aucun tracé de cinquante-deux
   * cases invariant par rotation ne peut donc être orthogonalement connexe —
   * un vrai plateau a bien quatre liaisons en diagonale, aux angles.
   *
   * Ce qui compte reste vérifié : le tracé ne saute jamais d'un bout du
   * plateau à l'autre.
   */
  test('chaque case touche la précédente', () => {
    for (let i = 0; i < TRACK; i++) {
      const ici = TRACK_CELLS[i];
      const suivante = TRACK_CELLS[(i + 1) % TRACK];
      const ecart = Math.max(
        Math.abs(ici.row - suivante.row),
        Math.abs(ici.col - suivante.col),
      );

      assert.equal(ecart, 1, `saut entre les cases ${i} et ${(i + 1) % TRACK}`);
    }
  });

  test('les diagonales se limitent aux quatre angles', () => {
    const diagonales = TRACK_CELLS.filter((ici, i) => {
      const suivante = TRACK_CELLS[(i + 1) % TRACK];
      return ici.row !== suivante.row && ici.col !== suivante.col;
    });

    assert.equal(diagonales.length, 4, 'une par quart, et pas davantage');
  });

  test('le circuit tient dans la grille', () => {
    for (const cell of TRACK_CELLS) {
      assert.ok(cell.row >= 0 && cell.row < GRID);
      assert.ok(cell.col >= 0 && cell.col < GRID);
    }
  });

  test('il ne passe jamais par le centre', () => {
    assert.ok(!TRACK_CELLS.some((c) => cle(c) === cle(CENTER)));
  });

  test('les quatre quarts se déduisent par rotation', () => {
    for (let i = 0; i < 13; i++) {
      const attendu = rotate(TRACK_CELLS[i]);
      assert.deepEqual(
        TRACK_CELLS[i + 13],
        attendu,
        `le second quart s’écarte du premier à la case ${i}`,
      );
    }
  });
});

describe('départs', () => {
  test('chaque joueur a sa case de départ sur le circuit', () => {
    for (const player of LUDO_PLAYERS) {
      const cell = startCell(player);
      assert.ok(TRACK_CELLS.some((c) => cle(c) === cle(cell)));
    }
  });

  test('les quatre départs sont distincts', () => {
    const departs = new Set(LUDO_PLAYERS.map((p) => cle(startCell(p))));
    assert.equal(departs.size, 4);
  });

  test('on reconnaît une case de départ à son propriétaire', () => {
    for (const player of LUDO_PLAYERS) {
      assert.equal(startOwner(START_SQUARE[player]), player);
    }
    // Une case ordinaire n'appartient à personne.
    assert.equal(startOwner(5), null);
  });

  test('les départs se déduisent aussi par rotation', () => {
    assert.deepEqual(rotate(startCell(0)), startCell(1));
    assert.deepEqual(rotate(startCell(1)), startCell(2));
  });
});

describe('allées', () => {
  test('chacune compte cinq cases', () => {
    for (const player of LUDO_PLAYERS) {
      assert.equal(homeCells(player).length, HOME_LENGTH);
    }
  });

  test('elles ne croisent jamais le circuit', () => {
    const circuit = new Set(TRACK_CELLS.map(cle));

    for (const player of LUDO_PLAYERS) {
      for (const cell of homeCells(player)) {
        assert.ok(
          !circuit.has(cle(cell)),
          `l’allée du joueur ${player} empiète sur le circuit en ${cle(cell)}`,
        );
      }
    }
  });

  test('les quatre allées sont disjointes', () => {
    const toutes = LUDO_PLAYERS.flatMap((p) => homeCells(p).map(cle));
    assert.equal(new Set(toutes).size, toutes.length);
  });

  test('chaque allée mène au centre', () => {
    for (const player of LUDO_PLAYERS) {
      const derniere = homeCells(player)[HOME_LENGTH - 1];
      const ecart =
        Math.abs(derniere.row - CENTER.row) + Math.abs(derniere.col - CENTER.col);

      assert.equal(ecart, 2, `l’allée du joueur ${player} n’aboutit pas au centre`);
    }
  });

  test('l’allée part du seuil, à côté de la case de départ', () => {
    // La première case de l'allée doit toucher celle qui précède le départ,
    // par un côté ou par un coin.
    for (const player of LUDO_PLAYERS) {
      const seuil = TRACK_CELLS[(START_SQUARE[player] - 1 + TRACK) % TRACK];
      const premiere = homeCells(player)[0];
      const ecart = Math.max(
        Math.abs(seuil.row - premiere.row),
        Math.abs(seuil.col - premiere.col),
      );

      assert.equal(ecart, 1, `l’allée du joueur ${player} ne part pas de son seuil`);
    }
  });
});

describe('écuries', () => {
  test('chacune a quatre emplacements', () => {
    for (const player of LUDO_PLAYERS) {
      assert.equal(stableCells(player).length, PIECES_PER_PLAYER);
    }
  });

  test('elles ne croisent ni le circuit ni les allées', () => {
    const occupe = new Set([
      ...TRACK_CELLS.map(cle),
      ...LUDO_PLAYERS.flatMap((p) => homeCells(p).map(cle)),
    ]);

    for (const player of LUDO_PLAYERS) {
      for (const cell of stableCells(player)) {
        assert.ok(!occupe.has(cle(cell)), `écurie ${player} en conflit en ${cle(cell)}`);
      }
    }
  });

  test('les seize emplacements sont distincts', () => {
    const tous = LUDO_PLAYERS.flatMap((p) => stableCells(p).map(cle));
    assert.equal(new Set(tous).size, 16);
  });

  test('chaque écurie occupe un coin différent', () => {
    const coins = LUDO_PLAYERS.map((p) => {
      const cells = stableCells(p);
      return {
        haut: cells.every((c) => c.row < 7),
        gauche: cells.every((c) => c.col < 7),
      };
    });

    const distincts = new Set(coins.map((c) => `${c.haut},${c.gauche}`));
    assert.equal(distincts.size, 4, 'deux écuries partagent un coin');
  });
});

describe('cohérence générale', () => {
  test('le plateau se déclare sain', () => {
    assert.ok(boardIsSound());
  });

  test('rien ne dépasse de la grille', () => {
    const toutes: Cell[] = [
      ...TRACK_CELLS,
      ...LUDO_PLAYERS.flatMap((p) => homeCells(p)),
      ...LUDO_PLAYERS.flatMap((p) => stableCells(p)),
      CENTER,
    ];

    for (const cell of toutes) {
      assert.ok(
        cell.row >= 0 && cell.row < GRID && cell.col >= 0 && cell.col < GRID,
        `case hors plateau : ${cle(cell)}`,
      );
    }
  });
});
