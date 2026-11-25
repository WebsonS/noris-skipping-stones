/* Live 1v1 friend match: create/join a room by code or invite link, ready up, 5 throws each with the Pebble,
 * live view of the friend's lake, leaving mid-match = loss, rematch. Nothing is saved: a reload is always a fresh start.
 * shortcut: uses the free public PeerJS broker and has no reconnect after a drop; run your own PeerServer + add rejoin if needed. */
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const N = 5, PRE = 'nori-skip-', TURN = 20;
  let peer = null, conn = null, guest = false, stream = null;
  // Relay (TURN) so phones on mobile data / different networks can still connect; PeerJS's built-in free relay is dead.
  // These are public by necessity (every browser needs them). If someone burns the quota, rotate the credential in Metered.
  const RELAY = { username: '822a4566ca21a350e0724293', credential: 'F0/v6+1zL9qch+q+' };
  const OPTS = { config: { iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=tcp'], ...RELAY },
  ] } };
  let phase = 'off'; // off | wait | lobby | count | play | done
  let me = {}, them = {}, deadline = 0, lastSeen = 0, lastPing = 0;

  const G = () => root.Game;
  const say = (t) => { $('vsMsg').textContent = t; };
  const send = (m) => { if (conn && conn.open) conn.send(m); };
  const num = (v, max) => Math.min(max, Math.max(0, Math.floor(+v) || 0));
  const clean = (s) => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12) || 'Friend';
  const makeCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random() * 31 | 0]).join('');
  const camTag = (t) => { $('vsCamTag').textContent = t; $('vsCamTag').hidden = !t; };

  /** Which parts of the room card show in each phase. */
  function show(p) {
    $('vsSetup').hidden = p !== 'off';
    $('vsRoom').hidden = p !== 'wait';
    $('vsActions').hidden = !(p === 'lobby' || p === 'done');
    $('btnVsClose').textContent = p === 'off' ? 'Close' : 'Leave room';
  }
  function reset() {
    if (peer) peer.destroy();
    peer = conn = null; phase = 'off';
    $('vsChip').hidden = true; $('vsCamBox').hidden = true; $('vsCam').srcObject = null;
    $('vsCamBox').classList.remove('big');
    $('vsTitle').textContent = 'Play a friend';
    show('off');
  }
  function open(code) {
    if (phase !== 'off') return UI.show('versus');
    reset();
    $('vsName').value = Save.data.name || '';
    if (code) $('vsCode').value = code;
    say(!root.Peer ? 'Multiplayer needs an internet connection.'
      : code ? `You're invited to room ${code}!\nType your name and press Join.`
      : `Same stone for both. Best total over ${N} throws wins.`);
    UI.show('versus');
  }
  function onError(e) {
    if (phase === 'play' || phase === 'done') return;
    reset();
    say(e.type === 'peer-unavailable' ? 'No room with that code.' : e.type === 'unavailable-id' ? 'Code clash, press Create again.' : 'Connection problem: ' + e.type);
  }
  function prep() { // a click: safe to start audio; remember the name for next time
    root.Sound.init();
    const n = clean($('vsName').value);
    Save.set('name', n === 'Friend' ? '' : n);
    reset();
    me = { name: Save.data.name || 'You', score: 0, n: 0, ready: false };
    them = { name: 'Friend', score: 0, n: 0, ready: false };
  }
  function create() {
    if (!root.Peer) return;
    prep();
    guest = false; phase = 'wait';
    const code = makeCode();
    $('vsCodeBig').textContent = '····';
    show('wait');
    say('Opening the room…');
    peer = new root.Peer(PRE + code, OPTS);
    peer.on('open', () => { $('vsCodeBig').textContent = code; say('Send the code or link to your friend.\nWaiting for them to join…'); });
    peer.on('connection', link);
    peer.on('call', (c) => { c.answer(myStream()); c.on('stream', showFriend); });
    peer.on('error', onError);
  }
  function join() {
    const code = $('vsCode').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) return say('Enter the 4-letter room code.');
    if (!root.Peer) return;
    prep();
    guest = true; phase = 'wait';
    show('join');
    say('Joining…');
    peer = new root.Peer(OPTS);
    peer.on('open', () => link(peer.connect(PRE + code, { reliable: true })));
    const p = peer; // a full room or blocked network never answers: don't leave them on "Joining…" forever
    setTimeout(() => { if (peer === p && phase === 'wait') { reset(); say("Couldn't join. The room may be full, closed, or blocked by this network."); } }, 15000);
    peer.on('error', onError);
  }
  function link(c) {
    if (conn) return c.close(); // room is full: two players only
    conn = c;
    c.on('open', () => {
      lastSeen = Date.now();
      send({ t: 'hi', name: Save.data.name }); // blank name shows as 'Friend' on their side, not a second 'You'
      lobby();
      if (guest) peer.call(conn.peer, myStream()).on('stream', showFriend);
      setTimeout(() => { if (conn && !$('vsCam').srcObject) camTag("Live view can't connect on this network"); }, 12000);
    });
    c.on('data', onData);
    c.on('close', friendGone);
  }

  // ---------- lobby, ready, countdown ----------
  function lobby() {
    phase = 'lobby';
    $('vsTitle').textContent = `${me.name} vs ${them.name}`;
    say(them.ready ? `${them.name} is ready!` : 'Both press Ready to start.');
    $('btnVsGo').hidden = false; $('btnVsGo').firstChild.textContent = 'Ready!';
    show('lobby');
    UI.show('versus');
    $('vsCamBox').hidden = false;
    if (!$('vsCam').srcObject) camTag('Connecting live view…');
  }
  function ready() {
    if (phase === 'done') lobby();
    if (phase !== 'lobby' || me.ready) return;
    me.ready = true;
    send({ t: 'ready' });
    $('btnVsGo').hidden = true;
    say(`Waiting for ${them.name}…`);
    maybeCount();
  }
  function maybeCount() {
    if (phase !== 'lobby' || !me.ready || !them.ready) return;
    phase = 'count';
    me.score = me.n = them.score = them.n = 0;
    UI.hide('versus');
    toLake();
    update();
    $('vsChip').hidden = false;
    let k = 3;
    const step = () => {
      if (phase !== 'count') return;
      if (k > 0) { UI.banner(String(k), 'warm'); root.Sound.sfx.click(); k--; setTimeout(step, 1000); return; }
      UI.banner('GO!', 'rainbow'); root.Sound.sfx.pop();
      phase = 'play'; deadline = Date.now() + TURN * 1000;
    };
    step();
  }
  function toLake() { // get onto the dock and ready to aim, skipping the first-time tutorial pop-up
    const g = G();
    if (g.tut.active) root.Tutorial.end(false);
    UI.hide('choice');
    if (g.state === 'title') {
      const done = Save.data.tutorialDone;
      Save.data.tutorialDone = true; $('btnPlay').click(); Save.data.tutorialDone = done; // skip without marking it done
    } else if (g.state === 'result' || g.state === 'choice') { UI.hideResult(); g.enterAim(); }
  }

  // ---------- the match ----------
  function record(total) {
    me.n++; me.score += total;
    deadline = Date.now() + TURN * 1000;
    send({ t: 'score', score: me.score, n: me.n });
    if (me.n === N && them.n < N) UI.toast(`All throws done! Waiting for ${them.name}…`, 2600);
    update();
    check();
  }
  function onResult(r) {
    if (phase !== 'play') return;
    send({ t: 'fly', on: 0 });
    if (me.n < N) record(r.total);
  }
  function tick() {
    // heartbeat: the library's 'close' event is unreliable, so 10 s of silence from the friend = they left
    if (conn && phase !== 'off' && phase !== 'wait') {
      if (Date.now() - lastPing > 2000) { lastPing = Date.now(); send({ t: 'ping' }); }
      if (Date.now() - lastSeen > 10000) return friendGone();
    }
    // per-throw clock: running out of time costs that throw
    if (phase !== 'play') return;
    const g = G();
    if (me.n < N && Date.now() > deadline && !g.charging && !['throw', 'flight', 'return'].includes(g.state)) {
      UI.toast('Too slow! That throw counts as 0.', 2200);
      record(0);
    }
    update();
  }
  function update() {
    if (phase === 'off' || phase === 'wait') return;
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const clock = phase === 'play' && me.n < N ? `  ·  ⏱ ${left}s` : '';
    $('vsChip').textContent = `${me.name} ${me.score} (${me.n}/${N})  ·  ${them.name} ${them.score} (${them.n}/${N})${clock}`;
    $('vsChip').classList.toggle('hurry', !!clock && left <= 5);
  }
  function check() {
    if (phase === 'play' && me.n >= N && them.n >= N) setTimeout(() => finish(''), 1800);
  }
  function finish(why) {
    if (phase !== 'play' && phase !== 'count') return;
    phase = 'done';
    me.ready = them.ready = false;
    const left = why === 'left';
    if (left) { conn = null; $('vsCamBox').hidden = true; } // they're gone: no rematch, no second notice
    const win = left || me.score > them.score, tie = !left && me.score === them.score;
    $('vsTitle').textContent = win ? 'You win! 🏆' : tie ? "It's a tie!" : `${them.name} wins!`;
    say(left ? `${them.name} left the match, so you win.` : `${me.name} ${me.score}  –  ${them.score} ${them.name}`);
    $('btnVsGo').hidden = left; $('btnVsGo').firstChild.textContent = 'Rematch';
    show('done');
    UI.show('versus');
    $('vsChip').hidden = true;
    if (win) root.Sound.sfx.meow('happy'); else if (!tie) root.Sound.sfx.meow('sad');
  }
  function friendGone() {
    if (phase === 'play' || phase === 'count') return finish('left');
    if (phase === 'done') { if (!conn) return; conn = null; $('btnVsGo').hidden = true; $('vsCamBox').hidden = true; say($('vsMsg').textContent + `\n${them.name} has left the room.`); return; }
    if (phase !== 'off') { UI.toast(`${them.name} left the room.`); reset(); UI.hide('versus'); G().goTitle(); }
  }
  function leave() {
    if (phase === 'off') return UI.hide('versus');
    const forfeit = phase === 'play' || phase === 'count';
    send({ t: 'quit' });
    const p = peer; peer = conn = null;
    setTimeout(() => { if (p) p.destroy(); }, 300); // let the quit message go out first
    reset();
    UI.hide('versus');
    G().goTitle();
    if (forfeit) UI.toast('You left the match, so it counts as a loss.', 2600);
  }
  function onData(d) { // the friend's messages are untrusted: only known types, clamped numbers, cleaned names
    if (!d || typeof d !== 'object') return;
    lastSeen = Date.now();
    if (d.t === 'hi') { them.name = clean(d.name); if (phase === 'lobby') $('vsTitle').textContent = `${me.name} vs ${them.name}`; update(); }
    else if (d.t === 'ready') { them.ready = true; if (phase === 'lobby' && !me.ready) say(`${them.name} is ready!`); maybeCount(); }
    else if (d.t === 'score' && (phase === 'play' || phase === 'count')) { them.score = num(d.score, 1e6); them.n = num(d.n, N); update(); check(); }
    else if (d.t === 'quit') friendGone();
    else if (d.t === 'vis') camTag(d.hidden ? `${them.name}'s game is in the background` : '');
    else if (d.t === 'fly') {
      $('vsCamBox').classList.toggle('big', !!d.on);
      camTag(d.on ? `${them.name}: ${num(d.skips, 99)} skips` : '');
    }
  }

  // ---------- live view: stream our game canvas, show theirs in a corner window ----------
  const myStream = () => stream || (stream = $('scene').captureStream(24));
  function showFriend(s) { const v = $('vsCam'); v.srcObject = s; camTag(''); v.play().catch(() => {}); }

  root.Versus = {
    inMatch: () => phase !== 'off',
    leave: () => { if (phase !== 'off') leave(); },
    blocked: () => phase !== 'off' && (phase !== 'play' || me.n >= N),
  };
  let inited = false;
  function init() {
    if (inited) return; inited = true;
    $('btnVersus').addEventListener('click', () => { root.Sound.init(); open(); });
    $('btnVsCreate').addEventListener('click', create);
    $('btnVsJoin').addEventListener('click', join);
    $('btnVsGo').addEventListener('click', ready);
    $('btnVsClose').addEventListener('click', leave);
    $('vsCamBox').addEventListener('pointerdown', (e) => { e.stopPropagation(); $('vsCamBox').classList.toggle('big'); });
    const copy = (text, msg) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => UI.toast(msg), () => UI.toast(text, 4000));
    $('vsCodeBig').addEventListener('click', () => copy($('vsCodeBig').textContent, 'Code copied!'));
    $('btnVsLink').addEventListener('click', () => copy(location.href.split(/[?#]/)[0] + '?room=' + $('vsCodeBig').textContent, 'Invite link copied!'));
    for (const id of ['vsCode', 'vsName']) $(id).addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && id === 'vsCode') join(); });
    const g = G();
    g.on('result', onResult);
    g.on('flight', () => { if (phase === 'play') send({ t: 'fly', on: 1, skips: 0 }); });
    g.on('skip', (b) => { if (phase === 'play') send({ t: 'fly', on: 1, skips: b.n }); });
    document.addEventListener('visibilitychange', () => send({ t: 'vis', hidden: document.hidden }));
    root.addEventListener('pagehide', () => send({ t: 'quit' })); // closing the tab mid-match = forfeit
    setInterval(tick, 250);
    // Invite link: open the join card once, then strip ?room so a reload is a fresh start.
    const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    if (location.search) history.replaceState(null, '', location.pathname);
    if (/^[A-Z0-9]{4}$/.test(code)) setTimeout(() => open(code), 1200);
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})(window);
