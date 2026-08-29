import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_LENGTH,
  PIECES_PER_PLAYER,
  START_SQUARE,
  TRACK,
  blockadeOwner,
  blockadeSize,
  createLudoGame,
  earnsExtraRoll,
  endTurn,
  homeApproach,
  homeGate,
  isCaptive,
  isTrespassing,
  legalLudoMoves,
  playLudoMove,
  progressOf,
  rollDice,
  rollInto,
  seatsFor,
  turnIsOver,
  type LudoPlayerId,
  type LudoState,
  type Pawn,
  type PawnSpot,
} from '../ludo.ts';

/**
 * Construit un état à la main. On décrit les seuls pions qui comptent pour le
 * cas testé ; les autres dorment dans leur écurie.
 */
const etat = (
  places: ReadonlyArray<{ owner: LudoPlayerId; spot: PawnSpot }>,
  options: { current?: LudoPlayerId; dice?: number[]; playerCount?: number } = {},
): LudoState => {
  const base = createLudoGame(options.playerCount ?? 4);
  const pawns: Pawn[] = [...base.pawns];

  for (const place of places) {
    // On déplace le premier pion encore au repos de ce joueur.
    const index = pawns.findIndex(
      (p) => p.owner === place.owner && p.spot.zone === 'stable' && p.spot.host === p.owner,
    );
    assert.notEqual(index, -1, `plus de pion disponible pour le joueur ${place.owner}`);
    pawns[index] = { owner: place.owner, spot: place.spot };
  }

  return {
    ...base,
    pawns,
    current: options.current ?? 0,
    dice: options.dice ?? [],
    // Le lancer est intact tant qu'on n'a rien joué, et les six qu'il porte
    // sont ceux du tour.
    rolled: options.dice ?? [],
    sixesThisTurn: (options.dice ?? []).filter((die) => die === 6).length,
  };
};

const surCase = (square: number): PawnSpot => ({ zone: 'track', square });
const dansMaison = (host: LudoPlayerId, step: number): PawnSpot => ({
  zone: 'home',
  host,
  step,
});

/** Retrouve un pion par sa position, pour vérifier ce qu'il est devenu. */
const pionEn = (state: LudoState, spot: PawnSpot): Pawn | undefined =>
  state.pawns.find(
    (p) =>
      p.spot.zone === spot.zone &&
      JSON.stringify(p.spot) === JSON.stringify(spot),
  );

describe('mise en place', () => {
  test('chacun commence avec quatre pions à l’écurie', () => {
    const state = createLudoGame(4);

    assert.equal(state.pawns.length, 4 * PIECES_PER_PLAYER);
    assert.ok(state.pawns.every((p) => p.spot.zone === 'stable'));
    assert.ok(state.pawns.every((p) => !isCaptive(p)), 'personne n’est prisonnier');
  });

  test('à deux joueurs, on s’assoit en diagonale', () => {
    const state = createLudoGame(2);
    const camps = [...new Set(state.pawns.map((p) => p.owner))].sort();

    assert.equal(state.pawns.length, 2 * PIECES_PER_PLAYER);
    assert.deepEqual(
      camps,
      [0, 2],
      'côte à côte, l’un aurait la moitié du circuit d’avance sur l’autre',
    );
  });

  test('les places suivies pour trois et quatre', () => {
    assert.deepEqual(seatsFor(2), [0, 2]);
    assert.deepEqual(seatsFor(3), [0, 1, 2]);
    assert.deepEqual(seatsFor(4), [0, 1, 2, 3]);
  });

  test('les départs sont espacés d’un quart de circuit', () => {
    const departs = [0, 1, 2, 3].map((p) => START_SQUARE[p as LudoPlayerId]);
    assert.deepEqual(departs, [0, 13, 26, 39]);
    assert.equal(TRACK, 52);
  });

  test('le seuil d’un joueur précède son départ', () => {
    assert.equal(homeGate(0), 51);
    assert.equal(homeGate(1), 12);
  });
});

