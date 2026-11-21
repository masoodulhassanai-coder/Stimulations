(function () {
  'use strict';
  var TRAVEL = 22, TIMEOUT = 65, RATE = 10, SPEEDS = [0.25, 0.5, 1, 2, 4];

  var ids = ['channel', 'event-log', 'stage-bar',
    'ro-cstate', 'ro-sstate', 'ro-cisn', 'ro-sisn', 'ro-timer', 'ro-speed',
    'badge-client', 'badge-server',
    'b-send', 'b-pause', 'b-resume', 'b-faster', 'b-slower', 'b-step', 'b-kill', 'b-reset'];
  var e = {};
  for (var k = 0; k < ids.length; k++) {
    e[ids[k]] = document.getElementById(ids[k]);
    if (!e[ids[k]]) { return; }
  }

  var s, renderedT = -1, renderedTimer = '', last = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function randIsn(min, max) {
    return (Math.floor(Math.random() * ((max - min) / 50)) * 50) + min;
  }

  function log(msg, cls) {
    var li = document.createElement('li');
    li.className = cls || '';
    var b = document.createElement('b');
    b.textContent = 't=' + s.t + ' ';
    li.appendChild(b);
    li.appendChild(document.createTextNode(msg));
    var box = e['event-log'];
    box.appendChild(li);
    while (box.children.length > 150) { box.removeChild(box.firstChild); }
    box.scrollTop = box.scrollHeight;
    s.ev++;
  }

  function place(f) {
    var p = clamp((s.tf - f.start) / TRAVEL, 0, 1);
    var pos = f.dir === 'c2s' ? p : 1 - p;
    f.el.style.left = (14 + pos * 72) + '%';
  }

  function selectFlight(f) {
    if (!f || f.dead) { return; }
    if (s.selected === f) {
      f.el.classList.remove('selected');
      f.el.setAttribute('aria-pressed', 'false');
      s.selected = null;
    } else {
      if (s.selected && s.selected.el) {
        s.selected.el.classList.remove('selected');
        s.selected.el.setAttribute('aria-pressed', 'false');
      }
      s.selected = f;
      f.el.classList.add('selected');
      f.el.setAttribute('aria-pressed', 'true');
    }
    render();
  }

  function launch(kind, dir, seq, ack, retx) {
    var f = { kind: kind, dir: dir, seq: seq, ack: ack, start: s.t, dead: false };
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pkt ' + kind + (retx ? ' retx' : '');
    var label = kind === 'syn' ? 'SYN' : (kind === 'synack' ? 'SYN-ACK' : 'ACK');
    var detail = kind === 'syn' ? 'seq=' + seq : 'seq=' + seq + ', ack=' + ack;
    b.innerHTML = label + '<span>' + detail + '</span>';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', 'Select ' + label + ' (' + detail + ')');
    b.addEventListener('click', function () { selectFlight(f); });
    f.el = b;
    e.channel.appendChild(b);
    s.flights.push(f);
    place(f);
  }

  function kill(f) {
    if (!f || f.dead) { return; }
    f.dead = true;
    f.el.classList.remove('selected');
    f.el.classList.add('lost');
    f.el.disabled = true;
    if (s.selected === f) { s.selected = null; }
    var name = f.kind === 'syn' ? 'SYN' : (f.kind === 'synack' ? 'SYN-ACK' : 'ACK');
    log('You destroyed ' + name + ' (seq=' + f.seq + (f.ack !== null ? ', ack=' + f.ack : '') + ') in transit.', 'bad');
    render();
  }

  function sendSyn(retx) {
    s.cState = 'SYN-SENT';
    s.timerOwner = 'client';
    s.timerStart = s.t;
    launch('syn', 'c2s', s.cisn, null, retx);
    log((retx ? 'Client: retransmitting SYN ' : 'Client: sent SYN ') + '(seq=' + s.cisn + '). State -> SYN-SENT.', retx ? 'retx' : 'send');
  }

  function sendSynAck(retx) {
    s.synAckSent = true;
    s.timerOwner = 'server';
    s.timerStart = s.t;
    launch('synack', 's2c', s.sisn, s.cisn + 1, retx);
    log((retx ? 'Server: retransmitting SYN-ACK ' : 'Server: sent SYN-ACK ') + '(seq=' + s.sisn + ', ack=' + (s.cisn + 1) + '). State: ' + s.sState + '.', retx ? 'retx' : 'buf');
  }

  function sendAck(retx) {
    s.cState = 'ESTABLISHED';
    s.needAck = false;
    launch('ack', 'c2s', s.cisn + 1, s.sisn + 1, retx);
    log((retx ? 'Client: re-sending ACK ' : 'Client: sent final ACK ') + '(seq=' + (s.cisn + 1) + ', ack=' + (s.sisn + 1) + '). Client state -> ESTABLISHED.', retx ? 'retx' : 'ok');
  }

  function hasLive(kind) {
    return s.flights.some(function (f) { return f.kind === kind && !f.dead; });
  }

  function canManualSend() {
    if (s.done || (s.started && !s.running)) { return false; }
    if (s.cState === 'CLOSED' && !hasLive('syn')) { return true; }
    if (s.sState === 'SYN-RCVD' && !s.synAckSent && !hasLive('synack')) { return true; }
    if (s.needAck && !hasLive('ack')) { return true; }
    return false;
  }

  function triggerManualSend() {
    if (!canManualSend()) { return false; }
    s.started = true;
    s.running = true;
    if (s.cState === 'CLOSED') {
      sendSyn(false);
      return true;
    }
    if (s.sState === 'SYN-RCVD' && !s.synAckSent) {
      sendSynAck(false);
      return true;
    }
    if (s.needAck) {
      sendAck(s.cState === 'ESTABLISHED');
      return true;
    }
    return false;
  }

  function onArrive(f) {
    if (f.kind === 'syn') {
      if (s.sState === 'LISTEN') {
        s.sState = 'SYN-RCVD';
        log('Server: received SYN (seq=' + f.seq + '). State -> SYN-RCVD. Press Send to transmit SYN-ACK.', 'send');
      } else if (s.sState === 'SYN-RCVD') {
        log('Server: received duplicate SYN (seq=' + f.seq + ') while in SYN-RCVD.', 'info');
      }
    } else if (f.kind === 'synack') {
      if (f.ack === s.cisn + 1) {
        if (s.cState === 'SYN-SENT') {
          s.gotSynAck = true;
          s.needAck = true;
          log('Client: received SYN-ACK (seq=' + f.seq + ', ack=' + f.ack + '). Press Send to transmit final ACK.', 'buf');
        } else if (s.cState === 'ESTABLISHED') {
          // Real-world TCP: Client already ESTABLISHED receives retransmitted SYN-ACK (because previous ACK was lost)
          // and immediately re-sends ACK so Server can complete the handshake.
          log('Client: received retransmitted SYN-ACK while ESTABLISHED (previous ACK was lost). Re-sending ACK.', 'retx');
          sendAck(true);
        }
      }
    } else if (f.kind === 'ack') {
      if (s.sState === 'SYN-RCVD' && f.ack === s.sisn + 1) {
        s.sState = 'ESTABLISHED';
        s.timerOwner = null;
        s.done = true;
        s.running = false;
        log('Server: received ACK (seq=' + f.seq + ', ack=' + f.ack + '). Server state -> ESTABLISHED. Connection complete!', 'ok');
      }
    }
  }

  function checkTimeouts() {
    if (!s.timerOwner || s.done) { return; }
    if (s.t - s.timerStart >= TIMEOUT) {
      if (s.timerOwner === 'client' && s.cState === 'SYN-SENT' && !s.gotSynAck) {
        log('Timeout! Client did not receive SYN-ACK. Resending SYN.', 'bad');
        sendSyn(true);
      } else if (s.timerOwner === 'server' && s.sState === 'SYN-RCVD') {
        log('Timeout! Server did not receive final ACK (still in SYN-RCVD). Resending SYN-ACK.', 'bad');
        sendSynAck(true);
      }
    }
  }

  function tick() {
    s.t++;
    var arrived = s.flights.filter(function (f) { return s.t - f.start >= TRAVEL; });
    arrived.forEach(function (f) {
      s.flights.splice(s.flights.indexOf(f), 1);
      if (s.selected === f) { s.selected = null; }
      if (f.el.parentNode) { f.el.parentNode.removeChild(f.el); }
      if (f.dead) { return; }
      onArrive(f);
    });
    checkTimeouts();
  }

  function timerText() {
    if (!s.timerOwner || s.done) { return 'idle'; }
    // Client stops its SYN timer once SYN-ACK arrives; Server timer keeps running until final ACK arrives
    if (s.timerOwner === 'client' && s.gotSynAck) { return 'idle'; }
    var left = TIMEOUT - (s.t - s.timerStart);
    return (Math.max(0, left) / RATE).toFixed(1) + 's';
  }

  function stageText() {
    if (s.done) { return 'Step 3 of 3: Connection ESTABLISHED on both Client and Server'; }
    if (s.cState === 'CLOSED') { return 'Step 0 of 3: Press Send to transmit SYN (seq=' + s.cisn + ')'; }
    if (s.sState === 'LISTEN') { return 'Step 1 of 3: SYN in flight to Server'; }
    if (s.sState === 'SYN-RCVD' && !s.synAckSent) { return 'Step 1 of 3: Server in SYN-RCVD — press Send to send SYN-ACK'; }
    if (s.cState === 'SYN-SENT' && !s.gotSynAck) { return 'Step 2 of 3: SYN-ACK in flight to Client'; }
    if (s.needAck) { return 'Step 2 of 3: Client received SYN-ACK — press Send to send final ACK'; }
    if (hasLive('ack')) { return 'Step 3 of 3: Final ACK in flight to Server'; }
    return 'Step 3 of 3: Final ACK lost! Waiting for Server SYN-ACK timeout to recover...';
  }

  function setBadge(el, state) {
    el.textContent = state;
    el.className = 'ep-state ' + state.toLowerCase();
  }

  function render() {
    var tStr = timerText();
    e['ro-cstate'].textContent = s.cState;
    e['ro-sstate'].textContent = s.sState;
    e['ro-cisn'].textContent = s.cisn;
    e['ro-sisn'].textContent = s.sisn;
    e['ro-timer'].textContent = tStr;
    e['ro-speed'].textContent = s.sp + 'x';
    e['stage-bar'].textContent = stageText();
    setBadge(e['badge-client'], s.cState);
    setBadge(e['badge-server'], s.sState);

    var si = SPEEDS.indexOf(s.sp);
    e['b-send'].disabled = !canManualSend();
    e['b-pause'].disabled = !s.running || s.done;
    e['b-resume'].disabled = s.running || !s.started || s.done;
    e['b-faster'].disabled = si >= SPEEDS.length - 1;
    e['b-slower'].disabled = si <= 0;
    e['b-step'].disabled = s.done || (!s.started && s.flights.length === 0);
    e['b-kill'].disabled = !s.selected || s.selected.dead;
    renderedT = s.t;
    renderedTimer = tStr;
  }

  function reset() {
    var sp = s ? s.sp : 1;
    last = 0;
    s = {
      t: 0, tf: 0, running: false, started: false, sp: sp,
      cState: 'CLOSED', sState: 'LISTEN',
      cisn: randIsn(100, 450), sisn: randIsn(500, 900),
      synAckSent: false, gotSynAck: false, needAck: false,
      timerOwner: null, timerStart: 0,
      flights: [], selected: null, ev: 0, done: false
    };
    e.channel.textContent = '';
    e['event-log'].textContent = '';
    log('Ready (Client ISN=' + s.cisn + ', Server ISN=' + s.sisn + '). Press Send to start the handshake.', 'info');
    render();
  }

  function frame(ts) {
    if (last && s.running) {
      s.tf += Math.min(ts - last, 100) / 1000 * RATE * s.sp;
      while (s.running && s.t + 1 <= s.tf) { tick(); }
      if (!s.running) { render(); }
    }
    last = ts;
    for (var i = 0; i < s.flights.length; i++) { place(s.flights[i]); }
    if (renderedT !== s.t || renderedTimer !== timerText()) { render(); }
    window.requestAnimationFrame(frame);
  }

  function setSpeed(d) {
    var i = clamp(SPEEDS.indexOf(s.sp) + d, 0, SPEEDS.length - 1);
    s.sp = SPEEDS[i];
    render();
  }

  e['b-send'].addEventListener('click', function () {
    triggerManualSend();
    render();
  });
  e['b-pause'].addEventListener('click', function () { s.running = false; log('Paused.', 'info'); render(); });
  e['b-resume'].addEventListener('click', function () { s.running = true; log('Resumed.', 'info'); render(); });
  e['b-faster'].addEventListener('click', function () { setSpeed(1); });
  e['b-slower'].addEventListener('click', function () { setSpeed(-1); });
  e['b-step'].addEventListener('click', function () {
    if (s.done) { return; }
    if (!s.started && s.flights.length === 0) { return; }
    s.running = false;
    s.tf = s.t;
    var ev0 = s.ev, n = 0;
    while (s.ev === ev0 && n < 300 && !s.done) { tick(); n++; }
    s.tf = s.t;
    render();
  });
  e['b-kill'].addEventListener('click', function () {
    if (s.selected) { kill(s.selected); }
  });
  e['b-reset'].addEventListener('click', reset);

  reset();
  window.requestAnimationFrame(frame);
}());