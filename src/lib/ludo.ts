/**
 * Le Ludo, variante sénégalaise.
 *
 * Trois règles le distinguent du Ludo répandu ailleurs, et toutes trois
 * touchent au même point : un pion n'est pas toujours chez lui.
 *
 *   — Un pion capturé ne rentre pas dans sa propre écurie mais dans celle de
 *     son ravisseur, où il reste prisonnier jusqu'à ce que son propriétaire
 *     fasse un 6.
 *   — Deux pions d'une même couleur sur une case forment un barrage que rien
 *     ne traverse, sauf un double-six.
 *   — L'allée finale d'un joueur n'est pas un sanctuaire : on peut y entrer
 *     pour prendre un pion sur le point de rentrer — mais uniquement pour cela,
 *     et il faut ensuite un 6 par case pour en ressortir.
 *
 * D'où le modèle : la position d'un pion porte toujours deux identités — à qui
 * il appartient, et chez qui il se trouve. Une fois cela posé, les trois règles
 * s'écrivent d'elles-mêmes au lieu d'être des cas particuliers greffés.
 *
 * Le module est pur : aucun dé n'y est tiré. Les valeurs arrivent de
 * l'extérieur, ce qui rend un jeu de hasard entièrement déterministe à tester —
 * et permettra plus tard au serveur d'être seul maître du dé, puisqu'un client
 * qui annonce ses propres 6 n'est contredit par personne.
 */

export type LudoPlayerId = 0 | 1 | 2 | 3;

export const LUDO_PLAYERS: readonly LudoPlayerId[] = [0, 1, 2, 3];

/** Cases du circuit commun : quatre bras de treize. */
export const TRACK = 52;

/**
 * Longueur de l'allée finale. Cinq cases colorées menant au centre : c'est ce
 * que dessine un plateau de quinze sur quinze, et le pion entre au centre au
 * pas suivant.
 */
export const HOME_LENGTH = 5;

export const PIECES_PER_PLAYER = 4;

/** Nombre de dés lancés par tour. */
export const DICE_COUNT = 2;

/**
 * Où chaque joueur pose ses pions en sortant. Les départs sont espacés d'un
 * quart de circuit : c'est ce qui donne à chacun le même trajet.
 */
export const START_SQUARE: Readonly<Record<LudoPlayerId, number>> = {
  0: 0,
  1: 13,
  2: 26,
  3: 39,
};

/**
 * Dernière case du circuit avant l'allée d'un joueur : celle qui précède son
 * départ. C'est aussi le point par lequel un adversaire peut s'introduire chez
 * lui.
 */
export const homeGate = (player: LudoPlayerId): number =>
  (START_SQUARE[player] - 1 + TRACK) % TRACK;

/**
 * Les coins occupés selon le nombre de joueurs.
 *
 * À deux, on s'assoit en diagonale : côte à côte, l'un aurait la moitié du
 * circuit d'avance sur l'autre avant même le premier lancer. À trois, les
 * places se suivent — quatre coins ne se partagent pas équitablement en trois.
 */
export const seatsFor = (playerCount: number): readonly LudoPlayerId[] =>
  playerCount === 2 ? [0, 2] : LUDO_PLAYERS.slice(0, playerCount);

// --- Position d'un pion ------------------------------------------------------

/**
 * `host` désigne chez qui se trouve le pion, qui n'est pas forcément son
 * propriétaire : c'est là que tiennent la capture-prisonnier et l'incursion
 * dans une allée adverse.
 */
export type PawnSpot =
  | { readonly zone: 'stable'; readonly host: LudoPlayerId }
  | { readonly zone: 'track'; readonly square: number }
  | { readonly zone: 'home'; readonly host: LudoPlayerId; readonly step: number }
  | { readonly zone: 'finished' };

export interface Pawn {
  readonly owner: LudoPlayerId;
  readonly spot: PawnSpot;
}

/** Vrai si le pion dort dans l'écurie d'un adversaire. */
export const isCaptive = (pawn: Pawn): boolean =>
  pawn.spot.zone === 'stable' && pawn.spot.host !== pawn.owner;

