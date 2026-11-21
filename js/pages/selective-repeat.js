(function () {
  'use strict';
  var MODE = 'sr';            // 'gbn' or 'sr'
  var TOTAL = 15, W = 4, RW = MODE === 'gbn' ? 1 : W;
  var TRAVEL = 20, TIMEOUT = 70, RATE = 10, SPEEDS = [0.25, 0.5, 1, 2, 4];

  var ids = ['sender-slots', 'receiver-slots', 'sender-frame', 'receiver-frame', 'channel', 'event-log',
    'ro-base', 'ro-next', 'ro-rcv', 'ro-timer', 'ro-speed',
    'b-send', 'b-pause', 'b-resume', 'b-faster', 'b-slower', 'b-step', 'b-kill', 'b-reset'];
  var e = {};
  for (var k = 0; k < ids.length; k++) {
    e[ids[k]] = document.getElementById(ids[k]);
    if (!e[ids[k]]) { return; }
  }

  var s, slotsS = [], slotsR = [], renderedT = -1, last = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function buildSlots(box, arr) {
    box.textContent = '';
    arr.length = 0;
    for (var i = 0; i < TOTAL; i++) {
      var d = document.createElement('span');
      d.className = 'slot';
      d.textContent = i;
      box.appendChild(d);
      arr.push(d);
    }
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
    f.el.style.left = ((f.seq + 0.5) / TOTAL * 100) + '%';
    f.el.style.top = ((f.kind === 'data' ? p : 1 - p) * 100) + '%';
  }

  function selectFlight(f) {
    if (f.dead) { return; }
    if (s.selected === f) {
      f.el.classList.remove('selected');
      f.el.setAttribute('aria-pressed', 'false');
      s.selected = null;
    } else {
      if (s.selected) {
        s.selected.el.classList.remove('selected');
        s.selected.el.setAttribute('aria-pressed', 'false');
      }
      s.selected = f;
      f.el.classList.add('selected');
      f.el.setAttribute('aria-pressed', 'true');
    }
    render();
  }

  function launch(kind, seq, retx) {
    var f = { kind: kind, seq: seq, start: s.t, dead: false };
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pkt ' + kind + (retx ? ' retx' : '');
    b.textContent = seq;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', 'Select ' + (kind === 'data' ? 'packet ' : 'ACK ') + seq);
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
    log('You destroyed ' + (f.kind === 'data' ? 'packet ' : 'ACK ') + f.seq + ' in transit. It will never arrive.', 'bad');
    render();
  }

  function sendData(seq, retx) {
    s.sentAt[seq] = s.t;
    if (retx) { s.retx[seq] = true; }
    launch('data', seq, retx);
    log((retx ? 'Sender: retransmitting packet ' : 'Sender: sent packet ') + seq + '.', retx ? 'retx' : 'send');
  }

  function sendNextPacket() {
    if (s.done || s.next >= TOTAL || s.next >= s.base + W) { return false; }
    var q = s.next++;
    sendData(q, false);
    if (MODE === 'gbn' && q === s.base) { s.timerStart = s.t; }
    return true;
  }

  function sendAck(n) { launch('ack', n, false); }

  function deliverInOrder() {
    while (s.got[s.rcv]) {
      log('Receiver: delivered packet ' + s.rcv + ' to the application.', 'ok');
      s.rcv++;
    }
  }

  function onData(f) {
    var q = f.seq;
    if (MODE === 'gbn') {
      if (q === s.rcv) {
        s.got[q] = true;
        s.rcv++;
        log('Receiver: packet ' + q + ' arrived in order and was delivered. Expecting ' + s.rcv + ' next. ACK ' + q + ' sent.', 'ok');
        sendAck(q);
      } else if (s.rcv > 0) {
        log('Receiver: packet ' + q + ' is out of order (expected ' + s.rcv + '). Discarded. Re-sending ACK ' + (s.rcv - 1) + '.', 'bad');
        sendAck(s.rcv - 1);
      } else {
        log('Receiver: packet ' + q + ' is out of order (expected 0). Discarded. Nothing to acknowledge yet.', 'bad');
      }
      return;
    }
    if (q < s.rcv) {
      log('Receiver: packet ' + q + ' is a duplicate of one already delivered. ACK ' + q + ' sent again.', 'info');
      sendAck(q);
    } else if (q < s.rcv + RW) {
      if (s.got[q]) {
        log('Receiver: duplicate of buffered packet ' + q + '. ACK ' + q + ' sent again.', 'info');
      } else {
        s.got[q] = true;
        log('Receiver: packet ' + q + (q === s.rcv ? ' arrived in order.' : ' arrived out of order and is buffered.') + ' ACK ' + q + ' sent.', q === s.rcv ? 'ok' : 'buf');
      }
      sendAck(q);
      deliverInOrder();
    } else {
      log('Receiver: packet ' + q + ' is outside the receive window and is ignored.', 'bad');
    }
  }

  function onAck(f) {
    var a = f.seq, oldBase = s.base;
    if (MODE === 'gbn') {
      if (a >= s.base) {
        for (var j = s.base; j <= a; j++) { s.acked[j] = true; }
        while (s.acked[s.base]) { s.base++; }
        s.timerStart = s.t;
        log('Sender: cumulative ACK ' + a + ' received. Window slides: base ' + oldBase + ' to ' + s.base + '.', 'ok');
      } else {
        log('Sender: ACK ' + a + ' is old or duplicate. Ignored.', 'info');
      }
      return;
    }
    if (s.acked[a]) {
      log('Sender: duplicate ACK ' + a + '. Ignored.', 'info');
      return;
    }
    s.acked[a] = true;
    while (s.acked[s.base]) { s.base++; }
    log('Sender: ACK ' + a + ' received' + (s.base !== oldBase ? '. Window slides: base ' + oldBase + ' to ' + s.base + '.' : '. base stays at ' + s.base + ' (packet ' + s.base + ' still unacknowledged).'), s.base !== oldBase ? 'ok' : 'info');
  }

  function checkTimeouts() {
    var q;
    if (MODE === 'gbn') {
      if (s.base < s.next && s.t - s.timerStart >= TIMEOUT) {
        log('Timeout! No new ACK for packet ' + s.base + '. Go back and resend packets ' + s.base + ' to ' + (s.next - 1) + '.', 'bad');
        for (q = s.base; q < s.next; q++) { sendData(q, true); }
        s.timerStart = s.t;
      }
      return;
    }
    for (q = s.base; q < s.next; q++) {
      if (!s.acked[q] && s.t - s.sentAt[q] >= TIMEOUT) {
        log('Timeout for packet ' + q + '. Only this packet is resent.', 'bad');
        sendData(q, true);
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
      if (f.kind === 'data') { onData(f); } else { onAck(f); }
    });
    checkTimeouts();
    if (s.base >= TOTAL && !s.done) {
      s.done = true;
      s.running = false;
      log('All ' + TOTAL + ' packets delivered and acknowledged. Press Reset to run again.', 'ok');
    }
  }

  function timerText() {
    var left = null, q;
    if (MODE === 'gbn') {
      if (s.base < s.next) { left = TIMEOUT - (s.t - s.timerStart); }
    } else {
      for (q = s.base; q < s.next; q++) {
        if (!s.acked[q]) {
          var l = TIMEOUT - (s.t - s.sentAt[q]);
          if (left === null || l < left) { left = l; }
        }
      }
    }
    return left === null ? 'idle' : (Math.max(0, left) / RATE).toFixed(1) + 's';
  }

  function render() {
    var i, c;
    for (i = 0; i < TOTAL; i++) {
      if (s.acked[i]) { c = 'acked'; }
      else if (i < s.next) { c = s.retx[i] ? 'retx' : 'sent'; }
      else if (i < s.base + W) { c = 'ready'; }
      else { c = 'idle'; }
      slotsS[i].className = 'slot ' + c;
      if (i < s.rcv) { c = 'acked'; }
      else if (s.got[i]) { c = 'buffer'; }
      else if (i < s.rcv + RW) { c = 'ready'; }
      else { c = 'idle'; }
      slotsR[i].className = 'slot ' + c;
    }
    var sf = e['sender-frame'], rf = e['receiver-frame'];
    sf.style.left = (s.base / TOTAL * 100) + '%';
    sf.style.width = (Math.min(W, TOTAL - s.base) / TOTAL * 100) + '%';
    rf.style.left = (s.rcv / TOTAL * 100) + '%';
    rf.style.width = (Math.min(RW, TOTAL - s.rcv) / TOTAL * 100) + '%';
    e['ro-base'].textContent = s.base;
    e['ro-next'].textContent = s.next;
    e['ro-rcv'].textContent = s.rcv;
    e['ro-timer'].textContent = timerText();
    e['ro-speed'].textContent = s.sp + 'x';
    var si = SPEEDS.indexOf(s.sp);
    var canSend = !s.done && s.next < TOTAL && s.next < s.base + W && (!s.started || s.running);
    e['b-send'].disabled = !canSend;
    e['b-pause'].disabled = !s.running || s.done;
    e['b-resume'].disabled = s.running || !s.started || s.done;
    e['b-faster'].disabled = si >= SPEEDS.length - 1;
    e['b-slower'].disabled = si <= 0;
    e['b-step'].disabled = s.done || !s.started;
    e['b-kill'].disabled = !s.selected || s.selected.dead;
    renderedT = s.t;
  }

  function reset() {
    var sp = s ? s.sp : 1;
    s = { t: 0, tf: 0, running: false, started: false, sp: sp, base: 0, next: 0, timerStart: 0,
      sentAt: [], acked: [], retx: [], got: [], rcv: 0, flights: [], selected: null, ev: 0, done: false };
    e.channel.textContent = '';
    e['event-log'].textContent = '';
    log('Ready. Press Send once to send 1 packet (up to ' + W + ' in the window).', 'info');
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
    if (renderedT !== s.t) { render(); }
    window.requestAnimationFrame(frame);
  }

  function setSpeed(d) {
    var i = clamp(SPEEDS.indexOf(s.sp) + d, 0, SPEEDS.length - 1);
    s.sp = SPEEDS[i];
    render();
  }

  e['b-send'].addEventListener('click', function () {
    if (s.done || s.next >= TOTAL || s.next >= s.base + W) { return; }
    s.started = true;
    s.running = true;
    sendNextPacket();
    render();
  });
  e['b-pause'].addEventListener('click', function () { s.running = false; log('Paused.', 'info'); render(); });
  e['b-resume'].addEventListener('click', function () { s.running = true; log('Resumed.', 'info'); render(); });
  e['b-faster'].addEventListener('click', function () { setSpeed(1); });
  e['b-slower'].addEventListener('click', function () { setSpeed(-1); });
  e['b-step'].addEventListener('click', function () {
    if (!s.started || s.done) { return; }
    s.running = false; s.tf = s.t;
    var ev0 = s.ev, n = 0;
    while (s.ev === ev0 && n < 300 && !s.done) { tick(); n++; }
    s.tf = s.t;
    render();
  });
  e['b-kill'].addEventListener('click', function () {
    if (s.selected) { kill(s.selected); }
  });
  e['b-reset'].addEventListener('click', reset);

  buildSlots(e['sender-slots'], slotsS);
  buildSlots(e['receiver-slots'], slotsR);
  reset();
  window.requestAnimationFrame(frame);
}());