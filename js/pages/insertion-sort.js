(function () {
  'use strict';
  var RATE = 4, SPEEDS = [0.25, 0.5, 1, 2, 4], N = 10;

  var ids = ['bars-stage', 'status-line', 'event-log',
    'ro-key', 'ro-idx', 'ro-shifts', 'ro-prefix', 'ro-speed',
    'b-send', 'b-pause', 'b-resume', 'b-faster', 'b-slower', 'b-step', 'b-reset'];
  var e = {};
  for (var k = 0; k < ids.length; k++) {
    e[ids[k]] = document.getElementById(ids[k]);
    if (!e[ids[k]]) { return; }
  }

  var s, renderedT = -1, last = 0, cols = [];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function randArray() {
    var arr = [];
    for (var i = 0; i < N; i++) {
      arr.push(15 + Math.floor(Math.random() * 81));
    }
    return arr;
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

  function buildBars() {
    e['bars-stage'].textContent = '';
    cols = [];
    for (var i = 0; i < N; i++) {
      var col = document.createElement('div');
      col.className = 'bar-col';
      var rect = document.createElement('div');
      rect.className = 'bar-rect';
      var val = document.createElement('span');
      val.className = 'bar-val';
      col.appendChild(rect);
      col.appendChild(val);
      e['bars-stage'].appendChild(col);
      cols.push({ col: col, rect: rect, val: val });
    }
  }

  function stepOneTick() {
    s.t++;
    if (s.done) {
      s.running = false;
      return;
    }

    if (s.i >= N) {
      s.keyVal = null;
      s.j = -1;
      s.shiftIdx = -1;
      s.prefixLen = N;
      s.done = true;
      s.running = false;
      log('Sorting complete with ' + s.shifts + ' shifts.', 'ok');
      return;
    }

    if (s.keyVal === null) {
      s.keyVal = s.arr[s.i];
      s.j = s.i - 1;
      s.shiftIdx = -1;
      log('Picked key ' + s.keyVal + ' at index ' + s.i + '.', 'buf');
      return;
    }

    if (s.j >= 0 && s.arr[s.j] > s.keyVal) {
      s.arr[s.j + 1] = s.arr[s.j];
      s.shiftIdx = s.j + 1;
      s.shifts++;
      log('Shifted ' + s.arr[s.j + 1] + ' from index ' + s.j + ' to ' + (s.j + 1) + '.', 'retx');
      s.j--;
    } else {
      s.arr[s.j + 1] = s.keyVal;
      s.shiftIdx = -1;
      s.prefixLen = s.i + 1;
      log('Placed key ' + s.keyVal + ' at index ' + (s.j + 1) + '.', 'ok');
      s.i++;
      s.keyVal = null;
      s.j = -1;
      if (s.i >= N) {
        s.done = true;
        s.running = false;
        log('All elements sorted in ' + s.shifts + ' shifts.', 'ok');
      }
    }
  }

  function canSend() {
    return !s.done && (!s.started || s.running);
  }

  function triggerSend() {
    if (!canSend()) { return; }
    s.started = true;
    s.running = true;
    var ev0 = s.ev, guard = 0;
    while (s.ev === ev0 && guard < 40 && !s.done) {
      stepOneTick();
      guard++;
    }
    s.tf = s.t;
    render();
  }

  function render() {
    var activeKeySlot = (s.keyVal !== null) ? (s.j + 1) : -1;
    for (var i = 0; i < N; i++) {
      var cls = 'bar-col';
      if (i === activeKeySlot) { cls += ' key'; }
      else if (i === s.shiftIdx) { cls += ' shift'; }
      else if (i < s.prefixLen) { cls += ' prefix'; }
      cols[i].col.className = cls;
      cols[i].rect.style.height = Math.max(12, Math.round((s.arr[i] / 100) * 155)) + 'px';
      cols[i].val.textContent = (i === activeKeySlot && s.keyVal !== null) ? s.keyVal : s.arr[i];
    }

    e['ro-key'].textContent = (s.keyVal !== null) ? String(s.keyVal) : '-';
    e['ro-idx'].textContent = (s.j >= 0) ? String(s.j) : '-';
    e['ro-shifts'].textContent = s.shifts;
    e['ro-prefix'].textContent = s.prefixLen + ' / ' + N;
    e['ro-speed'].textContent = s.sp + 'x';
    e['status-line'].textContent = s.done
      ? 'Sorted! Total shifts: ' + s.shifts
      : ('Sorted prefix: ' + s.prefixLen + ' / ' + N + ' · Shifts: ' + s.shifts);

    var si = SPEEDS.indexOf(s.sp);
    e['b-send'].disabled = !canSend();
    e['b-pause'].disabled = !s.running || s.done;
    e['b-resume'].disabled = s.running || !s.started || s.done;
    e['b-faster'].disabled = si >= SPEEDS.length - 1;
    e['b-slower'].disabled = si <= 0;
    e['b-step'].disabled = s.done;
    renderedT = s.t;
  }

  function reset() {
    var sp = s ? s.sp : 1;
    last = 0;
    s = {
      t: 0, tf: 0, running: false, started: false, sp: sp,
      arr: randArray(), i: 1, j: -1, keyVal: null,
      shiftIdx: -1, shifts: 0, prefixLen: 1, done: false, ev: 0
    };
    e['event-log'].textContent = '';
    log('Ready (Insertion Sort, n=' + N + ').', 'info');
    render();
  }

  function frame(ts) {
    if (last && s.running) {
      s.tf += Math.min(ts - last, 100) / 1000 * RATE * s.sp;
      while (s.running && s.t + 1 <= s.tf) { stepOneTick(); }
      if (!s.running) { s.tf = s.t; render(); }
    }
    last = ts;
    if (renderedT !== s.t) { render(); }
    window.requestAnimationFrame(frame);
  }

  function setSpeed(d) {
    var i = clamp(SPEEDS.indexOf(s.sp) + d, 0, SPEEDS.length - 1);
    s.sp = SPEEDS[i];
    render();
  }

  e['b-send'].addEventListener('click', triggerSend);
  e['b-pause'].addEventListener('click', function () { s.running = false; s.tf = s.t; log('Paused.', 'info'); render(); });
  e['b-resume'].addEventListener('click', function () {
    if (s.done) { return; }
    s.started = true;
    s.running = true;
    log('Resumed.', 'info');
    render();
  });
  e['b-faster'].addEventListener('click', function () { setSpeed(1); });
  e['b-slower'].addEventListener('click', function () { setSpeed(-1); });
  e['b-step'].addEventListener('click', function () {
    if (s.done) { return; }
    s.started = true;
    s.running = false;
    var ev0 = s.ev, guard = 0;
    while (s.ev === ev0 && guard < 40 && !s.done) {
      stepOneTick();
      guard++;
    }
    s.tf = s.t;
    render();
  });
  e['b-reset'].addEventListener('click', reset);

  buildBars();
  reset();
  window.requestAnimationFrame(frame);
}());