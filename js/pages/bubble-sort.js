(function () {
  'use strict';
  var RATE = 4, SPEEDS = [0.25, 0.5, 1, 2, 4], N = 10;

  var ids = ['bars-stage', 'status-line', 'event-log',
    'ro-pass', 'ro-pair', 'ro-swaps', 'ro-sorted', 'ro-speed',
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

    var limit = N - 1 - s.pass;
    if (limit <= 0) {
      s.sortedFrom = 0;
      s.cmpPair = null;
      s.swapPair = null;
      s.done = true;
      s.running = false;
      log('Array is sorted in ' + s.swaps + ' swaps.', 'ok');
      return;
    }

    if (s.j < limit) {
      var a = s.j, b = s.j + 1;
      s.cmpPair = [a, b];
      if (s.arr[a] > s.arr[b]) {
        var tmp = s.arr[a];
        s.arr[a] = s.arr[b];
        s.arr[b] = tmp;
        s.swapPair = [a, b];
        s.swaps++;
        s.swappedInPass = true;
        log('Pass ' + (s.pass + 1) + ': swapped ' + s.arr[a] + ' and ' + s.arr[b] + ' (indices ' + a + ', ' + b + ').', 'retx');
      } else {
        s.swapPair = null;
        log('Pass ' + (s.pass + 1) + ': ' + s.arr[a] + ' <= ' + s.arr[b] + ' at indices ' + a + ', ' + b + ' (no swap).', 'send');
      }
      s.j++;
      if (s.j >= limit) {
        s.sortedFrom = Math.min(s.sortedFrom, limit);
        if (!s.swappedInPass) {
          s.sortedFrom = 0;
          s.cmpPair = null;
          s.swapPair = null;
          s.done = true;
          s.running = false;
          log('No swaps in pass ' + (s.pass + 1) + ' — array sorted early!', 'ok');
        }
      }
    } else {
      s.pass++;
      s.j = 0;
      s.swappedInPass = false;
      if (N - 1 - s.pass <= 0) {
        s.sortedFrom = 0;
        s.cmpPair = null;
        s.swapPair = null;
        s.done = true;
        s.running = false;
        log('Sorting complete.', 'ok');
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
    for (var i = 0; i < N; i++) {
      var cls = 'bar-col';
      if (s.swapPair && (i === s.swapPair[0] || i === s.swapPair[1])) { cls += ' swap'; }
      else if (s.cmpPair && (i === s.cmpPair[0] || i === s.cmpPair[1])) { cls += ' cmp'; }
      else if (i >= s.sortedFrom) { cls += ' sorted'; }
      cols[i].col.className = cls;
      cols[i].rect.style.height = Math.max(12, Math.round((s.arr[i] / 100) * 155)) + 'px';
      cols[i].val.textContent = s.arr[i];
    }

    var sortedCount = N - s.sortedFrom;
    e['ro-pass'].textContent = Math.min(s.pass + 1, N - 1);
    e['ro-pair'].textContent = s.cmpPair ? (s.cmpPair[0] + ' & ' + s.cmpPair[1]) : '-';
    e['ro-swaps'].textContent = s.swaps;
    e['ro-sorted'].textContent = sortedCount + ' / ' + N;
    e['ro-speed'].textContent = s.sp + 'x';
    e['status-line'].textContent = s.done
      ? 'Sorted! Total swaps: ' + s.swaps
      : ('Pass ' + (s.pass + 1) + ' · Swaps: ' + s.swaps);

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
      arr: randArray(), pass: 0, j: 0, swaps: 0,
      sortedFrom: N, cmpPair: null, swapPair: null,
      swappedInPass: false, done: false, ev: 0
    };
    e['event-log'].textContent = '';
    log('Ready (Bubble Sort, n=' + N + ').', 'info');
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