describe('sortie d’écurie', () => {
  test('sans six, aucun pion ne sort', () => {
    const state = rollInto(createLudoGame(4), [3, 5]);
    assert.equal(legalLudoMoves(state).length, 0);
  });

  test('un six ouvre l’écurie', () => {
    const state = rollInto(createLudoGame(4), [6, 3]);
    const moves = legalLudoMoves(state);

    assert.ok(moves.length > 0);
    assert.ok(moves.every((m) => m.kind === 'enter'));
    assert.deepEqual(moves[0].to, { zone: 'track', square: START_SQUARE[0] });
  });

  test('le pion sorti se pose sur la case de départ', () => {
    const state = rollInto(createLudoGame(4), [6, 3]);
    const apres = playLudoMove(state, legalLudoMoves(state)[0]);

    assert.ok(pionEn(apres, surCase(START_SQUARE[0])));
    assert.deepEqual(apres.dice, [3], 'le six est consommé, l’autre dé reste');
  });
});

describe('capture : le pion devient prisonnier', () => {
  test('le pion pris rejoint l’écurie de son ravisseur, pas la sienne', () => {
    // Un pion du joueur 1 est à quatre cases du pion du joueur 0.
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: surCase(14) },
      ],
      { current: 0, dice: [4, 2] },
    );

    const prise = legalLudoMoves(state).find((m) => m.captures !== undefined);
    assert.ok(prise, 'la prise doit être proposée');

    const apres = playLudoMove(state, prise!);
    const captif = apres.pawns.find((p) => p.owner === 1 && isCaptive(p));

    assert.ok(captif, 'le pion du joueur 1 doit être prisonnier');
    assert.deepEqual(captif!.spot, { zone: 'stable', host: 0 });
  });

  test('un six rend le prisonnier à sa propre écurie', () => {
    const state = etat([{ owner: 0, spot: { zone: 'stable', host: 1 } }], {
      current: 0,
      dice: [6, 2],
    });

    const liberation = legalLudoMoves(state).find((m) => m.kind === 'free');
    assert.ok(liberation, 'le six doit permettre le rapatriement');

    const apres = playLudoMove(state, liberation!);
    assert.equal(
      apres.pawns.filter((p) => isCaptive(p)).length,
      0,
      'plus personne n’est prisonnier',
    );
  });

  test('sans six, le prisonnier reste où il est', () => {
    const state = etat([{ owner: 0, spot: { zone: 'stable', host: 1 } }], {
      current: 0,
      dice: [4, 2],
    });

    assert.equal(legalLudoMoves(state).length, 0);
  });

  test('se faire prendre coûte deux six : un pour rentrer, un pour ressortir', () => {
    const state = etat([{ owner: 0, spot: { zone: 'stable', host: 1 } }], {
      current: 0,
      dice: [6, 6],
    });

    // Premier six : le pion rentre chez lui.
    const libere = playLudoMove(state, legalLudoMoves(state).find((m) => m.kind === 'free')!);
    assert.ok(libere.pawns.some((p) => p.owner === 0 && p.spot.zone === 'stable'));

    // Second six : il repart sur le plateau.
    const sortie = legalLudoMoves(libere).find((m) => m.kind === 'enter');
    assert.ok(sortie, 'le second six doit le remettre en jeu');
  });

  test('on ne prend pas son propre pion', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 0, spot: surCase(14) },
      ],
      { current: 0, dice: [4, 1] },
    );

    const moves = legalLudoMoves(state);
    assert.ok(moves.every((m) => m.captures === undefined));
  });
});

