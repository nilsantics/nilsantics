'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const D = E.data;

function seq(values) {
  let i = 0;
  return function () { return values[i++ % values.length]; };
}

test('content is complete and ids are unique', function () {
  assert.equal(D.GENERATORS.length, 12);
  assert.equal(D.BOOKS.length, 66);
  assert.equal(D.BOOKS.filter(function (b) { return b.testament === 'old'; }).length, 39);
  assert.equal(D.BOOKS[0].name, 'Genesis');
  assert.equal(D.BOOKS[65].name, 'Revelation');
  D.GENERATORS.forEach(function (g) { assert.equal(g.upgrades.length, 5, g.id); });
  const ids = E.UPGRADES.map(function (u) { return u.id; });
  assert.equal(new Set(ids).size, ids.length);
  D.GENERATORS.forEach(function (g, i) {
    if (i > 0) assert.ok(g.baseCost > D.GENERATORS[i - 1].baseCost, 'costs rise');
  });
});

test('bulk cost equals the sum of single purchases', function () {
  let sum = 0;
  for (let k = 0; k < 10; k++) sum += E.nextCost('fisherman', 3 + k);
  assert.ok(Math.abs(E.bulkCost('fisherman', 3, 10) - sum) < 1e-6 * sum);
});

test('buying is all or nothing, and max buys as many as affordable', function () {
  const s = E.createState(0);
  s.faith = 14;
  assert.equal(E.buyGenerator(s, 'shepherd', 1), 0);
  assert.equal(s.faith, 14);
  s.faith = 1000;
  const n = E.maxAffordable('shepherd', 0, 1000);
  assert.ok(E.bulkCost('shepherd', 0, n) <= 1000);
  assert.ok(E.bulkCost('shepherd', 0, n + 1) > 1000);
  assert.equal(E.buyGenerator(s, 'shepherd', 'max'), n);
  assert.equal(s.owned.shepherd, n);
  assert.ok(s.faith >= 0 && s.faith < E.nextCost('shepherd', n));
  assert.equal(E.buyGenerator(s, 'nonsense', 1), 0);
});

test('production combines works, upgrades, books, blessings and buffs', function () {
  const s = E.createState(0);
  s.owned.fisherman = 10;
  assert.equal(E.productionPerSecond(s), 10);
  s.upgrades['fisherman-1'] = true;
  assert.equal(E.productionPerSecond(s), 20);
  s.books = 10; // +20%
  assert.ok(Math.abs(E.productionPerSecond(s) - 24) < 1e-9);
  s.blessings = 50; // +100%
  assert.ok(Math.abs(E.productionPerSecond(s) - 48) < 1e-9);
  s.buffs.loaves = 10;
  assert.ok(Math.abs(E.productionPerSecond(s) - 48 * 7) < 1e-9);
  assert.ok(Math.abs(E.productionPerSecond(s, false) - 48) < 1e-9);
});

test('prayer power grows with upgrades and Tongues of Fire', function () {
  const s = E.createState(0);
  assert.equal(E.click(s), 1);
  assert.equal(s.clicks, 1);
  s.upgrades['prayer-bread'] = true;
  s.upgrades['prayer-fervent'] = true;
  assert.equal(E.clickPower(s), 4);
  s.owned.sower = 100; // 800 per second
  s.upgrades['prayer-mustard'] = true;
  assert.equal(E.clickPower(s), 4 + 8);
  s.buffs.fire = 5;
  assert.equal(E.clickPower(s), (4 + 8) * 77);
});

test('upgrades unlock by their condition and can only be bought once', function () {
  const s = E.createState(0);
  assert.equal(E.availableUpgrades(s).length, 0);
  s.owned.shepherd = 1;
  const avail = E.availableUpgrades(s).map(function (u) { return u.id; });
  assert.deepEqual(avail, ['shepherd-1']);
  assert.equal(E.buyUpgrade(s, 'shepherd-1'), false); // cannot afford
  s.faith = 1000;
  assert.equal(E.buyUpgrade(s, 'shepherd-1'), true);
  assert.equal(s.faith, 850);
  assert.equal(E.buyUpgrade(s, 'shepherd-1'), false);
  assert.equal(E.buyUpgrade(s, 'shepherd-2'), false); // needs 5 shepherds
});

