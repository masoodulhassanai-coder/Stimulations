(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var RATE = 4, SPEEDS = [0.25, 0.5, 1, 2, 4];

  var NODES = [
    { id: 'A', x: 95, y: 145 },
    { id: 'B', x: 230, y: 65 },
    { id: 'C', x: 230, y: 225 },
    { id: 'D', x: 390, y: 65 },
    { id: 'E', x: 390, y: 225 },
    { id: 'F', x: 540, y: 145 }
  ];

  var BASE_EDGES = [
    { id: 'A-B', u: 'A', v: 'B', w: 4 },
    { id: 'A-C', u: 'A', v: 'C', w: 2 },
    { id: 'B-C', u: 'B', v: 'C', w: 1 },
    { id: 'B-D', u: 'B', v: 'D', w: 5 },
    { id: 'C-E', u: 'C', v: 'E', w: 8 },
    { id: 'C-D', u: 'C', v: 'D', w: 10 },
    { id: 'D-E', u: 'D', v: 'E', w: 2 },
    { id: 'D-F', u: 'D', v: 'F', w: 6 },
    { id: 'E-F', u: 'E', v: 'F', w: 3 }
  ];

  var ids = ['sel-source', 'edge-layer', 'pulse-layer', 'node-layer', 'dist-strip', 'event-log',
    'ro-cur', 'ro-vis', 'ro-cost', 'ro-edge', 'ro-speed',
    'b-send', 'b-pause', 'b-resume', 'b-faster', 'b-slower', 'b-step', 'b-kill', 'b-reset'];
  var e = {};
  for (var k = 0; k < ids.length; k++) {
    e[ids[k]] = document.getElementById(ids[k]);
    if (!e[ids[k]]) { return; }
  }

  var s, renderedT = -1, last = 0, edgeEls = {}, nodeEls = {};

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) {
        el.setAttribute(key, String(attrs[key]));
      }
    }
    return el;
  }

  function getNode(id) {
    for (var i = 0; i < NODES.length; i++) {
      if (NODES[i].id === id) { return NODES[i]; }
    }
    return null;
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

  function buildGraph() {
    e['edge-layer'].textContent = '';
    e['node-layer'].textContent = '';
    edgeEls = {};
    nodeEls = {};

    for (var i = 0; i < BASE_EDGES.length; i++) {
      var ed = BASE_EDGES[i];
      var a = getNode(ed.u), b = getNode(ed.v);
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var line = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'edge-line' });
      var hit = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'edge-hit' });
      var pill = svgEl('rect', { x: mx - 12, y: my - 10, width: 24, height: 20, rx: 6, class: 'edge-w-bg' });
      var label = svgEl('text', { x: mx, y: my, class: 'edge-w' });
      label.textContent = ed.w;

      (function (edgeId) {
        var onClick = function () { selectEdge(edgeId); };
        line.addEventListener('click', onClick);
        hit.addEventListener('click', onClick);
      })(ed.id);

      e['edge-layer'].appendChild(line);
      e['edge-layer'].appendChild(hit);
      e['edge-layer'].appendChild(pill);
      e['edge-layer'].appendChild(label);
      edgeEls[ed.id] = { line: line, label: label };
    }

    for (var j = 0; j < NODES.length; j++) {
      var nd = NODES[j];
      var g = svgEl('g', { class: 'node-g', transform: 'translate(' + nd.x + ',' + nd.y + ')' });
      var circ = svgEl('circle', { r: 22, class: 'node-circle' });
      var txt = svgEl('text', { y: -2, class: 'node-label' });
      txt.textContent = nd.id;
      var distTxt = svgEl('text', { y: 12, class: 'node-dist' });
      distTxt.textContent = '∞';
      g.appendChild(circ);
      g.appendChild(txt);
      g.appendChild(distTxt);
      e['node-layer'].appendChild(g);
      nodeEls[nd.id] = { g: g, distTxt: distTxt };
    }
  }

  function selectEdge(edgeId) {
    s.selectedEdge = (s.selectedEdge === edgeId) ? null : edgeId;
    render();
  }

  function recomputeFromCurrentBlocks() {
    var prevBlocked = s ? s.blocked.slice() : [];
    var sp = s ? s.sp : 1;
    var src = e['sel-source'].value;
    s = {
      t: 0, tf: 0, running: false, started: false, sp: sp,
      source: src,
      blocked: prevBlocked,
      selectedEdge: null,
      dist: {}, prev: {}, visited: {},
      curNode: null, candidates: [], candIdx: 0,
      probe: null, done: false, ev: 0
    };
    for (var i = 0; i < NODES.length; i++) {
      var id = NODES[i].id;
      s.dist[id] = (id === src) ? 0 : Infinity;
      s.prev[id] = null;
      s.visited[id] = false;
    }
    e['event-log'].textContent = '';
    log('Initialized from source ' + src + ' (dist[' + src + '] = 0).', 'info');
    render();
  }

  function isBlocked(edgeId) {
    return s.blocked.indexOf(edgeId) !== -1;
  }

  function blockSelectedEdge() {
    if (!s.selectedEdge || isBlocked(s.selectedEdge)) { return; }
    var cutId = s.selectedEdge;
    s.blocked.push(cutId);
    recomputeFromCurrentBlocks();
    log('Blocked edge ' + cutId + ' and reset distances to recompute shortest paths.', 'bad');
    render();
  }

  function outgoingEdges(u) {
    var list = [];
    for (var i = 0; i < BASE_EDGES.length; i++) {
      var ed = BASE_EDGES[i];
      if (isBlocked(ed.id)) { continue; }
      if (ed.u === u) { list.push({ id: ed.id, to: ed.v, w: ed.w }); }
      else if (ed.v === u) { list.push({ id: ed.id, to: ed.u, w: ed.w }); }
    }
    return list;
  }

  function pickClosestUnvisited() {
    var best = null;
    for (var i = 0; i < NODES.length; i++) {
      var id = NODES[i].id;
      if (s.visited[id]) { continue; }
      if (s.dist[id] === Infinity) { continue; }
      if (!best || s.dist[id] < s.dist[best]) { best = id; }
    }
    return best;
  }

  function stepOneTick() {
    s.t++;

    if (s.done) {
      s.running = false;
      return;
    }

    if (!s.curNode) {
      var nextU = pickClosestUnvisited();
      if (!nextU) {
        s.done = true;
        s.running = false;
        log('Shortest paths finalized from ' + s.source + '.', 'ok');
        return;
      }
      s.curNode = nextU;
      s.candidates = outgoingEdges(nextU).filter(function (nb) { return !s.visited[nb.to]; });
      s.candIdx = 0;
      log('Selected closest unvisited node ' + nextU + ' (cost=' + s.dist[nextU] + ').', 'send');
      return;
    }

    if (s.candIdx < s.candidates.length) {
      var edge = s.candidates[s.candIdx++];
      var newCost = s.dist[s.curNode] + edge.w;
      s.probe = { from: s.curNode, to: edge.to, edgeId: edge.id, startT: s.t - 1 };
      if (newCost < s.dist[edge.to]) {
        s.dist[edge.to] = newCost;
        s.prev[edge.to] = s.curNode;
        log('Relaxed ' + edge.id + ' (w=' + edge.w + '): dist[' + edge.to + '] -> ' + newCost + ' via ' + s.curNode + '.', 'ok');
      } else {
        log('Checked ' + edge.id + ' (w=' + edge.w + '): ' + newCost + ' >= dist[' + edge.to + '] (' + s.dist[edge.to] + ').', 'info');
      }
      return;
    }

    s.visited[s.curNode] = true;
    s.probe = null;
    log('Finalized ' + s.curNode + ' with shortest cost ' + s.dist[s.curNode] + '.', 'buf');
    s.curNode = null;
    s.candidates = [];
    s.candIdx = 0;

    if (!pickClosestUnvisited()) {
      s.done = true;
      s.running = false;
      log('All reachable nodes finalized from ' + s.source + '.', 'ok');
    }
  }

  function canRelaxNext() {
    return !s.done && (!s.started || s.running);
  }

  function triggerRelaxNext() {
    if (!canRelaxNext()) { return; }
    s.started = true;
    s.running = true;
    var ev0 = s.ev, guard = 0;
    while (s.ev === ev0 && guard < 30 && !s.done) {
      stepOneTick();
      guard++;
    }
    s.tf = s.t;
    render();
  }

  function updateProbe() {
    e['pulse-layer'].textContent = '';
    if (!s.probe || s.done) { return; }
    var a = getNode(s.probe.from), b = getNode(s.probe.to);
    if (!a || !b) { return; }
    var frac = clamp(s.tf - s.probe.startT, 0, 1);
    var cx = a.x + (b.x - a.x) * frac;
    var cy = a.y + (b.y - a.y) * frac;
    var dot = svgEl('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 6.5, class: 'pulse-dot' });
    e['pulse-layer'].appendChild(dot);
  }

  function render() {
    var visCount = 0, i;
    var treeEdges = {};
    for (i = 0; i < NODES.length; i++) {
      var id = NODES[i].id;
      if (s.visited[id]) { visCount++; }
      if (s.prev[id]) {
        var k1 = s.prev[id] + '-' + id;
        var k2 = id + '-' + s.prev[id];
        treeEdges[k1] = true;
        treeEdges[k2] = true;
      }
    }

    for (i = 0; i < BASE_EDGES.length; i++) {
      var ed = BASE_EDGES[i];
      var refE = edgeEls[ed.id];
      if (!refE) { continue; }
      var cls = 'edge-line';
      if (isBlocked(ed.id)) {
        cls += ' blocked';
      } else if (treeEdges[ed.id] && (s.visited[ed.u] || s.visited[ed.v])) {
        cls += ' tree';
      }
      if (s.probe && s.probe.edgeId === ed.id) { cls += ' active'; }
      if (s.selectedEdge === ed.id) { cls += ' selected'; }
      refE.line.setAttribute('class', cls);
    }

    for (i = 0; i < NODES.length; i++) {
      var nd = NODES[i];
      var refN = nodeEls[nd.id];
      if (!refN) { continue; }
      var nCls = 'node-g';
      if (s.curNode === nd.id) { nCls += ' current'; }
      else if (s.visited[nd.id]) { nCls += ' visited'; }
      else if (s.dist[nd.id] !== Infinity) { nCls += ' frontier'; }
      refN.g.setAttribute('class', nCls);
      refN.distTxt.textContent = (s.dist[nd.id] === Infinity) ? '∞' : String(s.dist[nd.id]);
    }

    e['dist-strip'].textContent = '';
    for (i = 0; i < NODES.length; i++) {
      var pid = NODES[i].id;
      var card = document.createElement('div');
      var cCls = 'd-card';
      if (s.curNode === pid) { cCls += ' current'; }
      else if (s.visited[pid]) { cCls += ' visited'; }
      else if (s.dist[pid] !== Infinity) { cCls += ' frontier'; }
      card.className = cCls;
      var dStr = (s.dist[pid] === Infinity) ? '∞' : String(s.dist[pid]);
      var viaStr = (pid === s.source) ? 'SRC' : (s.prev[pid] ? 'via ' + s.prev[pid] : 'no path');
      card.innerHTML = '<div class="d-name">' + pid + '</div><div class="d-val">' + dStr + '</div><div class="d-via">' + viaStr + '</div>';
      e['dist-strip'].appendChild(card);
    }

    updateProbe();

    var fCost = (s.dist.F === Infinity) ? '∞' : String(s.dist.F);
    e['ro-cur'].textContent = s.curNode || (s.done ? 'DONE' : '-');
    e['ro-vis'].textContent = visCount + ' / ' + NODES.length;
    e['ro-cost'].textContent = fCost;
    e['ro-edge'].textContent = s.selectedEdge || 'none';
    e['ro-speed'].textContent = s.sp + 'x';

    var si = SPEEDS.indexOf(s.sp);
    e['b-send'].disabled = !canRelaxNext();
    e['b-pause'].disabled = !s.running || s.done;
    e['b-resume'].disabled = s.running || !s.started || s.done;
    e['b-faster'].disabled = si >= SPEEDS.length - 1;
    e['b-slower'].disabled = si <= 0;
    e['b-step'].disabled = s.done;
    e['b-kill'].disabled = !s.selectedEdge || isBlocked(s.selectedEdge);
    renderedT = s.t;
  }

  function reset() {
    var sp = s ? s.sp : 1;
    last = 0;
    var src = e['sel-source'].value;
    s = {
      t: 0, tf: 0, running: false, started: false, sp: sp,
      source: src,
      blocked: [],
      selectedEdge: null,
      dist: {}, prev: {}, visited: {},
      curNode: null, candidates: [], candIdx: 0,
      probe: null, done: false, ev: 0
    };
    for (var i = 0; i < NODES.length; i++) {
      var id = NODES[i].id;
      s.dist[id] = (id === src) ? 0 : Infinity;
      s.prev[id] = null;
      s.visited[id] = false;
    }
    e['event-log'].textContent = '';
    log('Ready from source ' + src + '. Press Relax Next or Resume.', 'info');
    render();
  }

  function frame(ts) {
    if (last && s.running) {
      s.tf += Math.min(ts - last, 100) / 1000 * RATE * s.sp;
      while (s.running && s.t + 1 <= s.tf) { stepOneTick(); }
      if (!s.running) { s.tf = s.t; render(); }
      else { updateProbe(); }
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

  e['sel-source'].addEventListener('change', reset);
  e['b-send'].addEventListener('click', triggerRelaxNext);
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
    while (s.ev === ev0 && guard < 30 && !s.done) {
      stepOneTick();
      guard++;
    }
    s.tf = s.t;
    render();
  });
  e['b-kill'].addEventListener('click', blockSelectedEdge);
  e['b-reset'].addEventListener('click', reset);

  buildGraph();
  reset();
  window.requestAnimationFrame(frame);
}());