/** Vrai si le pion est englué dans l'allée de quelqu'un d'autre. */
export const isTrespassing = (pawn: Pawn): boolean =>
  pawn.spot.zone === 'home' && pawn.spot.host !== pawn.owner;

/** Vrai si le pion attend chez lui de pouvoir entrer en jeu. */
export const isResting = (pawn: Pawn): boolean =>
  pawn.spot.zone === 'stable' && pawn.spot.host === pawn.owner;

/**
 * Distance parcourue depuis la sortie, de 0 à 51. Un pion sort toujours sur sa
 * case de départ et ne fait qu'un tour : la mesure est donc sans ambiguïté.
 */
export const progressOf = (pawn: Pawn): number => {
  if (pawn.spot.zone !== 'track') return 0;
  return (pawn.spot.square - START_SQUARE[pawn.owner] + TRACK) % TRACK;
};

// --- État de la partie -------------------------------------------------------

export type LudoStatus =
  | { readonly kind: 'playing' }
  | { readonly kind: 'win'; readonly winner: LudoPlayerId };

export interface LudoState {
  readonly pawns: readonly Pawn[];
  readonly current: LudoPlayerId;
  /** Dés qu'il reste à employer. Se vide à mesure qu'on les joue. */
  readonly dice: readonly number[];
  /**
   * Le lancer du tour, intact. Sans lui, `dice` vide voudrait dire deux choses
   * — pas encore lancé, ou tout joué — et le tour ne se terminerait jamais.
   * Il sert aussi à savoir si un six est tombé une fois les dés dépensés.
   */
  readonly rolled: readonly number[];
  /**
   * Six accumulés depuis le début du tour, relances comprises.
   *
   * Forcer un barrage demande autant de six qu'il compte de pions. Avec deux
   * dés, trois six ne tombent jamais d'un coup : ils s'additionnent d'un lancer
   * à l'autre, ce que le double-six rend possible en rendant la main.
   */
  readonly sixesThisTurn: number;
  /**
   * Relances déjà accordées dans ce tour. Un six rend la main, mais pas
   * indéfiniment : sans plafond, une série chanceuse tiendrait le tour ouvert
   * sans fin.
   */
  readonly extraRolls: number;
  readonly status: LudoStatus;
  /** Nombre de joueurs réellement assis : les autres pions restent au repos. */
  readonly playerCount: number;
}

/** Au-delà, la main passe même sur un six. */
export const MAX_EXTRA_ROLLS = 3;

export const createLudoGame = (playerCount = 4): LudoState => {
  const pawns: Pawn[] = [];

  for (const player of seatsFor(playerCount)) {
    for (let i = 0; i < PIECES_PER_PLAYER; i++) {
      pawns.push({ owner: player, spot: { zone: 'stable', host: player } });
    }
  }

  return {
    pawns,
    current: 0,
    dice: [],
    rolled: [],
    sixesThisTurn: 0,
    extraRolls: 0,
    status: { kind: 'playing' },
    playerCount,
  };
};

// --- Lecture du plateau ------------------------------------------------------

/** Les pions posés sur une case du circuit. */
export const pawnsOnSquare = (state: LudoState, square: number): Pawn[] =>
  state.pawns.filter((p) => p.spot.zone === 'track' && p.spot.square === square);

/**
 * Le joueur qui tient une case en barrage, s'il y en a un.
 *
 * Un barrage ne se forme qu'à sa porte — sa case de départ, celle devant son
 * écurie où ses pions se posent en entrant en jeu. Ailleurs, empiler deux pions
 * ne protège rien : au contraire, un adversaire qui tombe dessus les prend tous
 * les deux d'un coup.
 *
 * C'est bien la case de départ, et non le seuil de l'allée : un joueur n'a
 * jamais deux pions sur ce seuil, puisqu'ils bifurquent chez eux dès qu'ils
 * l'atteignent. Le barrage y aurait été impossible à former.
 */
export const blockadeOwner = (
  state: LudoState,
  square: number,
): LudoPlayerId | null => {
  const dessus = pawnsOnSquare(state, square);
  if (dessus.length < 2) return null;

  const premier = dessus[0].owner;
  if (!dessus.every((p) => p.owner === premier)) return null;

  return square === START_SQUARE[premier] ? premier : null;
};