test('buy all takes the cheapest affordable upgrades', function () {
  const s = E.createState(0);
  s.owned.shepherd = 5;
  s.owned.fisherman = 1;
  s.faith = 1000; // shepherd-1 150, shepherd-2 750, fisherman-1 1000
  assert.equal(E.buyAllUpgrades(s), 2);
  assert.ok(E.has(s, 'shepherd-1') && E.has(s, 'shepherd-2'));
  assert.ok(!E.has(s, 'fisherman-1'));
  assert.equal(s.faith, 100);
});

test('books are read in order as all-time Faith doubles', function () {
  const s = E.createState(0);
  assert.deepEqual(E.checkBooks(s).map(function (b) { return b.name; }), ['Genesis']);
  E.earn(s, 99);
  assert.equal(E.checkBooks(s).length, 0);
  E.earn(s, 1);
  assert.deepEqual(E.checkBooks(s).map(function (b) { return b.name; }), ['Exodus']);
  E.earn(s, 1e30);
  E.checkBooks(s);
  assert.equal(s.books, 66);
  assert.equal(E.bookThreshold(2), 200);
});

test('blessings follow the cube root of all-time Faith', function () {
  assert.equal(E.blessingsFor(999999), 0);
  assert.equal(E.blessingsFor(1e6), 1);
  assert.equal(E.blessingsFor(8e6), 2);
  assert.equal(E.blessingsFor(1e9), 10);
  const s = E.createState(0);
  E.earn(s, 1e9);
  assert.equal(E.pendingBlessings(s), 10);
  assert.equal(E.nextBlessingAt(s), 11 * 11 * 11 * 1e6);
});

test('a Jubilee releases works and upgrades but keeps books, blessings and Sabbath', function () {
  const s = E.createState(0);
  assert.equal(E.jubilee(s, 0), 0, 'nothing to gain yet');
  s.owned.temple = 3;
  s.upgrades['temple-1'] = true;
  s.upgrades.sabbath = true;
  s.buffs.loaves = 30;
  E.earn(s, 1e9);
  E.checkBooks(s);
  const books = s.books;
  assert.equal(E.jubilee(s, 5000), 10);
  assert.equal(s.blessings, 10);
  assert.equal(s.jubilees, 1);
  assert.equal(s.faith, 0);
  assert.equal(s.runFaith, 0);
  assert.equal(s.allTimeFaith, 1e9);
  assert.equal(s.owned.temple, 0);
  assert.equal(E.has(s, 'temple-1'), false);
  assert.equal(E.has(s, 'sabbath'), true);
  assert.deepEqual(s.buffs, {});
  assert.equal(s.books, books);
  assert.equal(s.runStartedAt, 5000);
  assert.equal(E.pendingBlessings(s), 0);
});

test('tick earns Faith, runs out buffs and schedules manna', function () {
  const s = E.createState(0);
  s.owned.fisherman = 2;
  s.buffs.loaves = 0.5;
  s.mannaIn = 0.5;
  const events = E.tick(s, 1, seq([0]));
  assert.equal(s.faith, 2 + 2 * 6 * 0.5); // the ×7 only for the half second it lasted
  const types = events.map(function (e) { return e.type; }).sort();
  assert.deepEqual(types, ['book', 'buffEnd', 'manna']);
  assert.equal(s.mannaIn, 90);
  assert.equal(E.tick(s, 0).length, 0);
});

test('manna gives Faith early, and timed blessings once works produce', function () {
  const s = E.createState(0);
  let r = E.catchManna(s, seq([0.1]));
  assert.equal(r.effect.id, 'manna');
  assert.equal(s.faith, 13);
  assert.equal(s.mannaCaught, 1);

  s.owned.sower = 10; // 80 per second
  r = E.catchManna(s, seq([0.7]));
  assert.equal(r.effect.id, 'loaves');
  assert.equal(s.buffs.loaves, 77);
  r = E.catchManna(s, seq([0.95]));
  assert.equal(r.effect.id, 'fire');
  s.upgrades.baskets = true;
  r = E.catchManna(s, seq([0.95]));
  assert.equal(r.duration, 26);

  s.faith = 1e9;
  r = E.catchManna(s, seq([0.0]));
  assert.equal(r.amount, 80 * 900 + 13); // capped at 15 minutes of production
});

