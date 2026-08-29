/**
 * Le serveur de parties, avec de vrais clients.
 *
 * Un protocole ne se vérifie pas à la lecture : il faut deux connexions qui
 * s'envoient réellement les messages. Ce fichier démarre le serveur, ouvre deux
 * clients et joue les échanges qu'une partie en ligne produit.
 *
 *   npm run test:server
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

import { io } from 'socket.io-client';

/** Un port peu susceptible d'être déjà pris par le serveur de développement. */
const PORT = 5199;
const URL = `http://localhost:${PORT}`;

let serveur;
const clients = [];

/** Attend un événement, ou échoue plutôt que de bloquer la suite indéfiniment. */
const attendre = (socket, event, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`« ${event} » jamais reçu`)),
      timeout,
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data ?? {});
    });
  });

/** Vrai si l'événement n'arrive pas dans le délai : c'est ce qu'on veut vérifier. */
const nArrivePas = async (socket, event, delai = 350) => {
  let vu = false;
  const marquer = () => {
    vu = true;
  };
  socket.once(event, marquer);
  await new Promise((r) => setTimeout(r, delai));
  socket.off(event, marquer);
  return !vu;
};

const nouveauClient = () => {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return socket;
};

/** Une salle ouverte avec deux joueurs dedans. */
const salleAvecDeuxJoueurs = async () => {
  const a = nouveauClient();
  const b = nouveauClient();
  await Promise.all([attendre(a, 'connect'), attendre(b, 'connect')]);

  a.emit('create-room', { username: 'Amadou', game: 'dames' });
  const creation = await attendre(a, 'room-created');

  b.emit('join-room', { roomId: creation.roomId, username: 'Moussa' });
  const arrivee = await attendre(b, 'room-joined');
  await attendre(a, 'game-start');

  return { a, b, roomId: creation.roomId, couleurA: creation.player, couleurB: arrivee.player };
};