/**
 * Nombre de pions tenant le barrage, ou zéro s'il n'y en a pas.
 *
 * C'est le prix à payer pour passer : autant de six que de pions. Deux pions
 * demandent un double-six ; trois en demandent un de plus, réuni au lancer
 * suivant.
 */
export const blockadeSize = (state: LudoState, square: number): number =>
  blockadeOwner(state, square) === null ? 0 : pawnsOnSquare(state, square).length;

/** Les pions d'un joueur qui ont fini leur course. */
export const finishedCount = (state: LudoState, player: LudoPlayerId): number =>
  state.pawns.filter((p) => p.owner === player && p.spot.zone === 'finished').length;

// --- Coups -------------------------------------------------------------------

export type LudoMoveKind =
  /** Sortir un pion de sa propre écurie. */
  | 'enter'
  /** Ramener chez soi un pion prisonnier. */
  | 'free'
  /** Avancer sur le circuit. */
  | 'advance'
  /** Entrer dans sa propre allée, ou y progresser. */
  | 'home'
  /** S'introduire dans l'allée d'un adversaire pour l'y prendre. */
  | 'raid'
  /** Se dégager, case par case, de l'allée où l'on s'est aventuré. */
  | 'escape';

export interface LudoMove {
  readonly kind: LudoMoveKind;
  /** Rang du pion dans `state.pawns`. */
  readonly pawn: number;
  /** Valeur du dé employée par ce coup. */
  readonly die: number;
  /** Où le pion se retrouve. */
  readonly to: PawnSpot;
  /**
   * Pions capturés, le cas échéant : ils passeront dans l'écurie du joueur.
   *
   * Il peut y en avoir plusieurs : hors de sa porte, deux pions empilés se font
   * prendre ensemble.
   */
  readonly captures?: readonly number[];
}

/**
 * Vrai si le chemin entre deux cases du circuit est libre de barrage.
 *
 * On regarde chaque case franchie ainsi que l'arrivée : un barrage arrête, il
 * ne se saute pas. Le joueur qui tient le barrage n'est évidemment pas gêné par
 * le sien.
 */
const pathIsClear = (
  state: LudoState,
  from: number,
  steps: number,
  mover: LudoPlayerId,
  sixes: number,
): boolean => {
  for (let i = 1; i <= steps; i++) {
    const square = (from + i) % TRACK;
    const owner = blockadeOwner(state, square);
    if (owner === null || owner === mover) continue;

    // Il faut autant de six que le barrage compte de pions : deux pions, deux
    // six ; trois pions, trois six.
    if (sixes < blockadeSize(state, square)) return false;
  }
  return true;
};

/** Ce qui se trouve à l'arrivée : une prise, un refus, ou rien. */
const landingOnTrack = (
  state: LudoState,
  square: number,
  mover: LudoPlayerId,
): { allowed: boolean; captures?: readonly number[] } => {
  const dessus = pawnsOnSquare(state, square);
  if (dessus.length === 0) return { allowed: true };

  // On s'empile volontiers sur les siens — en sachant qu'ailleurs qu'à sa
  // porte, cela expose les deux pions d'un seul coup.
  if (dessus.every((p) => p.owner === mover)) return { allowed: true };

  // Un barrage adverse ne se prend pas : il faut d'abord le défaire. Il n'y en
  // a qu'à la porte de son propriétaire.
  if (blockadeOwner(state, square) !== null) return { allowed: false };

  // Tout ce qui appartient à d'autres est pris, fût-ce deux pions à la fois.
  return {
    allowed: true,
    captures: dessus
      .filter((p) => p.owner !== mover)
      .map((p) => state.pawns.indexOf(p)),
  };
};

