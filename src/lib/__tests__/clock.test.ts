import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  TIME_CONTROLS,
  createClock,
  flaggedPlayer,
  formatTime,
  isCritical,
  startClock,
  stopClock,
  switchClock,
  tickClock,
} from '../clock.ts';

describe('pendule', () => {
  test('sans limite de temps, rien ne se décompte', () => {
    let clock = createClock('none', 0);
    clock = startClock(clock, 'white', 0);
    clock = tickClock(clock, 60_000);
    assert.equal(clock.remaining.white, 0);
    assert.equal(flaggedPlayer(clock), null);
  });

  test('le blitz démarre à trois minutes chacun', () => {
    const clock = createClock('blitz', 0);
    assert.equal(clock.remaining.white, 180_000);
    assert.equal(clock.remaining.black, 180_000);
    assert.equal(clock.running, null, 'la pendule attend le premier coup');
  });

  test('seul le joueur au trait perd du temps', () => {
    let clock = createClock('blitz', 0);
    clock = startClock(clock, 'white', 0);
    clock = tickClock(clock, 5_000);

    assert.equal(clock.remaining.white, 175_000);
    assert.equal(clock.remaining.black, 180_000);
  });

  test('passer la main crédite l’incrément et lance l’adversaire', () => {
    let clock = createClock('blitz', 0);
    clock = startClock(clock, 'white', 0);
    clock = switchClock(clock, 'white', 'black', 10_000);

    // 3 min − 10 s écoulées + 2 s d'incrément.
    assert.equal(clock.remaining.white, 172_000);
    assert.equal(clock.running, 'black');
  });

  test('l’éclair n’accorde aucun incrément', () => {
    let clock = createClock('bullet', 0);
    clock = startClock(clock, 'white', 0);
    clock = switchClock(clock, 'white', 'black', 5_000);

    assert.equal(clock.remaining.white, 55_000);
    assert.equal(TIME_CONTROLS.bullet.incrementMs, 0);
  });

  test('le temps ne descend jamais sous zéro', () => {
    let clock = createClock('bullet', 0);
    clock = startClock(clock, 'white', 0);
    clock = tickClock(clock, 90_000);

    assert.equal(clock.remaining.white, 0);
    assert.equal(clock.running, null, 'la pendule s’arrête au drapeau');
    assert.equal(flaggedPlayer(clock), 'white');
  });

  test('un joueur au drapeau ne reçoit pas d’incrément', () => {
    let clock = createClock('blitz', 0);
    clock = startClock(clock, 'white', 0);
    clock = switchClock(clock, 'white', 'black', 200_000);

    assert.equal(clock.remaining.white, 0);
    assert.equal(clock.running, null);
  });

  test('arrêter la pendule fige le temps restant', () => {
    let clock = createClock('blitz', 0);
    clock = startClock(clock, 'white', 0);
    clock = stopClock(clock, 4_000);
    const frozen = clock.remaining.white;

    clock = tickClock(clock, 60_000);
    assert.equal(clock.remaining.white, frozen);
  });
});

describe('affichage du temps', () => {
  test('les minutes sont écrites en clair', () => {
    assert.equal(formatTime(180_000), '3:00');
    assert.equal(formatTime(65_000), '1:05');
    assert.equal(formatTime(10_000), '0:10');
  });

  test('sous dix secondes, le dixième apparaît', () => {
    assert.equal(formatTime(9_400), '9.4');
    assert.equal(formatTime(500), '0.5');
  });

  test('le temps négatif est ramené à zéro', () => {
    assert.equal(formatTime(-5_000), '0.0');
  });

  test('l’alerte se déclenche sous dix secondes', () => {
    assert.equal(isCritical(9_999), true);
    assert.equal(isCritical(10_001), false);
    assert.equal(isCritical(0), false, 'à zéro, ce n’est plus une alerte mais la fin');
  });
});
