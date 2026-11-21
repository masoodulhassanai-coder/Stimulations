(function () {
  'use strict';
  var RATE = 4, SPEEDS = [0.25, 0.5, 1, 2, 4], N = 10;

  var ids = ['bars-stage', 'status-line', 'event-log',
    'ro-key', 'ro-bounds', 'ro-mid', 'ro-prefix', 'ro-speed',
    'b-send', 'b-pause', 'b-resume', 'b-faster', 'b-slower', 'b-step', 'b-reset'];
  var e = {};
  for (var k = 0; k < ids.length; k++) {
    e[ids[k]] = document.getElementById(ids[k]);
    if (!e[ids[k]]) { return; }
  }

  var s, renderedT = -1, last = 0, itemMap = {}, trackEl = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function randArray() {
    var arr = [];
    for (var i = 0; i < N; i++) {
      arr.push({ id: 'b' + i, val: 15 + Math.floor(Math.random() * 81) });
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
    trackEl = document.createElement('div');
    trackEl.className = 'bars-track';
    e['bars-stage'].appendChild(trackEl);
    itemMap = {};

    for (var i = 0; i < N; i++) {
      var id = 'b' + i;
      var col = document.createElement('div');
      col.className = 'bar-col';
      var rect = document.createElement('div');
      rect.className = 'bar-rect';
      var val = document.createElement('span');
      val.className = 'bar-val';
      var idxTag = document.createElement('span');
      idxTag.className = 'bar-idx';
      idxTag.textContent = i;
      col.appendChild(rect);
      col.appendChild(val);
      col.appendChild(idxTag);
      trackEl.appendChild(col);
      itemMap[id] = { col: col, rect: rect, val: val };
    }
  }

  function positionBars() {
    if (!trackEl || !s) { return; }
    var w = trackEl.clientWidth || e['bars-stage'].clientWidth;
    var slotW = w / N;

    for (var idx = 0; idx < N; idx++) {
      var item = s.arr[idx];
      var ref = itemMap[item.id];
      if (!ref) { continue; }

      var cls = 'bar-col';
      if (idx === s.mid || (s.keyItem && item.id === s.keyItem.id && s.phase !== 'shift')) {
        cls += ' mid';
      } else if (idx === s.shiftIdx || (s.keyItem && item.id === s.keyItem.id && s.phase === 'shift')) {
        cls += ' shift';
      } else if (s.phase === 'search' && idx >= s.low && idx <= s.high) {
        cls += ' bound';
      } else if (idx < s.prefixLen) {
        cls += ' prefix';
      }

      var x = idx * slotW + 3;
      ref.col.className = cls;
      ref.col.style.width = Math.max(18, slotW - 6) + 'px';
      ref.col.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
      ref.rect.style.height = Math.max(14, Math.round((item.val / 100) * 145)) + 'px';
      ref.val.textContent = item.val;
    }
  }

  function stepOneTick() {
    s.t++;
    if (s.done) {
      s.running = false;
      return;
    }

    if (s.i >= N) {
      s.phase = 'done';
      s.keyItem = null;
      s.mid = -1;
      s.shiftIdx = -1;
      s.prefixLen = N;
      s.done = true;
      s.running = false;
      log('Binary Sort complete (' + s.shifts + ' shifts).', 'ok');
      return;
    }

    if (s.phase === 'init') {
      s.keyItem = s.arr[s.i];
      s.low = 0;
      s.high = s.i - 1;
      s.mid = -1;
      s.shiftIdx = -1;
      s.phase = 'search';
      log('Key ' + s.keyItem.val + ' at index ' + s.i + ': binary search in [0..' + s.high + '].', 'buf');
      return;
    }

    if (s.phase === 'search') {
      if (s.low <= s.high) {
        s.mid = Math.floor((s.low + s.high) / 2);
        if (s.arr[s.mid].val > s.keyItem.val) {
          log('Probe mid=' + s.mid + ' (' + s.arr[s.mid].val + ') > key ' + s.keyItem.val + ' -> search left.', 'send');
          s.high = s.mid - 1;
        } else {
          log('Probe mid=' + s.mid + ' (' + s.arr[s.mid].val + ') <= key ' + s.keyItem.val + ' -> search right.', 'send');
          s.low = s.mid + 1;
        }
      } else {
        s.insertPos = s.low;
        s.shiftCursor = s.i - 1;
        s.mid = -1;
        s.phase = 'shift';
        log('Found insertion index ' + s.insertPos + ' for key ' + s.keyItem.val + '.', 'buf');
      }
      return;
    }

    if (s.phase === 'shift') {
      if (s.shiftCursor >= s.insertPos) {
        var movingRight = s.arr[s.shiftCursor];
        s.arr[s.shiftCursor + 1] = movingRight;
        s.shiftIdx = s.shiftCursor + 1;
        s.shifts++;
        log('Shifted ' + movingRight.val + ' from ' + s.shiftCursor + ' to ' + (s.shiftCursor + 1) + '.', 'retx');
        s.shiftCursor--;
      } else {
        s.arr[s.insertPos] = s.keyItem;
        s.shiftIdx = -1;
        s.prefixLen = s.i + 1;
        log('Inserted key ' + s.keyItem.val + ' at index ' + s.insertPos + '.', 'ok');
        s.i++;
        s.keyItem = null;
        s.low = 0;
        s.high = -1;
        s.mid = -1;
        s.phase = 'init';
        if (s.i >= N) {
          s.done = true;
          s.running = false;
          log('All elements sorted (' + s.shifts + ' total shifts).', 'ok');
        }
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
    positionBars();

    e['ro-key'].textContent = s.keyItem ? String(s.keyItem.val) : '-';
    e['ro-bounds'].textContent = (s.phase === 'search' && s.low <= s.high) ? (s.low + '..' + s.high) : '-';
    e['ro-mid'].textContent = (s.mid >= 0) ? String(s.mid) : '-';
    e['ro-prefix'].textContent = s.prefixLen + ' / ' + N;
    e['ro-speed'].textContent = s.sp + 'x';
    e['status-line'].textContent = s.done
      ? 'Sorted! Total shifts: ' + s.shifts
      : ('Phase: ' + s.phase + ' · Prefix: ' + s.prefixLen + '/' + N + ' · Shifts: ' + s.shifts);

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
      arr: randArray(), i: 1, keyItem: null,
      low: 0, high: -1, mid: -1, insertPos: 0,
      shiftCursor: -1, shiftIdx: -1, shifts: 0,
      prefixLen: 1, phase: 'init', done: false, ev: 0
    };
    e['event-log'].textContent = '';
    log('Ready (Binary Sort, n=' + N + ').', 'info');
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

  window.addEventListener('resize', positionBars);
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