describe('barrages, à la porte seulement', () => {
  /*
   * La porte du joueur 1 est sa case de départ, la 13 : le seul endroit où deux
   * de ses pions forment un barrage. Un pion du joueur 0 attend en 9.
   *
   * C'est bien la case de départ et non le seuil de l'allée : un joueur n'a
   * jamais deux pions sur ce seuil, puisqu'ils bifurquent chez eux dès qu'ils
   * l'atteignent — le barrage y serait resté impossible à former.
   */
  const aLaPorte = (dice: number[]) =>
    etat(
      [
        { owner: 0, spot: surCase(9) },
        { owner: 1, spot: surCase(13) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 0, dice },
    );

  test('la porte est bien la case de départ', () => {
    assert.equal(START_SQUARE[1], 13);
  });

  test('la porte se ferme à deux pions', () => {
    const dessus = legalLudoMoves(aLaPorte([4, 1])).filter(
      (m) => m.to.zone === 'track' && m.to.square === 13,
    );

    assert.equal(dessus.length, 0, 'on ne se pose pas sur un barrage');
  });

  test('le barrage arrête aussi celui qui voudrait le franchir', () => {
    const audela = legalLudoMoves(aLaPorte([5, 1])).filter(
      (m) => m.to.zone === 'track' && m.to.square === 14,
    );

    assert.equal(audela.length, 0, 'un barrage ne se contourne pas : il bloque');
  });

  test('un double-six force le barrage', () => {
    const passe = legalLudoMoves(aLaPorte([6, 6])).filter(
      (m) => m.to.zone === 'track' && m.to.square === 15,
    );

    assert.equal(passe.length, 1, 'le double-six est la seule clé');
  });

  test('un six seul ne suffit pas', () => {
    const passe = legalLudoMoves(aLaPorte([6, 2])).filter(
      (m) => m.to.zone === 'track' && m.to.square === 15,
    );

    assert.equal(passe.length, 0);
  });

  test('trois pions demandent trois six', () => {
    const troisPions = (sixes: number) => {
      const base = etat(
        [
          { owner: 0, spot: surCase(9) },
          { owner: 1, spot: surCase(13) },
          { owner: 1, spot: surCase(13) },
          { owner: 1, spot: surCase(13) },
        ],
        { current: 0, dice: [6, 6] },
      );
      return { ...base, sixesThisTurn: sixes };
    };

    const passe = (state: LudoState) =>
      legalLudoMoves(state).some((m) => m.to.zone === 'track' && m.to.square === 15);

    assert.ok(!passe(troisPions(2)), 'un double-six ne suffit pas contre trois pions');
    assert.ok(passe(troisPions(3)), 'le troisième six ouvre le passage');
  });

  test('les six s’additionnent d’un lancer à l’autre', () => {
    // Deux dés ne donnent jamais trois six d'un coup : c'est la relance du
    // double-six qui permet de les réunir.
    let state = rollInto(createLudoGame(4), [6, 6]);
    assert.equal(state.sixesThisTurn, 2);

    state = endTurn(state, true);
    assert.equal(state.sixesThisTurn, 2, 'la relance garde les six acquis');

    state = rollInto(state, [6, 3]);
    assert.equal(state.sixesThisTurn, 3, 'le troisième six s’ajoute');
  });

  test('passer la main efface les six réunis', () => {
    let state = rollInto(createLudoGame(4), [6, 6]);
    state = endTurn(state, false);

    assert.equal(state.sixesThisTurn, 0, 'le joueur suivant repart de zéro');
  });

  test('deux pions sortis d’écurie ferment la porte d’eux-mêmes', () => {
    // C'est le cas courant : on sort un pion, puis un second, et tous deux se
    // retrouvent sur la case de départ. Le barrage se forme sans rien viser.
    const state = etat([{ owner: 1, spot: surCase(13) }], {
      current: 1,
      dice: [6, 2],
    });

    const sortie = legalLudoMoves(state).find((m) => m.kind === 'enter');
    assert.ok(sortie, 'le six doit sortir un second pion');

    const apres = playLudoMove(state, sortie!);
    assert.equal(blockadeOwner(apres, 13), 1, 'la porte est tenue');
    assert.equal(blockadeSize(apres, 13), 2);
  });

  test('le barrage ne gêne pas celui qui le tient', () => {
    const state = etat(
      [
        { owner: 1, spot: surCase(13) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 1, dice: [3, 1] },
    );

    assert.ok(
      legalLudoMoves(state).some((m) => m.to.zone === 'track' && m.to.square === 16),
      'on quitte sa porte quand on veut',
    );
  });

  test('ailleurs qu’à sa porte, deux pions ne bloquent rien', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(8) },
        { owner: 1, spot: surCase(20) },
        { owner: 1, spot: surCase(20) },
      ],
      { current: 0, dice: [12, 1] },
    );

    const dessus = legalLudoMoves(state).filter(
      (m) => m.to.zone === 'track' && m.to.square === 20,
    );
    assert.equal(dessus.length, 1, 'la case reste accessible');
  });
});

