/* Local save: progress, unlocks, settings and first-launch/tutorial memory. */
(function (root) {
  'use strict';
  const KEY = 'catSkippingRocks.save.v1';
  const DEFAULTS = {
    tutorialDone: false,
    bestScore: 0, bestSkips: 0, bestDist: 0, bestTaps: 0,
    throws: 0, totalSkips: 0, perfects: 0,
    unlocked: ['pebble'], selected: 'pebble', seen: ['pebble'],
    ghost: null, // { angle, power, skips } of the best throw — drawn as a hint marker
    music: true, sfx: true, shake: true,
  };
  let data = load();

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, DEFAULTS, { unlocked: ['pebble'], seen: ['pebble'] });
      const d = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, d);
    } catch (e) {
      return Object.assign({}, DEFAULTS, { unlocked: ['pebble'], seen: ['pebble'] });
    }
  }
  function save() {
    try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode: play on without saving */ }
  }

  /** Checks every stone's unlock condition against this throw + lifetime stats. Returns newly unlocked rocks. */
  function checkUnlocks(result) {
    const fresh = [];
    for (const r of root.ROCKS) {
      if (!r.unlock || data.unlocked.includes(r.id)) continue;
      if (progressOf(r, result) >= 1) { data.unlocked.push(r.id); fresh.push(r); }
    }
    return fresh;
  }

  /** 0..1 progress toward a stone's unlock (uses bests so it's monotonic). */
  function progressOf(r, result) {
    const u = r.unlock; if (!u) return 1;
    const cur = {
      skips: Math.max(data.bestSkips, result ? result.skips : 0),
      score: Math.max(data.bestScore, result ? result.total : 0),
      dist: Math.max(data.bestDist, result ? result.dist : 0),
      throws: data.throws,
      totalSkips: data.totalSkips,
      taps: Math.max(data.bestTaps, result ? result.taps : 0),
    }[u.type] || 0;
    return Math.min(1, cur / u.value);
  }
  function progressValue(r) {
    const u = r.unlock; if (!u) return null;
    const v = { skips: data.bestSkips, score: data.bestScore, dist: Math.floor(data.bestDist), throws: data.throws, totalSkips: data.totalSkips, taps: data.bestTaps }[u.type] || 0;
    return { cur: Math.min(v, u.value), max: u.value };
  }

  /** Record a finished throw. Returns { newBest:{score,skips,dist}, unlocked:[rocks] } */
  function recordThrow(res, angle, power) {
    data.throws++;
    data.totalSkips += res.skips;
    if (res.perfect) data.perfects++;
    const newBest = { score: res.total > data.bestScore, skips: res.skips > data.bestSkips, dist: res.dist > data.bestDist + 0.5 };
    const unlocked = checkUnlocks(res);
    if (newBest.score) data.bestScore = res.total;
    if (newBest.skips) { data.bestSkips = res.skips; data.ghost = { angle, power, skips: res.skips }; }
    if (res.dist > data.bestDist) data.bestDist = res.dist;
    if (res.taps > data.bestTaps) data.bestTaps = res.taps;
    // lifetime-based unlocks may now be satisfied too
    unlocked.push(...checkUnlocks(null).filter((r) => !unlocked.includes(r)));
    save();
    return { newBest, unlocked };
  }

  function resetAll() {
    data = Object.assign({}, DEFAULTS, { unlocked: ['pebble'], seen: ['pebble'], music: data.music, sfx: data.sfx });
    save();
  }

  root.Save = {
    get data() { return data; },
    save, recordThrow, progressOf, progressValue, resetAll,
    set(k, v) { data[k] = v; save(); },
  };
})(window);