test('offline time pays half without the Sabbath, all with it, up to a day', function () {
  const s = E.createState(0);
  s.owned.fisherman = 10;
  s.buffs.loaves = 50;
  let r = E.applyOffline(s, 100, seq([0]));
  assert.equal(r.gain, 500);
  assert.deepEqual(s.buffs, {}, 'buffs run out and do not apply offline');
  s.upgrades.sabbath = true;
  const rate = E.productionPerSecond(s, false); // books read so far add to it
  r = E.applyOffline(s, 100);
  assert.equal(r.gain, rate * 100);
  r = E.applyOffline(s, 3 * 86400);
  assert.equal(r.seconds, 86400);
  assert.equal(r.capped, true);
  assert.ok(s.mannaIn > 0 && s.mannaIn <= 30, 'manna is due soon after returning');
});

test('saves round-trip and bad fields are dropped', function () {
  const s = E.createState(123);
  s.owned.prophet = 7;
  s.upgrades['prophet-1'] = true;
  s.faith = 1234.5;
  s.allTimeFaith = 9999;
  s.runFaith = 5000;
  const back = E.deserialize(E.serialize(s), 0);
  assert.deepEqual(back, s);

  const messy = JSON.stringify({
    version: 1, faith: 'lots', owned: { shepherd: -4, fisherman: 2.7, dragon: 9 },
    upgrades: { 'shepherd-1': true, hacked: true, 'fisherman-1': 'yes' },
    buffs: { loaves: 20, fake: 3 }, books: 500, runFaith: 1e9, allTimeFaith: 10,
  });
  const clean = E.deserialize(messy, 0);
  assert.equal(clean.faith, 0);
  assert.equal(clean.owned.shepherd, 0);
  assert.equal(clean.owned.fisherman, 2);
  assert.equal('dragon' in clean.owned, false);
  assert.deepEqual(clean.upgrades, { 'shepherd-1': true });
  assert.deepEqual(clean.buffs, { loaves: 20 });
  assert.equal(clean.books, 66);
  assert.equal(clean.runFaith, 10);

  assert.throws(function () { E.deserialize('{"hello":1}'); });
  assert.throws(function () { E.deserialize('not json'); });
});

test('save codes encode and decode, and reject junk with a clear message', function () {
  const s = E.createState(0);
  s.faith = 42;
  const code = E.encodeSave(s);
  assert.ok(code.startsWith('MS1.'));
  assert.equal(E.decodeSave('  ' + code + '\n').faith, 42);
  assert.throws(function () { E.decodeSave('MS1.!!!'); }, /incomplete or mistyped/);
  assert.throws(function () { E.decodeSave(''); }, /incomplete or mistyped/);
});

test('numbers are formatted readably and never round up', function () {
  assert.equal(E.formatNumber(0), '0');
  assert.equal(E.formatNumber(999.9), '999');
  assert.equal(E.formatNumber(12345), '12,345');
  assert.equal(E.formatNumber(4.56, { decimals: true }), '4.5');
  assert.equal(E.formatNumber(1999999), '1.99M');
  assert.equal(E.formatNumber(9e17), '900Qa');
  assert.equal(E.formatNumber(1.5e9, { long: true }), '1.5 billion');
  assert.equal(E.formatNumber(2.5e40), '2.50e40');
  assert.equal(E.formatNumber(Infinity), '∞');
  assert.equal(E.formatNumber(NaN), '0');
  assert.equal(E.formatDuration(59), '59s');
  assert.equal(E.formatDuration(3725), '1h 2m');
  assert.equal(E.formatDuration(90061), '1d 1h');
  assert.equal(E.formatClock(75.2), '1:16');
});