describe('empiler hors de sa porte expose les deux pions', () => {
  test('un pion qui tombe sur deux adversaires les prend ensemble', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(8) },
        { owner: 1, spot: surCase(20) },
        { owner: 1, spot: surCase(20) },
      ],
      { current: 0, dice: [12, 1] },
    );

    const prise = legalLudoMoves(state).find(
      (m) => m.to.zone === 'track' && m.to.square === 20,
    );
    assert.ok(prise);
    assert.equal(prise!.captures?.length, 2, 'les deux partent ensemble');

    const apres = playLudoMove(state, prise!);
    const captifs = apres.pawns.filter((p) => p.owner === 1 && isCaptive(p));

    assert.equal(captifs.length, 2);
    for (const captif of captifs) {
      assert.deepEqual(captif.spot, { zone: 'stable', host: 0 });
    }
  });

  test('à la porte, les deux mêmes pions sont intouchables', () => {
    // Les mêmes deux pions, mais posés sur la case de départ du joueur 1.
    const state = etat(
      [
        { owner: 0, spot: surCase(9) },
        { owner: 1, spot: surCase(13) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 0, dice: [4, 1] },
    );

    assert.ok(
      !legalLudoMoves(state).some((m) => m.captures?.length),
      'un barrage ne se prend pas, il se force',
    );
  });

  test('un pion isolé se prend seul', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: surCase(14) },
      ],
      { current: 0, dice: [4, 1] },
    );

    const prise = legalLudoMoves(state).find((m) => m.captures?.length);
    assert.equal(prise!.captures!.length, 1);
  });

  test('on ne se prend pas soi-même en s’empilant', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 0, spot: surCase(14) },
      ],
      { current: 0, dice: [4, 1] },
    );

    assert.ok(legalLudoMoves(state).every((m) => !m.captures?.length));
  });
});

describe('allée finale', () => {
  test('le tour bouclé mène dans sa propre allée', () => {
    // Le joueur 0 part de 0 ; à la case 51, il a parcouru 51 cases.
    const state = etat([{ owner: 0, spot: surCase(51) }], { current: 0, dice: [3, 1] });
    const moves = legalLudoMoves(state);

    const entree = moves.find((m) => m.to.zone === 'home');
    assert.ok(entree, 'le pion doit pouvoir entrer chez lui');
    assert.equal(progressOf(state.pawns.find((p) => p.spot.zone === 'track')!), 51);
  });

  test('on peut passer devant sa porte et repartir pour un tour', () => {
    // Le pion du joueur 0 a bouclé son tour : il est en 51, à une case de chez
    // lui. Rentrer n'est pas une obligation — un pion sur le circuit menace
    // encore, un pion rentré ne fait plus que compter.
    const state = etat([{ owner: 0, spot: surCase(51) }], { current: 0, dice: [3, 1] });
    const moves = legalLudoMoves(state);

    assert.ok(
      moves.some((m) => m.to.zone === 'home'),
      'entrer chez soi reste possible',
    );
    assert.ok(
      moves.some((m) => m.to.zone === 'track'),
      'passer devant sa porte aussi',
    );
  });

  test('le pion qui a passé sa porte refait tout le tour', () => {
    const state = etat([{ owner: 0, spot: surCase(51) }], { current: 0, dice: [3, 1] });
    const tout_droit = legalLudoMoves(state).find((m) => m.to.zone === 'track')!;
    const apres = playLudoMove(state, tout_droit);

    // Il repart de sa case de départ ou presque : tout le circuit à refaire.
    assert.ok(progressOf(apres.pawns[tout_droit.pawn]) < 5);
  });

  test('un six ramène le pion de son allée sur le circuit', () => {
    // Rentrer n'est jamais définitif : un six ressort le pion juste avant son
    // seuil, d'où qu'il soit dans l'allée.
    for (const step of [0, 1, 2, 3, 4]) {
      const state = etat([{ owner: 0, spot: dansMaison(0, step) }], {
        current: 0,
        dice: [6, 1],
      });

      const sortie = legalLudoMoves(state).find((m) => m.kind === 'escape');
      assert.ok(sortie, `le six doit ressortir le pion depuis la case ${step}`);
      assert.deepEqual(sortie!.to, { zone: 'track', square: homeApproach(0) });
    }
  });

  test('le pion ressorti garde le choix de rentrer ou de repartir', () => {
    // C'est tout l'intérêt de le reposer avant le seuil : sur le seuil même,
    // il aurait été contraint de rentrer au coup suivant.
    const state = etat([{ owner: 0, spot: surCase(homeApproach(0)) }], {
      current: 0,
      dice: [3, 2],
    });
    const moves = legalLudoMoves(state);

    assert.ok(
      moves.some((m) => m.to.zone === 'home'),
      'rentrer reste possible',
    );
    assert.ok(
      moves.some((m) => m.to.zone === 'track'),
      'repartir pour un tour aussi',
    );
  });

  test('le six ne fait pas rentrer au centre', () => {
    // Seul le compte exact mène au centre ; le six sert à ressortir.
    const state = etat([{ owner: 0, spot: dansMaison(0, HOME_LENGTH - 1) }], {
      current: 0,
      dice: [6, 1],
    });

    const moves = legalLudoMoves(state);
    assert.ok(
      moves.some((m) => m.die === 1 && m.to.zone === 'finished'),
      'le un tombe juste et rentre le pion',
    );
    assert.ok(
      !moves.some((m) => m.die === 6 && m.to.zone === 'finished'),
      'le six ressort, il ne rentre pas',
    );
  });

  test('en ressortant, le pion prend ce qui occupe sa case', () => {
    const state = etat(
      [
        { owner: 0, spot: dansMaison(0, 2) },
        { owner: 1, spot: surCase(homeApproach(0)) },
      ],
      { current: 0, dice: [6, 1] },
    );

    const sortie = legalLudoMoves(state).find((m) => m.kind === 'escape');
    assert.equal(sortie!.captures?.length, 1, 'la case se libère à la prise');
  });

  test('il faut le compte exact pour atteindre le centre', () => {
    const state = etat([{ owner: 0, spot: dansMaison(0, HOME_LENGTH - 2) }], {
      current: 0,
      dice: [2, 5],
    });

    const moves = legalLudoMoves(state);
    assert.ok(
      moves.some((m) => m.to.zone === 'finished'),
      'le 2 tombe juste et rentre le pion',
    );
    assert.ok(
      !moves.some((m) => m.die === 5),
      'le 5 dépasse : le coup n’existe pas',
    );
  });

  test('on ne saute pas par-dessus son propre pion dans l’allée', () => {
    const state = etat(
      [
        { owner: 0, spot: dansMaison(0, 1) },
        { owner: 0, spot: dansMaison(0, 3) },
      ],
      { current: 0, dice: [2, 1] },
    );

    const moves = legalLudoMoves(state);
    assert.ok(
      !moves.some((m) => m.to.zone === 'home' && m.to.step === 3 && m.die === 2),
      'la case 3 est déjà prise',
    );
  });
});