before(async () => {
  /*
   * Un serveur laissé en marche par une exécution précédente répondrait à
   * notre place, et les tests porteraient sur lui — ou échoueraient sur un
   * « le serveur n'a pas démarré » qui n'explique rien.
   */
  try {
    const dejaLa = await fetch(`${URL}/healthz`);
    if (dejaLa.ok) {
      throw new Error(
        `Le port ${PORT} est déjà occupé. Arrêtez le serveur qui y répond avant de relancer les tests.`,
      );
    }
  } catch (cause) {
    if (String(cause.message).includes('déjà occupé')) throw cause;
    // Aucune réponse : le port est libre, c'est ce qu'on veut.
  }

  serveur = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  // On attend que le port réponde plutôt que de dormir un temps arbitraire.
  for (let essai = 0; essai < 40; essai++) {
    try {
      const reponse = await fetch(`${URL}/healthz`);
      if (reponse.ok) return;
    } catch {
      // Pas encore prêt.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('le serveur n’a pas démarré');
});

after(() => {
  for (const socket of clients) socket.close();
  serveur?.kill();
});

describe('salle', () => {
  test('le créateur prend les blancs, celui qui rejoint les noirs', async () => {
    const { couleurA, couleurB } = await salleAvecDeuxJoueurs();

    assert.equal(couleurA, 'white');
    assert.equal(couleurB, 'black');
  });

  test('une salle inconnue est refusée', async () => {
    const seul = nouveauClient();
    await attendre(seul, 'connect');

    seul.emit('join-room', { roomId: 'ZZZZZZ', username: 'Personne' });
    const erreur = await attendre(seul, 'error');

    assert.match(erreur.message, /not found/i);
  });

  test('un coup parvient à l’adversaire', async () => {
    const { a, b, roomId } = await salleAvecDeuxJoueurs();

    const recu = attendre(b, 'opponent-move');
    a.emit('make-move', {
      roomId,
      move: { fromRow: 1, fromCol: 0, toRow: 2, toCol: 0 },
      nextPlayer: 'black',
    });

    const { move } = await recu;
    assert.equal(move.fromRow, 1);
    assert.equal(move.toRow, 2);
  });
});

describe('revanche', () => {
  test('une seule demande ne relance pas la partie', async () => {
    const { a, b, roomId } = await salleAvecDeuxJoueurs();

    const offerte = attendre(b, 'rematch-offered');
    a.emit('rematch-request', { roomId });
    await offerte;

    assert.ok(
      await nArrivePas(a, 'rematch-start'),
      'la partie ne doit pas repartir tant que l’autre n’a pas répondu',
    );
  });

  test('quand les deux acceptent, la partie repart et les couleurs s’échangent', async () => {
    const { a, b, roomId } = await salleAvecDeuxJoueurs();

    const departA = attendre(a, 'rematch-start');
    const departB = attendre(b, 'rematch-start');

    a.emit('rematch-request', { roomId });
    b.emit('rematch-request', { roomId });

    const [nouveauA, nouveauB] = await Promise.all([departA, departB]);

    // Sur un plateau où le trait compte, refaire dix parties du même côté
    // n'aurait rien d'un affrontement égal.
    assert.equal(nouveauA.player, 'black');
    assert.equal(nouveauB.player, 'white');
    assert.equal(nouveauA.game, 'dames');
  });

  test('chaque revanche ré-échange les couleurs', async () => {
    const { a, b, roomId } = await salleAvecDeuxJoueurs();

    for (const attendu of ['black', 'white']) {
      const depart = attendre(a, 'rematch-start');
      a.emit('rematch-request', { roomId });
      b.emit('rematch-request', { roomId });

      assert.equal((await depart).player, attendu);
    }
  });

  test('la liste des joueurs porte les nouvelles couleurs', async () => {
    const { a, b, roomId } = await salleAvecDeuxJoueurs();

    const depart = attendre(a, 'rematch-start');
    a.emit('rematch-request', { roomId });
    b.emit('rematch-request', { roomId });
    const { players } = await depart;

    assert.ok(
      players.some((p) => p.username === 'Moussa' && p.player === 'white'),
      'celui qui rejoint doit être passé aux blancs',
    );
  });

  test('un refus remonte à celui qui a proposé', async () => {
    const { a, b, roomId } = await salleAvecDeuxJoueurs();

    const refus = attendre(a, 'rematch-declined');
    a.emit('rematch-request', { roomId });
    await attendre(b, 'rematch-offered');
    b.emit('rematch-decline', { roomId });

    await refus;
  });

  test('un refus efface les demandes en attente', async () => {
    const { a, b, roomId } = await salleAvecDeuxJoueurs();

    a.emit('rematch-request', { roomId });
    await attendre(b, 'rematch-offered');
    b.emit('rematch-decline', { roomId });
    await attendre(a, 'rematch-declined');

    // Sans effacement, cette seule demande suffirait à relancer la partie.
    a.emit('rematch-request', { roomId });
    assert.ok(await nArrivePas(a, 'rematch-start'));
  });

  test('demander deux fois de son côté ne relance rien', async () => {
    const { a, roomId } = await salleAvecDeuxJoueurs();

    a.emit('rematch-request', { roomId });
    a.emit('rematch-request', { roomId });

    assert.ok(
      await nArrivePas(a, 'rematch-start'),
      'il faut deux joueurs distincts, pas deux clics',
    );
  });

  test('le départ d’un joueur annule la demande en cours', async () => {
    const { a, b, roomId } = await salleAvecDeuxJoueurs();

    a.emit('rematch-request', { roomId });
    await attendre(b, 'rematch-offered');

    b.close();
    await attendre(a, 'opponent-disconnected');

    // Un nouvel arrivant ne doit pas se retrouver embarqué dans une revanche
    // décidée avant lui.
    const c = nouveauClient();
    await attendre(c, 'connect');
    c.emit('join-room', { roomId, username: 'Fatou' });
    await attendre(c, 'room-joined');

    c.emit('rematch-request', { roomId });
    assert.ok(await nArrivePas(c, 'rematch-start'));
  });
});
