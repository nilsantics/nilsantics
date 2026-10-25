/*
 * Mustard Seed: game rules.
 * Pure functions over a plain state object, so the same code runs in the
 * browser and in Node tests. No DOM access here.
 */
(function (root, factory) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const data = isNode ? require('./data.js') : root.MustardSeedData;
  const api = factory(data);
  if (isNode) module.exports = api;
  else root.MustardSeedEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  const SAVE_VERSION = 1;
  const SAVE_PREFIX = 'MS1.';

  const COST_GROWTH = 1.15;
  // Generator upgrade tiers: unlocked at `req` owned, cost = base cost × `mult`.
  const TIERS = [
    { req: 1, mult: 10 },
    { req: 5, mult: 50 },
    { req: 25, mult: 500 },
    { req: 50, mult: 50000 },
    { req: 100, mult: 5e6 },
  ];

  const BOOK_BONUS = 0.02;         // +2% all Faith per book read
  const BOOK_FIRST = 100;          // Exodus unlocks at this much all-time Faith
  const BOOK_GROWTH = 2;           // each later book needs twice as much

  const BLESSING_BONUS = 0.02;     // +2% all Faith per Blessing
  const BLESSING_UNIT = 1e6;       // blessings = floor(cbrt(all-time Faith / unit))

  const OFFLINE_CAP = 24 * 3600;   // seconds
  const OFFLINE_RATE = 0.5;        // without the Sabbath upgrade

  const MANNA_MIN = 90;            // seconds between manna falls
  const MANNA_SPREAD = 150;
  const MANNA_FIRST = 45;          // first fall comes sooner
  const MANNA_LIFETIME = 13;       // seconds it stays on screen

  // ---- Upgrade catalogue -------------------------------------------------

  const GEN_BY_ID = {};
  D.GENERATORS.forEach(function (g) { GEN_BY_ID[g.id] = g; });

  const UPGRADES = [];
  D.GENERATORS.forEach(function (g) {
    g.upgrades.forEach(function (u, t) {
      UPGRADES.push({
        id: g.id + '-' + (t + 1),
        kind: 'gen', gen: g.id, tier: t,
        name: u[0], ref: u[1],
        cost: g.baseCost * TIERS[t].mult,
        unlock: { type: 'owned', gen: g.id, n: TIERS[t].req },
        effect: g.plural + ' are twice as effective.',
      });
    });
  });
  D.PRAYER_UPGRADES.forEach(function (u) {
    UPGRADES.push({
      id: 'prayer-' + u.id, kind: 'prayer', name: u.name, ref: u.ref, cost: u.cost,
      mult: u.mult || 1, fpsShare: u.fpsShare || 0,
      unlock: { type: 'clicks', n: u.clicks },
      effect: u.mult
        ? 'Each prayer brings ' + u.mult + '× as much Faith.'
        : 'Each prayer also brings ' + Math.round(u.fpsShare * 100) + '% of your Faith per second.',
    });
  });
  D.GLOBAL_UPGRADES.forEach(function (u) {
    UPGRADES.push({
      id: 'global-' + u.id, kind: 'global', name: u.name, ref: u.ref, cost: u.cost, mult: u.mult,
      unlock: { type: 'runFaith', n: u.cost / 3 },
      effect: 'All Faith +' + Math.round((u.mult - 1) * 100) + '%.',
    });
  });
  D.SPECIAL_UPGRADES.forEach(function (u) {
    UPGRADES.push({
      id: u.id, kind: 'special', name: u.name, ref: u.ref, cost: u.cost,
      unlock: u.unlock, effect: u.effect,
    });
  });

  const UPGRADE_BY_ID = {};
  UPGRADES.forEach(function (u) { UPGRADE_BY_ID[u.id] = u; });

  const BUFFS = {};
  D.MANNA_EFFECTS.forEach(function (e) { if (e.duration) BUFFS[e.id] = e; });

  // ---- State -------------------------------------------------------------

  function createState(now) {
    const owned = {};
    D.GENERATORS.forEach(function (g) { owned[g.id] = 0; });
    const t = typeof now === 'number' ? now : Date.now();
    return {
      version: SAVE_VERSION,
      faith: 0,          // Faith on hand
      runFaith: 0,       // gathered since the last Jubilee
      allTimeFaith: 0,   // gathered ever
      clicks: 0,         // prayers ever
      clickFaith: 0,     // Faith from prayers ever
      owned: owned,
      upgrades: {},      // id -> true
      books: 0,          // how many books have been read (in canonical order)
      blessings: 0,
      jubilees: 0,
      buffs: {},         // id -> seconds remaining
      mannaIn: MANNA_FIRST,
      mannaCaught: 0,
      playTime: 0,       // seconds with the game open
      startedAt: t,
      runStartedAt: t,
      lastSaved: t,
    };
  }

  function has(state, id) { return state.upgrades[id] === true; }

  function earn(state, amount) {
    if (!(amount > 0)) return;
    state.faith += amount;
    state.runFaith += amount;
    state.allTimeFaith += amount;
  }

  function spend(state, amount) {
    state.faith = Math.max(0, state.faith - amount);
  }

  // ---- Production --------------------------------------------------------

  function genMultiplier(state, id) {
    let m = 1;
    for (let t = 0; t < TIERS.length; t++) if (has(state, id + '-' + (t + 1))) m *= 2;
    return m;
  }

  // Everything that scales all Faith, without timed blessings.
  function baseMultiplier(state) {
    let m = (1 + state.blessings * BLESSING_BONUS) * (1 + state.books * BOOK_BONUS);
    D.GLOBAL_UPGRADES.forEach(function (u) { if (has(state, 'global-' + u.id)) m *= u.mult; });
    return m;
  }

  function buffActive(state, id) { return state.buffs[id] > 0; }

  function productionMultiplier(state, withBuffs) {
    let m = baseMultiplier(state);
    if (withBuffs !== false && buffActive(state, 'loaves')) m *= BUFFS.loaves.mult;
    return m;
  }

  // Faith per second from one of a given work.
  function unitRate(state, id, withBuffs) {
    return GEN_BY_ID[id].baseRate * genMultiplier(state, id) * productionMultiplier(state, withBuffs);
  }

  function genRate(state, id, withBuffs) {
    return state.owned[id] * unitRate(state, id, withBuffs);
  }

  function productionPerSecond(state, withBuffs) {
    let total = 0;
    D.GENERATORS.forEach(function (g) {
      if (state.owned[g.id] > 0) total += state.owned[g.id] * g.baseRate * genMultiplier(state, g.id);
    });
    return total * productionMultiplier(state, withBuffs);
  }

  function clickPower(state) {
    let mult = 1;
    let share = 0;
    D.PRAYER_UPGRADES.forEach(function (u) {
      if (!has(state, 'prayer-' + u.id)) return;
      if (u.mult) mult *= u.mult;
      if (u.fpsShare) share += u.fpsShare;
    });
    let p = mult * baseMultiplier(state) + productionPerSecond(state) * share;
    if (buffActive(state, 'fire')) p *= BUFFS.fire.mult;
    return p;
  }

  function click(state) {
    const gain = clickPower(state);
    state.clicks += 1;
    state.clickFaith += gain;
    earn(state, gain);
    return gain;
  }

  // ---- Buying works ------------------------------------------------------

  function nextCost(id, owned) {
    return GEN_BY_ID[id].baseCost * Math.pow(COST_GROWTH, owned);
  }

  // Total cost of buying `n` more when `owned` are already owned.
  function bulkCost(id, owned, n) {
    if (n <= 0) return 0;
    return nextCost(id, owned) * (Math.pow(COST_GROWTH, n) - 1) / (COST_GROWTH - 1);
  }

  function maxAffordable(id, owned, bank) {
    const first = nextCost(id, owned);
    if (bank < first) return 0;
    let n = Math.floor(Math.log(bank * (COST_GROWTH - 1) / first + 1) / Math.log(COST_GROWTH));
    // Guard against floating-point drift at the edges.
    while (n > 0 && bulkCost(id, owned, n) > bank) n--;
    while (bulkCost(id, owned, n + 1) <= bank) n++;
    return n;
  }

  // `amount` is a count or 'max'. Buys all or nothing. Returns how many were bought.
  function buyGenerator(state, id, amount) {
    if (!GEN_BY_ID[id]) return 0;
    const owned = state.owned[id];
    const n = amount === 'max' ? maxAffordable(id, owned, state.faith) : Math.floor(amount);
    if (!(n > 0)) return 0;
    const cost = bulkCost(id, owned, n);
    if (cost > state.faith) return 0;
    spend(state, cost);
    state.owned[id] = owned + n;
    return n;
  }

  // A work is shown once owned, once nearly affordable, or if it is the first.
  function isRevealed(state, index) {
    const g = D.GENERATORS[index];
    return index === 0 || state.owned[g.id] > 0 || state.runFaith >= g.baseCost * 0.5;
  }

  // ---- Upgrades ----------------------------------------------------------

  function isUnlocked(state, u) {
    const r = u.unlock;
    switch (r.type) {
      case 'owned': return state.owned[r.gen] >= r.n;
      case 'clicks': return state.clicks >= r.n;
      case 'runFaith': return state.runFaith >= r.n;
      case 'manna': return state.mannaCaught >= r.n;
      default: return false;
    }
  }

  function availableUpgrades(state) {
    return UPGRADES
      .filter(function (u) { return !has(state, u.id) && isUnlocked(state, u); })
      .sort(function (a, b) { return a.cost - b.cost; });
  }

  function purchasedUpgrades(state) {
    return UPGRADES.filter(function (u) { return has(state, u.id); });
  }

  function buyUpgrade(state, id) {
    const u = UPGRADE_BY_ID[id];
    if (!u || has(state, id) || !isUnlocked(state, u) || state.faith < u.cost) return false;
    spend(state, u.cost);
    state.upgrades[id] = true;
    return true;
  }

  // Buys every affordable upgrade, cheapest first. Returns how many.
  function buyAllUpgrades(state) {
    let count = 0;
    const list = availableUpgrades(state);
    for (let i = 0; i < list.length; i++) {
      if (list[i].cost > state.faith) break;
      if (buyUpgrade(state, list[i].id)) count++;
    }
    return count;
  }

  // ---- Scripture ---------------------------------------------------------

  // All-time Faith needed to read book `i` (0 = Genesis, read at once).
  function bookThreshold(i) {
    if (i <= 0) return 0;
    return BOOK_FIRST * Math.pow(BOOK_GROWTH, i - 1);
  }

  function checkBooks(state) {
    const read = [];
    while (state.books < D.BOOKS.length && state.allTimeFaith >= bookThreshold(state.books)) {
      read.push(D.BOOKS[state.books]);
      state.books += 1;
    }
    return read;
  }

  // ---- Jubilee -----------------------------------------------------------

  function blessingsFor(allTimeFaith) {
    // The small nudge keeps exact cubes (e.g. 1e9) from rounding down.
    return Math.floor(Math.cbrt(Math.max(0, allTimeFaith) / BLESSING_UNIT) + 1e-9);
  }

  function pendingBlessings(state) {
    return Math.max(0, blessingsFor(state.allTimeFaith) - state.blessings);
  }

  // All-time Faith needed before one more Blessing is waiting.
  function nextBlessingAt(state) {
    const target = Math.max(blessingsFor(state.allTimeFaith), state.blessings) + 1;
    return target * target * target * BLESSING_UNIT;
  }

  function canJubilee(state) { return pendingBlessings(state) >= 1; }

  // Releases this age's works and upgrades in exchange for Blessings.
  function jubilee(state, now) {
    const gained = pendingBlessings(state);
    if (gained < 1) return 0;
    const fresh = createState(now);
    state.blessings += gained;
    state.jubilees += 1;
    state.faith = 0;
    state.runFaith = 0;
    state.owned = fresh.owned;
    // Sabbath and manna upgrades are kept; everything else is released.
    const kept = {};
    Object.keys(state.upgrades).forEach(function (id) {
      if (UPGRADE_BY_ID[id] && UPGRADE_BY_ID[id].kind === 'special') kept[id] = true;
    });
    state.upgrades = kept;
    state.buffs = {};
    state.runStartedAt = fresh.runStartedAt;
    return gained;
  }

  // ---- Manna -------------------------------------------------------------

  function nextMannaDelay(state, rng) {
    const r = typeof rng === 'function' ? rng() : Math.random();
    return (MANNA_MIN + r * MANNA_SPREAD) * (has(state, 'quail') ? 0.7 : 1);
  }

  function pickMannaEffect(state, r) {
    // Before any works produce Faith, a timed multiplier would be wasted.
    if (productionPerSecond(state, false) < 1) {
      return r < 0.85 ? D.MANNA_EFFECTS[0] : BUFFS.fire;
    }
    const total = D.MANNA_EFFECTS.reduce(function (s, e) { return s + e.weight; }, 0);
    let x = r * total;
    for (let i = 0; i < D.MANNA_EFFECTS.length; i++) {
      x -= D.MANNA_EFFECTS[i].weight;
      if (x < 0) return D.MANNA_EFFECTS[i];
    }
    return D.MANNA_EFFECTS[D.MANNA_EFFECTS.length - 1];
  }

  // Applies a gathered manna. Returns { effect, amount?, duration? }.
  function catchManna(state, rng) {
    const r = typeof rng === 'function' ? rng() : Math.random();
    const effect = pickMannaEffect(state, r);
    state.mannaCaught += 1;
    if (effect.duration) {
      const duration = effect.duration * (has(state, 'baskets') ? 2 : 1);
      state.buffs[effect.id] = Math.max(state.buffs[effect.id] || 0, duration);
      return { effect: effect, duration: duration };
    }
    const fps = productionPerSecond(state, false);
    let amount = Math.min(state.faith * 0.15, fps * 900) + 13;
    if (has(state, 'sixthday')) amount *= 2;
    earn(state, amount);
    return { effect: effect, amount: amount };
  }

  // ---- Time --------------------------------------------------------------

  function tickBuffs(state, dt) {
    const ended = [];
    Object.keys(state.buffs).forEach(function (id) {
      state.buffs[id] -= dt;
      if (!(state.buffs[id] > 0)) { delete state.buffs[id]; ended.push(id); }
    });
    return ended;
  }

  // Advances the game by `dt` seconds while it is open.
  // Returns events: { type: 'book', book } | { type: 'manna' } | { type: 'buffEnd', id }.
  function tick(state, dt, rng) {
    const events = [];
    if (!(dt > 0)) return events;
    // Loaves and Fishes only counts for the part of `dt` it was still running.
    const base = productionPerSecond(state, false);
    let gain = base * dt;
    if (buffActive(state, 'loaves')) gain += base * (BUFFS.loaves.mult - 1) * Math.min(dt, state.buffs.loaves);
    earn(state, gain);
    state.playTime += dt;
    tickBuffs(state, dt).forEach(function (id) { events.push({ type: 'buffEnd', id: id }); });
    state.mannaIn -= dt;
    if (state.mannaIn <= 0) {
      events.push({ type: 'manna' });
      state.mannaIn = nextMannaDelay(state, rng);
    }
    checkBooks(state).forEach(function (book) { events.push({ type: 'book', book: book }); });
    return events;
  }

  function offlineRate(state) { return has(state, 'sabbath') ? 1 : OFFLINE_RATE; }

  // Credits time spent away. Timed blessings run out; manna is due soon after.
  function applyOffline(state, seconds, rng) {
    if (!(seconds > 0)) return { gain: 0, seconds: 0, capped: false, books: [] };
    const counted = Math.min(seconds, OFFLINE_CAP);
    const gain = productionPerSecond(state, false) * counted * offlineRate(state);
    earn(state, gain);
    tickBuffs(state, seconds);
    state.mannaIn -= seconds;
    if (state.mannaIn <= 0) {
      const r = typeof rng === 'function' ? rng() : Math.random();
      state.mannaIn = 10 + r * 20;
    }
    return { gain: gain, seconds: counted, capped: seconds > OFFLINE_CAP, books: checkBooks(state) };
  }

  // ---- Saving ------------------------------------------------------------

  function num(v, fallback, min) {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    return typeof min === 'number' ? Math.max(min, n) : n;
  }

  function serialize(state) {
    return JSON.stringify(state);
  }

  // Rebuilds a state from saved JSON, keeping only known, well-formed fields.
  // Throws if the text is not a save at all.
  function deserialize(text, now) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number') {
      throw new Error('This is not a Mustard Seed save.');
    }
    const s = createState(now);
    ['faith', 'runFaith', 'allTimeFaith', 'clicks', 'clickFaith', 'blessings', 'jubilees',
      'mannaCaught', 'playTime'].forEach(function (k) { s[k] = num(raw[k], 0, 0); });
    ['startedAt', 'runStartedAt', 'lastSaved'].forEach(function (k) { s[k] = num(raw[k], s[k], 0); });
    s.mannaIn = num(raw.mannaIn, MANNA_FIRST, 0);
    s.books = Math.min(D.BOOKS.length, Math.floor(num(raw.books, 0, 0)));
    s.blessings = Math.floor(s.blessings);
    if (raw.owned && typeof raw.owned === 'object') {
      D.GENERATORS.forEach(function (g) { s.owned[g.id] = Math.floor(num(raw.owned[g.id], 0, 0)); });
    }
    if (raw.upgrades && typeof raw.upgrades === 'object') {
      Object.keys(raw.upgrades).forEach(function (id) {
        if (UPGRADE_BY_ID[id] && raw.upgrades[id] === true) s.upgrades[id] = true;
      });
    }
    if (raw.buffs && typeof raw.buffs === 'object') {
      Object.keys(BUFFS).forEach(function (id) {
        const v = num(raw.buffs[id], 0, 0);
        if (v > 0) s.buffs[id] = v;
      });
    }
    s.runFaith = Math.min(s.runFaith, s.allTimeFaith);
    return s;
  }

  // A copyable save code, for moving a game between devices.
  function encodeSave(state) {
    return SAVE_PREFIX + btoa(serialize(state));
  }

  function decodeSave(code, now) {
    let text = String(code || '').replace(/\s+/g, '');
    if (text.indexOf(SAVE_PREFIX) === 0) text = text.slice(SAVE_PREFIX.length);
    let json;
    try { json = atob(text); } catch (e) { throw new Error('That save code is incomplete or mistyped.'); }
    try { return deserialize(json, now); } catch (e) { throw new Error('That save code is incomplete or mistyped.'); }
  }

  // ---- Formatting --------------------------------------------------------

  const SHORT = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const LONG = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion',
    'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion', 'undecillion',
    'duodecillion', 'tredecillion', 'quattuordecillion', 'quindecillion'];

  function group(n) {
    return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Rounds down so a displayed amount never overstates what you have.
  // opts.long: "1.23 million" instead of "1.23M". opts.decimals: show one decimal below 100.
  function formatNumber(n, opts) {
    opts = opts || {};
    if (typeof n !== 'number' || Number.isNaN(n)) return '0';
    if (!Number.isFinite(n)) return '∞';
    if (n < 0) return '−' + formatNumber(-n, opts);
    if (n < 1e6) {
      if (opts.decimals && n < 100) {
        const d = Math.floor(n * 10 + 1e-9) / 10;
        return d % 1 === 0 ? String(d) : d.toFixed(1);
      }
      return group(n);
    }
    const names = opts.long ? LONG : SHORT;
    const tier = Math.floor(Math.log10(n) / 3 + 1e-12);
    if (tier >= names.length) {
      const exp = Math.floor(Math.log10(n));
      const mant = Math.floor(n / Math.pow(10, exp) * 100 + 1e-9) / 100;
      return mant.toFixed(2) + 'e' + exp;
    }
    const scaled = n / Math.pow(1000, tier);
    const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    const f = Math.pow(10, digits);
    let text = (Math.floor(scaled * f + 1e-9) / f).toFixed(digits);
    if (digits > 0) text = text.replace(/\.?0+$/, '');
    return text + (opts.long ? ' ' : '') + names[tier];
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + (sec < 10 ? '0' : '') + sec + 's';
    return sec + 's';
  }

  function formatClock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  return {
    data: D,
    constants: {
      SAVE_VERSION: SAVE_VERSION, COST_GROWTH: COST_GROWTH, TIERS: TIERS,
      BOOK_BONUS: BOOK_BONUS, BLESSING_BONUS: BLESSING_BONUS, BLESSING_UNIT: BLESSING_UNIT,
      OFFLINE_CAP: OFFLINE_CAP, OFFLINE_RATE: OFFLINE_RATE, MANNA_LIFETIME: MANNA_LIFETIME,
    },
    UPGRADES: UPGRADES,
    UPGRADE_BY_ID: UPGRADE_BY_ID,
    GEN_BY_ID: GEN_BY_ID,
    BUFFS: BUFFS,
    createState: createState,
    has: has,
    earn: earn,
    genMultiplier: genMultiplier,
    baseMultiplier: baseMultiplier,
    productionMultiplier: productionMultiplier,
    unitRate: unitRate,
    genRate: genRate,
    productionPerSecond: productionPerSecond,
    clickPower: clickPower,
    click: click,
    nextCost: nextCost,
    bulkCost: bulkCost,
    maxAffordable: maxAffordable,
    buyGenerator: buyGenerator,
    isRevealed: isRevealed,
    isUnlocked: isUnlocked,
    availableUpgrades: availableUpgrades,
    purchasedUpgrades: purchasedUpgrades,
    buyUpgrade: buyUpgrade,
    buyAllUpgrades: buyAllUpgrades,
    bookThreshold: bookThreshold,
    checkBooks: checkBooks,
    blessingsFor: blessingsFor,
    pendingBlessings: pendingBlessings,
    nextBlessingAt: nextBlessingAt,
    canJubilee: canJubilee,
    jubilee: jubilee,
    nextMannaDelay: nextMannaDelay,
    catchManna: catchManna,
    tick: tick,
    offlineRate: offlineRate,
    applyOffline: applyOffline,
    serialize: serialize,
    deserialize: deserialize,
    encodeSave: encodeSave,
    decodeSave: decodeSave,
    formatNumber: formatNumber,
    formatDuration: formatDuration,
    formatClock: formatClock,
  };
});
