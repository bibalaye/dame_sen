import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  HANDLE_MAX,
  HANDLE_MIN,
  PASSWORD_MIN,
  checkHandle,
  checkPassword,
  displayNameFrom,
  explainAuthError,
  internalEmail,
  isInternalEmail,
  normalizeHandle,
} from '../account.ts';

describe('forme canonique du pseudo', () => {
  test('la casse ne distingue pas deux joueurs', () => {
    assert.equal(normalizeHandle('Amadou'), normalizeHandle('AMADOU'));
    assert.equal(normalizeHandle('Amadou'), 'amadou');
  });

  test('les accents non plus', () => {
    assert.equal(normalizeHandle('Amádou'), 'amadou');
    assert.equal(normalizeHandle('Ndèye'), 'ndeye');
    assert.equal(normalizeHandle('Sègnane'), 'segnane');
  });

  test('les espaces et tirets deviennent des soulignés', () => {
    assert.equal(normalizeHandle('Ndeye Fatou'), 'ndeye_fatou');
    assert.equal(normalizeHandle('mame-diarra'), 'mame_diarra');
    assert.equal(normalizeHandle('cheikh.anta'), 'cheikh_anta');
  });

  test('les soulignés en trop sont réduits', () => {
    assert.equal(normalizeHandle('__abdou___diouf__'), 'abdou_diouf');
    assert.equal(normalizeHandle('a   b'), 'a_b');
  });

  test('les signes sont écartés', () => {
    assert.equal(normalizeHandle('mo@ussa!'), 'moussa');
    assert.equal(normalizeHandle('🔥 lion 🔥'), 'lion');
  });

  test('un pseudo déjà canonique ne bouge plus', () => {
    const once = normalizeHandle('Ndèye Fatou');
    assert.equal(normalizeHandle(once), once, 'la normalisation est idempotente');
  });
});

describe('validation du pseudo', () => {
  test('un pseudo ordinaire passe', () => {
    assert.ok(checkHandle('Amadou').ok);
    assert.ok(checkHandle('lion_2026').ok);
  });

  test('trop court, il est refusé', () => {
    const check = checkHandle('ab');
    assert.ok(!check.ok);
    if (!check.ok) assert.match(check.reason, new RegExp(String(HANDLE_MIN)));
  });

  test('trop long, il est refusé', () => {
    const check = checkHandle('a'.repeat(HANDLE_MAX + 1));
    assert.ok(!check.ok);
    if (!check.ok) assert.match(check.reason, new RegExp(String(HANDLE_MAX)));
  });

  test('vide, il est refusé sans parler de longueur', () => {
    const check = checkHandle('   ');
    assert.ok(!check.ok);
  });

  test('fait uniquement de signes, il est refusé', () => {
    assert.ok(!checkHandle('!!!!!!').ok);
    const check = checkHandle('@@@@@@');
    assert.ok(!check.ok);
    // Le message parle du contenu, pas de la longueur.
    if (!check.ok) assert.match(check.reason, /lettres ou des chiffres/);
  });

  test('les soulignés de tête sont retirés, pas refusés', () => {
    assert.ok(checkHandle('_amadou').ok);
    assert.equal(normalizeHandle('_amadou'), 'amadou');
  });

  test('les pseudos réservés sont protégés, quelle que soit leur écriture', () => {
    for (const essai of ['admin', 'Admin', 'ADMIN', 'Ádmin', 'moderateur']) {
      assert.ok(!checkHandle(essai).ok, `${essai} devrait être réservé`);
    }
  });

  test('la longueur se juge après normalisation', () => {
    // Cinq caractères tapés, trois une fois les signes retirés : c'est la
    // forme conservée qui compte, pas la saisie.
    assert.ok(checkHandle('a!b!c').ok);
    assert.ok(!checkHandle('a!b!!').ok);
  });
});

describe('validation du mot de passe', () => {
  test('assez long, il passe', () => {
    assert.ok(checkPassword('a'.repeat(PASSWORD_MIN)).ok);
  });

  test('trop court, il est refusé', () => {
    assert.ok(!checkPassword('a'.repeat(PASSWORD_MIN - 1)).ok);
  });

  test('aucune exigence de composition', () => {
    assert.ok(checkPassword('bonjour').ok, 'pas de majuscule ni de chiffre imposés');
  });
});

describe('adresse interne', () => {
  test('elle est déterministe', () => {
    assert.equal(internalEmail('Amadou'), internalEmail('Amadou'));
  });

  test('les variantes d’un même pseudo donnent la même adresse', () => {
    assert.equal(internalEmail('Amádou'), internalEmail('amadou'));
    assert.equal(internalEmail('Ndeye Fatou'), internalEmail('ndeye-fatou'));
  });

  test('deux pseudos distincts donnent deux adresses distinctes', () => {
    assert.notEqual(internalEmail('amadou'), internalEmail('moussa'));
  });

  test('elle a la forme d’une adresse', () => {
    assert.match(internalEmail('lion_2026'), /^[a-z0-9_]+@[a-z0-9.-]+$/);
  });

  test('on la reconnaît comme fabriquée', () => {
    assert.ok(isInternalEmail(internalEmail('amadou')));
    assert.ok(!isInternalEmail('quelquun@gmail.com'));
  });
});

describe('nom affiché', () => {
  test('la casse et les accents sont conservés', () => {
    assert.equal(displayNameFrom('Ndèye Fatou'), 'Ndèye Fatou');
  });

  test('les espaces en trop disparaissent', () => {
    assert.equal(displayNameFrom('  Amadou   Ba  '), 'Amadou Ba');
  });

  test('il est tronqué à la longueur maximale', () => {
    assert.equal(displayNameFrom('a'.repeat(50)).length, HANDLE_MAX);
  });
});

describe('messages d’erreur', () => {
  test('un pseudo déjà pris est annoncé clairement', () => {
    assert.match(explainAuthError('User already registered', 'signup'), /déjà pris/);
  });

  test('à la connexion, on ne dit pas lequel des deux est faux', () => {
    const message = explainAuthError('Invalid login credentials', 'signin');
    assert.match(message, /Pseudo ou mot de passe/);
  });

  test('une erreur inconnue reste compréhensible', () => {
    const message = explainAuthError('quelque chose d’imprévu', 'signup');
    assert.ok(message.length > 0);
    assert.ok(!message.includes('imprévu'), 'le message brut n’est pas recraché');
  });

  test('la coupure réseau se distingue d’un refus', () => {
    assert.match(explainAuthError('Failed to fetch', 'signin'), /réseau/);
  });
});
