/* Screen-space celebration layer drawn above the UI: paper confetti, petals, sparkles and coin-like shells. */
(function (root) {
  'use strict';
  const cv = document.getElementById('confetti');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, parts = [], running = false, last = 0;
  const COLORS = ['#ffd34d', '#f6a7c0', '#8fdc6e', '#7fd0ff', '#fff6dc', '#ffb48a', '#c5a3ff'];

  function resize() {
    DPR = Math.min(root.devicePixelRatio || 1, 2);
    W = root.innerWidth; H = root.innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
  }
  resize();
  root.addEventListener('resize', resize);

  function burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.dir != null ? o.dir : -Math.PI / 2) + (Math.random() - 0.5) * (o.spread || Math.PI * 1.2);
      const sp = (o.speed || 520) * (0.4 + Math.random() * 0.8);
      const kind = o.kind || (Math.random() < 0.18 ? 'star' : Math.random() < 0.35 ? 'petal' : 'paper');
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.gravity == null ? 900 : o.gravity,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, s: (o.size || 9) * (0.6 + Math.random() * 0.8),
        c: o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : COLORS[(Math.random() * COLORS.length) | 0],
        t: 0, life: (o.life || 2.2) * (0.6 + Math.random() * 0.6), kind, flip: Math.random() * 6,
      });
    }
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }

  function rain(n) { for (let i = 0; i < n; i++) burst(Math.random() * W, -20 - Math.random() * 120, 1, { dir: Math.PI / 2, spread: 0.6, speed: 120, gravity: 260, life: 3.5 }); }

  function star(c, r) {
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fill();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.t > p.life || p.y > H + 40) { parts.splice(i, 1); continue; }
      p.vx *= 1 - 1.6 * dt; p.vy += p.g * dt; p.vy *= 1 - 1.2 * dt;
      p.x += p.vx * dt + Math.sin(p.t * 4 + p.flip) * 20 * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const k = p.t / p.life;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.fillStyle = p.c;
      if (p.kind === 'star') { ctx.fillStyle = '#fff3b0'; star(ctx, p.s * 0.9); }
      else if (p.kind === 'petal') { ctx.scale(1, Math.abs(Math.sin(p.t * 6 + p.flip)) * 0.7 + 0.3); ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.7, p.s * 0.42, 0, 0, 7); ctx.fill(); }
      else if (p.kind === 'shell') { ctx.fillStyle = '#ffe17a'; ctx.beginPath(); ctx.arc(0, 0, p.s * 0.7, 0, 7); ctx.fill(); ctx.fillStyle = '#f2a922'; ctx.beginPath(); ctx.arc(0, 0, p.s * 0.45, 0, 7); ctx.fill(); ctx.fillStyle = '#fff8d0'; ctx.fillRect(-p.s * 0.15, -p.s * 0.5, p.s * 0.2, p.s * 0.4); }
      else { ctx.scale(Math.cos(p.t * 7 + p.flip), 1); ctx.fillRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6); }
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(loop); else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  root.FX = { burst, rain, resize };
})(window);
