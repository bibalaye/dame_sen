import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_LENGTH,
  PIECES_PER_PLAYER,
  START_SQUARE,
  TRACK,
  createLudoGame,
  earnsExtraRoll,
  endTurn,
  homeGate,
  isCaptive,
  isTrespassing,
  legalLudoMoves,
  playLudoMove,
  progressOf,
  rollDice,
  rollInto,
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
    // Le lancer est intact tant qu'on n'a rien joué.
    rolled: options.dice ?? [],
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

  test('à deux joueurs, seuls deux camps sont en jeu', () => {
    const state = createLudoGame(2);
    assert.equal(state.pawns.length, 2 * PIECES_PER_PLAYER);
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

describe('barrages', () => {
  // Deux pions du joueur 1 tiennent la case 14.
  const avecBarrage = (dice: number[]) =>
    etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: surCase(14) },
        { owner: 1, spot: surCase(14) },
      ],
      { current: 0, dice },
    );

  test('un barrage arrête le pion qui voudrait s’y poser', () => {
    const moves = legalLudoMoves(avecBarrage([4, 1]));
    const surLeBarrage = moves.filter(
      (m) => m.to.zone === 'track' && m.to.square === 14,
    );

    assert.equal(surLeBarrage.length, 0);
  });

  test('un barrage arrête aussi celui qui voudrait le franchir', () => {
    const moves = legalLudoMoves(avecBarrage([5, 1]));
    const audela = moves.filter((m) => m.to.zone === 'track' && m.to.square === 15);

    assert.equal(audela.length, 0, 'un barrage se contourne pas : il bloque');
  });

  test('un double-six force le barrage', () => {
    const moves = legalLudoMoves(avecBarrage([6, 6]));
    const passe = moves.filter((m) => m.to.zone === 'track' && m.to.square === 16);

    assert.equal(passe.length, 1, 'le double-six est la seule clé');
  });

  test('un six seul ne suffit pas', () => {
    const moves = legalLudoMoves(avecBarrage([6, 2]));
    const passe = moves.filter((m) => m.to.zone === 'track' && m.to.square === 16);

    assert.equal(passe.length, 0);
  });

  test('le barrage ne gêne pas celui qui le tient', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(14) },
        { owner: 0, spot: surCase(14) },
      ],
      { current: 0, dice: [3, 1] },
    );

    const moves = legalLudoMoves(state);
    assert.ok(moves.some((m) => m.to.zone === 'track' && m.to.square === 17));
  });

  test('un pion seul ne fait pas barrage', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: surCase(12) },
      ],
      { current: 0, dice: [4, 1] },
    );

    assert.ok(
      legalLudoMoves(state).some((m) => m.to.zone === 'track' && m.to.square === 14),
      'on franchit un pion isolé',
    );
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

  test('un six rend la main, mais pas indéfiniment', () => {
    assert.ok(earnsExtraRoll([6, 2], 0));
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

  test('le six se reconnaît encore après avoir été dépensé', () => {
    let state = rollInto(createLudoGame(4), [6, 2]);
    state = playLudoMove(state, legalLudoMoves(state)[0]);

    assert.ok(!state.dice.includes(6), 'le six a été joué');
    assert.ok(
      earnsExtraRoll(state.rolled, state.extraRolls),
      'le lancer garde la trace du six, sinon la relance se perdrait',
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

  test('à deux joueurs, la main revient au premier', () => {
    const state = createLudoGame(2);
    assert.equal(endTurn(state, false).current, 1);
    assert.equal(endTurn(endTurn(state, false), false).current, 0);
  });
});

describe('la main tourne', () => {
  /**
   * Reproduit exactement le cycle de l'écran : lancer, jouer tant qu'un dé se
   * joue, puis conclure. C'est ce que le composant fait, et c'est là que le
   * premier joueur gardait la main pour toute la partie.
   */
  const jouerDesTours = (nombre: number) => {
    let state = createLudoGame(4);
    let graine = 20260829;
    const random = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine / 2147483648;
    };

    const tours: number[] = [];

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

  test('personne n’enchaîne un nombre déraisonnable de tours', () => {
    const tours = jouerDesTours(60);

    let suite = 1;
    let record = 1;
    for (let i = 1; i < tours.length; i++) {
      suite = tours[i] === tours[i - 1] ? suite + 1 : 1;
      record = Math.max(record, suite);
    }

    // Un six rend la main, plafonné à trois relances : quatre tours d'affilée
    // au plus.
    assert.ok(record <= 4, `un joueur a enchaîné ${record} tours de suite`);
  });

  test('la main revient dans l’ordre', () => {
    const tours = jouerDesTours(40);

    for (let i = 1; i < tours.length; i++) {
      const precedent = tours[i - 1];
      const attendu = (precedent + 1) % 4;

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
