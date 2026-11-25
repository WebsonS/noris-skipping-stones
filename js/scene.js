/* The lake: a painted backdrop (the reference artwork) composed with a live pseudo-3D water plane,
 * dock, shore greenery, ripples, splashes and ambient life — all rendered through one perspective camera
 * so the throw camera can fly out over the water. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const NEAR = 0.25;
  const HORIZON_ROW = 379;          // waterline row in far.webp
  const DECK_Y = 0.5;
  const CAT_POS = { x: -0.32, y: DECK_Y, z: 0.55 };

  let cv, ctx, W = 1, H = 1, DPR = 1, F = 800, HZ = 300, mobile = false;
  const img = { rocks: {}, cat: {} };
  let reflCv = null, vignetteCv = null, raysCv = null, glowCv = null, sparkCv = null;
  let time = 0;

  const cam = { x: 0.42, y: 1.3, z: -2.7, fov: 1, pitch: 0, roll: 0, shakeX: 0, shakeY: 0 };

  // ---------- seeded world dressing ----------
  const rng = root.SkipPhysics.mulberry32(7);
  const R = (a, b) => a + (b - a) * rng();
  const wavelets = [];
  for (let i = 0; i < 300; i++) wavelets.push({ x: R(-22, 22), z: R(0, 70), len: R(0.4, 1.7), light: rng() < 0.55, ph: R(0, TAU), glint: rng() < 0.12 });
  const lilies = [];
  for (let i = 0; i < 34; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    lilies.push({ x: side * R(2.6, 13), z: R(3, 190), r: R(0.3, 0.75), rot: R(0, TAU), flower: rng() < 0.3, ph: R(0, TAU) });
  }
  const bushes = []; // sprite instances {x,z,h,v,flip}
  for (let z = -9; z < 3.4; z += 0.7) {
    bushes.push({ x: R(-4.4, -1.9), z: z + R(-0.3, 0.3), h: R(0.8, 1.35), v: (rng() * 4) | 0, flip: rng() < 0.5 });
    bushes.push({ x: R(1.9, 4.4), z: z + R(-0.3, 0.3), h: R(0.8, 1.35), v: (rng() * 4) | 0, flip: rng() < 0.5 });
  }
  for (let z = 1; z < 18; z += 1.3) {
    bushes.push({ x: R(-13, -6) - z * 0.25, z, h: R(1.4, 2.6), v: (rng() * 4) | 0, flip: rng() < 0.5 });
    bushes.push({ x: R(6, 13) + z * 0.25, z, h: R(1.4, 2.6), v: (rng() * 4) | 0, flip: rng() < 0.5 });
  }
  const trees = [
    { x: -6.4, z: 4.5, h: 7.5, w: 6.5, v: 0, flip: false }, { x: 7.4, z: 6.5, h: 8.5, w: 7, v: 1, flip: true }, { x: -11, z: 12, h: 9, w: 7.5, v: 1, flip: false },
  ];
  const props = bushes.map((o) => Object.assign({ kind: 'bush' }, o)).concat(trees.map((t) => Object.assign({ kind: 'tree' }, t)));
  props.sort((m, n) => n.z - m.z);
  const bushSprites = [], treeSprites = [];
  const reeds = [];
  for (let i = 0; i < 34; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    reeds.push({ x: side * R(1.6, 2.6), z: R(-3, 3.6), h: R(0.45, 1.05), ph: R(0, TAU), cat: rng() < 0.3, bend: R(-0.12, 0.12) });
  }

  // ---------- dynamic fx ----------
  const ripples = [], drops = [], crowns = [], sparks = [], pops = [], bubbles = [], rainbows = [], lilyPops = [];
  const petals = [];
  for (let i = 0; i < 16; i++) petals.push(newPetal(true));
  function newPetal(init) {
    return { x: rng() * 1.2, y: init ? rng() : -0.05, vx: R(0.02, 0.06), vy: R(0.025, 0.06), rot: R(0, TAU), vr: R(-2, 2), s: R(4, 8), pink: rng() < 0.55, ph: R(0, TAU) };
  }
  const dragonflies = [
    { cx: 2.4, cz: 3.2, cy: 0.9, ph: 0, sp: 0.55 }, { cx: -2.8, cz: 5.5, cy: 1.2, ph: 2, sp: 0.45 },
  ];
  const fish = []; let nextFish = 3;
  const birds = []; let nextBird = 4;
  const fireflies = [];
  for (let i = 0; i < 26; i++) fireflies.push({ x: R(-8, 8), y: R(0.3, 2.2), z: R(1, 18), ph: R(0, TAU) });

  // ---------- setup ----------
  function loadImage(src) {
    return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }

  async function load(onProgress) {
    const jobs = [];
    const add = (key, src, bucket) => jobs.push(loadImage(src).then((im) => { if (bucket) img[bucket][key] = im; else img[key] = im; onProgress && onProgress(); }));
    add('far', 'assets/far.webp');
    for (const r of root.ROCKS) add(r.id, 'assets/rocks/' + r.img + '.png', 'rocks');
    for (const c of ['alert', 'back', 'bloom', 'dizzy', 'fish', 'flower', 'hello', 'loaf', 'munch', 'peek', 'peekeyes', 'pounce', 'shock', 'sit', 'sleep', 'stalk', 'tears', 'toast', 'wave', 'walk', 'crouch'])
      add(c, 'assets/cat/' + c + '.png', 'cat');
    root.__assetCount = jobs.length;
    await Promise.all(jobs);
    buildStatic();
  }

  function init(canvas, isMobile) {
    cv = canvas; ctx = cv.getContext('2d', { alpha: false });
    mobile = isMobile;
    resize();
  }

  function resize() {
    DPR = Math.min(root.devicePixelRatio || 1, mobile ? 1.75 : 2);
    W = root.innerWidth; H = root.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const portrait = H > W;
    F = portrait ? Math.min(H * 0.95, W * 1.6) : Math.min(H * 1.15, W * 0.85);
    HZ = H * (portrait ? 0.47 : 0.44);
    if (img.far) buildStatic();
  }

  function buildStatic() {
    // mirrored, softened reflection of the far scenery
    const far = img.far; if (!far) return;
    const rw = 600, rh = Math.round(HORIZON_ROW / 2);
    reflCv = document.createElement('canvas'); reflCv.width = rw; reflCv.height = rh;
    const r = reflCv.getContext('2d');
    r.save(); r.translate(0, rh); r.scale(1, -1);
    r.drawImage(far, 0, 0, far.width, HORIZON_ROW, 0, 0, rw, rh);
    r.restore();
    // blur by down/up sampling
    const tmp = document.createElement('canvas'); tmp.width = rw / 4; tmp.height = rh / 4;
    tmp.getContext('2d').drawImage(reflCv, 0, 0, tmp.width, tmp.height);
    r.globalAlpha = 0.55; r.imageSmoothingQuality = 'high'; r.drawImage(tmp, 0, 0, rw, rh); r.globalAlpha = 1;
    // cool, slightly deeper tint like the reference water
    r.globalCompositeOperation = 'source-atop';
    const tg = r.createLinearGradient(0, 0, 0, rh);
    tg.addColorStop(0, 'rgba(70,150,200,0.18)'); tg.addColorStop(1, 'rgba(40,140,190,0.42)');
    r.fillStyle = tg; r.fillRect(0, 0, rw, rh);
    r.globalCompositeOperation = 'source-over';

    vignetteCv = document.createElement('canvas'); vignetteCv.width = 256; vignetteCv.height = 256;
    const v = vignetteCv.getContext('2d');
    const vg = v.createRadialGradient(128, 118, 70, 128, 128, 182);
    vg.addColorStop(0, 'rgba(40,20,40,0)'); vg.addColorStop(1, 'rgba(40,24,50,0.5)');
    v.fillStyle = vg; v.fillRect(0, 0, 256, 256);

    raysCv = document.createElement('canvas'); raysCv.width = 512; raysCv.height = 512;
    const rc = raysCv.getContext('2d');
    rc.translate(470, -40);
    for (let i = 0; i < 7; i++) {
      rc.save(); rc.rotate(0.55 + i * 0.13 + Math.sin(i * 7) * 0.04);
      const w = 18 + (i % 3) * 16;
      const g = rc.createLinearGradient(0, 0, 0, 700);
      g.addColorStop(0, 'rgba(255,240,200,0.5)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      rc.fillStyle = g; rc.fillRect(-w / 2, 0, w, 700); rc.restore();
    }

    glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
    const gc = glowCv.getContext('2d');
    const gg = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(0.25, 'rgba(255,250,225,0.6)'); gg.addColorStop(1, 'rgba(255,240,200,0)');
    gc.fillStyle = gg; gc.fillRect(0, 0, 128, 128);

    if (!bushSprites.length) {
      for (let i = 0; i < 4; i++) bushSprites.push(paintFoliage(256, 200, 70, i));
      for (let i = 0; i < 2; i++) treeSprites.push(paintTree(360, 420, i));
    }

    sparkCv = document.createElement('canvas'); sparkCv.width = sparkCv.height = 64;
    const sc = sparkCv.getContext('2d');
    sc.translate(32, 32); sc.fillStyle = '#fff';
    sc.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? 5 : 30; sc.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    sc.closePath(); sc.fill();
    sc.globalAlpha = 0.6; sc.drawImage(glowCv, -20, -20, 40, 40);
  }

  // ---------- painted foliage sprites (soft, layered dabs lit from the upper right) ----------
  const LEAF = ['#24502f', '#2f6b3c', '#3f8a45', '#58a650', '#7cc35c', '#a8d86a', '#d4ee93'];
  function dabCluster(g, cx, cy, rx, ry, n, seed) {
    const rr = root.SkipPhysics.mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const a = rr() * Math.PI * 2, d = Math.sqrt(rr());
      const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d * 0.9;
      const light = Math.min(1, Math.max(0, (0.55 - (y - (cy - ry)) / (2 * ry)) + (x - cx) / (rx * 4) + 0.35 + (rr() - 0.5) * 0.35));
      const ci = Math.min(LEAF.length - 1, Math.floor(light * (LEAF.length - 0.01)));
      g.fillStyle = LEAF[ci];
      const r = (0.14 + rr() * 0.16) * Math.min(rx, ry) * (1.2 - light * 0.45);
      g.beginPath(); g.ellipse(x, y, r * 1.15, r, rr() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  function paintFoliage(w, h, n, seed) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const rr = root.SkipPhysics.mulberry32(100 + seed);
    g.fillStyle = '#24502f';
    g.beginPath(); g.ellipse(w / 2, h * 0.68, w * 0.46, h * 0.3, 0, 0, Math.PI * 2); g.fill();
    const lobes = 3 + (rr() * 3 | 0);
    for (let i = 0; i < lobes; i++) {
      const lx = w * (0.18 + 0.64 * (i + 0.5) / lobes) + (rr() - 0.5) * 20, ly = h * (0.42 + rr() * 0.22);
      dabCluster(g, lx, ly, w * 0.2, h * 0.3, n, seed * 31 + i);
    }
    dabCluster(g, w / 2, h * 0.62, w * 0.42, h * 0.28, n, seed * 7 + 5);
    g.globalAlpha = 0.85;
    for (let i = 0; i < 18; i++) {
      g.fillStyle = rr() < 0.5 ? '#d4ee93' : '#f1f7b5';
      const x = w * (0.35 + rr() * 0.55), y = h * (0.25 + rr() * 0.3);
      g.beginPath(); g.ellipse(x, y, 3 + rr() * 5, 2 + rr() * 3, rr() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    const sg = g.createLinearGradient(0, h * 0.7, 0, h);
    sg.addColorStop(0, 'rgba(20,45,30,0)'); sg.addColorStop(1, 'rgba(20,45,30,0.55)');
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = sg; g.fillRect(0, 0, w, h);
    return c;
  }
  function paintTree(w, h, seed) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const rr = root.SkipPhysics.mulberry32(500 + seed);
    g.fillStyle = '#5a3e2e';
    g.beginPath(); g.moveTo(w * 0.46, h); g.quadraticCurveTo(w * 0.44, h * 0.6, w * 0.49, h * 0.4); g.lineTo(w * 0.55, h * 0.42); g.quadraticCurveTo(w * 0.53, h * 0.65, w * 0.57, h); g.fill();
    g.strokeStyle = '#5a3e2e'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.5, h * 0.55); g.quadraticCurveTo(w * 0.35, h * 0.45, w * 0.28, h * 0.38); g.stroke();
    g.beginPath(); g.moveTo(w * 0.52, h * 0.5); g.quadraticCurveTo(w * 0.66, h * 0.42, w * 0.72, h * 0.33); g.stroke();
    const clumps = [[0.5, 0.26, 0.36, 0.2], [0.28, 0.38, 0.24, 0.16], [0.72, 0.36, 0.25, 0.16], [0.5, 0.42, 0.3, 0.13], [0.4, 0.16, 0.2, 0.12], [0.63, 0.15, 0.2, 0.12]];
    for (const [x, y, rx, ry] of clumps) {
      g.fillStyle = '#24502f'; g.beginPath(); g.ellipse(w * x, h * y + 6, w * rx, h * ry, 0, 0, Math.PI * 2); g.fill();
    }
    clumps.forEach(([x, y, rx, ry], i) => dabCluster(g, w * x, h * y, w * rx, h * ry, 110, seed * 13 + i));
    g.globalAlpha = 0.8;
    for (let i = 0; i < 30; i++) {
      g.fillStyle = rr() < 0.5 ? '#d4ee93' : '#f6f9c4';
      g.beginPath(); g.ellipse(w * (0.45 + rr() * 0.4), h * (0.08 + rr() * 0.25), 3 + rr() * 6, 2 + rr() * 4, rr() * 3, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  // ---------- projection ----------
  function horizonY() { return HZ + cam.pitch * H; }
  function focal() { return F * cam.fov; }
  function proj(x, y, z) {
    const dz = z - cam.z;
    if (dz < NEAR) return null;
    const f = focal() / dz;
    return { x: W / 2 + (x - cam.x) * f, y: horizonY() + (cam.y - y) * f, s: f, dz };
  }
  // unclamped projection for polygons (after near clipping)
  function projRaw(p) {
    const dz = p[2] - cam.z, f = focal() / dz;
    return [W / 2 + (p[0] - cam.x) * f, horizonY() + (cam.y - p[1]) * f];
  }
  function clipNear(poly) {
    const out = [], nz = cam.z + NEAR;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = a[2] >= nz, bin = b[2] >= nz;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (nz - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, nz]);
      }
    }
    return out;
  }
  function polyPath(poly) {
    const c = clipNear(poly); if (c.length < 3) return false;
    ctx.beginPath();
    c.forEach((p, i) => { const q = projRaw(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.closePath(); return true;
  }
  function line3(a, b, width, color) {
    const nz = cam.z + NEAR;
    if (a[2] < nz && b[2] < nz) return;
    let A = a, B = b;
    if (A[2] < nz) { const t = (nz - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, nz]; }
    else if (B[2] < nz) { const t = (nz - B[2]) / (A[2] - B[2]); B = [B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t, nz]; }
    const p = projRaw(A), q = projRaw(B);
    const wa = Math.max(0.5, width * focal() / (A[2] - cam.z) / 2), wb = Math.max(0.5, width * focal() / (B[2] - cam.z) / 2);
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p[0] + nx * wa, p[1] + ny * wa); ctx.lineTo(q[0] + nx * wb, q[1] + ny * wb);
    ctx.lineTo(q[0] - nx * wb, q[1] - ny * wb); ctx.lineTo(p[0] - nx * wa, p[1] - ny * wa);
    ctx.closePath(); ctx.fill();
  }

  // ---------- drawing: backdrop ----------
  function drawSky() {
    const far = img.far, hz = horizonY();
    const S = Math.max(W * 1.1 / far.width, (hz + 2) / HORIZON_ROW) * (0.92 + 0.08 * cam.fov) * (1 + Math.min(cam.z, 300) * 0.0007);
    const w = far.width * S, h = far.height * S;
    const x = (W - w) / 2 - cam.x * 4 + Math.sin(time * 0.03) * 6;
    const y = hz - HORIZON_ROW * S;
    if (y > 0) { ctx.fillStyle = '#3c9ad6'; ctx.fillRect(0, 0, W, y + 2); }
    // water first (below horizon), then the scenery with its transparent water cut-out on top
    drawWater(x, w, S);
    ctx.drawImage(far, x, y, w, h);
    drawClouds(x, y, S);
    drawBirds(hz);
  }

  function drawWater(fx, fw, S) {
    const hz = horizonY();
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#9fd0e2'); g.addColorStop(0.18, '#7cc4dc'); g.addColorStop(0.55, '#45a9d0'); g.addColorStop(1, '#2a86b6');
    ctx.fillStyle = g; ctx.fillRect(0, hz, W, H - hz + 2);
    if (!reflCv) return;
    // wobbling mirrored scenery, strip by strip
    const rh = HORIZON_ROW * S * 0.92;
    const srcH = reflCv.height;
    let y = 0;
    ctx.globalAlpha = 0.82;
    while (y < rh && hz + y < H) {
      const sh = 2 + y * 0.035;
      const amp = 0.6 + y * 0.03;
      const off = Math.sin((y * 0.11) - time * 1.7 + cam.z * 0.6) * amp + Math.sin(y * 0.031 + time * 0.9) * amp * 0.6;
      const sy = (y / rh) * srcH, sH = Math.max(1, (sh / rh) * srcH);
      ctx.drawImage(reflCv, 0, sy, reflCv.width, sH, fx + off, hz + y, fw, sh + 0.6);
      y += sh;
    }
    ctx.globalAlpha = 1;
    // deepen the water toward the viewer so foreground pops
    const dg = ctx.createLinearGradient(0, hz, 0, H);
    dg.addColorStop(0, 'rgba(30,110,160,0)'); dg.addColorStop(0.5, 'rgba(30,110,160,0.10)'); dg.addColorStop(1, 'rgba(20,80,130,0.38)');
    ctx.fillStyle = dg; ctx.fillRect(0, hz, W, H - hz + 2);
    // haze line at the far shore
    const hg = ctx.createLinearGradient(0, hz - 6, 0, hz + 18);
    hg.addColorStop(0, 'rgba(255,240,235,0)'); hg.addColorStop(0.4, 'rgba(255,240,235,0.35)'); hg.addColorStop(1, 'rgba(255,240,235,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, hz - 6, W, 24);
  }

  const cloudWisps = [{ x: 0.1, y: 0.12, s: 1, sp: 0.004 }, { x: 0.6, y: 0.06, s: 0.7, sp: 0.006 }, { x: 0.85, y: 0.2, s: 0.8, sp: 0.003 }];
  function drawClouds(fx, fy, S) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    for (const c of cloudWisps) {
      const x = ((c.x + time * c.sp) % 1.3 - 0.15) * W;
      const y = fy + (c.y * HORIZON_ROW) * S;
      const s = c.s * S * 90;
      ctx.drawImage(glowCv, x - s, y - s * 0.35, s * 2, s * 0.7);
      ctx.drawImage(glowCv, x - s * 0.5, y - s * 0.5, s * 1.3, s * 0.7);
    }
    ctx.restore();
  }

  function drawBirds(hz) {
    if (time > nextBird) { birds.push({ x: -0.05, y: 0.08 + rng() * 0.18, sp: 0.02 + rng() * 0.02, n: 1 + (rng() * 3 | 0), ph: rng() * 6 }); nextBird = time + 14 + rng() * 20; }
    ctx.strokeStyle = 'rgba(60,50,70,0.55)'; ctx.lineWidth = 1.4;
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i]; b.x += b.sp * 0.016;
      if (b.x > 1.1) { birds.splice(i, 1); continue; }
      for (let k = 0; k < b.n; k++) {
        const x = (b.x - k * 0.018) * W, y = b.y * hz + k * 7, f = Math.sin(time * 9 + b.ph + k) * 3;
        ctx.beginPath(); ctx.moveTo(x - 6, y - f); ctx.quadraticCurveTo(x - 2, y - 2, x, y); ctx.quadraticCurveTo(x + 2, y - 2, x + 6, y - f); ctx.stroke();
      }
    }
  }

  // ---------- water surface detail ----------
  function drawWavelets() {
    const span = 70, f = focal();
    ctx.lineCap = 'round';
    for (const w of wavelets) {
      let z = w.z + Math.floor((cam.z - w.z) / span + 1) * span; // keep ahead of camera
      if (z - cam.z < 1.2) z += span;
      const p = proj(w.x + Math.sin(time * 0.4 + w.ph) * 0.2, 0, z);
      if (!p || p.y > H + 4 || p.x < -60 || p.x > W + 60) continue;
      const fade = Math.min(1, (span - p.dz) / 20) * Math.min(1, (p.dz - 1.2) / 2);
      if (fade <= 0) continue;
      const len = w.len * p.s;
      if (w.glint) {
        const tw = Math.max(0, Math.sin(time * 2.2 + w.ph * 3));
        if (tw < 0.3) continue;
        const sz = Math.max(3, Math.min(18, p.s * 0.18)) * tw;
        ctx.globalAlpha = fade * tw * 0.9;
        ctx.drawImage(sparkCv, p.x - sz, p.y - sz, sz * 2, sz * 2);
        continue;
      }
      ctx.globalAlpha = fade * (w.light ? 0.5 : 0.28);
      ctx.strokeStyle = w.light ? '#f2fcff' : '#1f6b98';
      ctx.lineWidth = Math.max(0.8, Math.min(5, p.s * 0.025));
      const bob = Math.sin(time * 1.3 + w.ph) * p.s * 0.012;
      ctx.beginPath(); ctx.moveTo(p.x - len / 2, p.y + bob); ctx.quadraticCurveTo(p.x, p.y + bob - Math.max(1, p.s * 0.02), p.x + len / 2, p.y + bob); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function ellipseOnWater(x, z, r) {
    const p = proj(x, 0, z); if (!p) return null;
    const rx = r * p.s;
    const ry = Math.max(0.6, rx * Math.min(1, (cam.y + 0.05) / p.dz));
    return { x: p.x, y: p.y, rx, ry, dz: p.dz, s: p.s };
  }

  function drawLilies() {
    for (const l of lilies) {
      const e = ellipseOnWater(l.x, l.z, l.r); if (!e || e.dz > 120 || e.y > H + 50) continue;
      if (e.rx < 0.8) continue;
      const bob = Math.sin(time * 1.1 + l.ph) * e.ry * 0.08;
      ctx.fillStyle = 'rgba(20,70,90,0.25)';
      ctx.beginPath(); ctx.ellipse(e.x + e.rx * 0.08, e.y + e.ry * 0.25 + bob, e.rx, e.ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5fae4e';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + bob, e.rx, e.ry, 0, l.rot, l.rot + TAU * 0.9); ctx.lineTo(e.x, e.y + bob); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(190,240,140,0.5)';
      ctx.beginPath(); ctx.ellipse(e.x - e.rx * 0.2, e.y - e.ry * 0.2 + bob, e.rx * 0.5, e.ry * 0.45, 0, 0, TAU); ctx.fill();
      if (l.flower && e.rx > 4) {
        const fs = e.rx * 0.45;
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * TAU + l.ph;
          ctx.fillStyle = k % 2 ? '#ffc2d4' : '#ff9fbd';
          ctx.beginPath(); ctx.ellipse(e.x + Math.cos(a) * fs * 0.45, e.y - fs * 0.35 + Math.sin(a) * fs * 0.2 + bob, fs * 0.38, fs * 0.6, a + Math.PI / 2, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#ffe17a'; ctx.beginPath(); ctx.arc(e.x, e.y - fs * 0.4 + bob, fs * 0.2, 0, TAU); ctx.fill();
      }
    }
  }

  function drawRipples(dt) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.t += dt;
      if (r.t > r.life) { ripples.splice(i, 1); continue; }
      const k = r.t / r.life;
      for (let ring = 0; ring < r.rings; ring++) {
        const rt = r.t - ring * 0.22; if (rt <= 0) continue;
        const rad = 0.12 + rt * r.speed * (1 - ring * 0.12);
        const e = ellipseOnWater(r.x, r.z, rad); if (!e || e.rx < 0.5) continue;
        const a = Math.pow(1 - k, 1.2) * r.strength * (1 - ring * 0.2);
        ctx.lineWidth = Math.max(0.8, Math.min(6, e.s * 0.035 * (1 - k * 0.6)));
        ctx.strokeStyle = r.color ? r.color.replace('ALPHA', (a * 0.9).toFixed(3)) : `rgba(245,253,255,${(a * 0.85).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(20,80,120,${(a * 0.3).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + ctx.lineWidth, e.rx * 0.97, e.ry * 0.97, 0, 0, Math.PI); ctx.stroke();
      }
    }
  }

  // ---------- shore, dock, trees ----------
  function drawProp(o) {
    const p = proj(o.x, 0, o.z); if (!p) return;
    const sp = o.kind === 'tree' ? treeSprites[o.v % treeSprites.length] : bushSprites[o.v % bushSprites.length];
    if (!sp) return;
    const h = o.h * p.s, w = (o.w ? o.w * p.s : h * sp.width / sp.height);
    if (h < 2 || p.x + w / 2 < -10 || p.x - w / 2 > W + 10 || p.y - h > H) return;
    const sway = Math.sin(time * 0.9 + o.z * 1.7) * 0.012;
    ctx.save();
    ctx.translate(p.x, p.y + h * 0.04);
    ctx.transform(o.flip ? -1 : 1, 0, sway * (o.flip ? -1 : 1), 1, 0, 0);
    ctx.drawImage(sp, -w / 2, -h, w, h);
    ctx.restore();
  }

  function drawBanks() {
    for (const sd of [-1, 1]) {
      const pts = [[sd * 1.75, 0.04, -12], [sd * 1.75, 0.04, 2.6], [sd * 2.6, 0.04, 4.2], [sd * 6, 0.04, 6], [sd * 16, 0.04, 22], [sd * 16, 0.04, -12]];
      ctx.fillStyle = '#4a7a3a';
      if (polyPath(pts)) ctx.fill();
      // soft sunlit grass edge along the water
      const edge = [[sd * 1.75, 0.05, -12], [sd * 1.75, 0.05, 2.6], [sd * 2.6, 0.05, 4.2], [sd * 6, 0.05, 6], [sd * 6.6, 0.05, 6], [sd * 3.2, 0.05, 4.1], [sd * 2.3, 0.05, 2.4], [sd * 2.3, 0.05, -12]];
      ctx.fillStyle = '#8fc45a';
      if (polyPath(edge)) ctx.fill();
    }
  }

  function drawShore(minZ, maxZ) {
    for (const o of props) if (o.z >= minZ && o.z < maxZ) drawProp(o);
    for (const r of reeds) if (r.z >= minZ && r.z < maxZ) {
      const sway = Math.sin(time * 1.4 + r.ph) * 0.06 + r.bend;
      const a = proj(r.x, 0, r.z), m = proj(r.x + sway * 0.4, r.h * 0.55, r.z), b = proj(r.x + sway, r.h, r.z);
      if (!a || !m || !b) continue;
      ctx.strokeStyle = '#6f9e3f'; ctx.lineWidth = Math.max(1, a.s * 0.018); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y, b.x, b.y); ctx.stroke();
      if (r.cat) { ctx.fillStyle = '#7a4e2d'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 0.09 * b.s, 0.028 * b.s, 0.1 * b.s, sway, 0, TAU); ctx.fill(); }
    }
  }

  const DOCK = { x0: -1.25, x1: 1.25, z0: -10, z1: 1.0 };
  function drawDock() {
    const { x0, x1, z0, z1 } = DOCK, y = DECK_Y;
    // shadow on the water
    ctx.fillStyle = 'rgba(15,55,85,0.35)';
    if (polyPath([[x0 + 0.2, 0, z0], [x1 + 0.6, 0, z0], [x1 + 0.6, 0, z1 + 0.5], [x0 + 0.2, 0, z1 + 0.5]])) ctx.fill();
    // support posts
    for (const z of [z1 - 0.05, -2, -5]) for (const x of [x0 + 0.08, x1 - 0.08]) line3([x, -0.4, z], [x, y, z], 0.12, '#4b3427');
    // front face
    ctx.fillStyle = '#7a4a36';
    if (polyPath([[x0, y, z1], [x1, y, z1], [x1, y - 0.18, z1], [x0, y - 0.18, z1]])) ctx.fill();
    // deck
    const dg = (() => { const a = proj(0, y, z1); const b = proj(0, y, Math.max(z0, cam.z + 0.6)); if (!a || !b) return '#b77d60'; const g = ctx.createLinearGradient(0, a.y, 0, b.y); g.addColorStop(0, '#c99070'); g.addColorStop(1, '#a86c52'); return g; })();
    ctx.fillStyle = dg;
    if (polyPath([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]])) ctx.fill();
    // planks
    ctx.globalAlpha = 0.55;
    for (let z = z1; z > z0; z -= 0.3) {
      if (z < cam.z + NEAR) break;
      line3([x0, y, z], [x1, y, z], 0.012, '#7d4c38');
    }
    ctx.globalAlpha = 0.18;
    for (let k = 0; k < 5; k++) { const x = x0 + (x1 - x0) * (k + 0.5) / 5; line3([x, y, z0], [x, y, z1], 0.01, '#5d3727'); }
    ctx.globalAlpha = 1;
    // warm sunlight patch on the deck
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,220,160,0.6)';
    if (polyPath([[x0 + 0.4, y, -3], [x1, y, -3.5], [x1, y, z1], [x0 + 0.9, y, z1]])) ctx.fill();
    ctx.restore();
    // railings (painted metal, as in the reference)
    const rail = '#4c5866', railHi = '#8d9aac';
    for (const x of [x0, x1]) {
      for (const z of [-9, -6.5, -4, -1.5, 0.95]) line3([x, y, z], [x, y + 0.95, z], 0.05, rail);
      line3([x, y + 0.95, z0], [x, y + 0.95, z1 - 0.05], 0.045, rail);
      line3([x, y + 0.95, z0], [x, y + 0.95, z1 - 0.05], 0.015, railHi);
      line3([x, y + 0.5, z0], [x, y + 0.5, z1 - 0.05], 0.03, rail);
    }
  }

  // ---------- splashes & particles ----------
  function drawCrowns(dt) {
    for (let i = crowns.length - 1; i >= 0; i--) {
      const c = crowns[i]; c.t += dt;
      if (c.t > c.life) { crowns.splice(i, 1); continue; }
      const k = c.t / c.life;
      const p = proj(c.x, 0, c.z); if (!p) continue;
      const sc = Math.min(p.s, Math.min(W, H) * 0.5);
      const h = Math.sin(Math.min(1, k * 1.6) * Math.PI) * c.size * sc;
      const w = c.size * sc * (0.5 + k * 0.6);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = '#f4fdff';
      ctx.beginPath();
      const n = 9;
      ctx.moveTo(p.x - w, p.y);
      for (let j = 0; j <= n; j++) {
        const t = j / n, x = p.x - w + 2 * w * t;
        const peak = h * (0.55 + 0.45 * Math.sin(t * Math.PI)) * (j % 2 ? 1 : 0.55);
        ctx.lineTo(x, p.y - peak);
      }
      ctx.lineTo(p.x + w, p.y); ctx.quadraticCurveTo(p.x, p.y + w * 0.15, p.x - w, p.y);
      ctx.fill();
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.drawImage(glowCv, p.x - w * 1.3, p.y - h * 1.1, w * 2.6, h * 1.6);
      ctx.globalAlpha = 1;
    }
  }

  function drawDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.t += dt;
      if (d.y < 0 || d.t > 2) {
        if (d.big && d.y < 0) ripples.push({ x: d.x, z: d.z, t: 0, life: 1.2, speed: 0.6, rings: 1, strength: 0.4 });
        drops.splice(i, 1); continue;
      }
      const p = proj(d.x, d.y, d.z); if (!p || p.dz < 1.0) continue;
      const r = Math.min(Math.min(W, H) * 0.008, Math.max(0.8, d.r * p.s));
      ctx.fillStyle = d.gold ? '#ffe9a6' : '#effbff';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      if (r > 2) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.35, 0, TAU); ctx.fill(); }
    }
  }

  function drawSparks(dt) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.t += dt;
      if (s.t > s.life) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy -= s.g * dt;
      const p = proj(s.x, s.y, s.z); if (!p || p.dz < 1.2) continue;
      const k = s.t / s.life;
      const cap = Math.min(W, H) * 0.035;
      const sz = Math.min(cap, Math.max(3, s.size * p.s)) * (1 - k * 0.6) * (0.7 + 0.3 * Math.sin(s.t * 30));
      ctx.globalAlpha = (1 - k) * 0.9;
      if (s.tint) { ctx.fillStyle = s.tint; ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.35, 0, TAU); ctx.fill(); }
      ctx.drawImage(sparkCv, p.x - sz, p.y - sz, sz * 2, sz * 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.t += dt;
      if (b.t < 0) continue;
      if (b.t > b.life) { ripples.push({ x: b.x, z: b.z, t: 0, life: 0.9, speed: 0.35, rings: 1, strength: 0.5 }); bubbles.splice(i, 1); continue; }
      const p = proj(b.x + Math.sin(b.t * 7 + b.ph) * 0.02, 0.01, b.z); if (!p) continue;
      const r = Math.max(1, b.r * p.s * Math.min(1, b.t * 5));
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.5, r, Math.PI, TAU); ctx.stroke();
    }
  }

  function drawRainbows(dt) {
    for (let i = rainbows.length - 1; i >= 0; i--) {
      const r = rainbows[i]; r.t += dt;
      if (r.t > r.life) { rainbows.splice(i, 1); continue; }
      const a = proj(r.x0, 0, r.z0), b = proj(r.x1, 0, r.z1); if (!a || !b) continue;
      const k = r.t / r.life;
      const cols = ['#ff7b8a', '#ffb36b', '#ffe066', '#8fe08a', '#7cc8ff', '#b59cff'];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const hh = Math.max(14, Math.abs(a.x - b.x) * 0.5 + (a.y - b.y) * 0.6 + 20);
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.55;
      cols.forEach((c, j) => {
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, (a.s + b.s) * 0.012);
        ctx.beginPath(); ctx.moveTo(a.x, a.y - j * ctx.lineWidth); ctx.quadraticCurveTo(mx, my - hh - j * ctx.lineWidth * 1.5, b.x, b.y - j * ctx.lineWidth); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
  }

  function drawLilyPops(dt) {
    for (let i = lilyPops.length - 1; i >= 0; i--) {
      const l = lilyPops[i]; l.t += dt;
      if (l.t > l.life) { lilyPops.splice(i, 1); continue; }
      const k = l.t / l.life;
      const sc = k < 0.15 ? k / 0.15 * 1.2 : (k < 0.25 ? 1.2 - (k - 0.15) : 1);
      const e = ellipseOnWater(l.x, l.z, 0.9 * sc); if (!e) continue;
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.fillStyle = '#62b552'; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0.2, TAU - 0.2); ctx.lineTo(e.x, e.y); ctx.fill();
      ctx.fillStyle = '#ff9fbd'; ctx.beginPath(); ctx.arc(e.x - e.rx * 0.3, e.y - e.ry * 0.5, e.rx * 0.18, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---------- ambient creatures ----------
  function drawDragonflies() {
    for (const d of dragonflies) {
      const t = time * d.sp + d.ph;
      const dart = Math.sin(t * 3.1) > 0.92 ? 0.6 : 0;
      const x = d.cx + Math.sin(t * 1.3) * 1.6 + dart, y = d.cy + Math.sin(t * 2.7) * 0.25, z = d.cz + Math.cos(t * 0.9) * 1.4;
      const p = proj(x, y, z); if (!p || p.s < 4) continue;
      const s = p.s * 0.05;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.strokeStyle = '#2f6f8f'; ctx.lineWidth = Math.max(1.2, s * 0.25); ctx.beginPath(); ctx.moveTo(-s * 1.4, 0); ctx.lineTo(s * 1.2, 0); ctx.stroke();
      const flap = Math.sin(time * 60) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(220,245,255,0.55)';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(s * 0.3, sx * s * 0.6 * flap - s * 0.3, s * 0.9, s * 0.25, sx * 0.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function updateFish(dt) {
    if (time > nextFish) {
      nextFish = time + 5 + rng() * 9;
      const z = cam.z + 6 + rng() * 25, x = cam.x + (rng() - 0.5) * 10;
      fish.push({ x, z, t: 0, life: 0.9, h: 0.35 + rng() * 0.35, dir: rng() < 0.5 ? -1 : 1, koi: rng() < 0.6 });
      splash(x, z, 0.4, { drops: 6, crown: false });
    }
    for (let i = fish.length - 1; i >= 0; i--) {
      const f = fish[i]; f.t += dt;
      if (f.t > f.life) { splash(f.x + f.dir * 0.7, f.z, 0.4, { drops: 8, crown: false }); fish.splice(i, 1); continue; }
      const k = f.t / f.life;
      const p = proj(f.x + f.dir * 0.7 * k, Math.sin(k * Math.PI) * f.h, f.z); if (!p) continue;
      const s = p.s * 0.2;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(f.dir * (k - 0.5) * 2.4); ctx.scale(f.dir, 1);
      ctx.fillStyle = f.koi ? '#ff8a3d' : '#c9d6dc';
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.38, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.4, -s * 0.4); ctx.lineTo(-s * 1.4, s * 0.4); ctx.fill();
      if (f.koi) { ctx.fillStyle = '#fff4e8'; ctx.beginPath(); ctx.ellipse(s * 0.2, -s * 0.05, s * 0.3, s * 0.18, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }

  function drawPetals(dt) {
    for (const p of petals) {
      p.x += (p.vx + Math.sin(time * 0.7 + p.ph) * 0.015) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > 1.05 || p.x > 1.1) Object.assign(p, newPetal(false), { x: rng() * 1.1 - 0.2 });
      ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.sin(time * 2 + p.ph)) * 0.6 + 0.4);
      ctx.fillStyle = p.pink ? 'rgba(255,183,205,0.9)' : 'rgba(150,200,90,0.85)';
      ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawFireflies(alpha) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const f of fireflies) {
      const z = f.z + Math.floor((cam.z - f.z + 2) / 20 + 1) * 20 - 2;
      const p = proj(f.x + Math.sin(time * 0.6 + f.ph) * 0.6, f.y + Math.sin(time * 0.9 + f.ph * 2) * 0.2, z); if (!p) continue;
      const tw = Math.max(0, Math.sin(time * 2 + f.ph * 5));
      const s = Math.max(6, p.s * 0.12) * tw;
      ctx.globalAlpha = alpha * tw;
      ctx.drawImage(glowCv, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ---------- the stone in flight ----------
  function drawRock(r) {
    if (!r || !r.visible) return;
    const im = img.rocks[r.id];
    // trail
    if (r.trail && r.trail.length > 1) {
      ctx.lineCap = 'round';
      let prev = null;
      for (let i = 0; i < r.trail.length; i++) {
        const t = r.trail[i]; const p = proj(t.x, t.y, t.z); if (!p || p.dz < 1.4) { prev = null; continue; }
        if (prev) {
          const k = i / r.trail.length;
          ctx.strokeStyle = r.trailColor || 'rgba(255,255,255,1)';
          ctx.globalAlpha = Math.min(0.8, k * 0.5 * (r.trailBoost || 1));
          ctx.lineWidth = Math.min(10, Math.max(1, p.s * 0.025 * k * (r.trailBoost || 1)));
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        prev = p;
      }
      ctx.globalAlpha = 1;
    }
    // shadow on the water
    if (r.y > 0.01 && !r.sunk) {
      const e = ellipseOnWater(r.x, r.z, 0.16 / (1 + r.y * 0.6));
      if (e) { ctx.fillStyle = 'rgba(10,50,80,0.28)'; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.rx, Math.max(1, e.ry), 0, 0, TAU); ctx.fill(); }
    }
    const p = proj(r.x, r.y + 0.06, r.z); if (!p || !im) return;
    let w = Math.max(r.minPx || 16, 0.24 * p.s) * (r.scale || 1);
    const h = w * im.height / im.width;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (r.sunk) { ctx.globalAlpha = Math.max(0, 1 - r.sinkT * 1.4); ctx.beginPath(); ctx.rect(-w, -h * 2, w * 2, h * 2 - h * r.sinkT * 0.9); ctx.clip(); }
    if (r.glow) { ctx.globalAlpha *= r.glow; ctx.drawImage(glowCv, -w * 1.2, -w * 1.1, w * 2.4, w * 2.2); ctx.globalAlpha = r.sunk ? Math.max(0, 1 - r.sinkT * 1.4) : 1; }
    ctx.rotate(r.rot || 0);
    ctx.scale(1 + (r.squash || 0) * 0.3, 1 - (r.squash || 0) * 0.3);
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    // spinning sheen
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(r.spinPhase || 0);
    ctx.drawImage(glowCv, -w * 0.5 + Math.cos(r.spinPhase || 0) * w * 0.3, -h * 0.6, w * 0.6, h * 0.6);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  function drawAimArc(aim) {
    if (!aim || !aim.show) return;
    const P = root.SkipPhysics, rel = P.RELEASE;
    const el = aim.angle * 0.5 * Math.PI / 180, v = 6 + 18 * (aim.power || 0.7);
    ctx.fillStyle = '#fffaf0';
    for (let i = 1; i < 14; i++) {
      const t = i * 0.028;
      const z = rel.z + Math.cos(el) * v * t, y = rel.y + Math.sin(el) * v * t - 4.9 * t * t;
      const p = proj(rel.x, Math.max(0, y), z); if (!p) continue;
      ctx.globalAlpha = (1 - i / 14) * 0.85;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, p.s * 0.022), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- floating score pops ----------
  function drawPops(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i]; q.t += dt;
      if (q.t > q.life) { pops.splice(i, 1); continue; }
      const p = q.screen ? { x: q.sx * W, y: q.sy * H } : proj(q.x, q.y || 0, q.z); if (!p) continue;
      const k = q.t / q.life;
      const pop = k < 0.12 ? 0.4 + (k / 0.12) * 0.9 : (k < 0.22 ? 1.3 - (k - 0.12) * 3 : 1);
      const rise = q.screen ? 0 : (Math.min(1, k * 1.5) * 50 + 20) * (q.big ? 1.3 : 1);
      const size = q.size * pop;
      ctx.save();
      ctx.translate(p.x, Math.max(size, p.y - rise));
      ctx.rotate(q.rot || 0);
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.font = `700 ${size}px "Fredoka", "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = q.stroke || '#5a3424';
      ctx.strokeText(q.text, 0, 0);
      const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
      g.addColorStop(0, q.c1 || '#fffbe6'); g.addColorStop(1, q.c2 || '#ffc94a');
      ctx.fillStyle = g; ctx.fillText(q.text, 0, 0);
      ctx.restore();
    }
  }

  function drawApproach(a) {
    if (!a) return;
    const k = Math.max(0, Math.min(1, a.k)); // 1 = far away, 0 = touch
    const base = ellipseOnWater(a.x, a.z, 0.35); if (!base) return;
    const sc = 1 + k * 2.6;
    ctx.save();
    ctx.lineWidth = Math.max(2, base.s * 0.03);
    ctx.globalAlpha = 0.35 + (1 - k) * 0.65;
    ctx.strokeStyle = a.hot ? '#ffe066' : '#ffffff';
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.ellipse(base.x, base.y, base.rx * sc, base.ry * sc, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = Math.max(1, base.s * 0.012);
    ctx.beginPath(); ctx.ellipse(base.x, base.y, base.rx, base.ry, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // ---------- full frame ----------
  function render(dt, st) {
    time += dt;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save();
    const roll = cam.roll, zoom = 1 + Math.abs(roll) * 1.4;
    ctx.translate(W / 2 + cam.shakeX, H / 2 + cam.shakeY);
    ctx.rotate(roll); ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    drawSky();
    drawWavelets();
    drawLilies();
    drawRipples(dt);
    drawLilyPops(dt);
    drawRainbows(dt);
    updateFish(dt);
    drawBanks();
    drawShore(DOCK.z1 + 0.6, 1e9);
    drawBubbles(dt);
    const rockFar = st.rock && st.rock.z > DOCK.z1 + 0.2;
    if (rockFar) { drawCrowns(dt); drawRock(st.rock); }
    drawDrops(dt);
    drawDock();
    drawAimArc(st.aim);
    if (st.cat && st.cat.visible) {
      const p = proj(CAT_POS.x, CAT_POS.y, CAT_POS.z);
      if (p) root.CatArt.draw(ctx, p.x, p.y, p.s * 0.0062, st.cat.pose);
    }
    if (!rockFar) { drawCrowns(dt); drawRock(st.rock); }
    drawShore(-1e9, DOCK.z1 + 0.6);
    drawDragonflies();
    drawSparks(dt);
    drawApproach(st.approach);

    // night / twilight grade for the Moonbeam stone
    if (st.night > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = st.night;
      const ng = ctx.createLinearGradient(0, 0, 0, H);
      ng.addColorStop(0, '#3a3f86'); ng.addColorStop(0.45, '#7a6aa8'); ng.addColorStop(1, '#2d3f78');
      ctx.fillStyle = ng; ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.restore();
      drawFireflies(st.night);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = st.night * 0.8;
      for (let i = 0; i < 40; i++) {
        const sx = (Math.sin(i * 91.7) * 0.5 + 0.5) * W, sy = (Math.sin(i * 37.3) * 0.5 + 0.5) * horizonY() * 0.75;
        const tw = 0.5 + 0.5 * Math.sin(time * 2 + i);
        ctx.globalAlpha = st.night * tw * 0.8;
        ctx.drawImage(sparkCv, sx - 4, sy - 4, 8, 8);
      }
      ctx.restore();
    }

    // god rays + petals + grade
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.22 + 0.06 * Math.sin(time * 0.5)) * (1 - (st.night || 0));
    ctx.drawImage(raysCv, W - Math.max(W, H) * 0.95, -20, Math.max(W, H), Math.max(W, H));
    ctx.restore();
    drawPetals(dt);
    drawPops(dt);
    ctx.restore();

    ctx.drawImage(vignetteCv, 0, 0, W, H);
    if (st.flash > 0.01) { ctx.fillStyle = `rgba(255,250,235,${st.flash})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- fx spawners ----------
  function splash(x, z, size, o = {}) {
    if (o.crown !== false) crowns.push({ x, z, t: 0, life: 0.55 + size * 0.2, size: 0.25 * size + 0.08 });
    const n = o.drops || Math.round(10 + size * 14);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, sp = (0.8 + rng() * 1.8) * size;
      drops.push({ x, y: 0.02, z, vx: Math.cos(a) * sp * 0.6, vz: Math.sin(a) * sp * 0.6 + (o.forward || 0), vy: (1.6 + rng() * 2.6) * Math.sqrt(size), r: 0.012 + rng() * 0.022 * size, t: 0, big: rng() < 0.25, gold: o.gold && rng() < 0.4 });
    }
    ripples.push({ x, z, t: 0, life: o.life || (3 + size * 2), speed: 0.9 + size * 0.5, rings: o.rings || 3, strength: Math.min(1, 0.55 + size * 0.3), color: o.color });
  }
  function sparkle(x, y, z, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, sp = 0.5 + rng() * (o.speed || 2);
      sparks.push({ x, y: y + 0.05, z, vx: Math.cos(a) * sp * 0.6, vy: 0.6 + rng() * 2.2, vz: Math.sin(a) * sp * 0.6, g: 3, t: 0, life: 0.5 + rng() * 0.7, size: o.size || 0.07, tint: o.tint });
    }
  }
  function bubble(x, z, n) { for (let i = 0; i < n; i++) bubbles.push({ x: x + (rng() - 0.5) * 0.25, z: z + (rng() - 0.5) * 0.25, t: -i * 0.18 - rng() * 0.1, life: 0.35 + rng() * 0.4, r: 0.02 + rng() * 0.03, ph: rng() * 6 }); }
  function pop(o) { pops.push(Object.assign({ t: 0, life: 1.3, size: 28 }, o)); }
  function rainbow(x0, z0, x1, z1) { rainbows.push({ x0, z0, x1, z1, t: 0, life: 1.8 }); }
  function lilyPop(x, z) { lilyPops.push({ x, z, t: 0, life: 2.2 }); }
  function clearFx() { ripples.length = drops.length = crowns.length = sparks.length = pops.length = bubbles.length = rainbows.length = lilyPops.length = 0; }

  function catScreen() { const p = proj(CAT_POS.x, CAT_POS.y, CAT_POS.z); return p ? { x: p.x, y: p.y, s: p.s * 0.0062 } : null; }

  root.Scene = {
    init, load, resize, render, cam, proj, splash, sparkle, bubble, pop, rainbow, lilyPop, clearFx, catScreen,
    img, CAT_POS, get W() { return W; }, get H() { return H; }, get time() { return time; },
  };
})(window);
