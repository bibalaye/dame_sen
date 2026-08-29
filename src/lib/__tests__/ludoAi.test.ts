import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_LENGTH,
  PIECES_PER_PLAYER,
  createLudoGame,
  endTurn,
  legalLudoMoves,
  playLudoMove,
  rollDice,
  rollInto,
  type LudoPlayerId,
  type LudoState,
  type Pawn,
  type PawnSpot,
} from '../ludo.ts';
import {
  chooseLudoMove,
  progressRatio,
  scoreLudoMove,
  threatsOn,
} from '../ludoAi.ts';

const etat = (
  places: ReadonlyArray<{ owner: LudoPlayerId; spot: PawnSpot }>,
  options: { current?: LudoPlayerId; dice?: number[]; playerCount?: number } = {},
): LudoState => {
  const base = createLudoGame(options.playerCount ?? 4);
  const pawns: Pawn[] = [...base.pawns];

  for (const place of places) {
    const index = pawns.findIndex(
      (p) => p.owner === place.owner && p.spot.zone === 'stable' && p.spot.host === p.owner,
    );
    assert.notEqual(index, -1, `plus de pion pour le joueur ${place.owner}`);
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

/** Un hasard qui ne tire jamais la maladresse : on veut le meilleur coup. */
const sansHasard = () => 0.99;

describe('détection des menaces', () => {
  test('un adversaire dans les six cases en amont menace', () => {
    const state = etat([{ owner: 1, spot: surCase(10) }], { current: 0 });

    assert.equal(threatsOn(state, 14, 0), 1, 'quatre cases derrière');
    assert.equal(threatsOn(state, 16, 0), 1, 'six cases derrière');
  });

  test('au-delà de six cases, il n’y a plus de menace immédiate', () => {
    const state = etat([{ owner: 1, spot: surCase(10) }], { current: 0 });
    assert.equal(threatsOn(state, 17, 0), 0);
  });

  test('un pion devant ne menace pas celui qui est derrière', () => {
    const state = etat([{ owner: 1, spot: surCase(20) }], { current: 0 });
    assert.equal(threatsOn(state, 14, 0), 0, 'on n’attaque pas à reculons');
  });

  test('ses propres pions ne se menacent pas', () => {
    const state = etat([{ owner: 0, spot: surCase(10) }], { current: 0 });
    assert.equal(threatsOn(state, 14, 0), 0);
  });

  test('la menace se compte autour du circuit', () => {
    // Un pion en case 50 menace la case 2 : le circuit boucle.
    const state = etat([{ owner: 1, spot: surCase(50) }], { current: 0 });
    assert.equal(threatsOn(state, 2, 0), 1);
  });
});

describe('priorités du joueur artificiel', () => {
  test('il prend plutôt que d’avancer', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 0, spot: surCase(30) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 0, dice: [3, 1] },
    );

    const choix = chooseLudoMove(state, 'hard', sansHasard);
    assert.ok(choix, 'un coup doit être trouvé');
    assert.notEqual(choix!.captures, undefined, 'la prise passe avant tout');
  });

  test('à choisir, il prend le pion le plus avancé', () => {
    // Deux prises possibles : l'une sur un pion frais, l'autre sur un pion
    // ayant presque bouclé son tour.
    const frais = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 0, dice: [3, 1] },
    );
    const avance = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 2, spot: surCase(13) },
      ],
      { current: 0, dice: [3, 1] },
    );

    const priseFraiche = legalLudoMoves(frais).find((m) => m.captures !== undefined)!;
    const priseAvancee = legalLudoMoves(avance).find((m) => m.captures !== undefined)!;

    // Le pion du joueur 2 part de la case 26 : en 13, il a presque fini son tour.
    assert.ok(
      scoreLudoMove(avance, priseAvancee) > scoreLudoMove(frais, priseFraiche),
      'reprendre un pion avancé coûte plus cher à son propriétaire',
    );
  });

  test('l’incursion dans une allée l’emporte sur une prise ordinaire', () => {
    const raid = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: dansMaison(1, 1) },
      ],
      { current: 0, dice: [4, 1] },
    );
    const ordinaire = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 1, spot: surCase(14) },
      ],
      { current: 0, dice: [4, 1] },
    );

    const coupRaid = legalLudoMoves(raid).find((m) => m.kind === 'raid')!;
    const coupPrise = legalLudoMoves(ordinaire).find((m) => m.captures !== undefined)!;

    assert.ok(
      scoreLudoMove(raid, coupRaid) > scoreLudoMove(ordinaire, coupPrise),
      'la victime était à deux pas du but',
    );
  });

  test('il évite de se poser à portée d’un adversaire', () => {
    // Deux avances possibles : l'une devant un adversaire, l'autre à l'abri.
    const state = etat(
      [
        { owner: 0, spot: surCase(20) },
        // Un pion adverse en 21 menace tout ce qui se pose de 22 à 27.
        { owner: 1, spot: surCase(21) },
      ],
      { current: 0, dice: [3, 8] },
    );

    // Le 3 pose en 23, à portée. On vérifie que le score le sanctionne.
    const expose = legalLudoMoves(state).find(
      (m) => m.to.zone === 'track' && m.to.square === 23,
    );
    assert.ok(expose);
    assert.ok(scoreLudoMove(state, expose!) < 0, 'se mettre à portée doit coûter');
  });

  test('se poser à deux annule le risque', () => {
    // Le pion rejoint l'un des siens : le barrage ne se prend pas.
    const state = etat(
      [
        { owner: 0, spot: surCase(20) },
        { owner: 0, spot: surCase(23) },
        { owner: 1, spot: surCase(21) },
      ],
      { current: 0, dice: [3, 1] },
    );

    const barrage = legalLudoMoves(state).find(
      (m) => m.to.zone === 'track' && m.to.square === 23,
    );
    assert.ok(barrage);
    assert.ok(
      scoreLudoMove(state, barrage!) > 0,
      'former un barrage sur une case menacée reste bon',
    );
  });

  test('il fuit une case menacée', () => {
    const menace = etat(
      [
        { owner: 0, spot: surCase(20) },
        { owner: 1, spot: surCase(16) },
      ],
      { current: 0, dice: [10, 1] },
    );
    const tranquille = etat([{ owner: 0, spot: surCase(20) }], {
      current: 0,
      dice: [10, 1],
    });

    const fuite = legalLudoMoves(menace).find((m) => m.die === 10)!;
    const flanerie = legalLudoMoves(tranquille).find((m) => m.die === 10)!;

    assert.ok(
      scoreLudoMove(menace, fuite) > scoreLudoMove(tranquille, flanerie),
      'partir d’une case menacée vaut mieux qu’y rester',
    );
  });

  test('il sort ses pions de l’écurie', () => {
    const state = rollInto(createLudoGame(4), [6, 6]);
    const choix = chooseLudoMove(state, 'hard', sansHasard);

    assert.equal(choix?.kind, 'enter');
  });

  test('il libère un prisonnier plutôt que d’avancer', () => {
    const state = etat(
      [
        { owner: 0, spot: { zone: 'stable', host: 1 } },
        { owner: 0, spot: surCase(20) },
      ],
      { current: 0, dice: [6, 2] },
    );

    const choix = chooseLudoMove(state, 'hard', sansHasard);
    assert.equal(choix?.kind, 'free', 'un pion prisonnier ne sert à rien');
  });

  test('il se dégage d’une allée où il s’est aventuré', () => {
    const state = etat(
      [
        { owner: 0, spot: dansMaison(1, 2) },
        { owner: 0, spot: surCase(20) },
      ],
      { current: 0, dice: [6, 3] },
    );

    const choix = chooseLudoMove(state, 'hard', sansHasard);
    assert.equal(choix?.kind, 'escape', 'un pion englué ne progresse plus');
  });

  test('il rentre un pion quand le compte tombe juste', () => {
    const state = etat(
      [
        { owner: 0, spot: dansMaison(0, HOME_LENGTH - 2) },
        { owner: 0, spot: surCase(20) },
      ],
      { current: 0, dice: [2, 1] },
    );

    const choix = chooseLudoMove(state, 'hard', sansHasard);
    assert.equal(choix?.to.zone, 'finished');
  });
});