describe('incursion dans l’allée d’un adversaire', () => {
  test('on y entre pour prendre un pion sur le point de rentrer', () => {
    // Le seuil du joueur 1 est la case 12. Un pion du joueur 0 est en 10 ; avec
    // un 4, il franchit le seuil et arrive à la case 1 de l'allée.
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: dansMaison(1, 1) },
      ],
      { current: 0, dice: [4, 2] },
    );

    const raid = legalLudoMoves(state).find((m) => m.kind === 'raid');
    assert.ok(raid, 'l’incursion doit être proposée');

    const apres = playLudoMove(state, raid!);
    const captif = apres.pawns.find((p) => p.owner === 1 && isCaptive(p));

    assert.ok(captif, 'le pion visé devient prisonnier');
    assert.ok(
      apres.pawns.some((p) => p.owner === 0 && isTrespassing(p)),
      'l’assaillant se retrouve chez l’autre',
    );
  });

  test('on n’entre pas chez l’autre depuis son seuil', () => {
    // Le seuil du joueur 1 est la case 12 ; un pion posé dessus ne doit pas
    // pouvoir bifurquer en arrière dans l'allée.
    const state = etat(
      [
        { owner: 0, spot: surCase(12) },
        { owner: 1, spot: dansMaison(1, 1) },
      ],
      { current: 0, dice: [2, 5] },
    );

    assert.ok(
      !legalLudoMoves(state).some((m) => m.kind === 'raid'),
      'on entre en arrivant sur le seuil, jamais en en repartant',
    );
  });

  test('sans proie, l’allée reste fermée', () => {
    const state = etat([{ owner: 0, spot: surCase(10) }], { current: 0, dice: [4, 2] });

    assert.ok(
      !legalLudoMoves(state).some((m) => m.kind === 'raid'),
      'on n’entre pas chez l’autre par mégarde',
    );
  });

  test('il faut un six par case pour se dégager', () => {
    const state = etat([{ owner: 0, spot: dansMaison(1, 2) }], {
      current: 0,
      dice: [5, 3],
    });
    assert.equal(legalLudoMoves(state).length, 0, 'sans six, on reste englué');

    const avecSix = etat([{ owner: 0, spot: dansMaison(1, 2) }], {
      current: 0,
      dice: [6, 3],
    });
    const sortie = legalLudoMoves(avecSix).find((m) => m.kind === 'escape');

    assert.ok(sortie);
    assert.deepEqual(sortie!.to, { zone: 'home', host: 1, step: 1 }, 'une case à la fois');
  });

  test('depuis le seuil, le six ramène sur le circuit', () => {
    const state = etat([{ owner: 0, spot: dansMaison(1, 0) }], {
      current: 0,
      dice: [6, 1],
    });

    const sortie = legalLudoMoves(state).find((m) => m.kind === 'escape');
    assert.deepEqual(sortie!.to, { zone: 'track', square: homeGate(1) });
  });

  test('un pion en visite ne rentre pas dans l’allée où il se trouve', () => {
    const state = etat([{ owner: 0, spot: dansMaison(1, HOME_LENGTH - 1) }], {
      current: 0,
      dice: [1, 6],
    });

    assert.ok(
      !legalLudoMoves(state).some((m) => m.to.zone === 'finished'),
      'on ne gagne pas en finissant chez quelqu’un d’autre',
    );
  });
});

