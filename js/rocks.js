/* The stone collection. Each stone tweaks the physics (params) and some carry a special power. */
(function (root) {
  'use strict';
  const ROCKS = [
    {
      id: 'pebble', name: 'Lake Pebble', img: 'pebble', rarity: 'common', color: '#a7a596',
      power: 'Honest & balanced', desc: 'A smooth, grey, perfectly ordinary skipping stone. Nori found it first.',
      unlock: null, params: {},
    },
    {
      id: 'googly', name: 'Googly', img: 'googly', rarity: 'common', color: '#c9c5b5',
      power: 'Keen Eye', desc: 'Watches your aim: the sweet spot glows on the angle gauge, and it forgives a little more.',
      unlock: { type: 'skips', value: 6, text: 'Skip 6 times in one throw' }, params: { sigma: 7.6 }, showSweet: true,
    },
    {
      id: 'toast', name: 'Toasty', img: 'toast', rarity: 'common', color: '#e2a35c',
      power: 'Bouncy Crust', desc: 'Springs high off the water for big, floaty hops. Distance points ×2, but it tires quickly.',
      unlock: { type: 'score', value: 1500, text: 'Score 1,500 in one throw' }, params: { rebound: 1.75, lossMul: 1.2, distMul: 2 },
    },
    {
      id: 'glass', name: 'River Glass', img: 'glass', rarity: 'rare', color: '#5fb4ea',
      power: 'Slick', desc: 'Glides with almost no drag — but only if your angle is spot-on.',
      unlock: { type: 'skips', value: 9, text: 'Skip 9 times in one throw' }, params: { lossMul: 0.72, sigma: 4.6 },
    },
    {
      id: 'leaf', name: 'Autumn Leaf', img: 'leaf', rarity: 'rare', color: '#e0743a',
      power: 'Featherfall', desc: 'Drifts on the breeze. Gentle gravity, a wide sweet spot, and lazy curving hops.',
      unlock: { type: 'dist', value: 95, text: 'Throw 95 m in one go' }, params: { grav: 0.7, sigma: 9.5, speedMul: 0.9, wind: 1.4 },
    },
    {
      id: 'ladybug', name: 'Ladybug', img: 'ladybug', rarity: 'rare', color: '#d8433a',
      power: 'Lucky Spots', desc: 'Every skip has a 1-in-5 chance to score ×3 — and the 7th skip is always lucky.',
      unlock: { type: 'throws', value: 60, text: 'Throw 60 stones' }, params: { lucky: 0.2 },
    },
    {
      id: 'sprout', name: 'Sprout', img: 'sprout', rarity: 'rare', color: '#6fae4a',
      power: 'Second Wind', desc: 'When it should sink, a lily pad pops up and bounces it back into the air. Once per throw.',
      unlock: { type: 'skips', value: 10, text: 'Skip 10 times in one throw' }, params: { rescue: true },
    },
    {
      id: 'swirl', name: 'Whirlwind', img: 'swirl', rarity: 'epic', color: '#8fd3e8',
      power: 'Gust', desc: 'A burst of wind shoves it forward on the 3rd and 6th skip.',
      unlock: { type: 'score', value: 4000, text: 'Score 4,000 in one throw' }, params: { gust: true },
    },
    {
      id: 'frost', name: 'Frostbite', img: 'frost', rarity: 'epic', color: '#9fd8ff',
      power: 'Ice Path', desc: 'The first 5 skips freeze the water and lose almost nothing. After that it turns brittle.',
      unlock: { type: 'skips', value: 12, text: 'Skip 12 times in one throw' }, params: { frost: true },
    },
    {
      id: 'crystal', name: 'Prism Crystal', img: 'crystal', rarity: 'epic', color: '#b49cf0',
      power: 'Refraction', desc: 'Your combo multiplier climbs twice as fast with every skip.',
      unlock: { type: 'score', value: 7000, text: 'Score 7,000 in one throw' }, params: { multStep: 0.4 },
    },
    {
      id: 'music', name: 'Melody', img: 'music', rarity: 'epic', color: '#f2c75c',
      power: 'Rhythm', desc: 'Tap windows are twice as wide and perfect taps carry it much further. Each skip sings.',
      unlock: { type: 'taps', value: 5, text: '5 purr-fect taps in one throw' }, params: { tapWindow: 2, tapSave: 0.64 },
    },
    {
      id: 'rainbow', name: 'Rainbow', img: 'rainbow', rarity: 'legend', color: '#ff9fd0',
      power: 'Spectrum', desc: 'Leaves rainbows on every skip and scores double — but its sweet spot is tiny.',
      unlock: { type: 'skips', value: 14, text: 'Skip 14 times in one throw' }, params: { sigma: 4.2, ptsMul: 2 },
    },
    {
      id: 'moon', name: 'Moonbeam', img: 'moon', rarity: 'legend', color: '#3d4f9e',
      power: 'Twilight', desc: 'Turns the lake to dusk and slows time around it — dreamy hops and easy taps.',
      unlock: { type: 'totalSkips', value: 600, text: 'Skip 600 times in total' }, params: { grav: 0.82, timeScale: 0.72, tapWindow: 1.6 }, night: true,
    },
    {
      id: 'angel', name: 'Angel Wing', img: 'angel', rarity: 'legend', color: '#ffd6ec',
      power: 'Featherwing', desc: 'The legendary stone. A generous sweet spot, almost no drag, and it glides between skips.',
      unlock: { type: 'skips', value: 16, text: 'Skip 16 times in one throw' }, params: { lossMul: 0.56, sigma: 8.5, grav: 0.86 },
    },
  ];
  const RARITY = {
    common: { label: 'Common', color: '#8a9a7b' },
    rare: { label: 'Rare', color: '#4f93c9' },
    epic: { label: 'Epic', color: '#9a6bd6' },
    legend: { label: 'Legendary', color: '#e3a12f' },
  };
  root.ROCKS = ROCKS;
  root.RARITY = RARITY;
  root.rockById = (id) => ROCKS.find((r) => r.id === id) || ROCKS[0];
})(typeof window !== 'undefined' ? window : globalThis);
