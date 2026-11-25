/* Nori — the black sticker cat, drawn procedurally so it can move, throw and emote.
 * Faithful to the reference stickers: a soft black blob, pointed ears, huge yellow ring eyes,
 * a long curling tail and a thick cream "sticker" outline around the whole silhouette. */
(function (root) {
  'use strict';
  const INK = '#141216';
  const RIM = '#fffaf0';
  const EYE = '#f4d63a';
  const OUT = 3.6; // outline thickness in cat units

  function ell(ctx, x, y, rx, ry, rot = 0) { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }

  function earPath(ctx, side, twitch) {
    const s = side; // -1 left, 1 right
    const tw = twitch * s;
    ctx.moveTo(s * 7, -76);
    ctx.quadraticCurveTo(s * 20, -94 + tw * 2, s * 25 + tw, -96 + Math.abs(tw));
    ctx.quadraticCurveTo(s * 30 + tw, -86, s * 29, -66);
    ctx.closePath();
  }

  function silhouette(ctx, P) {
    // body
    ell(ctx, 0, -27 + P.crouch * 4, 27 + P.crouch * 2, 25 - P.crouch * 3);
    // head
    ctx.save();
    ell(ctx, P.headX, -60 + P.crouch * 9 + P.headY, 30, 24, P.headTilt);
    ctx.restore();
    // feet
    ell(ctx, -12, -4, 9, 5.5);
    ell(ctx, 12, -4, 9, 5.5);
  }

  function ears(ctx, P) {
    ctx.save();
    ctx.translate(P.headX, -60 + P.crouch * 9 + P.headY);
    ctx.rotate(P.headTilt);
    ctx.translate(0, 60);
    earPath(ctx, -1, P.earTwitch); earPath(ctx, 1, P.earTwitch * 0.4);
    ctx.restore();
  }

  function tailPath(ctx, P) {
    const w = Math.sin(P.tail) * 9, w2 = Math.cos(P.tail * 0.8) * 7;
    if (P.view === 'back') { // wraps around the feet, like the back-view sticker
      ctx.moveTo(-6, -9);
      ctx.bezierCurveTo(-26, -1, -44, -2, -48 - w * 0.4, -14);
      ctx.quadraticCurveTo(-52 - w * 0.5, -26 - w2 * 0.6, -42 - w * 0.4, -30 - w2 * 0.4);
      return;
    }
    const side = 1;
    ctx.moveTo(side * 20, -10);
    ctx.bezierCurveTo(side * (44 + w2 * 0.3), -12, side * (50 + w), -34, side * (38 + w), -52 - w2);
    ctx.quadraticCurveTo(side * (32 + w * 0.6), -60 - w2, side * (28 + w * 0.5), -55 - w2 * 0.6);
  }

  function armTarget(P) {
    // shoulder on the throwing (screen-right) side in back view
    const sx = 17, sy = -40 + P.crouch * 6;
    const a = P.arm.angle, len = 23 * P.arm.reach;
    return { sx, sy, px: sx + Math.cos(a) * len, py: sy + Math.sin(a) * len };
  }

  /**
   * Draw the cat. (x,y) = screen position of its feet, s = px per cat-unit.
   * P: { view, turn(0..1 squash), crouch, lean, bob, squash, headTilt, headX, headY, earTwitch, tail,
   *      eyes, blush, arm:{angle,reach,behind}, rockImg, rockVisible, alpha }
   */
  function draw(ctx, x, y, s, P) {
    ctx.save();
    ctx.translate(x, y - P.bob * s);
    const flipS = P.turnScale == null ? 1 : P.turnScale;
    ctx.scale(s * (1 + P.squash * 0.12) * flipS, s * (1 - P.squash * 0.12));
    ctx.rotate(P.lean);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // soft contact shadow
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#2b2018';
    ctx.beginPath(); ell(ctx, 4, 0, 36, 6); ctx.fill();
    ctx.restore();

    const arm = P.view === 'back' && P.arm ? armTarget(P) : null;

    // ---- outline pass (cream sticker rim) ----
    ctx.strokeStyle = RIM; ctx.fillStyle = RIM;
    ctx.lineWidth = OUT * 2;
    ctx.beginPath(); silhouette(ctx, P); ctx.stroke(); ctx.fill();
    ctx.beginPath(); ears(ctx, P); ctx.stroke(); ctx.fill();
    if (P.view !== 'back') { ctx.lineWidth = 9 + OUT * 2; ctx.beginPath(); tailPath(ctx, P); ctx.stroke(); }
    if (arm) { ctx.lineWidth = 11 + OUT * 2; ctx.beginPath(); ctx.moveTo(arm.sx, arm.sy); ctx.lineTo(arm.px, arm.py); ctx.stroke(); }

    // ---- ink pass ----
    ctx.fillStyle = INK; ctx.strokeStyle = INK;
    if (P.view !== 'back') { ctx.lineWidth = 9; ctx.beginPath(); tailPath(ctx, P); ctx.stroke(); }
    if (arm && P.arm.behind) { ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(arm.sx, arm.sy); ctx.lineTo(arm.px, arm.py); ctx.stroke(); }
    ctx.beginPath(); silhouette(ctx, P); ctx.fill('nonzero');
    ctx.beginPath(); ears(ctx, P); ctx.fill();

    // subtle volume: a soft sheen on the head/back so the black reads as round
    ctx.save();
    ctx.globalAlpha = 0.16;
    const g = ctx.createRadialGradient(-8, -72 + P.crouch * 9, 2, -4, -60, 30);
    g.addColorStop(0, '#9aa4c8'); g.addColorStop(1, 'rgba(154,164,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ell(ctx, P.headX, -60 + P.crouch * 9 + P.headY, 30, 24, P.headTilt); ctx.fill();
    ctx.restore();

    if (P.view === 'back') {
      ctx.strokeStyle = RIM; ctx.lineWidth = 9 + OUT * 2; ctx.beginPath(); tailPath(ctx, P); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); tailPath(ctx, P); ctx.stroke();
      // the faint line where head meets back (as on the reference back-view sticker)
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(P.headX, -40 + P.crouch * 9, 18, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
      if (arm && !P.arm.behind) {
        ctx.strokeStyle = INK; ctx.lineWidth = 11;
        ctx.beginPath(); ctx.moveTo(arm.sx, arm.sy); ctx.lineTo(arm.px, arm.py); ctx.stroke();
      }
      if (arm && P.rockVisible && P.rockImg) {
        const rw = 20, rh = rw * P.rockImg.height / P.rockImg.width;
        ctx.save(); ctx.translate(arm.px, arm.py); ctx.rotate(-0.25);
        ctx.drawImage(P.rockImg, -rw / 2, -rh / 2 - 2, rw, rh);
        ctx.restore();
        // paw over the stone
        ctx.fillStyle = INK; ctx.beginPath(); ell(ctx, arm.px + 2, arm.py + 1, 6, 5); ctx.fill();
      }
    } else {
      face(ctx, P);
    }
    ctx.restore();
  }

  function face(ctx, P) {
    ctx.save();
    ctx.translate(P.headX, -60 + P.crouch * 9 + P.headY);
    ctx.rotate(P.headTilt);
    ctx.translate(0, 60);
    const ey = -58, ex = 11.5;
    const mode = P.eyes || 'open';
    ctx.lineCap = 'round';
    if (P.blush) {
      ctx.fillStyle = 'rgba(246,140,170,0.55)';
      ctx.beginPath(); ell(ctx, -19, -48, 5, 2.6); ell(ctx, 19, -48, 5, 2.6); ctx.fill();
    }
    for (const sx of [-1, 1]) {
      const cx = sx * ex;
      if (mode === 'open' || mode === 'shock' || mode === 'sad') {
        const r = mode === 'shock' ? 8.6 : 7.4;
        ctx.strokeStyle = mode === 'shock' ? '#fffaf0' : EYE; ctx.lineWidth = 2.7;
        ctx.beginPath(); ctx.arc(cx + (P.lookX || 0), ey + (P.lookY || 0), r, 0, Math.PI * 2); ctx.stroke();
        if (mode === 'sad') { // tears welling, like the dripping-eye sticker
          ctx.fillStyle = '#8fd0f0';
          const d = (P.tear || 0) * 9;
          ctx.beginPath(); ctx.ellipse(cx + 1, ey + 9 + d, 2.4, 3.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = EYE; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(cx - 6, ey - 11); ctx.lineTo(cx + 2 * sx, ey - 9 - sx * 2); ctx.stroke();
        }
      } else if (mode === 'blink' || mode === 'closed') {
        ctx.strokeStyle = EYE; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(cx - 6, ey + 1); ctx.quadraticCurveTo(cx, ey + 4, cx + 6, ey + 1); ctx.stroke();
      } else if (mode === 'happy') {
        ctx.strokeStyle = EYE; ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(cx - 6.5, ey + 2); ctx.quadraticCurveTo(cx, ey - 7, cx + 6.5, ey + 2); ctx.stroke();
      } else if (mode === 'dizzy') {
        ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 1.8;
        ctx.beginPath();
        const spin = (P.time || 0) * 6 * sx;
        for (let k = 0; k < 26; k++) {
          const a = k * 0.55 + spin, r = 0.4 + k * 0.29;
          const px = cx + Math.cos(a) * r, py = ey + Math.sin(a) * r;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    }
    if (mode === 'happy' || P.mouth === 'w') {
      ctx.strokeStyle = '#f39ab0'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-4, -46); ctx.quadraticCurveTo(-2, -43, 0, -46); ctx.quadraticCurveTo(2, -43, 4, -46); ctx.stroke();
    }
    if (mode === 'shock') {
      ctx.fillStyle = '#f39ab0'; ctx.beginPath(); ell(ctx, 0, -46, 2, 1.6); ctx.fill();
      ctx.strokeStyle = '#7fb3e8'; ctx.lineWidth = 1.6; // sweat lines
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(24 + k * 3.4, -82 + k); ctx.lineTo(24 + k * 3.4, -72 + k); ctx.stroke(); }
    }
    ctx.restore();
  }

  /** Default pose object. */
  function pose() {
    return {
      view: 'front', turnScale: 1, crouch: 0, lean: 0, bob: 0, squash: 0, headTilt: 0, headX: 0, headY: 0,
      earTwitch: 0, tail: 0, eyes: 'open', blush: false, arm: { angle: 1.7, reach: 1, behind: false },
      rockImg: null, rockVisible: false, lookX: 0, lookY: 0, time: 0, tear: 0, mouth: null,
    };
  }

  root.CatArt = { draw, pose, armTarget };
})(window);