describe('déroulement du tour', () => {
  test('chaque dé se joue séparément', () => {
    const state = etat([{ owner: 0, spot: surCase(10) }], { current: 0, dice: [3, 5] });

    const valeurs = new Set(legalLudoMoves(state).map((m) => m.die));
    assert.deepEqual([...valeurs].sort(), [3, 5]);

    const apres = playLudoMove(
      state,
      legalLudoMoves(state).find((m) => m.die === 3)!,
    );
    assert.deepEqual(apres.dice, [5], 'l’autre dé reste à jouer');
  });

  test('le même pion enchaîne ses deux dés, prise comprise', () => {
    // Le geste le plus courant : avancer de trois pour prendre, puis de cinq
    // pour s'éloigner de la case où l'on vient de frapper.
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 0, dice: [3, 5] },
    );

    const prise = legalLudoMoves(state).find((m) => m.captures?.length);
    assert.ok(prise, 'le trois doit prendre');
    assert.equal(prise!.die, 3);

    const apres = playLudoMove(state, prise!);
    const suite = legalLudoMoves(apres).filter((m) => m.pawn === prise!.pawn);

    assert.deepEqual(apres.dice, [5]);
    assert.equal(suite.length, 1, 'le même pion doit pouvoir jouer le cinq');
    assert.deepEqual(suite[0].to, { zone: 'track', square: 18 });
  });

  test('renoncer à la prise laisse jouer les deux dés à la suite', () => {
    // L'autre branche du choix : avancer de huit d'affilée sans rien prendre.
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 0, dice: [3, 5] },
    );

    const sansPrise = legalLudoMoves(state).find((m) => m.die === 5)!;
    const apres = playLudoMove(state, sansPrise);
    const suite = legalLudoMoves(apres).filter((m) => m.pawn === sansPrise.pawn);

    assert.equal(suite.length, 1);
    assert.deepEqual(
      suite[0].to,
      { zone: 'track', square: 18 },
      'huit cases au total, par l’autre chemin',
    );
  });

  test('il faut un double-six pour rejouer, pas un six', () => {
    // Avec deux dés, un six sort dans près d'un lancer sur trois : relancer à
    // chaque fois donnerait des tours qui n'en finissent pas.
    assert.ok(earnsExtraRoll([6, 6], 0));
    assert.ok(!earnsExtraRoll([6, 2], 0), 'un seul six ne rend pas la main');
    assert.ok(!earnsExtraRoll([4, 2], 0));
    assert.ok(!earnsExtraRoll([6, 6], 3), 'le plafond arrête la série');
  });

  test('le tour n’est pas fini tant qu’on n’a pas lancé', () => {
    const state = createLudoGame(4);
    assert.ok(!turnIsOver(state), 'sans lancer, il n’y a rien à conclure');
  });

  test('le tour se termine une fois les deux dés joués', () => {
    // C'est le cas qui manquait : `dice` vide ne suffisait pas à conclure,
    // puisque c'est aussi l'état avant le lancer. Le joueur qui sortait le
    // premier gardait la main et enchaînait tous les tours.
    let state = etat([{ owner: 0, spot: surCase(10) }], { current: 0, dice: [3, 5] });

    state = playLudoMove(state, legalLudoMoves(state).find((m) => m.die === 3)!);
    assert.ok(!turnIsOver(state), 'un dé reste à jouer');

    state = playLudoMove(state, legalLudoMoves(state).find((m) => m.die === 5)!);
    assert.deepEqual(state.dice, []);
    assert.ok(turnIsOver(state), 'les deux dés sont dépensés : la main doit passer');
  });

  test('le tour se termine aussi quand aucun dé ne se joue', () => {
    // Rien en jeu et pas de six : il n'y a rien à faire de ce lancer.
    const state = rollInto(createLudoGame(4), [3, 5]);

    assert.equal(legalLudoMoves(state).length, 0);
    assert.ok(turnIsOver(state));
  });

  test('le double-six se reconnaît encore après avoir été dépensé', () => {
    let state = rollInto(createLudoGame(4), [6, 6]);
    state = playLudoMove(state, legalLudoMoves(state)[0]);

    assert.equal(state.dice.length, 1, 'un six a été joué');
    assert.ok(
      earnsExtraRoll(state.rolled, state.extraRolls),
      'le lancer garde la trace du double, sinon la relance se perdrait',
    );
  });

  test('passer la main efface le lancer', () => {
    const state = rollInto(createLudoGame(4), [6, 2]);
    const apres = endTurn(state, false);

    assert.deepEqual(apres.rolled, []);
    assert.ok(!turnIsOver(apres), 'le joueur suivant doit d’abord lancer');
  });

  test('passer la main change de joueur', () => {
    const state = createLudoGame(4);
    assert.equal(endTurn(state, false).current, 1);
    assert.equal(endTurn(state, true).current, 0, 'la relance garde la main');
  });

  test('à deux joueurs, la main passe au camp opposé', () => {
    const state = createLudoGame(2);

    // Les sièges sont en diagonale : après le premier vient le troisième coin.
    assert.equal(endTurn(state, false).current, 2);
    assert.equal(endTurn(endTurn(state, false), false).current, 0);
  });

  test('à trois joueurs, la main suit les places occupées', () => {
    const state = createLudoGame(3);

    assert.equal(endTurn(state, false).current, 1);
    assert.equal(endTurn(endTurn(state, false), false).current, 2);
    assert.equal(
      endTurn(endTurn(endTurn(state, false), false), false).current,
      0,
      'le quatrième coin reste vide',
    );
  });
});