/** Les coups qu'un pion peut jouer avec une valeur de dé donnée. */
const movesForPawn = (
  state: LudoState,
  index: number,
  die: number,
  sixes: number,
): LudoMove[] => {
  const pawn = state.pawns[index];
  if (pawn.owner !== state.current) return [];

  const moves: LudoMove[] = [];
  const spot = pawn.spot;

  // --- Écurie ---------------------------------------------------------------
  if (spot.zone === 'stable') {
    if (die !== 6) return [];

    // Prisonnier : le six le rend à son propriétaire, pas au plateau.
    if (spot.host !== pawn.owner) {
      return [
        {
          kind: 'free',
          pawn: index,
          die,
          to: { zone: 'stable', host: pawn.owner },
        },
      ];
    }

    const square = START_SQUARE[pawn.owner];
    const landing = landingOnTrack(state, square, pawn.owner);
    if (!landing.allowed) return [];

    return [
      {
        kind: 'enter',
        pawn: index,
        die,
        to: { zone: 'track', square },
        ...(landing.captures?.length ? { captures: landing.captures } : {}),
      },
    ];
  }

  if (spot.zone === 'finished') return [];

  // --- Allée d'un adversaire : on n'en sort qu'à coups de six ---------------
  if (spot.zone === 'home' && spot.host !== pawn.owner) {
    if (die !== 6) return [];

    // Une case par six, jusqu'à retrouver le circuit par où l'on est entré.
    if (spot.step > 0) {
      return [
        {
          kind: 'escape',
          pawn: index,
          die,
          to: { zone: 'home', host: spot.host, step: spot.step - 1 },
        },
      ];
    }

    const square = homeGate(spot.host);
    const landing = landingOnTrack(state, square, pawn.owner);
    if (!landing.allowed) return [];

    return [
      {
        kind: 'escape',
        pawn: index,
        die,
        to: { zone: 'track', square },
        ...(landing.captures?.length ? { captures: landing.captures } : {}),
      },
    ];
  }

  // --- Sa propre allée : compte exact, ou un six -----------------------------
  if (spot.zone === 'home') {
    const step = spot.step + die;

    /*
     * Un six sort le pion pour de bon, d'où qu'il soit dans l'allée. Sans cela,
     * un pion à deux cases du centre pouvait attendre des tours entiers le
     * chiffre exact, pendant que la partie se jouait ailleurs.
     */
    if (die === 6) {
      return [{ kind: 'home', pawn: index, die, to: { zone: 'finished' } }];
    }

    // La dernière case franchie mène au centre ; au-delà, le coup est refusé.
    if (step === HOME_LENGTH) {
      return [{ kind: 'home', pawn: index, die, to: { zone: 'finished' } }];
    }
    if (step > HOME_LENGTH) return [];

    // On ne saute pas par-dessus l'un des siens dans l'allée.
    const occupe = state.pawns.some(
      (p) =>
        p.spot.zone === 'home' &&
        p.spot.host === spot.host &&
        p.spot.step === step,
    );
    if (occupe) return [];

    return [
      {
        kind: 'home',
        pawn: index,
        die,
        to: { zone: 'home', host: spot.host, step },
      },
    ];
  }

  // --- Circuit --------------------------------------------------------------
  const progress = progressOf(pawn);
  const restant = TRACK - progress;

  /*
   * Le pion a bouclé son tour : il peut entrer chez lui — ou passer devant sa
   * porte et repartir pour un tour complet.
   *
   * Rien ne l'y oblige, et c'est parfois le bon choix : un pion qui reste sur
   * le circuit continue de menacer, tandis qu'un pion rentré ne sert plus qu'à
   * compter. On ne retourne donc plus ici : l'avance ordinaire s'ajoute plus
   * bas, et le pion recommencera son tour.
   */
  if (die >= restant && pathIsClear(state, spot.square, restant - 1, pawn.owner, sixes)) {
    const step = die - restant;

    if (step === HOME_LENGTH) {
      moves.push({ kind: 'home', pawn: index, die, to: { zone: 'finished' } });
    } else if (step < HOME_LENGTH) {
      const occupe = state.pawns.some(
        (p) =>
          p.spot.zone === 'home' &&
          p.spot.host === pawn.owner &&
          p.spot.step === step,
      );
      if (!occupe) {
        moves.push({
          kind: 'home',
          pawn: index,
          die,
          to: { zone: 'home', host: pawn.owner, step },
        });
      }
    }
  }

  // Avance ordinaire.
  if (pathIsClear(state, spot.square, die, pawn.owner, sixes)) {
    const square = (spot.square + die) % TRACK;
    const landing = landingOnTrack(state, square, pawn.owner);

    if (landing.allowed) {
      moves.push({
        kind: 'advance',
        pawn: index,
        die,
        to: { zone: 'track', square },
        ...(landing.captures?.length ? { captures: landing.captures } : {}),
      });
    }
  }

  // --- Incursion chez un adversaire ----------------------------------------
  // Uniquement pour prendre : sans proie, l'allée reste fermée, et l'on n'y
  // entre donc jamais par mégarde.
  for (const host of LUDO_PLAYERS) {
    if (host === pawn.owner || !seatsFor(state.playerCount).includes(host)) continue;

    const gate = homeGate(host);
    const jusquAuSeuil = (gate - spot.square + TRACK) % TRACK;
    const step = die - jusquAuSeuil - 1;

    /*
     * On n'entre chez l'autre qu'en arrivant sur son seuil, jamais en en
     * repartant. Depuis le seuil lui-même, bifurquer dans l'allée ramène le
     * pion en arrière du chemin qu'il vient de prendre : `jusquAuSeuil` vaut
     * alors zéro, et le coup est écarté.
     */
    if (jusquAuSeuil < 1 || jusquAuSeuil >= die) continue;
    if (step < 0 || step >= HOME_LENGTH) continue;
    if (!pathIsClear(state, spot.square, jusquAuSeuil, pawn.owner, sixes)) continue;

    const proie = state.pawns.findIndex(
      (p) =>
        p.spot.zone === 'home' &&
        p.spot.host === host &&
        p.spot.step === step &&
        p.owner !== pawn.owner,
    );
    if (proie === -1) continue;

    moves.push({
      kind: 'raid',
      pawn: index,
      die,
      to: { zone: 'home', host, step },
      captures: [proie],
    });
  }

  return moves;
};

