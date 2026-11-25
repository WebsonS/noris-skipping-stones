/* All sound is synthesized live with WebAudio — original music box melodies, water, wind and a little cat. */
(function (root) {
  'use strict';
  let ctx = null, master, musicBus, sfxBus, ambBus, reverb, noiseBuf;
  let musicOn = true, sfxOn = true;
  let musicTimer = null, musicStep = 0, nextNoteTime = 0, intensity = 0, nightMode = false;
  const PENTA = [0, 2, 4, 7, 9];              // major pentatonic degrees
  const ROOT = 62;                             // D4
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const penta = (i) => ROOT + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.55 : 0;
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.9 : 0;
    ambBus = ctx.createGain(); ambBus.gain.value = sfxOn ? 0.5 : 0;
    reverb = makeReverb(2.6);
    const rvGain = ctx.createGain(); rvGain.gain.value = 0.32;
    reverb.connect(rvGain); rvGain.connect(master);
    [musicBus, sfxBus, ambBus].forEach((b) => b.connect(master));
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startAmbience();
    startMusic();
  }

  function makeReverb(sec) {
    const c = ctx.createConvolver();
    const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    c.buffer = b; return c;
  }

  const now = () => (ctx ? ctx.currentTime : 0);

  function env(g, t, a, peak, dec, sus = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec);
  }

  function tone(freq, t, dur, { type = 'sine', vol = 0.2, bus = sfxBus, rev = 0.3, attack = 0.005, glide = 0, detune = 0 } = {}) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
    env(g, t, attack, vol, dur);
    o.connect(g); g.connect(bus);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverb); }
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  /** soft music-box / kalimba pluck */
  function pluck(midi, t, vol = 0.12, bus) {
    const f = mtof(midi);
    tone(f, t, 1.4, { type: 'sine', vol, bus: bus || musicBus, rev: 0.55, attack: 0.004 });
    tone(f * 2.01, t, 0.35, { type: 'sine', vol: vol * 0.35, bus: bus || musicBus, rev: 0.4, attack: 0.002 });
    tone(f * 4.2, t, 0.08, { type: 'triangle', vol: vol * 0.12, bus: bus || musicBus, rev: 0.2, attack: 0.001 });
  }

  function noise(t, dur, { vol = 0.3, type = 'bandpass', f0 = 1200, f1 = null, q = 1, bus = sfxBus, attack = 0.005, rev = 0.15 } = {}) {
    if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, attack, vol, dur);
    src.connect(fl); fl.connect(g); g.connect(bus);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverb); }
    src.start(t, Math.random()); src.stop(t + attack + dur + 0.05);
  }

  // ---------------- ambience ----------------
  let ambNodes = [];
  function startAmbience() {
    // gentle wind: looping filtered noise with slow LFO
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lg = ctx.createGain(); lg.gain.value = 0.035; lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(ambBus); src.start(); lfo.start();
    // lapping water: occasional soft noise swells (scheduled in tick)
    ambNodes.push(src, lfo);
  }
  let nextLap = 0, nextBird = 2;
  function ambienceTick() {
    if (!ctx) return;
    const t = now();
    if (t > nextLap) {
      noise(t, 0.9 + Math.random() * 0.6, { vol: 0.04, type: 'lowpass', f0: 380, f1: 260, bus: ambBus, attack: 0.35, rev: 0.1 });
      nextLap = t + 1.6 + Math.random() * 2.2;
    }
    if (t > nextBird) {
      if (nightMode) cricket(t); else bird(t);
      nextBird = t + 4 + Math.random() * 9;
    }
  }
  function bird(t) {
    const n = 2 + (Math.random() * 3 | 0), base = 2600 + Math.random() * 1200;
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.11 + Math.random() * 0.05);
      tone(base * (1 + Math.random() * 0.2), tt, 0.09, { vol: 0.025, bus: ambBus, glide: 1.35, rev: 0.6 });
    }
  }
  function cricket(t) {
    for (let i = 0; i < 6; i++) tone(4400, t + i * 0.06, 0.03, { type: 'triangle', vol: 0.012, bus: ambBus, rev: 0.4 });
  }

  // ---------------- music ----------------
  // A slow, original, lilting progression in D major pentatonic, 6/8 feel. Layers swell with intensity.
  const CHORDS = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]]; // D  Bm  G  A
  const MELODY = [ // degree indices into penta(), -1 = rest; 16 steps per bar (8th notes of 6/8 x ~)
    7, -1, 9, 8, -1, 7, 5, -1, 6, -1, 7, -1,
    5, -1, 4, 5, -1, 7, 6, -1, 4, -1, -1, -1,
    7, -1, 9, 10, -1, 9, 8, -1, 7, -1, 5, -1,
    6, -1, 5, 4, -1, 2, 4, -1, 5, -1, -1, -1,
  ];
  const STEP = 0.24; // seconds per 8th note (slow, calm)
  function startMusic() {
    if (musicTimer) return;
    nextNoteTime = now() + 0.2;
    musicTimer = setInterval(scheduler, 60);
  }
  function scheduler() {
    if (!ctx) return;
    ambienceTick();
    while (nextNoteTime < now() + 0.25) {
      playStep(musicStep, nextNoteTime);
      nextNoteTime += STEP;
      musicStep++;
    }
  }
  function playStep(i, t) {
    const bar = Math.floor(i / 12) % 4, pos = i % 12;
    const ch = CHORDS[bar];
    if (pos === 0) { // warm pad
      ch.forEach((m, k) => {
        tone(mtof(m), t, STEP * 11, { type: 'triangle', vol: 0.022 + intensity * 0.01, bus: musicBus, rev: 0.6, attack: 0.6, detune: k * 4 - 6 });
      });
      tone(mtof(ch[0] - 12), t, STEP * 10, { type: 'sine', vol: 0.05, bus: musicBus, rev: 0.2, attack: 0.08 });
    }
    if (pos === 6) tone(mtof(ch[1] - 12), t, STEP * 5, { type: 'sine', vol: 0.03, bus: musicBus, rev: 0.2, attack: 0.08 });
    // arpeggio harp
    if (pos % 2 === 1 || intensity > 0.4) {
      const a = ch[(pos >> 1) % 4] + 12;
      pluck(a, t, 0.028 + intensity * 0.02);
    }
    // melody comes in every other cycle (gives breathing space)
    const cycle = Math.floor(i / 48) % 2;
    const mel = MELODY[i % 48];
    if (mel >= 0 && (cycle === 1 || intensity > 0.3)) pluck(penta(mel), t, 0.07);
    if (intensity > 0.55 && pos % 3 === 0) noise(t, 0.05, { vol: 0.018 * intensity, type: 'highpass', f0: 7000, bus: musicBus, rev: 0 }); // shaker
  }

  // ---------------- SFX ----------------
  const S = {
    click() { const t = now(); tone(1250, t, 0.06, { type: 'sine', vol: 0.12, rev: 0.1, glide: 0.6 }); tone(620, t, 0.05, { type: 'triangle', vol: 0.06, rev: 0 }); },
    pop() { const t = now(); tone(520, t, 0.12, { vol: 0.16, glide: 2.2, rev: 0.2 }); },
    whoosh(power = 1) {
      const t = now();
      noise(t, 0.45, { vol: 0.12 + power * 0.12, type: 'bandpass', f0: 500, f1: 2400, q: 0.8, attack: 0.05, rev: 0.2 });
    },
    charge(p) { // tiny tick while charging
      const t = now(); tone(300 + p * 900, t, 0.03, { type: 'triangle', vol: 0.025, rev: 0 });
    },
    skip(n, strong) { // a plip + rising pentatonic chime, escalating with the chain
      const t = now();
      const f = 900 + Math.min(n, 20) * 40;
      tone(f, t, 0.09, { vol: 0.16, glide: 0.45, rev: 0.25 });
      noise(t, 0.14, { vol: 0.14, type: 'bandpass', f0: 2400, f1: 900, q: 1.2, rev: 0.25 });
      pluck(penta(5 + Math.min(n - 1, 14)), t + 0.01, 0.13 + (strong ? 0.05 : 0), sfxBus);
      if (n >= 5) pluck(penta(5 + Math.min(n - 1, 14)) + 12, t + 0.06, 0.06, sfxBus);
    },
    tap(perfect) { const t = now(); pluck(perfect ? 98 : 91, t, 0.09, sfxBus); tone(perfect ? 2400 : 1800, t, 0.12, { vol: 0.05, rev: 0.4 }); },
    milestone(level) { // sparkly rising arpeggio
      const t = now();
      for (let i = 0; i < 5 + level; i++) pluck(penta(7 + i * 2), t + i * 0.055, 0.1, sfxBus);
      noise(t, 0.6, { vol: 0.05, type: 'highpass', f0: 6000, attack: 0.02, rev: 0.6 });
    },
    sink(bad) {
      const t = now();
      tone(bad ? 300 : 420, t, 0.35, { vol: 0.25, glide: 0.25, rev: 0.3 });
      noise(t, 0.3, { vol: 0.18, type: 'lowpass', f0: 1400, f1: 300, rev: 0.25 });
      for (let i = 0; i < 4; i++) tone(500 + Math.random() * 500, t + 0.25 + i * 0.12, 0.06, { vol: 0.05, glide: 1.8, rev: 0.4 });
    },
    lily() { const t = now(); tone(180, t, 0.25, { type: 'sine', vol: 0.25, glide: 3, rev: 0.3 }); pluck(86, t + 0.05, 0.1, sfxBus); },
    gust() { const t = now(); noise(t, 0.7, { vol: 0.2, type: 'bandpass', f0: 300, f1: 3000, q: 0.6, attack: 0.1, rev: 0.3 }); },
    lucky() { const t = now(); [0, 4, 7, 12].forEach((s, i) => tone(mtof(86 + s), t + i * 0.04, 0.25, { type: 'square', vol: 0.025, rev: 0.4 })); },
    tick(i) { const t = now(); tone(1500 + (i % 12) * 60, t, 0.025, { type: 'square', vol: 0.025, rev: 0 }); },
    coin() { const t = now(); tone(1976, t, 0.08, { type: 'square', vol: 0.03, rev: 0.2 }); tone(2637, t + 0.07, 0.3, { type: 'square', vol: 0.03, rev: 0.4 }); },
    stamp() { const t = now(); tone(110, t, 0.25, { vol: 0.35, glide: 0.5, rev: 0.3 }); noise(t, 0.15, { vol: 0.2, type: 'lowpass', f0: 900, rev: 0.2 }); },
    fanfare() {
      const t = now();
      const seq = [0, 4, 7, 12, 7, 12, 16];
      seq.forEach((s, i) => pluck(74 + s, t + i * 0.09, 0.13, sfxBus));
      [62, 66, 69, 74].forEach((m) => tone(mtof(m), t + 0.6, 1.6, { type: 'triangle', vol: 0.05, rev: 0.7, attack: 0.05 }));
    },
    meow(mood = 'happy') { // little synthesized meow
      if (!ctx) return;
      const t = now();
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = mood === 'sad' ? 520 : 640;
      o.frequency.setValueAtTime(f * 0.8, t);
      o.frequency.linearRampToValueAtTime(f * (mood === 'sad' ? 1.05 : 1.35), t + 0.12);
      o.frequency.linearRampToValueAtTime(f * (mood === 'sad' ? 0.6 : 0.85), t + 0.42);
      const vib = ctx.createOscillator(); vib.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 9;
      vib.connect(vg); vg.connect(o.frequency);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
      f1.frequency.setValueAtTime(900, t); f1.frequency.linearRampToValueAtTime(1700, t + 0.15); f1.frequency.linearRampToValueAtTime(1000, t + 0.4);
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 3200;
      const g = ctx.createGain(); env(g, t, 0.05, 0.16, 0.42);
      o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(sfxBus);
      const s = ctx.createGain(); s.gain.value = 0.25; g.connect(s); s.connect(reverb);
      o.start(t); vib.start(t); o.stop(t + 0.55); vib.stop(t + 0.55);
    },
    purr(dur = 1.2) {
      if (!ctx) return;
      const t = now();
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const am = ctx.createGain(); am.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 24; const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain);
      const g = ctx.createGain(); env(g, t, 0.2, 0.35, dur);
      src.connect(lp); lp.connect(am); am.connect(g); g.connect(sfxBus);
      src.start(t); lfo.start(t); src.stop(t + dur + 0.3); lfo.stop(t + dur + 0.3);
    },
    unlock() { S.fanfare(); setTimeout(() => S.coin(), 500); },
  };

  root.Sound = {
    init, sfx: S,
    get ready() { return !!ctx; },
    setMusic(on) { musicOn = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.55 : 0, now(), 0.2); },
    setSfx(on) { sfxOn = on; if (sfxBus) { sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, now(), 0.05); ambBus.gain.setTargetAtTime(on ? 0.5 : 0, now(), 0.2); } },
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
    setNight(v) { nightMode = v; },
    duck(amount, dur) { if (!musicBus || !musicOn) return; const t = now(); musicBus.gain.setTargetAtTime(0.55 * amount, t, 0.05); musicBus.gain.setTargetAtTime(0.55, t + dur, 0.4); },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  };
})(window);