describe('la main tourne', () => {
  /**
   * Reproduit exactement le cycle de l'écran : lancer, jouer tant qu'un dé se
   * joue, puis conclure. C'est ce que le composant fait, et c'est là que le
   * premier joueur gardait la main pour toute la partie.
   */
  const jouerDesTours = (nombre: number, joueurs = 4) => {
    let state = createLudoGame(joueurs);
    let graine = 20260829;
    const random = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine / 2147483648;
    };

    const tours: LudoPlayerId[] = [];

    for (let i = 0; i < nombre && state.status.kind === 'playing'; i++) {
      tours.push(state.current);
      state = rollInto(state, rollDice(random));

      /*
       * Le garde-fou n'est pas décoratif : sans lui, une règle de fin de tour
       * cassée fait tourner cette boucle indéfiniment, et le test bloque au
       * lieu d'échouer. On veut un message, pas un silence.
       */
      let coups = 0;
      while (!turnIsOver(state)) {
        assert.ok(coups++ < 8, 'le tour ne se termine jamais');

        const moves = legalLudoMoves(state);
        assert.ok(moves.length > 0, 'aucun coup, et pourtant le tour continue');

        state = playLudoMove(state, moves[Math.floor(random() * moves.length)]);
      }

      if (state.status.kind !== 'playing') break;
      state = endTurn(state, earnsExtraRoll(state.rolled, state.extraRolls));
    }

    return tours;
  };

  test('les quatre joueurs prennent la main', () => {
    const tours = jouerDesTours(60);
    const vus = new Set(tours);

    assert.equal(
      vus.size,
      4,
      `seuls les joueurs ${[...vus].join(', ')} ont joué : la main ne tourne pas`,
    );
  });

  test('la main tourne aussi à deux et à trois', () => {
    for (const joueurs of [2, 3]) {
      const tours = jouerDesTours(40, joueurs);
      const vus = new Set(tours);

      assert.equal(
        vus.size,
        joueurs,
        `à ${joueurs} joueurs, seuls ${[...vus].join(', ')} ont joué`,
      );

      const places = seatsFor(joueurs);
      for (const joueur of vus) {
        assert.ok(
          places.includes(joueur),
          `le joueur ${joueur} n’est pas assis à cette table`,
        );
      }
    }
  });

  test('personne n’enchaîne un nombre déraisonnable de tours', () => {
    const tours = jouerDesTours(60);

    let suite = 1;
    let record = 1;
    for (let i = 1; i < tours.length; i++) {
      suite = tours[i] === tours[i - 1] ? suite + 1 : 1;
      record = Math.max(record, suite);
    }

    // Un double-six rend la main, plafonné à trois relances : quatre tours
    // d'affilée au plus.
    assert.ok(record <= 4, `un joueur a enchaîné ${record} tours de suite`);
  });

  test('la main revient dans l’ordre', () => {
    const tours = jouerDesTours(40);

    for (let i = 1; i < tours.length; i++) {
      const precedent = tours[i - 1];
      const places = seatsFor(4);
      const attendu = places[(places.indexOf(precedent) + 1) % places.length];

      assert.ok(
        tours[i] === attendu || tours[i] === precedent,
        `après le joueur ${precedent}, on attend ${attendu} ou une relance, pas ${tours[i]}`,
      );
    }
  });
});

