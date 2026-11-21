(function () {
  'use strict';
  var RATE = 4, SPEEDS = [0.25, 0.5, 1, 2, 4];
  var BASE_PROCS = [
    { pid: 'P1', at: 0, bt: 5 },
    { pid: 'P2', at: 1, bt: 3 },
    { pid: 'P3', at: 2, bt: 8 },
    { pid: 'P4', at: 3, bt: 6 },
    { pid: 'P5', at: 5, bt: 2 },
    { pid: 'P6', at: 6, bt: 4 }
  ];

  var ids = ['sel-algo', 'sel-quantum', 'quantum-wrap',
    'ro-cpu', 'ro-rq', 'ro-done', 'ro-awt', 'ro-atat', 'ro-speed',
    'zone-cpu', 'zone-ready', 'zone-cpu-slot', 'zone-done', 'cpu-meter', 'proc-dock', 'gantt-track', 'event-log',
    'b-send', 'b-pause', 'b-resume', 'b-faster', 'b-slower', 'b-step', 'b-kill', 'b-reset'];
  var e = {};
  for (var k = 0; k < ids.length; k++) {
    e[ids[k]] = document.getElementById(ids[k]);
    if (!e[ids[k]]) { return; }
  }

  var s, renderedT = -1, last = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

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

  function findProc(pid) {
    for (var i = 0; i < s.procs.length; i++) {
      if (s.procs[i].pid === pid) { return s.procs[i]; }
    }
    return null;
  }

  function selectProc(pid) {
    var p = findProc(pid);
    if (!p || p.state === 'finished' || p.state === 'killed') { return; }
    s.selected = (s.selected === pid) ? null : pid;
    render();
  }

  function killSelected() {
    if (!s.selected) { return; }
    var p = findProc(s.selected);
    if (!p || p.state === 'finished' || p.state === 'killed') { return; }
    p.state = 'killed';
    p.ct = s.t;
    p.tat = p.ct - p.at;
    p.wt = Math.max(0, p.tat - (p.bt - p.rt));
    s.rq = s.rq.filter(function (id) { return id !== p.pid; });
    if (s.runningPid === p.pid) {
      s.runningPid = null;
      s.qUsed = 0;
    }
    s.selected = null;
    log('Killed ' + p.pid + ' at time ' + p.ct + '.', 'bad');
    checkAllDone();
    render();
  }

  function admitArrivals() {
    for (var i = 0; i < s.procs.length; i++) {
      var p = s.procs[i];
      if (p.state === 'new' && p.at <= s.t) {
        p.state = 'ready';
        s.rq.push(p.pid);
        log(p.pid + ' arrived (AT=' + p.at + ', BT=' + p.bt + ') -> Ready Queue.', 'send');
      }
    }
  }

  function pickNextPid() {
    if (s.rq.length === 0) { return null; }
    var i, bestIdx = 0, bestP, curP;
    if (s.algo === 'fcfs' || s.algo === 'rr') {
      return s.rq.shift();
    }
    if (s.algo === 'sjf') {
      bestP = findProc(s.rq[0]);
      for (i = 1; i < s.rq.length; i++) {
        curP = findProc(s.rq[i]);
        if (curP.bt < bestP.bt || (curP.bt === bestP.bt && curP.at < bestP.at)) {
          bestP = curP;
          bestIdx = i;
        }
      }
      return s.rq.splice(bestIdx, 1)[0];
    }
    if (s.algo === 'srtf') {
      bestP = findProc(s.rq[0]);
      for (i = 1; i < s.rq.length; i++) {
        curP = findProc(s.rq[i]);
        if (curP.rt < bestP.rt || (curP.rt === bestP.rt && curP.at < bestP.at)) {
          bestP = curP;
          bestIdx = i;
        }
      }
      return s.rq.splice(bestIdx, 1)[0];
    }
    return s.rq.shift();
  }

  function dispatchIfNeeded() {
    if (s.algo === 'srtf' && s.runningPid) {
      var cur = findProc(s.runningPid);
      if (cur && cur.state === 'running' && s.rq.length > 0) {
        var shortest = findProc(s.rq[0]);
        for (var i = 1; i < s.rq.length; i++) {
          var cand = findProc(s.rq[i]);
          if (cand.rt < shortest.rt) { shortest = cand; }
        }
        if (shortest.rt < cur.rt) {
          cur.state = 'ready';
          s.rq.push(cur.pid);
          log('Preempted ' + cur.pid + ' (RT=' + cur.rt + ') for ' + shortest.pid + ' (RT=' + shortest.rt + ').', 'retx');
          s.runningPid = null;
          s.qUsed = 0;
        }
      }
    }
    if (!s.runningPid) {
      var nextPid = pickNextPid();
      if (nextPid) {
        var p = findProc(nextPid);
        p.state = 'running';
        s.runningPid = p.pid;
        s.qUsed = 0;
        log('CPU -> ' + p.pid + ' (RT=' + p.rt + ').', 'ok');
      }
    }
  }

  function checkAllDone() {
    var active = s.procs.some(function (p) { return p.state !== 'finished' && p.state !== 'killed'; });
    if (!active && !s.runningPid && !s.done) {
      s.done = true;
      s.running = false;
      log('All processes finished.', 'ok');
    }
  }

  function stepOneTick() {
    admitArrivals();
    dispatchIfNeeded();

    var activePid = s.runningPid;
    s.t++;

    if (activePid) {
      var p = findProc(activePid);
      p.rt--;
      s.qUsed++;
      s.gantt.push({ pid: p.pid, start: s.t - 1, end: s.t });

      if (p.rt <= 0) {
        p.rt = 0;
        p.state = 'finished';
        p.ct = s.t;
        p.tat = p.ct - p.at;
        p.wt = Math.max(0, p.tat - p.bt);
        s.runningPid = null;
        s.qUsed = 0;
        if (s.selected === p.pid) { s.selected = null; }
        log(p.pid + ' completed (WT=' + p.wt + ', TAT=' + p.tat + ').', 'ok');
      } else if (s.algo === 'rr' && s.qUsed >= s.quantum) {
        p.state = 'ready';
        s.rq.push(p.pid);
        s.runningPid = null;
        s.qUsed = 0;
        log(p.pid + ' quantum (' + s.quantum + ') used -> Ready Queue.', 'buf');
      }
    } else {
      s.gantt.push({ pid: 'IDLE', start: s.t - 1, end: s.t });
    }

    admitArrivals();
    checkAllDone();
  }

  function canSendOne() {
    if (s.done || (s.started && !s.running)) { return false; }
    return s.procs.some(function (p) { return p.state !== 'finished' && p.state !== 'killed'; });
  }

  function triggerSend() {
    if (!canSendOne()) { return; }
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

  function makeToken(p, compact) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pkt-token ' + p.state + (s.selected === p.pid ? ' selected' : '');
    if (!compact) {
      b.style.minWidth = (64 + p.bt * 5) + 'px';
    }
    var sub = 'RT ' + p.rt + '/' + p.bt;
    if (p.state === 'finished' || p.state === 'killed') {
      sub = 'WT ' + p.wt + ' · TAT ' + p.tat;
    } else if (p.state === 'new') {
      sub = 'AT ' + p.at + ' · BT ' + p.bt;
    }
    b.innerHTML = '<span class="t-id">' + p.pid + '</span><span class="t-sub">' + sub + '</span>';
    b.addEventListener('click', function () { selectProc(p.pid); });
    return b;
  }

  function updateMeter() {
    var frac = clamp(s.tf - s.t, 0, 1);
    if (!s.runningPid || !s.running || s.done) {
      e['cpu-meter'].style.width = '0%';
      return;
    }
    if (s.algo === 'rr') {
      var qPct = clamp(((s.qUsed + frac) / s.quantum) * 100, 0, 100);
      e['cpu-meter'].style.width = qPct.toFixed(1) + '%';
    } else {
      var p = findProc(s.runningPid);
      var bPct = clamp(((p.bt - p.rt + frac) / p.bt) * 100, 0, 100);
      e['cpu-meter'].style.width = bPct.toFixed(1) + '%';
    }
  }

  function render() {
    var doneList = s.procs.filter(function (p) { return p.state === 'finished' || p.state === 'killed'; });
    var sumWt = 0, sumTat = 0, i;
    for (i = 0; i < doneList.length; i++) {
      sumWt += doneList[i].wt;
      sumTat += doneList[i].tat;
    }
    var nDone = doneList.length;

    e['ro-cpu'].textContent = s.runningPid || 'IDLE';
    e['ro-rq'].textContent = s.rq.length;
    e['ro-done'].textContent = nDone + ' / ' + s.procs.length;
    e['ro-awt'].textContent = nDone ? (sumWt / nDone).toFixed(1) : '0.0';
    e['ro-atat'].textContent = nDone ? (sumTat / nDone).toFixed(1) : '0.0';
    e['ro-speed'].textContent = s.sp + 'x';
    e['quantum-wrap'].style.display = s.algo === 'rr' ? '' : 'none';
    e['zone-cpu'].className = 'zone zone-cpu' + (s.runningPid ? ' active' : '');

    e['zone-ready'].textContent = '';
    for (i = 0; i < s.rq.length; i++) {
      e['zone-ready'].appendChild(makeToken(findProc(s.rq[i]), true));
    }

    e['zone-cpu-slot'].textContent = '';
    if (s.runningPid) {
      e['zone-cpu-slot'].appendChild(makeToken(findProc(s.runningPid), false));
    } else {
      var idle = document.createElement('span');
      idle.className = 'idle-tag';
      idle.textContent = 'IDLE';
      e['zone-cpu-slot'].appendChild(idle);
    }
    updateMeter();

    e['zone-done'].textContent = '';
    for (i = 0; i < s.procs.length; i++) {
      if (s.procs[i].state === 'finished' || s.procs[i].state === 'killed') {
        e['zone-done'].appendChild(makeToken(s.procs[i], true));
      }
    }

    e['proc-dock'].textContent = '';
    for (i = 0; i < s.procs.length; i++) {
      e['proc-dock'].appendChild(makeToken(s.procs[i], false));
    }

    e['gantt-track'].textContent = '';
    for (i = 0; i < s.gantt.length; i++) {
      var g = s.gantt[i];
      var seg = document.createElement('span');
      seg.className = 'g-seg' + (g.pid === 'IDLE' ? ' idle' : '');
      seg.style.minWidth = '38px';
      seg.textContent = g.pid;
      e['gantt-track'].appendChild(seg);
    }

    var si = SPEEDS.indexOf(s.sp);
    e['b-send'].disabled = !canSendOne();
    e['b-pause'].disabled = !s.running || s.done;
    e['b-resume'].disabled = s.running || !s.started || s.done;
    e['b-faster'].disabled = si >= SPEEDS.length - 1;
    e['b-slower'].disabled = si <= 0;
    e['b-step'].disabled = s.done;
    e['b-kill'].disabled = !s.selected;
    renderedT = s.t;
  }

  function reset() {
    var sp = s ? s.sp : 1;
    last = 0;
    var procs = BASE_PROCS.map(function (item) {
      return { pid: item.pid, at: item.at, bt: item.bt, rt: item.bt, state: 'new', ct: null, wt: null, tat: null };
    });
    s = {
      t: 0, tf: 0, running: false, started: false, sp: sp,
      algo: e['sel-algo'].value,
      quantum: parseInt(e['sel-quantum'].value, 10) || 2,
      procs: procs, rq: [], runningPid: null, qUsed: 0,
      gantt: [], selected: null, ev: 0, done: false
    };
    e['event-log'].textContent = '';
    log('Ready (' + s.algo.toUpperCase() + ').', 'info');
    render();
  }

  function frame(ts) {
    if (last && s.running) {
      s.tf += Math.min(ts - last, 100) / 1000 * RATE * s.sp;
      while (s.running && s.t + 1 <= s.tf) { stepOneTick(); }
      if (!s.running) { s.tf = s.t; render(); }
      else { updateMeter(); }
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

  e['sel-algo'].addEventListener('change', reset);
  e['sel-quantum'].addEventListener('change', reset);
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
  e['b-kill'].addEventListener('click', killSelected);
  e['b-reset'].addEventListener('click', reset);

  reset();
  window.requestAnimationFrame(frame);
}());