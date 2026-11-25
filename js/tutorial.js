/* First-time tutorial: Nori guides the player through real actions, one at a time.
 * Each step spotlights exactly one thing, waits for the player to do it, then celebrates. */
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let G = root.Game; const UI = root.UI, Save = root.Save;
  const touch = document.body.classList.contains('touch');
  const SFX = () => root.Sound.sfx;
  const TOTAL = 6; // progress pips shown in the bubble

  let active = false, step = null, spotTarget = null, pointerMode = null, raf = 0, holdT = 0, timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

  function say(text, o = {}) {
    const b = $('tutBubble');
    b.classList.remove('in');
    later(() => {
      $('tutText').innerHTML = text;
      if (o.cat) { const c = $('tutCat'); if (!c.src.endsWith(o.cat + '.png')) { c.src = 'assets/cat/' + o.cat + '.png'; } c.classList.remove('swap'); void c.offsetWidth; c.classList.add('swap'); }
      const nb = $('tutNext');
      nb.classList.toggle('show', !!o.next);
      nb.querySelector('span') ? (nb.querySelector('span').textContent = o.next || 'Next') : (nb.textContent = o.next || 'Next');
      nb.onclick = o.next ? () => { SFX().click(); o.onNext && o.onNext(); } : null;
      b.classList.toggle('low', o.pos === 'low');
      b.classList.toggle('mid', o.pos !== 'low' && o.pos !== 'top' && o.pos !== 'res');
      b.classList.toggle('res', o.pos === 'res');
      const pips = $('tutSteps'); pips.innerHTML = '';
      for (let i = 0; i < TOTAL; i++) pips.insertAdjacentHTML('beforeend', `<i class="${i < (o.pip || 0) ? 'done' : i === (o.pip || 0) ? 'cur' : ''}"></i>`);
      b.classList.add('in');
    }, o.instant ? 0 : 180);
  }

  /** target: element id | css selector | function → DOMRect-like | null */
  function spot(target, o = {}) { spotTarget = target ? { target, pad: o.pad == null ? 10 : o.pad, round: o.round } : null; pointerMode = o.pointer || null; }

  function rectOf(t) {
    if (!t) return null;
    if (typeof t === 'function') return t();
    const el = t.startsWith && (t.startsWith('#') || t.startsWith('.') || t.includes('[')) ? document.querySelector(t) : $(t);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    return r;
  }

  function tick() {
    if (!active) return;
    const sp = $('tutSpot'), pw = $('tutPointer');
    const r = spotTarget && rectOf(spotTarget.target);
    if (r) {
      const p = spotTarget.pad;
      sp.classList.add('on');
      sp.style.left = (r.left - p) + 'px'; sp.style.top = (r.top - p) + 'px';
      sp.style.width = (r.width + p * 2) + 'px'; sp.style.height = (r.height + p * 2) + 'px';
      sp.style.borderRadius = spotTarget.round ? '50%' : '26px';
      if (pointerMode) {
        pw.className = 'on ' + pointerMode;
        pw.style.left = (r.left + r.width * 0.62) + 'px'; pw.style.top = (r.top + r.height * 0.55) + 'px';
      } else pw.className = '';
    } else {
      sp.classList.remove('on'); pw.className = '';
    }
    raf = requestAnimationFrame(tick);
  }

  function celebrate(text, el) {
    SFX().milestone(1);
    const r = el ? rectOf(el) : null;
    const x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : innerHeight * 0.4;
    root.FX.burst(x, y, 34, { speed: 460 });
    if (text) UI.toast(text, 1400);
  }

  // ---------------- steps ----------------
  const STEPS = {
    hello() {
      Object.assign(G.tut, { active: true, lockThrow: true, lockRocks: true, forceSweet: false, assist: 0, minPower: 0, freezeAtSkip: 0, maxSkips: 0, allowAgain: false });
      spot(null);
      say("Hi, I'm <b>Nori</b>! Let's skip stones across the lake together. It's easy — and a little addictive.", { cat: 'hello', next: "Let's go!", onNext: () => go('angle'), pip: 0 });
      SFX().meow('happy');
    },
    angle() {
      G.tut.forceSweet = true;
      if (G.angle > 13 && G.angle < 25) G.angle = 10;
      spot('angleDial', { pointer: 'updown', pad: 8 });
      say(touch
        ? 'First, the <b>angle</b>. Slide your thumb <b>up and down</b> on the left side of the screen to tilt the stone into the <span class="em">green zone</span>.'
        : 'First, the <b>angle</b>. <b>Scroll your mouse wheel</b> (or press <b>↑ ↓</b>, or drag this dial) to tilt the stone into the <span class="em">green zone</span>.',
      { cat: 'sit', pos: 'mid', pip: 0 });
      holdT = 0;
    },
    power() {
      Object.assign(G.tut, { lockThrow: false, minPower: 0.62, assist: 0.8, freezeAtSkip: 2, maxSkips: 4 });
      spot(touch ? 'throwBtn' : 'throwBtn', { pointer: 'hold', pad: 10, round: true });
      say(touch
        ? 'Now <b>press and hold</b> the paw to wind up… and <b>let go</b> when the ring is nearly full!'
        : 'Now <b>hold the mouse button</b> (anywhere) or <b>Space</b> to wind up… and <b>let go</b> when the ring is nearly full!',
      { cat: 'pounce', pos: 'mid', pip: 1 });
    },
    flight() {
      spot(null);
      say('Wheee! Watch it skip… every skip is worth <b>more</b> than the last!', { cat: 'alert', pos: 'low', pip: 2, instant: true });
    },
    tapTeach() {
      const ringRect = () => {
        const a = G.approach; if (!a) return null;
        const p = root.Scene.proj(a.x, 0, a.z); if (!p) return null;
        const w = Math.max(70, p.s * 1.1);
        return { left: p.x - w / 2, top: p.y - w * 0.3, width: w, height: w * 0.6 };
      };
      spot(ringRect, { pointer: 'tap', pad: 16, round: true });
      say(touch ? 'Quick — <b>tap</b> right as the stone touches the water for a bonus!' : 'Quick — <b>click</b> (or press <b>Space</b>) right as the stone touches the water for a bonus!',
        { cat: 'shock', pos: 'low', pip: 2, instant: true });
    },
    tapped() {
      spot(null);
      celebrate('Purr-fect timing!');
      say('Purr-fect! Watch for the <b>shrinking ring</b> — tap as it closes to keep the stone going.', { cat: 'flower', pos: 'low', pip: 3, instant: true });
    },
    score() {
      spot('.res-total', { pad: 8 });
      say('Here\'s your score! Long chains build a <b>combo</b>, so big throws score <span class="em">huge</span>.', { cat: 'fish', pos: 'res', next: 'Next', onNext: () => go('again'), pip: 3 });
    },
    again() {
      G.tut.allowAgain = true;
      spot('btnAgain', { pointer: 'tap', pad: 8 });
      say('Now let\'s see what a <b>bad</b> throw does. Tap <b>Throw again</b>.', { cat: 'stalk', pos: 'res', pip: 4 });
    },
    flat() {
      Object.assign(G.tut, { forceSweet: false, assist: 0, minPower: 0, freezeAtSkip: 0, maxSkips: 0, lockThrow: G.angle >= 5, allowAgain: false });
      spot('angleDial', { pointer: 'updown', pad: 8 });
      say('Tilt the stone <b>completely flat</b> — all the way down, below 5° — then throw it.', { cat: 'peekeyes', pos: 'mid', pip: 4 });
    },
    flatReady() {
      spot(touch ? 'throwBtn' : null, { pointer: touch ? 'hold' : null, round: true });
      say(touch ? 'Flat as a pancake! Now <b>hold and release</b> the paw.' : 'Flat as a pancake! Now <b>hold and release</b> to throw.', { cat: 'peekeyes', pos: 'mid', pip: 4, instant: true });
    },
    plop() {
      spot(null);
      say('<b>Plop!</b> Too flat and the front edge digs into the water.', { cat: 'dizzy', pos: 'low', pip: 4, instant: true });
    },
    lesson() {
      spot(null);
      say('Too <b>flat</b> digs in, too <b>steep</b> plunges. Around <b>20°</b> at <b>full power</b> is the magic spot — that\'s where <span class="em">7+ skips</span> happen.',
        { cat: 'sit', pos: 'res', next: 'Got it!', onNext: () => go('pouch'), pip: 5 });
    },
    pouch() {
      G.tut.lockRocks = false;
      spot('btnResRocks', { pointer: 'tap', pad: 8 });
      say('You already found new stones! Open your <b>stone pouch</b>.', { cat: 'fish', pos: 'res', pip: 5 });
    },
    pick() {
      spot('#rockGrid [data-id="googly"]', { pointer: 'tap', pad: 6 });
      say('This is <b>Googly</b>. Its power shows the sweet spot on your dial. Tap it!', { cat: 'alert', pos: 'low', pip: 5 });
    },
    equip() {
      if (Save.data.selected === 'googly') { go('pouchDone'); return; }
      spot('btnEquip', { pointer: 'tap', pad: 8 });
      say('Tap <b>Use this stone</b> to put it in Nori\'s paw.', { cat: 'alert', pos: 'low', pip: 5 });
    },
    pouchDone() {
      spot('#rocksMenu .close', { pointer: 'tap', pad: 6, round: true });
      say('Every stone has its <b>own power</b>. Skip further and score higher to find them all! Close the pouch when you\'re ready.', { cat: 'bloom', pos: 'low', pip: 6 });
    },
    done() {
      spot(null);
      celebrate(null);
      root.FX.rain(50);
      SFX().fanfare();
      say("You're ready! Now go find the perfect throw — I believe in you.", { cat: 'hello', pos: 'res', next: 'Start skipping!', onNext: () => finish(), pip: 6 });
    },
  };

  function go(name) { step = name; STEPS[name](); }

  // ---------------- event wiring ----------------
  function onAngle(a) {
    if (!active) return;
    if (step === 'angle') {
      const p = root.SkipPhysics.params(root.rockById(Save.data.selected));
      const inZone = Math.abs(a - p.sweet) <= 3;
      if (inZone && !holdT) holdT = performance.now();
      if (!inZone) holdT = 0;
    }
    if (step === 'flat' || step === 'flatReady') {
      G.tut.lockThrow = a >= 5;
      if (a < 5 && step === 'flat') go('flatReady');
      else if (a >= 5 && step === 'flatReady') go('flat');
    }
  }
  function angleWatcher() {
    if (!active) return;
    if (step === 'angle' && holdT && performance.now() - holdT > 450) {
      holdT = 0; celebrate('Perfect angle!', 'angleDial'); go('power');
    }
    later(angleWatcher, 80);
  }

  function wire() {
    if (wire.done) return; wire.done = true;
    G.on('angle', onAngle);
    G.on('release', (d) => { if (!active) return; if (step === 'power') go('flight'); else if (step === 'flatReady' || step === 'flat') { spot(null); $('tutBubble').classList.remove('in'); } });
    G.on('tutFreeze', () => { if (active) go('tapTeach'); });
    G.on('tutTapped', () => { if (active) go('tapped'); });
    G.on('sink', () => { if (!active) return; if (G.throw && G.throw.skips === 0 && step !== 'flight' && step !== 'tapped' && step !== 'tapTeach') go('plop'); else $('tutBubble').classList.remove('in'); });
    G.on('result', () => { if (active) { $('tutBubble').classList.remove('in'); spot(null); } });
    UI.on('result:done', () => {
      if (!active) return;
      if (step === 'flight' || step === 'tapped' || step === 'tapTeach') later(() => go('score'), 250);
      else if (step === 'plop' || step === 'flat' || step === 'flatReady') later(() => go('lesson'), 250);
    });
    G.on('again', () => { if (active && step === 'again') go('flat'); });
    UI.on('rocks:open', () => { if (active && step === 'pouch') later(() => go('pick'), 350); });
    UI.on('rocks:view', (id) => { if (active && step === 'pick' && id === 'googly') later(() => go('equip'), 150); });
    UI.on('rocks:equip', (id) => { if (active && step === 'equip' && id === 'googly') { celebrate('Googly equipped!'); go('pouchDone'); } });
    UI.on('rocks:close', () => {
      if (!active) return;
      if (step === 'pouchDone' || step === 'equip' || step === 'pick') go('done');
      else if (step === 'pouch') { /* closed early from elsewhere */ }
    });
    $('tutSkip').addEventListener('click', () => { SFX().click(); end(false); UI.toast('Tutorial skipped — you can replay it in Settings.'); });
    root.addEventListener('resize', () => {});
  }

  function start() {
    G = root.Game;
    wire();
    timers.forEach(clearTimeout); timers = [];
    active = true;
    // make sure the googly unlock is something the player earns during the lesson
    $('tutorial').classList.add('show');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    go('hello');
    later(angleWatcher, 80);
  }

  function finish() {
    end(true);
    if (G.state === 'result') { UI.hideResult(); G.enterAim(); }
  }

  function end(completed) {
    active = false; step = null;
    timers.forEach(clearTimeout); timers = [];
    Save.set('tutorialDone', true);
    Object.assign(G.tut, { active: false, lockThrow: false, lockRocks: false, forceSweet: false, assist: 0, minPower: 0, freezeAtSkip: 0, maxSkips: 0, allowAgain: false });
    if (G.freeze) G.freeze = false;
    $('tutBubble').classList.remove('in');
    spot(null);
    setTimeout(() => { if (!active) $('tutorial').classList.remove('show'); }, 350);
    if (completed) Save.set('tutorialDone', true);
  }

  root.Tutorial = { start, end, get active() { return active; }, get step() { return step; } };
})(window);
