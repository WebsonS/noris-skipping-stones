// Physics tuning / regression check:  node tools/tune.js [rockId]
require('../js/physics.js');
require('../js/rocks.js');
const P = globalThis.SkipPhysics;
const rock = globalThis.rockById(process.argv[2] || 'pebble');
const N = 40;
function avg(angle, power, tap) {
  let s = 0, sc = 0, d = 0, mx = 0;
  for (let i = 0; i < N; i++) {
    const r = P.simulate(angle, power, rock, 1000 + i, tap ? { tapFn: () => 2 } : undefined);
    s += r.skips; sc += r.total; d += r.dist; mx = Math.max(mx, r.skips);
  }
  return { skips: s / N, score: sc / N, dist: d / N, max: mx };
}
const powers = [0.1, 0.3, 0.5, 0.7, 0.85, 0.95, 1];
console.log(`rock=${rock.id}   rows=angle, cols=power ${powers.join(' ')}   (avg skips / max)`);
for (let a = 0; a <= 44; a += 2) {
  const row = powers.map((p) => { const r = avg(a, p); return (r.skips.toFixed(1) + '/' + r.max).padStart(8); });
  console.log(String(a).padStart(3) + '°' + row.join(''));
}
const best = avg(rock.params && rock.params.sweet || 19, 1);
const bestTap = avg(19, 1, true);
console.log('sweet+full power:', best, '\nwith perfect taps:', bestTap);
