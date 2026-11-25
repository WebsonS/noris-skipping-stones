/* DOM UI: HUD, angle dial, power ring, result "slot machine", stone pouch, unlock reveal, settings. */
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const bus = {};
  const on = (e, f) => { (bus[e] = bus[e] || []).push(f); };
  const emit = (e, d) => { (bus[e] || []).forEach((f) => f(d)); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = () => root.Sound.sfx;

  // ---------- generic show/hide ----------
  function show(id) { $(id).classList.add('show'); }
  function hide(id) { $(id).classList.remove('show'); }
  function isOpen(id) { return $(id).classList.contains('show'); }

  let toastT = 0;
  function toast(text, ms = 1800) {
    const t = $('toast'); t.innerHTML = text; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ---------- HUD ----------
  function updateHud() {
    const d = root.Save.data;
    $('bestScore').textContent = fmt(d.bestScore);
    $('bestSkips').textContent = d.bestSkips;
    const r = root.rockById((root.Versus && root.Versus.inMatch()) ? 'pebble' : d.selected); // matches always throw the Pebble
    $('pouchImg').src = 'assets/rocks/' + r.img + '.png';
    $('resRockImg').src = 'assets/rocks/' + r.img + '.png';
    $('pouchDot').classList.toggle('on', d.unlocked.some((id) => !d.seen.includes(id)));
    const ts = $('titleStats');
    ts.innerHTML = d.throws ? `<span class="chip"><span class="k">Best</span><b>${fmt(d.bestScore)}</b></span><span class="chip"><b>${d.bestSkips}</b><span class="k">skips</span></span><span class="chip"><b>${d.unlocked.length}/${root.ROCKS.length}</b><span class="k">stones</span></span>` : '';
  }

  // ---------- angle dial ----------
  const PIV = { x: 16, y: 118 }, RAD = 108, VIS = 1.75; // visual angle = game angle × VIS
  const pt = (deg, r) => { const a = deg * VIS * Math.PI / 180; return { x: PIV.x + Math.cos(a) * r, y: PIV.y - Math.sin(a) * r }; };
  function wedge(a0, a1, r0, r1) {
    const p0 = pt(a0, r1), p1 = pt(a1, r1), q1 = pt(a1, r0), q0 = pt(a0, r0);
    return `M${q0.x},${q0.y} L${p0.x},${p0.y} A${r1},${r1} 0 0 0 ${p1.x},${p1.y} L${q1.x},${q1.y} A${r0},${r0} 0 0 1 ${q0.x},${q0.y}Z`;
  }
  function buildDial() {
    $('dialFan').setAttribute('d', wedge(0, 45, 0, RAD));
    const P = root.SkipPhysics;
    $('zoneFlat').setAttribute('d', wedge(0, P.FLAT_LIMIT, 20, RAD - 4));
    $('zoneSteep').setAttribute('d', wedge(P.STEEP_LIMIT, 45, 20, RAD - 4));
    const g = $('dialTicks'); g.innerHTML = '';
    for (let a = 0; a <= 45; a += 5) {
      const p = pt(a, RAD - (a % 10 ? 6 : 12)), q = pt(a, RAD - 1);
      g.insertAdjacentHTML('beforeend', `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`);
    }
    $('dialPivot').setAttribute('cx', PIV.x); $('dialPivot').setAttribute('cy', PIV.y);
  }
  let sweetShown = null;
  function setAngle(angle, rock, ghost, forceSweet) {
    const tip = pt(angle, RAD - 18);
    const n = $('needle');
    n.setAttribute('x1', PIV.x); n.setAttribute('y1', PIV.y); n.setAttribute('x2', tip.x); n.setAttribute('y2', tip.y);
    const st = pt(angle, RAD - 18);
    $('needleStone').setAttribute('transform', `translate(${st.x},${st.y}) rotate(${-angle * VIS})`);
    $('needleStone').firstElementChild.setAttribute('fill', rock.color || '#a7a596');
    $('angleNum').textContent = Math.round(angle) + '°';
    const showSweet = !!(rock.showSweet || forceSweet);
    const key = showSweet ? rock.id + (forceSweet ? 'f' : '') : null;
    if (key !== sweetShown) {
      sweetShown = key;
      if (showSweet) {
        const p = root.SkipPhysics.params(rock);
        const half = forceSweet ? 3 : p.sigma * 0.42;
        $('zoneSweet').setAttribute('d', wedge(p.sweet - half, p.sweet + half, 20, RAD - 4));
      } else $('zoneSweet').setAttribute('d', '');
    }
    const gl = $('ghostLine');
    if (ghost && ghost.angle != null) {
      const g = pt(ghost.angle, RAD - 4);
      gl.setAttribute('x1', PIV.x); gl.setAttribute('y1', PIV.y); gl.setAttribute('x2', g.x); gl.setAttribute('y2', g.y);
      gl.style.display = '';
    } else gl.style.display = 'none';
  }

  // ---------- power ring ----------
  const RING_C = 2 * Math.PI * 50;
  function initRing() {
    $('powerRing').setAttribute('stroke-dasharray', `0 ${RING_C}`);
    const sweet = RING_C * 0.08;
    $('sweetArc').setAttribute('stroke-dasharray', `${sweet} ${RING_C}`);
    $('sweetArc').setAttribute('stroke-dashoffset', `${-RING_C * 0.92}`);
  }
  function setPower(p, charging) {
    $('powerRing').setAttribute('stroke-dasharray', `${RING_C * p} ${RING_C}`);
    const b = $('throwBtn');
    b.classList.toggle('charging', !!charging);
    b.classList.toggle('max', !!charging && p > 0.92);
    $('throwLabel').textContent = charging ? (p > 0.92 ? 'Now!' : 'Let go!') : 'Hold';
  }
  function setHint(html) { $('hint').innerHTML = html; $('hint').style.display = html ? '' : 'none'; }

  // ---------- flight HUD ----------
  function setFlying(on) { $('hud').classList.toggle('flying', on); }
  function setSkips(n) { const el = $('skipNum'); el.textContent = n; if (n) retrigger(el, 'bump'); }
  function setScore(score, mult) {
    $('scoreNum').textContent = fmt(score);
    const m = $('multPill'); m.textContent = '×' + mult.toFixed(1);
    m.classList.toggle('hot', mult >= 2);
  }
  function banner(text, cls) {
    const b = $('banner'); b.firstElementChild.textContent = text;
    b.className = cls || ''; void b.offsetWidth; b.classList.add('go');
  }
  function releaseLabel(text, cls) {
    const b = $('releaseLabel'); b.firstElementChild.textContent = text;
    b.className = cls || ''; void b.offsetWidth; b.classList.add('go');
  }
  function tapFeedback(text) { const t = $('tapFeedback'); t.textContent = text; retrigger(t, 'go'); }
  let camImg = '';
  function noriCam(name, cls) {
    const im = $('noriCamImg');
    if (camImg !== name) { camImg = name; im.src = 'assets/cat/' + name + '.png'; }
    im.className = ''; void im.offsetWidth; im.className = cls || 'react';
  }

  // ---------- result slot machine ----------
  const ICON = {
    skip: '<svg viewBox="0 0 26 26"><g fill="none" stroke="#3f8fc4" stroke-width="2.2"><ellipse cx="13" cy="17" rx="11" ry="4"/><ellipse cx="13" cy="17" rx="5.5" ry="2"/></g><ellipse cx="13" cy="8" rx="6" ry="2.6" fill="#9a988a"/></svg>',
    pts: '<svg viewBox="0 0 26 26"><path d="M13 2l3 7 7 .6-5.3 4.7 1.7 7.2L13 17.7 6.6 21.5l1.7-7.2L3 9.6 10 9z" fill="#ffc94a" stroke="#c98a14" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    dist: '<svg viewBox="0 0 26 26"><path d="M6 23V3" stroke="#7a5640" stroke-width="2.4" stroke-linecap="round"/><path d="M7 4h12l-3 4 3 4H7z" fill="#f6a7c0"/></svg>',
    perfect: '<svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="#ffe27a"/><path d="M8 13.5l3.2 3.2L18.5 9" fill="none" stroke="#7a4b10" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tap: '<svg viewBox="0 0 64 64"><g fill="#5b3a29"><ellipse cx="32" cy="42" rx="14" ry="11"/><ellipse cx="15" cy="27" rx="6" ry="7.5"/><ellipse cx="26" cy="17" rx="6" ry="7.5"/><ellipse cx="38" cy="17" rx="6" ry="7.5"/><ellipse cx="49" cy="27" rx="6" ry="7.5"/></g></svg>',
  };

  let tally = null; // running tally state, for fast-forward
  function tier(res) {
    const n = res.skips;
    if (n === 0) return { t: res.reason === 'plunge' ? 'Kerplunk!' : res.reason === 'dig' ? 'Plop…' : 'Plop…', st: res.reason === 'plunge' ? 'shock' : res.reason === 'dig' ? 'dizzy' : 'tears', cls: 'sad', level: 0 };
    if (n <= 2) return { t: n === 1 ? 'One skip!' : 'Two skips!', st: 'sit', cls: '', level: 1 };
    if (n <= 4) return { t: 'Nice!', st: 'wave', cls: 'party', level: 2 };
    if (n <= 6) return { t: 'Great!', st: 'pounce', cls: 'party', level: 3 };
    if (n <= 9) return { t: 'Amazing!', st: 'flower', cls: 'party', level: 4 };
    if (n <= 12) return { t: 'Legendary!', st: 'bloom', cls: 'party', level: 5 };
    return { t: 'Purr-fection!', st: 'hello', cls: 'party', level: 6 };
  }

  function buildReels(total) {
    const box = $('reels'); box.innerHTML = '';
    const str = fmt(total);
    const reels = [];
    for (const ch of str) {
      if (ch === ',') { box.insertAdjacentHTML('beforeend', '<div class="reel comma">,</div>'); continue; }
      const d = +ch;
      const el = document.createElement('div'); el.className = 'reel';
      const strip = document.createElement('div'); strip.className = 'strip';
      let html = '';
      for (let k = 0; k < 30; k++) html += `<span>${k % 10}</span>`;
      strip.innerHTML = html; el.appendChild(strip); box.appendChild(el);
      reels.push({ el, strip, d });
    }
    return reels;
  }

  let pendingUnlocks = []; // stones found while the player had already moved on
  async function showResult(res, info, opts) {
    const t = tier(res);
    tally = { done: false, res, info };
    const sticker = info.newBest.score && res.skips >= 3 ? 'fish' : t.st;
    $('resSticker').src = 'assets/cat/' + sticker + '.png';
    $('resSticker').className = t.cls;
    $('resTitle').textContent = t.t;
    $('resTitle').className = t.level >= 5 ? 'rainbow' : '';
    const reasonTxt = { dig: 'Too flat — the edge dug in.', plunge: 'Too steep — it plunged.', tired: '' }[res.reason] || '';
    $('resSub').textContent = res.skips === 0 ? (reasonTxt || 'It sank right away.') : `${res.skips} skip${res.skips > 1 ? 's' : ''} · ${res.dist.toFixed(1)} m`;
    const rows = $('resRows'); rows.innerHTML = '';
    const items = [];
    items.push({ ic: ICON.skip, lbl: 'Skips', val: res.skips, plain: true });
    if (res.skips) items.push({ ic: ICON.pts, lbl: `Skip chain <small>(×${res.mult.toFixed(1)} combo)</small>`, val: res.skipPts, cls: res.skips >= 7 ? 'gold' : '' });
    items.push({ ic: ICON.dist, lbl: `Distance <small>${res.dist.toFixed(1)} m</small>`, val: res.distPts });
    if (res.perfectPts) items.push({ ic: ICON.perfect, lbl: 'Perfect release', val: res.perfectPts, cls: 'gold' });
    if (res.tapPts) items.push({ ic: ICON.tap, lbl: `Purr-fect taps ×${res.taps}`, val: res.tapPts, cls: 'pink' });
    const els = items.map((it) => {
      const li = document.createElement('li'); if (it.cls) li.className = it.cls;
      li.innerHTML = `<span class="ic">${it.ic}</span><span class="lbl">${it.lbl}</span><span class="val">0</span>`;
      rows.appendChild(li); return { li, it, val: li.querySelector('.val') };
    });
    const reels = buildReels(res.total);
    $('stamp').classList.remove('go');
    $('result').querySelector('.res-total').classList.remove('shine');
    show('result');
    const ff = () => tally.done || tally.ff;
    await wait(ff() ? 0 : 380);

    // rows count up one by one
    let tickN = 0;
    for (const e of els) {
      e.li.classList.add('in');
      if (!ff()) S().pop();
      const target = e.it.val;
      const dur = ff() ? 0 : Math.min(650, 220 + target * (e.it.plain ? 60 : 0.4));
      const t0 = performance.now();
      while (true) {
        const k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
        const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
        e.val.textContent = e.it.plain ? v : '+' + fmt(v);
        if (!ff() && (tickN++ % 3 === 0)) S().tick(tickN);
        if (k >= 1 || ff()) { e.val.textContent = e.it.plain ? target : '+' + fmt(target); break; }
        await wait(30);
      }
      await wait(ff() ? 0 : 140);
    }

    // spin the reels and land them left → right
    const h = reels.length ? reels[0].el.offsetHeight : 46;
    reels.forEach((r) => { r.strip.style.transition = 'none'; r.strip.style.transform = 'translateY(0)'; });
    void $('reels').offsetWidth;
    const spinStart = performance.now();
    reels.forEach((r, i) => {
      const dur = ff() ? 0 : 700 + i * 190;
      r.strip.style.transition = `transform ${dur}ms cubic-bezier(.12,.62,.22,1.06)`;
      r.strip.style.transform = `translateY(${-(20 + r.d) * h}px)`;
      r.landAt = spinStart + dur;
    });
    if (!ff()) {
      let landed = 0, ti = 0;
      while (landed < reels.length && !ff()) {
        const nowT = performance.now();
        reels.forEach((r) => { if (!r.landed && nowT >= r.landAt) { r.landed = true; landed++; r.el.classList.add('landed'); S().click(); } });
        if (ti++ % 2 === 0) S().tick(ti);
        await wait(45);
      }
    }
    reels.forEach((r) => { r.el.classList.add('landed'); if (t.level >= 4) r.el.classList.add('gold'); });
    $('result').querySelector('.res-total').classList.add('shine');
    S().coin();
    const card = $('result').querySelector('.result-card').getBoundingClientRect();
    if (t.level >= 2) root.FX.burst(card.left + card.width / 2, card.top + card.height * 0.62, 18 + t.level * 14, { kind: t.level >= 4 ? null : 'shell', speed: 480 + t.level * 60 });
    if (t.level >= 5) root.FX.rain(60);
    if (info.newBest.score && root.Save.data.throws > 1) {
      await wait(ff() ? 0 : 250);
      $('stamp').classList.add('go'); S().stamp();
      root.FX.burst(card.right - 40, card.top + card.height * 0.6, 30, { colors: ['#f6a7c0', '#ffd34d', '#fff6dc'] });
    }
    tally.done = true;
    const found = pendingUnlocks.concat(info.unlocked);
    if (found.length) {
      await wait(700);
      const onResults = isOpen('result'), inMatch = root.Versus && root.Versus.inMatch();
      // The reveal only ever opens on the results screen, never over live play (or mid-match, where Space
      // would equip it). Otherwise it waits for the next results screen.
      if (!onResults || inMatch) {
        pendingUnlocks = found;
        if (inMatch && onResults && info.unlocked.length) toast(`New stone found: ${info.unlocked.map((r) => r.name).join(', ')}! You'll see it after the match.`, 3200);
      } else { pendingUnlocks = []; await showUnlock(found); }
    }
    emit('result:done');
  }
  function fastForward() { if (tally && !tally.done) tally.ff = true; }

  function hideResult() { hide('result'); }

  // ---------- unlock reveal (one stone, or several found at once) ----------
  function showUnlock(list) {
    if (!Array.isArray(list)) list = [list];
    return new Promise((resolve) => {
      let pick = list[list.length - 1];
      const many = list.length > 1;
      $('unlockKicker').textContent = many ? `${list.length} new stones found!` : 'New stone found!';
      const row = $('unlockRow');
      row.innerHTML = '';
      row.style.display = many ? '' : 'none';
      $('unlockImg').style.display = many ? 'none' : '';
      const fill = (r) => {
        pick = r;
        $('unlockImg').src = 'assets/rocks/' + r.img + '.png';
        $('unlockName').textContent = r.name;
        $('unlockPower').textContent = '✦ ' + r.power + ' ✦';
        $('unlockDesc').textContent = r.desc;
        const ra = root.RARITY[r.rarity];
        $('unlockRarity').textContent = ra.label; $('unlockRarity').style.background = ra.color;
        row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === r.id));
      };
      if (many) list.forEach((r, i) => {
        const b = document.createElement('button');
        b.className = 'unlock-pick'; b.dataset.id = r.id; b.style.animationDelay = (0.15 + i * 0.16) + 's';
        b.innerHTML = `<img src="assets/rocks/${r.img}.png" alt=""><span>${r.name}</span>`;
        b.onclick = () => { S().click(); fill(r); };
        row.appendChild(b);
      });
      fill(pick);
      show('unlock');
      S().unlock();
      root.Sound.duck(0.3, 2);
      setTimeout(() => root.FX.burst(innerWidth / 2, innerHeight * 0.42, 60 + list.length * 20, { speed: 700 }), 250);
      const done = (equip) => {
        hide('unlock');
        $('btnUnlockEquip').onclick = $('btnUnlockLater').onclick = null;
        if (equip) selectRock(pick.id);
        S().click();
        resolve(equip);
      };
      $('btnUnlockEquip').onclick = () => done(true);
      $('btnUnlockLater').onclick = () => done(false);
    });
  }

  // ---------- stone pouch ----------
  let viewing = null;
  function selectRock(id) {
    const d = root.Save.data;
    if (!d.unlocked.includes(id)) return;
    root.Save.set('selected', id);
    if (!d.seen.includes(id)) { d.seen.push(id); root.Save.save(); }
    updateHud();
    emit('rock:select', id);
  }
  function openRocks() {
    if ((root.Versus && root.Versus.inMatch())) return toast('Friend matches use the Pebble for both players.');
    viewing = root.Save.data.selected;
    renderRocks();
    show('rocksMenu');
    S().pop();
    emit('rocks:open');
  }
  function closeRocks() { hide('rocksMenu'); emit('rocks:close'); }
  function renderRocks() {
    const d = root.Save.data, grid = $('rockGrid');
    $('pouchCount').textContent = `${d.unlocked.length} / ${root.ROCKS.length}`;
    grid.innerHTML = '';
    for (const r of root.ROCKS) {
      const un = d.unlocked.includes(r.id);
      const c = document.createElement('button');
      c.className = 'rock-cell' + (un ? '' : ' locked') + (d.selected === r.id ? ' sel' : '') + (viewing === r.id ? ' viewing' : '');
      c.dataset.id = r.id;
      c.innerHTML = `<span class="bar" style="background:${root.RARITY[r.rarity].color}"></span>${un && !d.seen.includes(r.id) ? '<span class="new">NEW</span>' : ''}<img src="assets/rocks/${r.img}.png" alt=""><span class="nm">${un ? r.name : '???'}</span>`;
      c.onclick = () => {
        viewing = r.id; S().click();
        if (un && !d.seen.includes(r.id)) { d.seen.push(r.id); root.Save.save(); updateHud(); }
        renderRocks(); emit('rocks:view', r.id);
      };
      grid.appendChild(c);
    }
    const r = root.rockById(viewing), un = d.unlocked.includes(r.id), ra = root.RARITY[r.rarity];
    const det = $('rockDetail');
    let action = '';
    if (un) action = d.selected === r.id ? '<span class="count">In your paw ✓</span>' : '<button id="btnEquip" class="btn primary small">Use this stone</button>';
    else {
      const pv = root.Save.progressValue(r);
      const unit = r.unlock.type === 'dist' ? ' m' : '';
      action = `<div class="progress"><i style="width:${(pv.cur / pv.max) * 100}%"></i></div><div class="progress-lbl">🔒 ${r.unlock.text} — ${fmt(pv.cur)}${unit} / ${fmt(pv.max)}${unit}</div>`;
    }
    det.innerHTML = `<div class="big"><img class="${un ? '' : 'locked'}" src="assets/rocks/${r.img}.png" alt=""><div class="rarity" style="background:${ra.color}">${ra.label}</div></div>
      <div class="info"><h4>${un ? r.name : 'Mystery stone'}</h4><div class="pw">${un ? '✦ ' + r.power : '✦ ???'}</div><p>${un ? r.desc : 'Somewhere along the shore, a special stone is waiting…'}</p>${action}</div>`;
    const eq = $('btnEquip');
    if (eq) eq.onclick = () => { selectRock(r.id); S().pop(); renderRocks(); toast(`<b>${r.name}</b> is in Nori's paw!`); emit('rocks:equip', r.id); };
  }

  // ---------- settings ----------
  function openSettings() {
    const d = root.Save.data;
    $('optMusic').checked = d.music; $('optSfx').checked = d.sfx; $('optShake').checked = d.shake;
    $('statsBox').innerHTML = `<div>Best score<b>${fmt(d.bestScore)}</b></div><div>Most skips<b>${d.bestSkips}</b></div><div>Longest throw<b>${d.bestDist.toFixed(1)} m</b></div><div>Stones thrown<b>${fmt(d.throws)}</b></div><div>Total skips<b>${fmt(d.totalSkips)}</b></div><div>Perfect releases<b>${fmt(d.perfects)}</b></div>`;
    $('btnReset').textContent = 'Reset progress'; $('btnReset').dataset.arm = '';
    show('settings'); S().pop();
    emit('settings:open');
  }

  function init() {
    buildDial(); initRing();
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.close; S().click();
      if (id === 'rocksMenu') closeRocks(); else { hide(id); emit(id + ':close'); }
    }));
    $('optMusic').onchange = (e) => { root.Save.set('music', e.target.checked); root.Sound.setMusic(e.target.checked); };
    $('optSfx').onchange = (e) => { root.Save.set('sfx', e.target.checked); root.Sound.setSfx(e.target.checked); };
    $('optShake').onchange = (e) => root.Save.set('shake', e.target.checked);
    $('btnReset').onclick = () => {
      const b = $('btnReset');
      if (b.dataset.arm) { root.Save.resetAll(); hide('settings'); updateHud(); toast('Progress reset. Fresh lake, fresh stones!'); emit('reset'); }
      else { b.dataset.arm = '1'; b.textContent = 'Tap again to confirm'; }
    };
    $('result').querySelector('.result-card').addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) fastForward(); });
    updateHud();
  }

  root.UI = {
    init, on, emit, show, hide, isOpen, toast, updateHud, setAngle, setPower, setHint, setFlying, setSkips, setScore,
    banner, releaseLabel, tapFeedback, noriCam, showResult, hideResult, fastForward, showUnlock, openRocks, closeRocks, renderRocks,
    selectRock, openSettings, fmt, get tallyDone() { return !tally || tally.done; },
  };
})(window);