describe('niveaux', () => {
  test('le niveau difficile ne joue jamais au hasard', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 0, spot: surCase(30) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 0, dice: [3, 1] },
    );

    // Même avec un hasard qui pousserait à la maladresse, il prend.
    for (const tirage of [0, 0.1, 0.5, 0.9]) {
      const choix = chooseLudoMove(state, 'hard', () => tirage);
      assert.notEqual(choix!.captures, undefined);
    }
  });

  test('le niveau facile se trompe souvent', () => {
    const state = etat(
      [
        { owner: 0, spot: surCase(10) },
        { owner: 0, spot: surCase(30) },
        { owner: 1, spot: surCase(13) },
      ],
      { current: 0, dice: [3, 1] },
    );

    // Un tirage sous le seuil de maladresse détourne du meilleur coup.
    const choix = chooseLudoMove(state, 'easy', () => 0.05);
    assert.ok(choix, 'un coup est joué quand même');
  });

  test('sans coup possible, il ne rend rien', () => {
    const state = rollInto(createLudoGame(4), [3, 5]);
    assert.equal(chooseLudoMove(state, 'hard', sansHasard), null);
  });

  test('un seul coup possible est joué sans hésiter', () => {
    const state = etat([{ owner: 0, spot: { zone: 'stable', host: 1 } }], {
      current: 0,
      dice: [6, 2],
    });

    assert.equal(chooseLudoMove(state, 'easy', () => 0)?.kind, 'free');
  });
});