describe('fin de partie', () => {
  test('rentrer son quatrième pion gagne la partie', () => {
    const state: LudoState = {
      ...createLudoGame(4),
      pawns: [
        ...Array.from({ length: 3 }, () => ({
          owner: 0 as LudoPlayerId,
          spot: { zone: 'finished' } as PawnSpot,
        })),
        { owner: 0, spot: dansMaison(0, HOME_LENGTH - 1) },
        ...createLudoGame(4).pawns.filter((p) => p.owner !== 0),
      ],
      current: 0,
      dice: [1, 4],
    };

    const dernier = legalLudoMoves(state).find((m) => m.to.zone === 'finished');
    assert.ok(dernier, 'le compte exact doit rentrer le dernier pion');

    const apres = playLudoMove(state, dernier!);
    assert.equal(apres.status.kind, 'win');
    if (apres.status.kind === 'win') assert.equal(apres.status.winner, 0);
  });

  test('la partie terminée n’accepte plus de coup', () => {
    const gagne: LudoState = {
      ...createLudoGame(4),
      status: { kind: 'win', winner: 0 },
      dice: [6, 6],
    };

    assert.equal(legalLudoMoves(gagne).length, 0);
  });
});

describe('robustesse', () => {
  test('l’état reçu n’est jamais modifié', () => {
    const state = rollInto(createLudoGame(4), [6, 3]);
    const avant = JSON.stringify(state);

    playLudoMove(state, legalLudoMoves(state)[0]);
    assert.equal(JSON.stringify(state), avant);
  });

  test('un coup illégal laisse la partie où elle est', () => {
    const state = rollInto(createLudoGame(4), [3, 2]);
    const inventé = {
      kind: 'enter' as const,
      pawn: 0,
      die: 3,
      to: surCase(0),
    };

    assert.equal(playLudoMove(state, inventé), state);
  });

  test('les dés tirés restent entre un et six', () => {
    // Les bornes du générateur : 0 et le plus grand nombre sous 1.
    for (const valeur of [0, 0.999999]) {
      for (const de of rollDice(() => valeur)) {
        assert.ok(de >= 1 && de <= 6, `dé hors bornes : ${de}`);
      }
    }
  });

  test('une partie ne reste jamais bloquée sans raison', () => {
    // Cent tours au hasard : aucun ne doit lever, et l'état doit rester sain.
    let state = createLudoGame(4);
    let graine = 12345;
    const random = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine / 2147483648;
    };

    for (let tour = 0; tour < 100 && state.status.kind === 'playing'; tour++) {
      state = rollInto(state, rollDice(random));

      while (state.dice.length > 0) {
        const moves = legalLudoMoves(state);
        if (moves.length === 0) break;
        state = playLudoMove(state, moves[Math.floor(random() * moves.length)]);
      }

      if (state.status.kind !== 'playing') break;
      state = endTurn(state, false);
    }

    assert.equal(state.pawns.length, 4 * PIECES_PER_PLAYER, 'aucun pion ne disparaît');
  });
});
