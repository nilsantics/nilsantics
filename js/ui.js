/*
 * Mustard Seed: the page. Wires the engine to the DOM and draws the tree.
 */
(function () {
  'use strict';

  const E = window.MustardSeedEngine;
  const D = E.data;

  const SAVE_KEY = 'mustard-seed-save';
  const PREFS_KEY = 'mustard-seed-prefs';
  const OFFLINE_AFTER = 300;   // a gap longer than this (seconds) counts as time away
  const SAVE_EVERY = 10000;    // ms
  const TABS = ['works', 'upgrades', 'scripture', 'jubilee', 'records'];
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let state = null;
  let buyAmount = 1;
  let activeTab = 'works';
  let unseenBooks = 0;
  let lastTick = Date.now();
  let lastSave = 0;

  // ---- Small helpers -----------------------------------------------------

  const $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function setText(node, text) {
    if (node.__text !== text) { node.textContent = text; node.__text = text; }
  }

  function setAttr(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function setDisabled(btn, value) {
    if (btn.disabled !== value) btn.disabled = value;
  }

  const fmt = function (n) { return E.formatNumber(n); };
  const fmtSmall = function (n) { return E.formatNumber(n, { decimals: true }); };
  const fmtLong = function (n) { return E.formatNumber(n, { long: true }); };
  const fmtLongSmall = function (n) { return E.formatNumber(n, { long: true, decimals: true }); };

  function fmtMult(m) {
    if (m < 10) return (Math.floor(m * 100 + 1e-9) / 100).toFixed(2);
    if (m < 100) return (Math.floor(m * 10 + 1e-9) / 10).toFixed(1);
    return fmt(m);
  }

  // Scripture text, with LORD in small capitals as the King James Version prints it.
  function appendVerse(parent, text) {
    text.split(/(LORD)/).forEach(function (part) {
      if (part === 'LORD') parent.appendChild(el('span', 'lord', 'Lord'));
      else if (part) parent.appendChild(document.createTextNode(part));
    });
    return parent;
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
  }

  // ---- Saving ------------------------------------------------------------

  function save() {
    if (!state) return false;
    state.lastSaved = Date.now();
    lastSave = state.lastSaved;
    return storageSet(SAVE_KEY, E.serialize(state));
  }

  function loadSaved(hotData) {
    const text = (hotData && hotData.save) || storageGet(SAVE_KEY);
    if (!text) return null;
    try { return E.deserialize(text); } catch (e) { return null; }
  }

  function loadPrefs() {
    try {
      const p = JSON.parse(storageGet(PREFS_KEY) || '{}');
      if (TABS.indexOf(p.tab) >= 0) activeTab = p.tab;
      if (p.amount === 'max' || [1, 10, 100].indexOf(p.amount) >= 0) buyAmount = p.amount;
    } catch (e) { /* keep defaults */ }
  }

  function savePrefs() {
    storageSet(PREFS_KEY, JSON.stringify({ tab: activeTab, amount: buyAmount }));
  }

  // ---- Toasts ------------------------------------------------------------

  const toastList = $('toasts');

  function dismissToast(li) {
    if (!li.isConnected || li.classList.contains('leaving')) return;
    li.classList.add('leaving');
    setTimeout(function () { li.remove(); }, reduceMotion ? 0 : 230);
  }

  function toast(opts) {
    const li = el('li', 'toast');
    li.appendChild(el('p', 'toast-title', opts.title));
    if (opts.body) li.appendChild(el('p', 'toast-body', opts.body));
    if (opts.verse) {
      const v = appendVerse(el('p', 'toast-verse'), opts.verse);
      if (opts.ref) {
        v.appendChild(document.createTextNode(' '));
        v.appendChild(el('span', 'ref', opts.ref));
      }
      li.appendChild(v);
    }
    li.addEventListener('click', function () { dismissToast(li); });
    toastList.appendChild(li);
    while (toastList.children.length > 3) toastList.removeChild(toastList.firstChild);
    setTimeout(function () { dismissToast(li); }, opts.duration || 6500);
  }

  function toastBooks(books, isNewGame) {
    if (!books.length) return;
    unseenBooks += books.length;
    const last = books[books.length - 1];
    if (isNewGame && last.index === 0) {
      toast({
        title: 'Genesis',
        body: 'Tap the tree to pray for Faith. Spend it on works, and read on through all 66 books.',
        verse: last.verse, ref: last.ref, duration: 9000,
      });
      return;
    }
    if (last.index === D.BOOKS.length - 1) {
      toast({
        title: 'Amen',
        body: 'You have read from Genesis to Revelation. All Faith +' + Math.round(D.BOOKS.length * E.constants.BOOK_BONUS * 100) + '%.',
        verse: last.verse, ref: last.ref, duration: 12000,
      });
      return;
    }
    const title = books.length === 1
      ? 'You read ' + last.name
      : 'You read ' + books.length + ' books, ' + books[0].name + ' to ' + last.name;
    toast({
      title: title,
      body: 'All Faith +' + Math.round(books.length * E.constants.BOOK_BONUS * 100) + '%.',
      verse: last.verse, ref: last.ref,
    });
  }

  // ---- The tree ----------------------------------------------------------

  const Tree = (function () {
    let canvas = null;
    let ctx = null;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let books = 0;
    let shown = 0;     // eases toward `books` so growth is visible
    let glow = 0;
    let lastDraw = 0;
    let stars = [];
    const motes = [];
    const colors = {};

    function hash(n) {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    }

    function readColors() {
      const css = getComputedStyle(document.documentElement);
      const get = function (name, fallback) { return css.getPropertyValue(name).trim() || fallback; };
      colors.gold = get('--gold', '#e8bd54');
      colors.leaf = get('--leaf', '#9cc26a');
      colors.vellum = get('--vellum', '#f1e8d0');
      colors.lapis = get('--lapis', '#13215a');
      colors.blossom = '#f7da6e';
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      stars = [];
      const count = Math.min(140, Math.round((W * H) / 3800));
      for (let i = 0; i < count; i++) {
        stars.push({ x: hash(i * 3 + 1) * W, y: hash(i * 3 + 2) * H * 0.82, r: 0.4 + hash(i * 3 + 3) * 1.1, p: hash(i * 7 + 5) * 6.283 });
      }
      draw(performance.now());
    }

    function init(c) {
      canvas = c;
      ctx = c.getContext('2d');
      readColors();
      resize();
      if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
      else window.addEventListener('resize', resize);
      requestAnimationFrame(frame);
    }

    function setBooks(n, instant) {
      books = n;
      if (instant) shown = n;
    }

    function pulse(x, y) {
      glow = Math.min(1, glow + 0.3);
      for (let k = 0; k < 3; k++) {
        motes.push({
          x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 16,
          vx: (Math.random() - 0.5) * 1.4, vy: -(0.6 + Math.random() * 1.4), life: 0.7 + Math.random() * 0.3,
        });
      }
      if (motes.length > 90) motes.splice(0, motes.length - 90);
    }

    function frame(t) {
      requestAnimationFrame(frame);
      if (document.hidden || !W) return;
      const busy = motes.length > 0 || glow > 0.01 || Math.abs(shown - books) > 0.001;
      const interval = reduceMotion && !busy ? 1000 : 33;
      if (t - lastDraw < interval) return;
      lastDraw = t;
      draw(t);
    }

    function drawTree(x, y, s, t, scale) {
      const depth = 1.6 + 8.4 * s;            // 1.6 levels as a sprout, 10 when full grown
      const full = Math.floor(depth);
      const frac = depth - full;
      const trunk = scale * (0.075 + 0.125 * s);
      const width0 = 1.6 + 8 * s;
      const levels = [];
      const tips = [];

      function grow(x1, y1, len, ang, d, id) {
        const a = ang + (reduceMotion ? 0 : Math.sin(t * 0.0008 + id * 0.7) * 0.006 * (d + 1));
        const x2 = x1 + Math.cos(a) * len;
        const y2 = y1 + Math.sin(a) * len;
        (levels[d] || (levels[d] = [])).push(x1, y1, x2, y2);
        const next = d + 1;
        if (next > full || (next === full && frac < 0.05)) { tips.push(x2, y2, id); return; }
        const k = next === full ? frac : 1;
        const n = d < 2 && hash(id * 1.7) > 0.55 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const side = n === 2 ? (i === 0 ? -1 : 1) : i - 1;
          const spread = 0.36 + hash(id * 13 + i) * 0.3;
          const childAng = a + side * spread + (hash(id * 31 + i) - 0.5) * 0.25;
          const childLen = len * (0.66 + hash(id * 17 + i) * 0.14) * k;
          grow(x2, y2, childLen, childAng, next, id * 4 + i + 1);
        }
      }
      grow(x, y, trunk, -Math.PI / 2, 0, 1);

      ctx.lineCap = 'round';
      ctx.strokeStyle = colors.gold;
      for (let d = 0; d < levels.length; d++) {
        const segs = levels[d];
        if (!segs) continue;
        ctx.lineWidth = Math.max(0.6, width0 * Math.pow(0.68, d));
        ctx.globalAlpha = Math.max(0.5, 0.95 - d * 0.045);
        ctx.beginPath();
        for (let i = 0; i < segs.length; i += 4) {
          ctx.moveTo(segs[i], segs[i + 1]);
          ctx.lineTo(segs[i + 2], segs[i + 3]);
        }
        ctx.stroke();
      }

      // Leaves, with the mustard's small yellow flowers among them.
      const leafR = 1.3 + 2.4 * s;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = colors.leaf;
      ctx.beginPath();
      for (let i = 0; i < tips.length; i += 3) {
        const id = tips[i + 2];
        if (hash(id * 3.3) > 0.82 && s > 0.3) continue;
        const lx = tips[i] + (hash(id * 5.1) - 0.5) * 4;
        const ly = tips[i + 1] + (hash(id * 7.3) - 0.5) * 4;
        ctx.moveTo(lx + leafR, ly);
        ctx.arc(lx, ly, leafR, 0, 6.283);
      }
      ctx.fill();
      if (s > 0.3) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = colors.blossom;
        ctx.beginPath();
        for (let i = 0; i < tips.length; i += 3) {
          const id = tips[i + 2];
          if (hash(id * 3.3) <= 0.82) continue;
          ctx.moveTo(tips[i] + leafR * 0.8, tips[i + 1]);
          ctx.arc(tips[i], tips[i + 1], leafR * 0.8, 0, 6.283);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return { tips: tips, top: y - scale * (0.12 + 0.45 * s) };
    }

    // From the New Testament on, the birds of the air come and lodge in the branches.
    function drawBirds(cx, top, t, scale) {
      const count = Math.min(6, Math.floor((books - 39) / 4) + 1);
      ctx.strokeStyle = colors.vellum;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const speed = 0.00018 + hash(i + 40) * 0.0001;
        const phase = hash(i + 10) * 6.283;
        const ang = reduceMotion ? phase : phase + t * speed;
        const rx = scale * (0.28 + hash(i + 20) * 0.2);
        const ry = scale * (0.05 + hash(i + 30) * 0.06);
        const bx = cx + Math.cos(ang) * rx;
        const by = top - scale * 0.04 + Math.sin(ang) * ry;
        const flap = reduceMotion ? 0.5 : (Math.sin(t * 0.012 + i * 2) + 1) / 2;
        const span = 4 + hash(i + 50) * 2.5;
        const lift = 1.5 + flap * 3;
        ctx.moveTo(bx - span, by - lift);
        ctx.quadraticCurveTo(bx - span / 2, by - lift * 0.2, bx, by);
        ctx.quadraticCurveTo(bx + span / 2, by - lift * 0.2, bx + span, by - lift);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function draw(t) {
      if (!ctx || !W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      shown += (books - shown) * 0.05;
      if (Math.abs(books - shown) < 0.001) shown = books;
      const s = Math.sqrt(Math.max(0, Math.min(66, shown)) / 66);

      ctx.fillStyle = colors.vellum;
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        ctx.globalAlpha = reduceMotion ? 0.45 : 0.3 + 0.3 * (1 + Math.sin(t * 0.0011 + st.p)) / 2;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const groundY = H - Math.max(36, H * 0.1);
      const cx = W / 2;
      const scale = Math.min(H * 0.86, W * 1.05);
      const crownY = groundY - scale * (0.1 + 0.33 * s);

      // A faint halo always, brighter for a moment after each prayer.
      const haloR = scale * (0.2 + 0.35 * s);
      const halo = ctx.createRadialGradient(cx, crownY, 0, cx, crownY, haloR);
      halo.addColorStop(0, 'rgba(232, 189, 84, ' + (0.1 + 0.22 * glow).toFixed(3) + ')');
      halo.addColorStop(1, 'rgba(232, 189, 84, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(cx - haloR, crownY - haloR, haloR * 2, haloR * 2);
      glow *= 0.92;

      // A low hill, rising from the bottom corners to the tree's root.
      const hillTop = groundY - 6;
      ctx.fillStyle = colors.lapis;
      ctx.beginPath();
      ctx.moveTo(-W * 0.05, H);
      ctx.quadraticCurveTo(cx, 2 * hillTop - H, W * 1.05, H);
      ctx.closePath();
      ctx.fill();

      const tree = drawTree(cx, groundY - 3, s, t, scale);
      if (books >= 40) drawBirds(cx, tree.top, t, scale);

      ctx.fillStyle = colors.gold;
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.x += m.vx;
        m.y += m.vy;
        m.vy *= 0.985;
        m.life -= 0.025;
        if (m.life <= 0) { motes.splice(i, 1); continue; }
        ctx.globalAlpha = m.life;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.8, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    return { init: init, setBooks: setBooks, pulse: pulse };
  })();

  function treeStage(books) {
    if (books >= 66) return 'Your tree stands like a tree planted by the rivers of water.';
    if (books >= 40) return 'Your mustard seed has become a tree, and the birds of the air lodge in its branches.';
    if (books >= 20) return 'Your mustard seed has grown into the greatest among herbs.';
    if (books >= 5) return 'Your mustard seed has sprung up as a tender plant.';
    return 'Your mustard seed is still the least of all seeds.';
  }

  // ---- Praying -----------------------------------------------------------

  const sanctuary = $('sanctuary');
  const prayBtn = $('pray');
  const floaters = $('floaters');

  function floatText(text, x, y) {
    const f = el('span', 'floater', text);
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    f.addEventListener('animationend', function () { f.remove(); });
    floaters.appendChild(f);
    while (floaters.children.length > 24) floaters.removeChild(floaters.firstChild);
  }

  function pray(clientX, clientY) {
    const gain = E.click(state);
    const r = sanctuary.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    floatText('+' + fmtSmall(gain), x, y - 10);
    Tree.pulse(x, y);
    renderTally();
  }

  prayBtn.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    pray(e.clientX, e.clientY);
  });
  // Keyboard and assistive activation arrive as clicks without a pointer press.
  prayBtn.addEventListener('click', function (e) {
    if (e.detail !== 0) return;
    const r = prayBtn.getBoundingClientRect();
    pray(r.left + r.width / 2, r.top + r.height * 0.6);
  });

  // ---- Manna -------------------------------------------------------------

  const manna = { el: $('manna'), timer: 0, active: false };

  function showManna() {
    if (manna.active || document.hidden) return;
    const h = sanctuary.clientHeight;
    manna.el.style.left = (14 + Math.random() * 72) + '%';
    manna.el.style.setProperty('--fall-to', Math.round(h * (reduceMotion ? 0.45 : 0.78)) + 'px');
    manna.el.style.setProperty('--fall-time', E.constants.MANNA_LIFETIME + 's');
    manna.el.hidden = false;
    manna.el.style.animation = 'none';
    void manna.el.offsetWidth; // restart the fall
    manna.el.style.animation = '';
    manna.active = true;
    clearTimeout(manna.timer);
    manna.timer = setTimeout(hideManna, E.constants.MANNA_LIFETIME * 1000);
  }

  function hideManna() {
    clearTimeout(manna.timer);
    manna.el.hidden = true;
    manna.active = false;
  }

  manna.el.addEventListener('click', function () {
    if (!manna.active) return;
    hideManna();
    const r = E.catchManna(state);
    const e = r.effect;
    let body;
    if (e.id === 'manna') body = '+' + fmtLong(r.amount) + ' Faith.';
    else if (e.id === 'loaves') body = 'All Faith ×' + e.mult + ' for ' + Math.round(r.duration) + ' seconds.';
    else body = 'Each prayer brings ×' + e.mult + ' Faith for ' + Math.round(r.duration) + ' seconds. Pray quickly.';
    toast({ title: e.name, body: body, verse: e.verse, ref: e.ref });
    render();
  });

  // ---- Tabs --------------------------------------------------------------

  function selectTab(name, focus) {
    activeTab = name;
    TABS.forEach(function (t) {
      const on = t === name;
      const tab = $('tab-' + t);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      $('panel-' + t).hidden = !on;
    });
    if (focus) $('tab-' + name).focus();
    $('panels').scrollTop = 0;
    if (name === 'scripture') unseenBooks = 0;
    savePrefs();
    render();
  }

  TABS.forEach(function (t) {
    $('tab-' + t).addEventListener('click', function () { selectTab(t); });
  });
  document.querySelector('.tabs').addEventListener('keydown', function (e) {
    const i = TABS.indexOf(activeTab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(TABS[next], true);
  });

  function setBadge(id, text) {
    const b = $(id);
    const show = !!text;
    if (b.hidden === show) b.hidden = !show;
    if (show) setText(b, text);
  }

  // ---- Tally -------------------------------------------------------------

  const tally = {
    amount: $('faith-amount'), rate: $('faith-rate'), power: $('click-power'), buffs: $('buffs'), buffSig: '',
  };

  function renderTally() {
    setText(tally.amount, fmtLong(state.faith));
    setText(tally.rate, fmtLongSmall(E.productionPerSecond(state)));
    setText(tally.power, '+' + fmtSmall(E.clickPower(state)));
  }

  function renderBuffs() {
    const items = [];
    if (state.buffs.loaves > 0) items.push('Loaves and Fishes · ×' + E.BUFFS.loaves.mult + ' Faith · ' + E.formatClock(state.buffs.loaves));
    if (state.buffs.fire > 0) items.push('Tongues of Fire · ×' + E.BUFFS.fire.mult + ' prayer · ' + E.formatClock(state.buffs.fire));
    const sig = items.join('|');
    if (sig === tally.buffSig) return;
    tally.buffSig = sig;
    tally.buffs.textContent = '';
    items.forEach(function (text) { tally.buffs.appendChild(el('li', 'buff', text)); });
  }

  // ---- Works -------------------------------------------------------------

  const works = { list: $('works'), rows: {}, revealed: -1 };

  function revealedCount() {
    let n = 0;
    for (let i = 0; i < D.GENERATORS.length; i++) if (E.isRevealed(state, i)) n = i + 1;
    return n;
  }

  function workRow(g) {
    const li = el('li');
    const btn = el('button', 'work');
    btn.type = 'button';
    btn.dataset.id = g.id;
    const initial = el('span', 'initial', g.name.charAt(0));
    initial.setAttribute('aria-hidden', 'true');
    const main = el('span', 'work-main');
    const rate = el('span', 'work-rate');
    const verse = appendVerse(el('span', 'work-verse'), g.verse);
    verse.appendChild(el('span', 'ref', g.ref));
    main.append(el('span', 'work-name', g.name), rate, verse);
    const side = el('span', 'work-side');
    const owned = el('span', 'work-owned', '0');
    const cost = el('span', 'cost');
    side.append(owned, cost);
    btn.append(initial, main, side);
    li.appendChild(btn);
    works.rows[g.id] = { btn: btn, rate: rate, owned: owned, cost: cost };
    return li;
  }

  function mysteryRow(g) {
    const li = el('li');
    const box = el('div', 'work mystery');
    const initial = el('span', 'initial', '?');
    initial.setAttribute('aria-hidden', 'true');
    const main = el('span', 'work-main');
    main.append(
      el('span', 'work-name', 'Not yet revealed'),
      el('span', 'work-rate', 'Appears once you gather ' + fmt(g.baseCost * 0.5) + ' Faith in this age.')
    );
    box.append(initial, main);
    li.appendChild(box);
    return li;
  }

  function buildWorks() {
    const count = revealedCount();
    works.revealed = count;
    works.rows = {};
    works.list.textContent = '';
    D.GENERATORS.forEach(function (g, i) {
      if (i < count) works.list.appendChild(workRow(g));
      else if (i === count) works.list.appendChild(mysteryRow(g));
    });
  }

  function quote(g) {
    const owned = state.owned[g.id];
    if (buyAmount === 'max') {
      const n = E.maxAffordable(g.id, owned, state.faith);
      return n > 0 ? { n: n, cost: E.bulkCost(g.id, owned, n) } : { n: 1, cost: E.nextCost(g.id, owned) };
    }
    return { n: buyAmount, cost: E.bulkCost(g.id, owned, buyAmount) };
  }

  function renderWorks() {
    if (revealedCount() !== works.revealed) buildWorks();
    D.GENERATORS.forEach(function (g) {
      const row = works.rows[g.id];
      if (!row) return;
      const owned = state.owned[g.id];
      const q = quote(g);
      const each = E.unitRate(state, g.id);
      setText(row.owned, String(owned));
      setText(row.cost, (q.n > 1 || buyAmount === 10 || buyAmount === 100 ? '×' + q.n + ' · ' : '') + fmt(q.cost));
      setText(row.rate, fmtSmall(each) + ' per second each' + (owned > 0 ? ' · ' + fmtSmall(each * owned) + ' in all' : ''));
      setDisabled(row.btn, q.cost > state.faith);
      setAttr(row.btn, 'aria-label',
        'Buy ' + q.n + ' ' + (q.n === 1 ? g.name : g.plural) + ' for ' + fmt(q.cost) + ' Faith. You have ' + owned + '.');
    });
  }

  works.list.addEventListener('click', function (e) {
    const btn = e.target.closest('button.work');
    if (!btn || btn.disabled) return;
    if (E.buyGenerator(state, btn.dataset.id, buyAmount) > 0) render();
  });

  const amountBtns = Array.prototype.slice.call(document.querySelectorAll('.amount'));
  function renderAmounts() {
    amountBtns.forEach(function (b) {
      const v = b.dataset.amount === 'max' ? 'max' : Number(b.dataset.amount);
      setAttr(b, 'aria-checked', v === buyAmount ? 'true' : 'false');
      b.tabIndex = v === buyAmount ? 0 : -1;
    });
  }
  amountBtns.forEach(function (b, i) {
    b.addEventListener('click', function () {
      buyAmount = b.dataset.amount === 'max' ? 'max' : Number(b.dataset.amount);
      savePrefs();
      renderAmounts();
      render();
    });
    b.addEventListener('keydown', function (e) {
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = amountBtns[(i + dir + amountBtns.length) % amountBtns.length];
      next.focus();
      next.click();
    });
  });

  // ---- Upgrades ----------------------------------------------------------

  const ups = {
    list: $('upgrades'), note: $('upgrades-note'), buyAll: $('buy-all'),
    purchased: $('purchased'), purchasedList: $('purchased-list'), purchasedSummary: $('purchased-summary'),
    sig: null, purchasedSig: null, rows: {},
  };

  function buildUpgrades(avail) {
    ups.rows = {};
    ups.list.textContent = '';
    avail.forEach(function (u) {
      const li = el('li');
      const btn = el('button', 'upgrade');
      btn.type = 'button';
      btn.dataset.id = u.id;
      const cost = el('span', 'cost', fmt(u.cost));
      btn.append(el('span', 'upgrade-name', u.name), el('span', 'upgrade-effect', u.effect), el('span', 'ref', u.ref), cost);
      btn.setAttribute('aria-label', 'Buy ' + u.name + ' for ' + fmt(u.cost) + ' Faith. ' + u.effect);
      li.appendChild(btn);
      ups.list.appendChild(li);
      ups.rows[u.id] = { btn: btn, cost: u.cost };
    });
  }

  function upgradesEmptyNote() {
    const ownsAny = D.GENERATORS.some(function (g) { return state.owned[g.id] > 0; });
    if (!ownsAny) return 'Buy your first Shepherd to reveal an upgrade.';
    return 'New upgrades appear as your works grow and your prayers add up.';
  }

  function renderUpgrades(avail) {
    const sig = avail.map(function (u) { return u.id; }).join(',');
    if (sig !== ups.sig) { buildUpgrades(avail); ups.sig = sig; }
    let affordable = 0;
    avail.forEach(function (u) {
      const can = state.faith >= u.cost;
      if (can) affordable++;
      setDisabled(ups.rows[u.id].btn, !can);
    });
    setText(ups.note, avail.length ? avail.length + ' available' : upgradesEmptyNote());
    setDisabled(ups.buyAll, affordable === 0);
    setText(ups.buyAll, affordable > 1 ? 'Buy all ' + affordable + ' I can afford' : 'Buy all I can afford');

    const bought = E.purchasedUpgrades(state);
    const psig = bought.map(function (u) { return u.id; }).join(',');
    if (psig !== ups.purchasedSig) {
      ups.purchasedSig = psig;
      ups.purchased.hidden = bought.length === 0;
      setText(ups.purchasedSummary, 'Purchased (' + bought.length + ')');
      ups.purchasedList.textContent = '';
      bought.forEach(function (u) { ups.purchasedList.appendChild(el('li', null, u.name)); });
    }
  }

  ups.list.addEventListener('click', function (e) {
    const btn = e.target.closest('button.upgrade');
    if (!btn || btn.disabled) return;
    if (E.buyUpgrade(state, btn.dataset.id)) render();
  });
  ups.buyAll.addEventListener('click', function () {
    if (E.buyAllUpgrades(state) > 0) render();
  });

  // ---- Scripture ---------------------------------------------------------

  const scripture = {
    old: $('books-old'), nt: $('books-new'), read: $('books-read'), bar: $('books-bar'),
    next: $('books-next'), stage: $('tree-stage'), built: -1,
  };

  function buildBooks(fresh) {
    scripture.old.textContent = '';
    scripture.nt.textContent = '';
    D.BOOKS.forEach(function (b, i) {
      const li = el('li', 'book');
      li.append(el('span', 'book-no', String(i + 1)), el('span', 'book-name', b.name));
      if (i < state.books) {
        li.append(appendVerse(el('p', 'book-verse'), b.verse), el('span', 'ref', b.ref));
        if (i >= fresh) li.classList.add('fresh');
      } else {
        li.classList.add('locked');
        if (i === state.books) li.classList.add('next');
        li.append(el('span', 'book-lock', 'Opens at ' + fmt(E.bookThreshold(i)) + ' Faith gathered in all'));
      }
      (b.testament === 'old' ? scripture.old : scripture.nt).appendChild(li);
    });
  }

  function renderScripture() {
    if (scripture.built !== state.books) {
      buildBooks(scripture.built < 0 ? state.books : scripture.built);
      scripture.built = state.books;
      setText(scripture.read, String(state.books));
      scripture.bar.style.width = (state.books / D.BOOKS.length * 100).toFixed(1) + '%';
      setText(scripture.stage, treeStage(state.books));
    }
    if (state.books < D.BOOKS.length) {
      const b = D.BOOKS[state.books];
      setText(scripture.next, 'Next: ' + b.name + ', at ' + fmt(E.bookThreshold(state.books)) +
        ' Faith gathered in all. You have gathered ' + fmt(state.allTimeFaith) + '.');
    } else {
      setText(scripture.next, 'You have read the whole Bible, from Genesis to Revelation.');
    }
  }

  // ---- Jubilee -----------------------------------------------------------

  const jub = {
    held: $('jub-held'), pending: $('jub-pending'), now: $('jub-now'), after: $('jub-after'), next: $('jub-next'),
    start: $('jub-start'), actions: $('jub-actions'), confirm: $('jub-confirm'), confirmText: $('jub-confirm-text'),
  };

  function blessingMult(n) { return 1 + n * E.constants.BLESSING_BONUS; }

  function jubileeWorthIt() {
    const p = E.pendingBlessings(state);
    return p >= Math.max(25, state.blessings);
  }

  function renderJubilee() {
    const pending = E.pendingBlessings(state);
    setText(jub.held, fmt(state.blessings));
    setText(jub.pending, '+' + fmt(pending));
    setText(jub.now, '×' + fmtMult(blessingMult(state.blessings)));
    setText(jub.after, '×' + fmtMult(blessingMult(state.blessings + pending)));
    setText(jub.next, 'Your next Blessing comes at ' + fmt(E.nextBlessingAt(state)) +
      ' Faith gathered in all. You have gathered ' + fmt(state.allTimeFaith) + '.');
    setDisabled(jub.start, pending < 1);
    if (!jub.confirm.hidden) {
      setText(jub.confirmText, 'Release this age for ' + fmt(pending) + ' Blessing' + (pending === 1 ? '' : 's') + '?');
      if (pending < 1) closeJubileeConfirm();
    }
  }

  function closeJubileeConfirm() {
    jub.confirm.hidden = true;
    jub.actions.hidden = false;
  }

  jub.start.addEventListener('click', function () {
    if (!E.canJubilee(state)) return;
    jub.actions.hidden = true;
    jub.confirm.hidden = false;
    renderJubilee();
    $('jub-yes').focus();
  });
  $('jub-no').addEventListener('click', function () { closeJubileeConfirm(); jub.start.focus(); });
  $('jub-yes').addEventListener('click', function () {
    const gained = E.jubilee(state, Date.now());
    closeJubileeConfirm();
    if (gained < 1) return;
    hideManna();
    resetViews();
    save();
    toast({
      title: 'The Jubilee is proclaimed',
      body: 'You received ' + fmt(gained) + ' Blessing' + (gained === 1 ? '' : 's') + '. All Faith ×' + fmtMult(blessingMult(state.blessings)) + ' from now on.',
      verse: 'Ye shall return every man unto his possession, and ye shall return every man unto his family.',
      ref: 'Leviticus 25:10',
      duration: 9000,
    });
    selectTab('works');
  });

  // ---- Records and saving ------------------------------------------------

  const STAT_ROWS = [
    ['Faith gathered in all', function () { return fmtLong(state.allTimeFaith); }],
    ['Faith gathered this age', function () { return fmtLong(state.runFaith); }],
    ['Faith per second', function () { return fmtLongSmall(E.productionPerSecond(state)); }],
    ['Prayers offered', function () { return fmt(state.clicks); }],
    ['Faith from prayer', function () { return fmtLong(state.clickFaith); }],
    ['Manna gathered', function () { return fmt(state.mannaCaught); }],
    ['Books read', function () { return state.books + ' of 66'; }],
    ['Blessings', function () { return fmt(state.blessings); }],
    ['Jubilees proclaimed', function () { return fmt(state.jubilees); }],
    ['Length of this age', function () { return E.formatDuration((Date.now() - state.runStartedAt) / 1000); }],
    ['Time spent playing', function () { return E.formatDuration(state.playTime); }],
    ['Away earnings', function () { return Math.round(E.offlineRate(state) * 100) + '% of Faith per second'; }],
  ];
  const statCells = [];
  (function buildStats() {
    const dl = $('stats');
    STAT_ROWS.forEach(function (row) {
      const dd = el('dd');
      dl.append(el('dt', null, row[0]), dd);
      statCells.push(dd);
    });
  })();

  function renderRecords() {
    STAT_ROWS.forEach(function (row, i) { setText(statCells[i], row[1]()); });
  }

  const saveMsg = $('save-msg');
  const saveCode = $('save-code');
  function say(text, isError) {
    saveMsg.textContent = text;
    saveMsg.classList.toggle('error', !!isError);
  }

  $('save-now').addEventListener('click', function () {
    const ok = save();
    say(ok ? 'Saved.' : 'This browser is blocking storage, so the game cannot save here. Copy your save code to keep it.', !ok);
  });

  $('copy-save').addEventListener('click', function () {
    const code = E.encodeSave(state);
    saveCode.value = code;
    const fallback = function () {
      saveCode.focus();
      saveCode.select();
      say('Your save code is in the box. Select it and copy it.');
    };
    try {
      navigator.clipboard.writeText(code).then(function () { say('Save code copied.'); }, fallback);
    } catch (e) { fallback(); }
  });

  $('load-save').addEventListener('click', function () {
    const text = saveCode.value.trim();
    if (!text) { say('Paste a save code into the box first.', true); return; }
    try {
      state = E.decodeSave(text);
    } catch (e) {
      say(e.message + ' Check that you copied the whole code.', true);
      return;
    }
    state.lastSaved = Date.now();
    lastTick = Date.now();
    unseenBooks = 0;
    hideManna();
    resetViews();
    save();
    saveCode.value = '';
    say('Save loaded.');
    render();
  });

  $('reset-start').addEventListener('click', function () {
    $('reset-actions').hidden = true;
    $('reset-confirm').hidden = false;
    $('reset-no').focus();
  });
  $('reset-no').addEventListener('click', function () {
    $('reset-confirm').hidden = true;
    $('reset-actions').hidden = false;
  });
  $('reset-yes').addEventListener('click', function () {
    $('reset-confirm').hidden = true;
    $('reset-actions').hidden = false;
    storageRemove(SAVE_KEY);
    state = E.createState();
    lastTick = Date.now();
    unseenBooks = 0;
    hideManna();
    resetViews();
    toastBooks(E.checkBooks(state), true);
    save();
    say('Progress erased. A new seed is planted.');
    render();
  });

  // ---- Welcome back ------------------------------------------------------

  const welcome = $('welcome');
  function showWelcome(result) {
    const body = $('welcome-body');
    body.textContent = '';
    body.append(
      document.createTextNode('You were away for ' + E.formatDuration(result.seconds) + (result.capped ? ' (time away counts up to a day)' : '') + '. Your works gathered '),
      el('strong', null, fmtLong(result.gain) + ' Faith'),
      document.createTextNode('.')
    );
    if (E.offlineRate(state) < 1) {
      body.append(document.createTextNode(' While you are away they work at half strength. The upgrade Remember the Sabbath brings them to full strength.'));
    }
    welcome.hidden = false;
    $('welcome-ok').focus();
  }
  function closeWelcome() { welcome.hidden = true; }
  $('welcome-ok').addEventListener('click', closeWelcome);
  welcome.addEventListener('click', function (e) { if (e.target === welcome) closeWelcome(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !welcome.hidden) closeWelcome(); });

  // ---- The loop ----------------------------------------------------------

  function handleEvents(events) {
    const books = [];
    events.forEach(function (ev) {
      if (ev.type === 'book') books.push(ev.book);
      else if (ev.type === 'manna') showManna();
    });
    toastBooks(books, false);
  }

  function away(seconds) {
    const result = E.applyOffline(state, seconds);
    toastBooks(result.books, false);
    if (result.gain > 0) showWelcome(result);
  }

  function resetViews() {
    works.revealed = -1;
    ups.sig = null;
    ups.purchasedSig = null;
    scripture.built = -1;
    tally.buffSig = null;
    Tree.setBooks(state.books, true);
  }

  function render() {
    renderTally();
    renderBuffs();
    Tree.setBooks(state.books);

    const avail = E.availableUpgrades(state);
    let affordable = 0;
    avail.forEach(function (u) { if (u.cost <= state.faith) affordable++; });
    setBadge('badge-upgrades', affordable ? ', ' + affordable + ' you can afford' : '');
    setBadge('badge-scripture', unseenBooks && activeTab !== 'scripture' ? ', ' + unseenBooks + ' new' : '');
    setBadge('badge-jubilee', jubileeWorthIt() ? ', ' + fmt(E.pendingBlessings(state)) + ' Blessings waiting' : '');

    if (activeTab === 'works') renderWorks();
    else if (activeTab === 'upgrades') renderUpgrades(avail);
    else if (activeTab === 'scripture') { unseenBooks = 0; renderScripture(); }
    else if (activeTab === 'jubilee') renderJubilee();
    else renderRecords();
  }

  function step() {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (dt > OFFLINE_AFTER) away(dt);
    else if (dt > 0) handleEvents(E.tick(state, dt));
    render();
    if (now - lastSave >= SAVE_EVERY) save();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) save();
    else step();
  });
  window.addEventListener('pagehide', save);

  function boot(hotData) {
    loadPrefs();
    const saved = loadSaved(hotData);
    state = saved || E.createState();
    $('works-verse').textContent = '';
    appendVerse($('works-verse'), D.WORKS_VERSE.verse);
    $('works-ref').textContent = D.WORKS_VERSE.ref;
    $('jubilee-verse').textContent = '';
    appendVerse($('jubilee-verse'), D.JUBILEE_VERSE.verse);
    $('jubilee-ref').textContent = D.JUBILEE_VERSE.ref;

    const awaySeconds = (Date.now() - state.lastSaved) / 1000;
    lastTick = Date.now();
    const firstBooks = E.checkBooks(state);
    Tree.init($('tree'));
    Tree.setBooks(state.books, true);

    if (awaySeconds > OFFLINE_AFTER) away(awaySeconds);
    else if (awaySeconds > 0) handleEvents(E.tick(state, awaySeconds));
    toastBooks(firstBooks, !saved);
    if (!saved) unseenBooks = 0;

    renderAmounts();
    selectTab(activeTab);
    save();
    setInterval(step, 100);

    // Keep the game in progress when this page is updated while open.
    const viewerHot = window.claude && window.claude.hot;
    if (viewerHot && typeof viewerHot.snapshot === 'function') {
      try { viewerHot.snapshot(function () { return { save: E.serialize(state) }; }); } catch (e) { /* optional */ }
    }
  }

  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot((hot && hot.data) || {});
})();