describe('avancement', () => {
  test('une partie neuve part de zéro', () => {
    assert.equal(progressRatio(createLudoGame(4), 0), 0);
  });

  test('tous les pions rentrés font un', () => {
    const state: LudoState = {
      ...createLudoGame(4),
      pawns: [
        ...Array.from({ length: PIECES_PER_PLAYER }, () => ({
          owner: 0 as LudoPlayerId,
          spot: { zone: 'finished' } as PawnSpot,
        })),
        ...createLudoGame(4).pawns.filter((p) => p.owner !== 0),
      ],
    };

    assert.equal(progressRatio(state, 0), 1);
  });

  test('un pion chez un adversaire ne compte pas comme un progrès', () => {
    const state = etat([{ owner: 0, spot: dansMaison(1, 4) }], { current: 0 });
    assert.equal(progressRatio(state, 0), 0, 'il n’avance pas vers son but');
  });
});

describe('robustesse', () => {
  test('deux adversaires jouent une partie entière sans se bloquer', () => {
    let state = createLudoGame(2);
    let graine = 4242;
    const random = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine / 2147483648;
    };

    let tours = 0;
    while (state.status.kind === 'playing' && tours++ < 3000) {
      state = rollInto(state, rollDice(random));

      // On joue les dés tant qu'il reste un coup.
      for (let i = 0; i < 4 && state.dice.length > 0; i++) {
        const choix = chooseLudoMove(state, 'hard', random);
        if (!choix) break;

        const avant = state;
        state = playLudoMove(state, choix);
        assert.notEqual(state, avant, 'le coup choisi doit être jouable');
      }

      if (state.status.kind !== 'playing') break;
      state = endTurn(state, false);
    }

    assert.equal(
      state.status.kind,
      'win',
      'une partie conduite par deux adversaires artificiels doit se conclure',
    );
  });

  test('l’état reçu n’est pas modifié par le choix', () => {
    const state = rollInto(createLudoGame(4), [6, 3]);
    const avant = JSON.stringify(state);

    chooseLudoMove(state, 'hard', sansHasard);
    assert.equal(JSON.stringify(state), avant);
  });
});
