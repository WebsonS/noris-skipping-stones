/* Game flow, input, the cinematic throw camera and Nori's animation. */
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const P = root.SkipPhysics, Scene = root.Scene, UI = root.UI, Save = root.Save;
  const SFX = () => root.Sound.sfx;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const touch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in root && !matchMedia('(pointer: fine)').matches);
  document.body.classList.toggle('touch', touch);

  // ---------------- state ----------------
  const G = {
    state: 'loading', time: 0,
    angle: 12, power: 0, charging: false, chargeT: 0, chargePointer: null, chargeKey: false,
    drag: null, keysHeld: {},
    throw: null, flightT: 0, ts: 1, slow: { scale: 1, until: 0 }, pendingTap: 0, tapCool: 0,
    sinkT: 0, sinkPos: null, rock: null, trail: [], approach: null,
    ret: null, result: null, resultInfo: null, night: 0,
    flash: 0, shake: 0, punch: 0, rollT: 0, side: 0, sideT: 0, lift: 0,
    camVelZ: 0, freeze: false, lastMilestone: 0,
    cat: { pose: root.CatArt.pose(), mode: 'idle', t: 0, view: 'front', turn: null, react: null, blinkT: 2, reactT: 0 },
  };
  root.Game = G;
  const listeners = {};
  G.on = (e, f) => { (listeners[e] = listeners[e] || []).push(f); };
  G.emit = (e, d) => (listeners[e] || []).forEach((f) => f(d));
  G.tut = { active: false, forceSweet: false, assist: 0, lockThrow: false, freezeAtSkip: 0, minPower: 0, lockRocks: false };

  function rock() { return root.rockById(root.Versus && root.Versus.inMatch() ? 'pebble' : Save.data.selected); } // friend matches: same stone for both

  // ---------------- camera poses ----------------
  function aimPose() {
    const portrait = innerHeight > innerWidth;
    return portrait ? { x: 0.1, y: 1.3, z: -2.3, fov: 1, pitch: 0, roll: 0 } : { x: 0.5, y: 1.25, z: -2.7, fov: 1, pitch: 0, roll: 0 };
  }
  function resultPose() { const a = aimPose(); if (innerHeight > innerWidth) a.pitch = -0.2; return a; }
  function titlePose() { const a = aimPose(); return Object.assign({}, a, { y: a.y + 0.25, z: a.z - 0.4, pitch: innerHeight > innerWidth ? -0.07 : 0.02 }); }

  // ---------------- boot ----------------
  async function boot() {
    Scene.init($('scene'), touch);
    UI.init();
    const total = 1 + root.ROCKS.length + 21;
    let n = 0;
    await Scene.load(() => { n++; $('loadFill').style.width = Math.round((n / total) * 100) + '%'; });
    Object.assign(Scene.cam, titlePose());
    G.state = 'title';
    G.night = rock().night ? 1 : 0;
    UI.setHint(hintText());
    setTimeout(() => { UI.hide('loading'); UI.show('title'); }, 350);
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function hintText() {
    return touch
      ? 'Slide on the <b>left</b> to tilt · <b>hold</b> the paw, let go to throw'
      : '<b>Scroll</b> or <b>↑ ↓</b> to tilt · <b>hold click</b> or <b>Space</b>, release to throw';
  }

  // ---------------- flow ----------------
  function startPlaying() {
    root.Sound.init();
    applyAudioSettings();
    UI.hide('title');
    SFX().pop();
    if (!Save.data.tutorialDone) { UI.show('choice'); G.state = 'choice'; return; }
    enterAim();
  }
  function applyAudioSettings() { root.Sound.setMusic(Save.data.music); root.Sound.setSfx(Save.data.sfx); }

  function enterAim() {
    G.state = 'aim';
    G.throw = null; G.rock = null; G.approach = null; G.charging = false; G.power = 0;
    $('hud').classList.add('show');
    $('hud').classList.remove('locked');
    UI.setFlying(false);
    UI.setPower(0, false);
    UI.updateHud();
    setCatMode('aim');
    G.emit('aim');
  }

  function goTitle() {
    UI.hideResult(); UI.hide('settings');
    $('hud').classList.remove('show');
    G.state = 'title'; G.ret = null; G.throw = null; G.rock = null;
    setCatMode('idle');
    UI.updateHud();
    UI.show('title');
  }

  // ---------------- charging & release ----------------
  function canThrow() {
    return G.state === 'aim' && !G.tut.lockThrow && !UI.isOpen('rocksMenu') && !UI.isOpen('settings') && !UI.isOpen('choice') && !UI.isOpen('unlock') && !UI.isOpen('versus') && !(root.Versus && root.Versus.blocked());
  }
  function startCharge(pointerId, key) {
    if (!canThrow() || G.charging) return;
    G.charging = true; G.chargeT = 0; G.power = 0; G.chargePointer = pointerId; G.chargeKey = !!key;
    $('hud').classList.add('charging');
    G.emit('chargeStart');
  }
  function endCharge() {
    if (!G.charging) return;
    G.charging = false; G.chargePointer = null; G.chargeKey = false;
    $('hud').classList.remove('charging');
    if (G.chargeT < 0.14) { UI.setPower(0, false); UI.toast(touch ? 'Hold the paw button to wind up!' : 'Hold to wind up, then let go!'); return; }
    release();
  }
  function powerAt(t) {
    const x = t / 0.82; // one sweep up takes 0.82s, then back down
    const k = x % 2;
    return k < 1 ? k : 2 - k;
  }

  function release() {
    const r = rock();
    let power = G.power;
    if (G.tut.minPower) power = Math.max(power, G.tut.minPower);
    const seed = (Math.random() * 1e9) | 0;
    const s = P.createThrow(G.angle, power, r, seed, { assist: G.tut.assist, maxSkips: G.tut.maxSkips });
    G.throw = s;
    G.flightT = 0; G.sinkT = 0; G.trail = []; G.pendingTap = 0; G.tapCool = 0; G.lastMilestone = 0;
    G.side = 0; G.sideT = 0; G.lift = 0; G.camVelZ = 0; G.freeze = false;
    G.state = 'throw'; G.cat.t = 0;
    setCatMode('throw');
    UI.setPower(0, false);
    UI.setFlying(true);
    UI.setSkips(0); UI.setScore(0, 1);
    UI.noriCam('sit', 'react');
    SFX().whoosh(power);
    vibrate(12);
    const rel = s.release;
    const cls = rel.key === 'perfect' ? 'perfect' : (rel.q < 0.25 ? 'bad' : '');
    setTimeout(() => UI.releaseLabel(rel.label, cls), 120);
    if (rel.key === 'perfect') { G.flash = 0.25; setTimeout(() => SFX().milestone(1), 80); }
    G.emit('release', { angle: G.angle, power, rating: rel });
  }

  // ---------------- taps during flight ----------------
  function flightTap() {
    if (G.state !== 'flight' || !G.throw || !G.throw.alive) return;
    if (G.tapCool > 0 || G.pendingTap) return;
    const tc = P.timeToContact(G.throw);
    const p = G.throw.p;
    const win = 0.1 * p.tapWindow, perfect = 0.05 * p.tapWindow;
    if (tc != null && tc < win) {
      G.pendingTap = tc < perfect || G.freeze ? 2 : 1;
      if (G.freeze) { G.freeze = false; G.emit('tutTapped'); }
    } else {
      G.tapCool = 0.3;
      UI.tapFeedback('Too early!');
    }
  }

  // ---------------- input ----------------
  const canvas = $('scene');
  function setAngle(a) {
    a = clamp(a, 0, 45);
    if (Math.abs(a - G.angle) > 0.01) { G.angle = a; G.emit('angle', a); }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (G.state === 'flight') { flightTap(); return; }
    if (G.state === 'result') { UI.fastForward(); return; }
    if (G.state !== 'aim') return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      startCharge(e.pointerId);
    } else if (e.clientX < innerWidth * 0.5) {
      G.drag = { id: e.pointerId, y: e.clientY, a: G.angle };
    } else {
      startCharge(e.pointerId);
    }
  });
  $('throwBtn').addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    if (G.state === 'flight') { flightTap(); return; }
    try { $('throwBtn').setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    startCharge(e.pointerId);
  });
  $('angleDial').addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    if (G.state !== 'aim' || G.charging) return;
    try { $('angleDial').setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    G.drag = { id: e.pointerId, y: e.clientY, a: G.angle };
  });
  root.addEventListener('pointermove', (e) => {
    if (G.drag && e.pointerId === G.drag.id) {
      if (!G.charging) setAngle(G.drag.a + (G.drag.y - e.clientY) * (touch ? 0.17 : 0.2));
    }
  });
  root.addEventListener('wheel', (e) => {
    if (G.state !== 'aim' || G.charging || UI.isOpen('rocksMenu') || UI.isOpen('settings')) return;
    e.preventDefault();
    const d = Math.abs(e.deltaY) < 20 ? e.deltaY * 0.08 : Math.sign(e.deltaY) * 1.5;
    setAngle(G.angle - d);
  }, { passive: false });
  const up = (e) => {
    if (G.drag && e.pointerId === G.drag.id) G.drag = null;
    if (G.charging && G.chargePointer === e.pointerId) endCharge();
  };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  root.addEventListener('keydown', (e) => {
    if (e.repeat && (e.code === 'Space')) { e.preventDefault(); return; }
    G.keysHeld[e.code] = true;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (G.state === 'title') { $('btnPlay').click(); return; }
      if (UI.isOpen('unlock')) { $('btnUnlockEquip').click(); return; }
      if (G.state === 'flight') { flightTap(); return; }
      if (G.state === 'result') { if (!UI.tallyDone) UI.fastForward(); else if (!G.tut.active || G.tut.allowAgain) $('btnAgain').click(); return; }
      if (G.state === 'aim' && e.code === 'Space') startCharge(null, true);
    }
    if (e.code === 'Escape') {
      if (UI.isOpen('rocksMenu') && !G.tut.active) UI.closeRocks();
      else if (UI.isOpen('settings')) UI.hide('settings');
    }
    if ((e.code === 'KeyR' || e.code === 'KeyB') && G.state === 'aim' && !G.tut.lockRocks && !UI.isOpen('settings')) UI.isOpen('rocksMenu') ? UI.closeRocks() : UI.openRocks();
  });
  root.addEventListener('keyup', (e) => {
    G.keysHeld[e.code] = false;
    if (e.code === 'Space' && G.chargeKey) endCharge();
  });
  root.addEventListener('blur', () => { G.keysHeld = {}; if (G.charging) { G.charging = false; UI.setPower(0, false); } });
  document.addEventListener('visibilitychange', () => { document.hidden ? root.Sound.suspend() : root.Sound.resume(); });

  // buttons
  $('btnPlay').addEventListener('click', startPlaying);
  $('btnTutYes').addEventListener('click', () => { UI.hide('choice'); SFX().pop(); enterAim(); root.Tutorial.start(); });
  $('btnTutNo').addEventListener('click', () => { UI.hide('choice'); Save.set('tutorialDone', true); SFX().click(); enterAim(); UI.toast('Have fun! You can replay the tutorial in Settings.'); });
  $('btnAgain').addEventListener('click', () => { if (G.state !== 'result' || (G.tut.active && !G.tut.allowAgain)) return; SFX().click(); UI.hideResult(); enterAim(); G.emit('again'); });
  $('btnRocks').addEventListener('click', () => { if (G.tut.lockRocks || G.state === 'flight') return; UI.openRocks(); });
  $('btnResRocks').addEventListener('click', () => { if (G.tut.lockRocks) return; UI.openRocks(); });
  $('btnTitleRocks').addEventListener('click', () => { root.Sound.init(); applyAudioSettings(); UI.openRocks(); });
  $('btnSettings').addEventListener('click', () => { if (G.state === 'flight') return; UI.openSettings(); });
  $('btnTitleSettings').addEventListener('click', () => { root.Sound.init(); applyAudioSettings(); UI.openSettings(); });
  $('btnReplayTut').addEventListener('click', () => {
    if (root.Versus && root.Versus.inMatch()) return UI.toast('Finish or leave the match to replay the tutorial.');
    UI.hide('settings');
    if (G.state === 'title') { UI.hide('title'); root.Sound.init(); applyAudioSettings(); }
    if (G.state === 'result') UI.hideResult();
    if (G.state !== 'flight') { enterAim(); root.Tutorial.start(); }
  });
  const home = () => { if (G.tut.active) root.Tutorial.end(false); if (root.Versus) root.Versus.leave(); goTitle(); };
  $('btnHome').addEventListener('click', home);
  $('btnResHome').addEventListener('click', () => { SFX().click(); home(); });
  UI.on('rock:select', (id) => { root.Sound.setNight(!!root.rockById(id).night); });
  UI.on('reset', () => { goTitle(); });

  function vibrate(ms) { if (touch && navigator.vibrate) try { navigator.vibrate(ms); } catch (_) { /* ignore */ } }

  // ---------------- flight & events ----------------
  const MILESTONES = { 3: 'Nice!', 5: 'Great!', 7: 'AMAZING!', 10: 'LEGENDARY!', 13: 'UNSTOPPABLE!', 16: 'PURR-FECTION!', 20: 'MYTHIC!!' };

  function onSkip(b) {
    const n = b.n, s = G.throw, r = rock();
    const big = n >= 7;
    const size = 0.45 + Math.min(1, b.speed / 22) * 0.8 + Math.min(n, 12) * 0.03;
    const ripColor = r.id === 'frost' ? 'rgba(210,245,255,ALPHA)' : r.id === 'rainbow' ? ['rgba(255,150,180,ALPHA)', 'rgba(255,220,120,ALPHA)', 'rgba(150,230,140,ALPHA)', 'rgba(130,200,255,ALPHA)', 'rgba(200,170,255,ALPHA)'][n % 5] : null;
    Scene.splash(b.x, b.z, size, { color: ripColor, gold: n >= 5, forward: s.vz * 0.15, rings: n >= 5 ? 4 : 3, life: 7.5 + Math.min(n, 10) * 0.25 });
    Scene.sparkle(b.x, 0.05, b.z, 3 + Math.min(n, 14), { size: 0.05 + Math.min(n, 12) * 0.005, tint: n >= 7 ? 'rgba(255,200,230,0.7)' : null });
    if (r.id === 'rainbow' && s.bounces.length > 1) { const pb = s.bounces[s.bounces.length - 2]; Scene.rainbow(pb.x, pb.z, b.x, b.z); }
    if (b.rescued) { Scene.lilyPop(b.x, b.z); SFX().lily(); Scene.pop({ x: b.x, z: b.z, y: 0.4, text: 'Lily pad!', size: 26, c2: '#8fdc6e', life: 1.4 }); }
    if (b.gust) { SFX().gust(); Scene.pop({ x: b.x, z: b.z, y: 0.6, text: 'Whoosh!', size: 26, c2: '#9fe0ff', life: 1.3 }); G.punch = Math.max(G.punch, 0.08); }
    if (b.lucky) { SFX().lucky(); Scene.pop({ x: b.x, z: b.z, y: 0.65, text: 'LUCKY ×3', size: 26, c2: '#8fdc6e', life: 1.5 }); }
    if (b.tapped) {
      SFX().tap(b.tapped >= 2);
      UI.tapFeedback(b.tapped >= 2 ? 'Purr-fect tap!' : 'Nice tap!');
      Scene.sparkle(b.x, 0.1, b.z, 10, { size: 0.08, tint: 'rgba(255,170,210,0.8)' });
    }
    // floating score pop, escalating
    const col = n >= 10 ? ['#ffffff', '#c5a3ff'] : n >= 7 ? ['#ffffff', '#ff9ec7'] : n >= 3 ? ['#fffbe6', '#ffc94a'] : ['#ffffff', '#bfe9ff'];
    Scene.pop({ x: b.x, z: b.z, text: '+' + UI.fmt(b.pts), size: 24 + Math.min(n, 16) * 2.2, c1: col[0], c2: col[1], big, rot: (Math.random() - 0.5) * 0.2 });
    SFX().skip(n, big);
    vibrate(n >= 7 ? 22 : 10);
    UI.setSkips(n); UI.setScore(s.score, s.mult);
    root.Sound.setIntensity(Math.min(1, n / 10));
    // reactions in the Nori-cam
    if (n === 3) UI.noriCam('alert'); else if (n === 5) UI.noriCam('pounce'); else if (n === 7) UI.noriCam('flower', 'party'); else if (n === 10) UI.noriCam('bloom', 'party'); else if (n === 13) UI.noriCam('hello', 'party');
    // camera & time: the highlight-reel treatment
    const shakeOn = Save.data.shake;
    if (MILESTONES[n]) {
      G.slow = { scale: n >= 7 ? 0.18 : 0.3, until: G.time + (n >= 7 ? 0.65 : 0.45) };
      G.punch = Math.max(G.punch, n >= 7 ? 0.2 : 0.12);
      G.rollT = (Math.random() < 0.5 ? -1 : 1) * (n >= 7 ? 0.06 : 0.035);
      G.sideT = (G.sideT >= 0 ? -1 : 1) * (0.5 + Math.min(n, 12) * 0.05);
      G.flash = Math.max(G.flash, n >= 7 ? 0.45 : 0.2);
      if (shakeOn) G.shake = Math.max(G.shake, n >= 7 ? 9 : 5);
      UI.banner(MILESTONES[n], n >= 10 ? 'rainbow' : n >= 7 ? 'pink' : n >= 5 ? 'warm' : '');
      SFX().milestone(Math.min(4, (n / 4) | 0));
      root.Sound.duck(0.4, 0.8);
      Scene.sparkle(b.x, 0.2, b.z, 14, { size: 0.09, speed: 2.4 });
      if (n >= 7) root.FX.burst(innerWidth / 2, innerHeight * 0.3, 26 + n * 2, { speed: 520 });
      G.lastMilestone = n;
    } else if (n >= 3) {
      G.slow = { scale: 0.5, until: G.time + 0.12 };
      G.punch = Math.max(G.punch, 0.05);
      if (shakeOn) G.shake = Math.max(G.shake, 2.5);
    } else if (shakeOn) G.shake = Math.max(G.shake, 1.5);
    G.emit('skip', b);
  }

  function onSink(ev) {
    const s = G.throw;
    G.state = 'sinking'; G.sinkT = 0;
    G.sinkPos = { x: ev.x, z: ev.z };
    G.approach = null;
    const bad = s.skips === 0;
    Scene.splash(ev.x, ev.z, bad ? 1.1 : 0.55, { rings: bad ? 4 : 3, life: 5 });
    Scene.bubble(ev.x, ev.z, bad ? 7 : 5);
    SFX().sink(bad);
    G.slow = { scale: 0.45, until: G.time + 0.7 };
    if (bad) {
      UI.noriCam(ev.reason === 'plunge' ? 'shock' : ev.reason === 'dig' ? 'dizzy' : 'tears', 'react');
      Scene.pop({ x: ev.x, z: ev.z, y: 0.3, text: ev.reason === 'plunge' ? 'Kerplunk!' : 'Plop!', size: 34, c1: '#e8f6ff', c2: '#9fd3ee', life: 1.6 });
    } else if (s.skips <= 2) UI.noriCam('tears', 'react');
    root.Sound.setIntensity(0);
    G.emit('sink', ev);
  }

  function updateFlight(dt) {
    const s = G.throw, r = rock();
    // time scale: rock trait × slow-mo × tutorial freeze
    let target = (r.params.timeScale || 1);
    if (G.time < G.slow.until) target *= G.slow.scale;
    const pc = P.predictContact(s);
    if (pc) {
      const show = 0.42;
      if (pc.t < show) G.approach = { x: pc.x, z: pc.z, k: pc.t / show, hot: pc.t < 0.1 * s.p.tapWindow };
      else G.approach = null;
      if (s.skips >= 3 && pc.t < 0.14) target *= 0.65;
      if (G.tut.freezeAtSkip && s.skips + 1 === G.tut.freezeAtSkip && pc.t < 0.05 && !G.pendingTap && !G.freeze) {
        G.freeze = true; G.emit('tutFreeze');
      }
    } else G.approach = null;
    if (G.freeze) target = 0.0;
    G.ts = lerp(G.ts, target, damp(G.freeze ? 30 : 14, dt));
    const gdt = dt * G.ts;
    G.flightT += gdt;
    G.tapCool = Math.max(0, G.tapCool - dt);
    const evs = P.step(s, gdt, () => { const t = G.pendingTap; G.pendingTap = 0; return t; });
    for (const ev of evs) { if (ev.type === 'skip') onSkip(ev); else if (ev.type === 'sink') onSink(ev); }
    // trail + visual rock
    G.trail.push({ x: s.x, y: s.y + 0.04, z: s.z });
    if (G.trail.length > 18) G.trail.shift();
    return gdt;
  }

  function updateRockVisual(dt, gdt) {
    const s = G.throw; if (!s) return;
    const r = rock();
    const q = s.release.q;
    if (!G.rock) G.rock = { id: r.id, visible: true, rot: 0, spinPhase: 0, squash: 0, trail: G.trail, minPx: touch ? 14 : 16 };
    const v = G.rock;
    v.id = r.id; v.x = s.x; v.y = s.y; v.z = s.z; v.trail = G.trail;
    v.spinPhase += gdt * s.spin;
    v.rot = Math.sin(v.spinPhase * 0.5) * 0.12 - 0.1;
    v.squash *= Math.exp(-dt * 10);
    v.trailColor = s.skips >= 7 ? '#ffd6ea' : (r.color || '#ffffff');
    v.trailBoost = 0.8 + Math.min(1.2, s.skips * 0.12) + q * 0.4;
    v.glow = s.skips >= 5 ? Math.min(1, (s.skips - 4) * 0.2) : (s.perfectRelease ? 0.5 : 0);
    v.sunk = G.state === 'sinking' || G.state === 'return' || G.state === 'result';
    v.sinkT = G.sinkT;
    v.visible = G.sinkT < 1.2;
  }

  // ---------------- director: the camera ----------------
  function direct(dt) {
    const cam = Scene.cam;
    const shakeAmp = G.shake;
    G.shake *= Math.exp(-dt * 7);
    G.punch *= Math.exp(-dt * 4.5);
    G.flash *= Math.exp(-dt * 5);
    G.rollT *= Math.exp(-dt * 2.2);
    let T = null, k = 4;

    if (G.state === 'title' || G.state === 'choice' || G.state === 'loading') {
      T = titlePose();
      T.x += Math.sin(G.time * 0.15) * 0.25; T.y += Math.sin(G.time * 0.2) * 0.05;
      k = 1.2;
    } else if (G.state === 'aim') {
      T = aimPose();
      T.x += Math.sin(G.time * 0.3) * 0.03; T.y += Math.sin(G.time * 0.4) * 0.02;
      if (G.charging) { T.z += G.power * 0.35; T.fov = 1 + G.power * 0.05; }
      k = 3;
    } else if (G.state === 'throw') {
      T = aimPose(); T.z += 0.3; T.fov = 1.04; k = 3;
    } else if (G.state === 'flight' && G.throw) {
      const s = G.throw;
      G.side = lerp(G.side, G.sideT, damp(1.6, dt));
      const slowmo = G.time < G.slow.until;
      G.lift = lerp(G.lift, slowmo ? -0.28 : 0, damp(5, dt));
      const follow = 2.3 + clamp(s.vz, 0, 22) * 0.055;
      T = { x: s.x * 0.85 + G.side, y: Math.max(0.32, 0.72 + s.y * 0.4 + G.lift), z: s.z - follow, fov: 1, pitch: slowmo ? 0.025 : 0, roll: 0 };
      // whoosh: let the stone pull away for a beat, then chase it with velocity feed-forward
      const chase = clamp((G.flightT - 0.12) / 0.35, 0, 1);
      cam.z += s.vz * dt * G.ts * chase;
      k = lerp(1.2, 6, chase);
    } else if (G.state === 'sinking' && G.sinkPos) {
      const bad = G.throw.skips === 0;
      const crane = !bad && G.sinkT > 0.9;
      T = crane
        ? { x: G.sinkPos.x * 0.6, y: 5.2, z: G.sinkPos.z - 13, fov: 1, pitch: -0.1, roll: 0 }
        : { x: G.sinkPos.x * 0.8, y: 0.8, z: G.sinkPos.z - (bad ? 4.5 : 3.4), fov: 1, pitch: 0, roll: 0 };
      k = crane ? 1.6 : 2.5;
    } else if (G.state === 'return' && G.ret) {
      const t = ease(clamp(G.ret.t / G.ret.dur, 0, 1));
      const A = G.ret.from, B = resultPose();
      for (const key of ['x', 'y', 'z', 'fov', 'pitch']) cam[key] = lerp(A[key], B[key], t);
      cam.y += Math.sin(t * Math.PI) * 0.9; // a gentle arc home
      cam.roll = lerp(A.roll, 0, t);
    } else if (G.state === 'result') {
      T = resultPose(); T.x += Math.sin(G.time * 0.3) * 0.03; k = 2;
    }

    if (T) {
      const d = damp(k, dt);
      cam.x = lerp(cam.x, T.x, d); cam.y = lerp(cam.y, T.y, d); cam.z = lerp(cam.z, T.z, d);
      cam.fov = lerp(cam.fov, T.fov || 1, d); cam.pitch = lerp(cam.pitch, T.pitch || 0, d);
      cam.roll = lerp(cam.roll, (T.roll || 0) + G.rollT, damp(6, dt));
    }
    cam.fov *= 1 + G.punch;
    cam.shakeX = (Math.random() - 0.5) * shakeAmp;
    cam.shakeY = (Math.random() - 0.5) * shakeAmp;
  }

  // ---------------- Nori ----------------
  function setCatMode(mode, react) {
    const c = G.cat;
    if (mode === c.mode && !react) return;
    c.mode = mode; c.t = 0;
    if (react) { c.react = react; c.reactT = 0; }
    const wantView = (mode === 'aim' || mode === 'throw' || mode === 'watch') ? 'back' : 'front';
    if (wantView !== c.view) c.turn = { t: 0, to: wantView };
  }

  function updateCat(dt) {
    const c = G.cat, p = c.pose;
    c.t += dt; p.time += dt;
    const excite = G.throw ? Math.min(1, G.throw.skips / 8) : 0;
    p.tail += dt * (1.3 + excite * 3);
    // turning (paper-flip squash)
    if (c.turn) {
      c.turn.t += dt / 0.28;
      const t = Math.min(1, c.turn.t);
      p.turnScale = Math.abs(Math.cos(t * Math.PI));
      if (t >= 0.5) { c.view = c.turn.to; p.view = c.view; }
      if (t >= 1) { c.turn = null; p.turnScale = 1; }
    }
    // blinking
    c.blinkT -= dt;
    let eyes = 'open';
    if (c.blinkT < 0) { eyes = 'blink'; if (c.blinkT < -0.12) c.blinkT = 2 + Math.random() * 3.5; }
    p.blush = false; p.mouth = null; p.tear = 0; p.lookX = 0; p.lookY = 0;
    let bob = 0, squash = Math.sin(G.time * 2.2) * 0.12, crouch = 0, lean = 0, headTilt = Math.sin(G.time * 0.7) * 0.04, ear = 0;
    if (Math.sin(G.time * 1.3) > 0.985) ear = 3;
    const r = rock();
    p.rockImg = Scene.img.rocks[r.id];

    if (c.mode === 'idle') {
      p.rockVisible = false;
      p.lookX = Math.sin(G.time * 0.4) * 1.5;
    } else if (c.mode === 'aim') {
      p.rockVisible = true;
      if (G.charging) {
        crouch = G.power * 0.7; lean = 0.08 + G.power * 0.1;
        p.arm = { angle: -0.15 - G.power * 0.35, reach: 1.05, behind: false };
        squash = G.power * 0.4;
      } else {
        lean = Math.sin(G.time * 1.1) * 0.02;
        p.arm = { angle: 0.85 + Math.sin(G.time * 1.6) * 0.06, reach: 0.95, behind: false };
      }
    } else if (c.mode === 'throw') {
      const k = clamp(c.t / 0.3, 0, 1);
      const a = k < 0.5 ? lerp(-0.5, 1.6, ease(k / 0.5)) : lerp(1.6, 3.0, ease((k - 0.5) / 0.5));
      p.arm = { angle: a, reach: k > 0.25 && k < 0.65 ? 0.72 : 1.05, behind: k > 0.3 && k < 0.7 };
      p.rockVisible = k < 0.42;
      lean = lerp(0.18, -0.2, ease(k)); crouch = lerp(0.7, 0.15, k); squash = k < 0.4 ? -0.3 : 0.2;
      if (k >= 0.42 && G.state === 'throw') { G.state = 'flight'; G.emit('flight'); }
      if (k >= 1) setCatMode('watch');
    } else if (c.mode === 'watch') {
      p.rockVisible = false;
      p.arm = { angle: 2.5, reach: 0.9, behind: false };
      lean = -0.08 + Math.sin(c.t * 3) * 0.02; crouch = 0.1;
      bob = G.throw && G.throw.skips >= 3 ? Math.abs(Math.sin(c.t * 8)) * 4 : 0;
    } else if (c.mode === 'react') {
      p.rockVisible = false;
      const kind = c.react, t = c.t;
      if (kind === 'great') {
        eyes = 'happy'; p.blush = true;
        bob = t < 2.4 ? Math.abs(Math.sin(t * 7)) * 16 : Math.abs(Math.sin(t * 2.5)) * 3;
        squash = bob < 2 ? 0.5 : -0.2;
        headTilt = Math.sin(t * 7) * 0.12;
        if (t < 2.4 && Math.random() < dt * 8) Scene.sparkle(Scene.CAT_POS.x + (Math.random() - 0.5) * 0.4, 0.9, Scene.CAT_POS.z, 2, { size: 0.06, tint: Math.random() < 0.5 ? 'rgba(255,160,200,0.8)' : null });
      } else if (kind === 'good') {
        eyes = t < 1.6 ? 'happy' : eyes; p.blush = t < 1.6;
        bob = t < 0.6 ? Math.sin(t / 0.6 * Math.PI) * 12 : 0;
        headTilt = 0.1 * Math.sin(t * 3);
      } else if (kind === 'meh') {
        headTilt = 0.22 * Math.min(1, t * 3); p.lookY = -1.5;
      } else if (kind === 'dizzy') {
        eyes = t < 2.4 ? 'dizzy' : eyes; headTilt = Math.sin(t * 5) * 0.2; lean = Math.sin(t * 3) * 0.08;
      } else if (kind === 'shock') {
        eyes = t < 2 ? 'shock' : eyes; squash = t < 0.3 ? -0.6 : 0; bob = t < 0.25 ? 10 : 0;
      } else if (kind === 'sad') {
        eyes = t < 3 ? 'sad' : eyes; p.tear = (t * 0.6) % 1; crouch = 0.25; headTilt = -0.12;
      }
    }
    p.eyes = eyes; p.bob = bob; p.squash = squash; p.crouch = crouch; p.lean = lean; p.headTilt = headTilt; p.earTwitch = ear;
  }

  // ---------------- main loop ----------------
  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    G.time += dt;
    let gdt = dt;

    if (G.state === 'aim') {
      // keyboard aiming
      const kUp = G.keysHeld.ArrowUp || G.keysHeld.KeyW, kDn = G.keysHeld.ArrowDown || G.keysHeld.KeyS;
      if ((kUp || kDn) && !G.charging) setAngle(G.angle + (kUp ? 1 : -1) * 18 * dt);
      if (G.charging) {
        const prev = G.power;
        G.chargeT += dt; G.power = powerAt(G.chargeT);
        if (Math.floor(prev * 10) !== Math.floor(G.power * 10)) SFX().charge(G.power);
        UI.setPower(G.power, true);
      }
    } else if (G.state === 'flight' || G.state === 'throw') {
      if (G.state === 'flight') gdt = updateFlight(dt);
    } else if (G.state === 'sinking') {
      let ts = G.time < G.slow.until ? G.slow.scale : 1;
      G.ts = lerp(G.ts, ts, damp(8, dt));
      gdt = dt * G.ts;
      G.sinkT += gdt;
      P.step(G.throw, gdt);
      const hold = G.throw.skips === 0 ? 1.15 : 2.5;
      if (G.sinkT > hold) beginReturn();
    } else if (G.state === 'return') {
      G.ret.t += dt;
      if (G.ret.t > G.ret.dur * 0.55 && !G.ret.reacted) { G.ret.reacted = true; catReact(); }
      if (G.ret.t >= G.ret.dur) showResult();
    }
    if (G.state === 'flight' || G.state === 'sinking' || G.state === 'return') updateRockVisual(dt, gdt);

    // twilight blend for the Moonbeam stone
    G.night = lerp(G.night, rock().night ? 1 : 0, damp(1.5, dt));

    direct(dt);
    updateCat(dt);
    if (G.state === 'aim') UI.setAngle(G.angle, rock(), Save.data.ghost, G.tut.forceSweet);

    Scene.render(dt, {
      rock: G.rock && G.rock.visible ? G.rock : null,
      cat: { visible: true, pose: G.cat.pose },
      aim: G.state === 'aim' ? { show: true, angle: G.angle, power: G.charging ? G.power : 0.7 } : null,
      approach: G.state === 'flight' ? G.approach : null,
      night: G.night, flash: G.flash,
    });
    requestAnimationFrame(frame);
  }

  function beginReturn() {
    const s = G.throw;
    G.result = P.finalize(s);
    G.resultInfo = Save.recordThrow(G.result, s.angle, s.power);
    const cam = Scene.cam;
    G.ret = { t: 0, dur: s.skips === 0 ? 0.85 : 1.15, from: { x: cam.x, y: cam.y, z: cam.z, fov: cam.fov, pitch: cam.pitch, roll: cam.roll }, reacted: false };
    G.state = 'return';
    UI.setFlying(false);
    $('hud').classList.add('locked');
    setCatMode('react', null);
    G.cat.view = 'front'; G.cat.pose.view = 'front'; G.cat.turn = null;
    SFX().whoosh(0.5);
  }

  function catReact() {
    const res = G.result;
    let kind = 'meh';
    if (res.skips === 0) kind = res.reason === 'plunge' ? 'shock' : res.reason === 'dig' ? 'dizzy' : 'sad';
    else if (res.skips >= 7) kind = 'great';
    else if (res.skips >= 3) kind = 'good';
    else if (res.skips <= 1) kind = 'sad';
    setCatMode('react', kind);
    if (kind === 'great') { SFX().meow('happy'); setTimeout(() => SFX().purr(1.6), 450); }
    else if (kind === 'good') SFX().meow('happy');
    else if (kind === 'sad' || kind === 'dizzy' || kind === 'shock') SFX().meow('sad');
  }

  function showResult() {
    G.state = 'result';
    UI.updateHud();
    UI.showResult(G.result, G.resultInfo);
    G.emit('result', G.result);
  }

  // ---------------- resize ----------------
  root.addEventListener('resize', () => { Scene.resize(); });

  G.enterAim = enterAim;
  G.goTitle = goTitle;
  G.setCatMode = setCatMode;
  G.rock = null;
  boot();
})(window);
