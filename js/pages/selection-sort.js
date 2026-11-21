(function () {
  'use strict';
  var RATE = 4, SPEEDS = [0.25, 0.5, 1, 2, 4], N = 10;

  var ids = ['bars-stage', 'status-line', 'event-log',
    'ro-pass', 'ro-min', 'ro-swaps', 'ro-sorted', 'ro-speed',
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

    if (s.i >= N - 1) {
      s.sortedCount = N;
      s.scanIdx = -1;
      s.minIdx = -1;
      s.done = true;
      s.running = false;
      log('Sorting complete with ' + s.swaps + ' swaps.', 'ok');
      return;
    }

    if (s.j < N) {
      s.scanIdx = s.j;
      if (s.arr[s.j] < s.arr[s.minIdx]) {
        s.minIdx = s.j;
        log('Pass ' + (s.i + 1) + ': new minimum ' + s.arr[s.minIdx] + ' at index ' + s.minIdx + '.', 'retx');
      } else {
        log('Pass ' + (s.i + 1) + ': checked index ' + s.j + ' (' + s.arr[s.j] + ') vs min ' + s.arr[s.minIdx] + '.', 'send');
      }
      s.j++;
    } else {
      s.scanIdx = -1;
      if (s.minIdx !== s.i) {
        var tmp = s.arr[s.i];
        s.arr[s.i] = s.arr[s.minIdx];
        s.arr[s.minIdx] = tmp;
        s.swaps++;
        log('Swapped index ' + s.i + ' (' + s.arr[s.minIdx] + ') with min at index ' + s.minIdx + ' (' + s.arr[s.i] + ').', 'buf');
      } else {
        log('Element ' + s.arr[s.i] + ' is already minimum at index ' + s.i + '.', 'ok');
      }
      s.sortedCount = s.i + 1;
      s.i++;
      s.j = s.i + 1;
      s.minIdx = s.i;
      if (s.i >= N - 1) {
        s.sortedCount = N;
        s.scanIdx = -1;
        s.minIdx = -1;
        s.done = true;
        s.running = false;
        log('Sorting complete in ' + s.swaps + ' swaps.', 'ok');
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
      if (i < s.sortedCount) { cls += ' sorted'; }
      else if (i === s.minIdx) { cls += ' minval'; }
      else if (i === s.scanIdx) { cls += ' scan'; }
      cols[i].col.className = cls;
      cols[i].rect.style.height = Math.max(12, Math.round((s.arr[i] / 100) * 155)) + 'px';
      cols[i].val.textContent = s.arr[i];
    }

    e['ro-pass'].textContent = Math.min(s.i + 1, N - 1);
    e['ro-min'].textContent = (s.minIdx >= 0) ? String(s.arr[s.minIdx]) : '-';
    e['ro-swaps'].textContent = s.swaps;
    e['ro-sorted'].textContent = s.sortedCount + ' / ' + N;
    e['ro-speed'].textContent = s.sp + 'x';
    e['status-line'].textContent = s.done
      ? 'Sorted! Total swaps: ' + s.swaps
      : ('Pass ' + (s.i + 1) + ' · Min: ' + ((s.minIdx >= 0) ? s.arr[s.minIdx] : '-') + ' · Swaps: ' + s.swaps);

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
      arr: randArray(), i: 0, j: 1, minIdx: 0, scanIdx: -1,
      swaps: 0, sortedCount: 0, done: false, ev: 0
    };
    e['event-log'].textContent = '';
    log('Ready (Selection Sort, n=' + N + ').', 'info');
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