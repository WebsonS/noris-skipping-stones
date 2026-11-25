// Core-rule regression tests:  node tools/test.js
const store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
require('../js/physics.js');
require('../js/rocks.js');
require('../js/storage.js');
const P = globalThis.SkipPhysics, Save = globalThis.Save;
const pebble = globalThis.rockById('pebble');

let fails = 0;
function check(name, cond, info) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!cond) fails++; }
function runs(angle, power, rock = pebble, n = 60, opts) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(P.simulate(angle, power, rock, 5000 + i, opts));
  return out;
}
const avg = (a, f) => a.reduce((s, r) => s + f(r), 0) / a.length;

// 1. too flat → sinks instantly (digs in)
const flat = runs(2, 1);
check('flat throw sinks instantly', flat.every((r) => r.skips === 0 && r.reason === 'dig'), `skips=${avg(flat, (r) => r.skips)}`);
// 2. too steep → plunges
const steep = runs(42, 0.9);
check('steep throw plunges', steep.every((r) => r.skips === 0 && r.reason === 'plunge'));
// 3. too weak → (almost) nothing
const weak = runs(19, 0.05);
check('very weak throw sinks almost immediately', avg(weak, (r) => r.skips) <= 1.2, `avg=${avg(weak, (r) => r.skips).toFixed(2)}`);
// 4. mediocre angles → 1–3 skips
const meh = runs(10, 0.75).concat(runs(28, 0.75));
const mehAvg = avg(meh, (r) => r.skips);
check('off-angle throws give 1–3 skips', mehAvg >= 1 && mehAvg <= 3 && meh.every((r) => r.skips <= 4), `avg=${mehAvg.toFixed(2)}`);
// 5. the rare sweet spot → 7+
const perfect = runs(19, 1);
check('perfect angle + full power skips 7+', perfect.every((r) => r.skips > 7), `min=${Math.min(...perfect.map((r) => r.skips))}`);
const nearly = runs(19, 0.7);
check('good-but-not-perfect power stays below 7', avg(nearly, (r) => r.skips) < 7, `avg=${avg(nearly, (r) => r.skips).toFixed(2)}`);
// 6. bounces lose energy: each hop shorter & quicker
{
  const s = P.createThrow(19, 1, pebble, 42);
  while (s.alive) P.step(s, 1 / 60);
  const b = s.bounces;
  let shorter = true, quicker = true;
  for (let i = 2; i < b.length; i++) {
    if (b[i].z - b[i - 1].z > b[i - 1].z - b[i - 2].z + 0.01) shorter = false;
    if (b[i].t - b[i - 1].t > b[i - 1].t - b[i - 2].t + 0.002) quicker = false;
  }
  check('hops get shorter', shorter); check('hops get quicker', quicker);
}
// 7. scoring escalates with skips
{
  const lo = P.simulate(14, 0.8, pebble, 1), hi = P.simulate(19, 1, pebble, 1);
  check('more skips → much bigger score', hi.skips > lo.skips && hi.total > lo.total * 2, `${lo.skips}:${lo.total} vs ${hi.skips}:${hi.total}`);
  check('a sinking throw scores 0', P.simulate(2, 1, pebble, 1).total === 0);
}
// 8. skill matters (randomness is small)
{
  const r = runs(19, 1).map((x) => x.skips);
  check('throw-to-throw spread is small', Math.max(...r) - Math.min(...r) <= 2, `range ${Math.min(...r)}–${Math.max(...r)}`);
}
// 9. every stone behaves differently
{
  const sig = globalThis.ROCKS.map((rk) => { const a = runs(19, 1, rk, 20, { tapFn: () => 1 }); return avg(a, (r) => r.skips).toFixed(2) + '/' + avg(a, (r) => r.total).toFixed(0) + '/' + avg(a, (r) => r.dist).toFixed(1); });
  check('all stones have distinct outcomes', new Set(sig).size >= globalThis.ROCKS.length - 1, sig.join('  '));
}
// 10. unlocks & persistence
{
  Save.resetAll();
  check('fresh save: only the pebble, tutorial not done', Save.data.unlocked.join() === 'pebble' && !Save.data.tutorialDone);
  const r3 = P.simulate(19, 0.7, pebble, 1);
  const info = Save.recordThrow(r3, 19, 0.7);
  check('6+ skips unlocks Googly', r3.skips >= 6 && info.unlocked.some((x) => x.id === 'googly'), `skips=${r3.skips}`);
  const r8 = P.simulate(19, 1, pebble, 3, { tapFn: () => 2 });
  const info8 = Save.recordThrow(r8, 19, 1);
  check('a 12+ skip throw unlocks the skip-tier stones together', ['glass', 'sprout', 'frost'].every((id) => info8.unlocked.some((x) => x.id === id)), info8.unlocked.map((x) => x.id).join(','));
  check('locked legendary stays locked', !Save.data.unlocked.includes('angel'));
  Save.set('tutorialDone', true);
  // simulate reopening the game: reload storage module from the same localStorage
  delete require.cache[require.resolve('../js/storage.js')];
  require('../js/storage.js');
  check('tutorial-done + unlocks survive a reload', globalThis.Save.data.tutorialDone === true && globalThis.Save.data.unlocked.includes('googly'));
  check('best score recorded', globalThis.Save.data.bestScore === Math.max(r3.total, r8.total));
}
console.log(fails ? `\n${fails} FAILED` : '\nAll tests passed');
process.exit(fails ? 1 : 0);