/** Vrai si le lancer en cours est un double-six, la clé des barrages. */
export const isDoubleSix = (dice: readonly number[]): boolean =>
  dice.length >= 2 && dice.every((d) => d === 6);

/**
 * Tous les coups jouables avec les dés restants.
 *
 * Les six réunis pendant le tour restent acquis même une fois les dés
 * dépensés : c'est ainsi qu'on force un barrage de trois pions, en additionnant
 * un double-six et le six du lancer suivant.
 */
export const legalLudoMoves = (state: LudoState): LudoMove[] => {
  if (state.status.kind !== 'playing') return [];

  const valeurs = [...new Set(state.dice)];
  const moves: LudoMove[] = [];

  for (const die of valeurs) {
    for (let i = 0; i < state.pawns.length; i++) {
      moves.push(...movesForPawn(state, i, die, state.sixesThisTurn));
    }
  }

  return moves;
};

// --- Déroulement -------------------------------------------------------------

/** Le joueur suivant, en suivant les coins occupés. */
export const nextPlayer = (state: LudoState): LudoPlayerId => {
  const seats = seatsFor(state.playerCount);
  const place = seats.indexOf(state.current);

  return seats[(place + 1) % seats.length];
};

/**
 * Pose les dés d'un tour. Les valeurs viennent de l'appelant : le module ne
 * tire rien lui-même.
 */
export const rollInto = (state: LudoState, dice: readonly number[]): LudoState => {
  if (state.status.kind !== 'playing') return state;

  return {
    ...state,
    dice: [...dice],
    rolled: [...dice],
    // Les six s'ajoutent à ceux du tour : c'est ce qui permet d'en réunir trois
    // ou quatre, un lancer après l'autre.
    sixesThisTurn: state.sixesThisTurn + dice.filter((die) => die === 6).length,
  };
};

/** Un lancer, à partir d'une source de hasard fournie. */
export const rollDice = (random: () => number = Math.random): number[] =>
  Array.from({ length: DICE_COUNT }, () => 1 + Math.floor(random() * 6));

