(function () {
  'use strict';
  var slides = document.querySelectorAll('.hero-slides img');
  if (slides.length < 2) { return; }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cur = 0, timer = null;
  function show(n) {
    slides[cur].classList.remove('active');
    cur = n % slides.length;
    slides[cur].classList.add('active');
  }
  function start() { if (!timer && !reduce) { timer = window.setInterval(function () { show(cur + 1); }, 6000); } }
  function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
  slides[0].classList.add('active');
  start();
  document.addEventListener('visibilitychange', function () { if (document.hidden) { stop(); } else { start(); } });
}());
