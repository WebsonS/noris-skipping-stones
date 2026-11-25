/* Stone-skipping physics + scoring. Pure logic, no rendering — also runs under Node for tuning/tests.
 *
 * World axes: x = lateral (right +), y = up (water surface at 0), z = forward over the lake (metres).
 * The player's "angle" is the stone's tilt at release. Like real skipping (Clanet's ~20° "magic angle"),
 * too flat and the leading edge digs in, too steep and it plunges; the closer to the sweet spot the less
 * energy each touch of the water costs.
 */
(function (root) {
  'use strict';
  const G = 9.8;
  const VSINK = 3.1;            // below this forward speed the stone can't plane any more
  const FLAT_LIMIT = 5;         // degrees — below: digs in
  const STEEP_LIMIT = 37;       // degrees — above: plunges
  const RELEASE = { x: -0.25, y: 1.0, z: 0.9 };

  const BASE = {
    sweet: 19, sigma: 7.5, lossMul: 1, speedMul: 1, grav: 1, rebound: 1,
    multStep: 0.2, ptsMul: 1, distMul: 1, tapWindow: 1, tapSave: 0.84, lucky: 0, timeScale: 1,
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function params(rock) { return Object.assign({}, BASE, (rock && rock.params) || {}); }

  function angleQuality(angle, p) {
    const d = (angle - p.sweet) / p.sigma;
    return Math.exp(-d * d);
  }

  /** Release rating shown the instant the stone leaves the paw. */
  function rateRelease(angle, power, rock) {
    const p = params(rock);
    const qa = angleQuality(angle, p);
    if (angle < FLAT_LIMIT) return { key: 'flat', label: 'Too flat!', q: 0 };
    if (angle > STEEP_LIMIT) return { key: 'steep', label: 'Too steep!', q: 0 };
    if (power < 0.22) return { key: 'weak', label: 'Too gentle…', q: 0.1 };
    const q = qa * (0.35 + 0.65 * power);
    if (qa > 0.93 && power > 0.92) return { key: 'perfect', label: 'PERFECT!', q };
    if (q > 0.7) return { key: 'great', label: 'Great throw!', q };
    if (q > 0.45) return { key: 'good', label: 'Nice!', q };
    return { key: 'ok', label: angle < p.sweet ? 'A bit flat…' : 'A bit steep…', q };
  }

  function createThrow(angle, power, rock, seed, opts) {
    opts = opts || {};
    const p = params(rock);
    const rng = mulberry32(seed >>> 0 || 1);
    const v0 = (6 + 18 * power) * p.speedMul;
    const elev = (angle * 0.5) * Math.PI / 180;
    const qa = angleQuality(angle, p);
    const s = {
      rock, p, rng, angle, power, qa,
      x: RELEASE.x, y: RELEASE.y, z: RELEASE.z,
      vx: (rng() - 0.5) * 0.5, vy: v0 * Math.sin(elev), vz: v0 * Math.cos(elev),
      t: 0, skips: 0, alive: true, sunk: false, sinkReason: null,
      rescueUsed: false, assist: opts.assist || 0, maxSkips: opts.maxSkips || 0, tapsPerfect: 0,
      score: 0, mult: 1, bounces: [], maxHop: 0,
      release: rateRelease(angle, power, rock),
      perfectRelease: qa > 0.93 && power > 0.92,
      spin: 8 + 30 * power * (0.4 + 0.6 * qa),
    };
    return s;
  }

  /** Time (s) until the stone next touches the water (ballistic), or null. */
  function timeToContact(s) {
    if (!s.alive) return null;
    const g = G * s.p.grav;
    const disc = s.vy * s.vy + 2 * g * s.y;
    if (disc < 0) return null;
    return (s.vy + Math.sqrt(disc)) / g;
  }

  function predictContact(s) {
    const t = timeToContact(s);
    if (t == null) return null;
    return { t, x: s.x + s.vx * t, z: s.z + s.vz * t };
  }

  /** Advance the flight. `tapFn()` is asked at each contact whether the player timed a tap. Returns events. */
  function step(s, dt, tapFn) {
    const ev = [];
    if (!s.alive) return ev;
    const g = G * s.p.grav;
    let remaining = dt;
    // sub-step so fast stones never tunnel past a contact
    while (remaining > 0 && s.alive) {
      const h = Math.min(remaining, 1 / 240);
      remaining -= h;
      s.t += h;
      if (s.p.wind) s.vx += Math.sin(s.t * 2.3) * s.p.wind * h;
      s.vy -= g * h;
      s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
      // tiny air drag
      s.vz *= 1 - 0.012 * h;
      if (s.y <= 0 && s.vy < 0) {
        s.y = 0;
        const tapped = tapFn ? tapFn(s) : 0;
        ev.push(contact(s, tapped));
      }
    }
    return ev;
  }

  function sink(s, reason) {
    s.alive = false; s.sunk = true; s.sinkReason = reason;
    s.vy = -0.6; s.vz *= 0.15; s.vx *= 0.15;
    return { type: 'sink', reason, x: s.x, z: s.z, skips: s.skips };
  }

  function contact(s, tapped) {
    const p = s.p, rng = s.rng;
    const vz = s.vz;
    const inc = Math.atan2(-s.vy, vz) * 180 / Math.PI;
    if (s.skips === 0) {
      if (s.angle < FLAT_LIMIT) return sink(s, 'dig');
      if (s.angle > STEEP_LIMIT) return sink(s, 'plunge');
      if (s.qa < 0.03 && !s.assist) return sink(s, s.angle < p.sweet ? 'dig' : 'plunge');
    }
    if (inc > 32) return sink(s, 'plunge');
    if (s.maxSkips && s.skips >= s.maxSkips) return sink(s, 'tired');
    const q = Math.max(s.qa, s.assist);
    let loss = p.lossMul * (0.095 + 0.52 * Math.pow(1 - q, 1.5) + 0.1 * (1 - s.power)) + 0.95 / Math.max(vz, 0.5);
    loss *= 0.86 + rng() * 0.28;
    if (p.frost) loss *= s.skips < 5 ? 0.35 : 1.35;
    if (tapped) loss *= tapped >= 2 ? p.tapSave * 0.88 : p.tapSave;
    loss = Math.min(loss, 0.97);
    let nvz = vz * (1 - loss);
    let rescued = false;
    if (nvz < VSINK) {
      if (p.rescue && !s.rescueUsed && s.skips > 0) {
        s.rescueUsed = true; rescued = true; nvz = Math.max(nvz, 6.5);
      } else {
        return sink(s, 'tired');
      }
    }
    let gust = false;
    s.skips++;
    if (p.gust && (s.skips === 3 || s.skips === 6)) { nvz *= 1.3; gust = true; }
    s.vx *= (1 - loss) + (rng() - 0.5) * 0.1;
    s.vx += (rng() - 0.5) * 0.35;
    s.vz = nvz;
    const gamma = (4.6 + 4.2 * q) * p.rebound * (0.95 + rng() * 0.1) * Math.PI / 180;
    s.vy = nvz * Math.tan(gamma) * (rescued ? 1.8 : 1);
    s.y = 0.0001;

    // scoring
    const n = s.skips;
    s.mult = 1 + p.multStep * (n - 1);
    let lucky = 1;
    if (p.lucky && (rng() < p.lucky || n === 7)) lucky = 3;
    const tapMul = tapped ? (tapped >= 2 ? 2 : 1.5) : 1;
    if (tapped >= 2) s.tapsPerfect++;
    const pts = Math.round(10 * n * s.mult * lucky * tapMul * p.ptsMul);
    s.score += pts;
    const b = { type: 'skip', n, x: s.x, z: s.z, pts, mult: s.mult, lucky: lucky > 1, tapped, rescued, gust, speed: nvz, t: s.t };
    s.bounces.push(b);
    return b;
  }

  /** Final tally once the stone has sunk. */
  function finalize(s) {
    const dist = Math.max(0, s.z - RELEASE.z);
    const distPts = s.skips ? Math.round(dist * 4 * s.p.distMul) : 0;
    const perfectPts = s.perfectRelease && s.skips > 0 ? 250 : 0;
    const tapPts = s.tapsPerfect * 25;
    const total = s.score + distPts + perfectPts + tapPts;
    return {
      skips: s.skips, dist, skipPts: s.score, distPts, perfectPts, tapPts, total,
      mult: s.mult, taps: s.tapsPerfect, reason: s.sinkReason, release: s.release,
      perfect: s.perfectRelease,
    };
  }

  /** Run a whole throw instantly (tests / tuning). tapFn optional. */
  function simulate(angle, power, rock, seed, opts) {
    const s = createThrow(angle, power, rock, seed, opts);
    let guard = 0;
    while (s.alive && guard++ < 20000) step(s, 1 / 60, opts && opts.tapFn);
    return finalize(s);
  }

  root.SkipPhysics = {
    G, VSINK, FLAT_LIMIT, STEEP_LIMIT, RELEASE, BASE,
    params, angleQuality, rateRelease, createThrow, step, timeToContact, predictContact, finalize, simulate, mulberry32,
  };
})(typeof window !== 'undefined' ? window : globalThis);