const withoutOneDie = (dice: readonly number[], die: number): number[] => {
  const rest = [...dice];
  const at = rest.indexOf(die);
  if (at !== -1) rest.splice(at, 1);
  return rest;
};

/**
 * Joue un coup. L'état rendu est neuf ; celui reçu n'est jamais modifié.
 *
 * Un coup refusé rend l'état inchangé, ce qui permet à l'appelant de le
 * détecter par simple identité.
 */
export const playLudoMove = (state: LudoState, move: LudoMove): LudoState => {
  if (state.status.kind !== 'playing') return state;

  const permis = legalLudoMoves(state).some(
    (m) =>
      m.pawn === move.pawn &&
      m.die === move.die &&
      m.kind === move.kind &&
      sameSpot(m.to, move.to),
  );
  if (!permis) return state;

  const pawns = [...state.pawns];
  const mover = pawns[move.pawn];

  // La prise d'abord : les pions pris rejoignent l'écurie de leur ravisseur, et
  // non la leur. C'est ce qui fait toute la différence avec le Ludo répandu.
  for (const proie of move.captures ?? []) {
    pawns[proie] = {
      ...pawns[proie],
      spot: { zone: 'stable', host: state.current },
    };
  }

  pawns[move.pawn] = { ...mover, spot: move.to };

  const dice = withoutOneDie(state.dice, move.die);
  const gagne = countFinished(pawns, state.current) === PIECES_PER_PLAYER;

  if (gagne) {
    return {
      ...state,
      pawns,
      dice: [],
      status: { kind: 'win', winner: state.current },
    };
  }

  return { ...state, pawns, dice };
};

const countFinished = (pawns: readonly Pawn[], player: LudoPlayerId): number =>
  pawns.filter((p) => p.owner === player && p.spot.zone === 'finished').length;

export const sameSpot = (a: PawnSpot, b: PawnSpot): boolean => {
  if (a.zone !== b.zone) return false;
  if (a.zone === 'track' && b.zone === 'track') return a.square === b.square;
  if (a.zone === 'stable' && b.zone === 'stable') return a.host === b.host;
  if (a.zone === 'home' && b.zone === 'home') {
    return a.host === b.host && a.step === b.step;
  }
  return true;
};

/**
 * Vrai si le joueur n'a plus rien à faire de son lancer : soit il a dépensé ses
 * deux dés, soit aucun ne se joue.
 *
 * C'est ici que se règle la question qui a laissé un joueur enchaîner tous les
 * tours : `dice` vide ne suffit pas à conclure, puisque c'est aussi l'état
 * avant le lancer. Le tour ne se termine que si le lancer a eu lieu.
 */
export const turnIsOver = (state: LudoState): boolean => {
  if (state.status.kind !== 'playing') return false;
  if (state.rolled.length === 0) return false;

  return state.dice.length === 0 || legalLudoMoves(state).length === 0;
};

/** Vrai si le joueur a encore un dé jouable. */
export const turnContinues = (state: LudoState): boolean => {
  if (state.status.kind !== 'playing') return false;
  return state.dice.length > 0 && legalLudoMoves(state).length > 0;
};

/**
 * Vrai si le joueur relance après avoir épuisé ses dés.
 *
 * Il faut un double-six, pas un six. Avec deux dés, un six sort dans près d'un
 * lancer sur trois : rendre la main à chaque fois donnerait des tours qui
 * n'en finissent pas. Le double, lui, tombe une fois sur trente-six — et c'est
 * déjà la combinaison qui force les barrages.
 */
export const earnsExtraRoll = (
  dice: readonly number[],
  extraRolls: number,
): boolean => isDoubleSix(dice) && extraRolls < MAX_EXTRA_ROLLS;

/** Passe la main, dés remis à zéro. */
export const endTurn = (state: LudoState, again: boolean): LudoState => {
  if (state.status.kind !== 'playing') return state;

  return {
    ...state,
    dice: [],
    rolled: [],
    // Une relance poursuit le même tour : les six déjà réunis restent acquis.
    sixesThisTurn: again ? state.sixesThisTurn : 0,
    current: again ? state.current : nextPlayer(state),
    extraRolls: again ? state.extraRolls + 1 : 0,
  };
};
