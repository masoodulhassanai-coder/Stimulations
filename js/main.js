(function () {
  'use strict';
  var root = document.documentElement;

  // Theme toggle (dark default, saved in localStorage)
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      root.setAttribute('data-theme', saved);
    }
  } catch (err) { /* storage unavailable */ }

  function closeAllDropdowns() {
    var openItems = document.querySelectorAll('.site-nav .has-dropdown.open');
    for (var i = 0; i < openItems.length; i++) {
      openItems[i].classList.remove('open');
      var btn = openItems[i].querySelector('.nav-trigger');
      if (btn) { btn.setAttribute('aria-expanded', 'false'); }
    }
  }

  function getNav() {
    return document.getElementById('primary-nav') || document.querySelector('.site-nav');
  }

  function getBurger() {
    return document.querySelector('.hamburger');
  }

  function syncActiveNavAndYear() {
    var nav = getNav();
    if (nav) {
      var clean = function (p) {
        return String(p || '').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
      };
      var here = clean(location.pathname);
      var links = nav.querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (href && clean(href) === here) {
          links[i].setAttribute('aria-current', 'page');
          var parentDrop = links[i].closest('.has-dropdown');
          if (parentDrop) {
            var parentBtn = parentDrop.querySelector('.nav-trigger');
            if (parentBtn) { parentBtn.classList.add('current-parent'); }
          }
        }
      }
    }

    var year = document.getElementById('year');
    if (year) { year.textContent = String(new Date().getFullYear()); }
  }

  function injectComponent(selector, url, done) {
    var slot = document.querySelector(selector);
    if (!slot || typeof window.fetch !== 'function') {
      if (done) { done(); }
      return;
    }
    fetch(url)
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.text();
      })
      .then(function (html) {
        slot.innerHTML = html;
        if (done) { done(); }
      })
      .catch(function () {
        if (done) { done(); }
      });
  }

  function initHeroSlider() {
    var slides = document.querySelectorAll('.hero__slides img');
    if (!slides.length) { return; }

    var current = 0;
    var foundActive = false;
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].classList.contains('active')) {
        current = i;
        foundActive = true;
        break;
      }
    }
    if (!foundActive) {
      slides[0].classList.add('active');
    }

    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduce || slides.length < 2) { return; }

    window.setInterval(function () {
      slides[current].classList.remove('active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
    }, 5000);
  }

  // Delegated clicks for theme toggle, hamburger drawer, dropdown triggers, and outside clicks
  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || !target.closest) { return; }

    var themeBtn = target.closest('.theme-toggle');
    if (themeBtn) {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (err) { /* ignore */ }
      return;
    }

    var burger = getBurger();
    var nav = getNav();
    var clickedBurger = target.closest('.hamburger');
    if (clickedBurger && burger && nav) {
      ev.preventDefault();
      var isOpen = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (!isOpen) { closeAllDropdowns(); }
      return;
    }

    var trigger = target.closest('.site-nav .nav-trigger');
    if (trigger) {
      ev.preventDefault();
      ev.stopPropagation();
      var item = trigger.closest('.has-dropdown');
      if (!item) { return; }
      var willOpen = !item.classList.contains('open');
      closeAllDropdowns();
      item.classList.toggle('open', willOpen);
      trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }

    if (!target.closest('.site-nav')) {
      closeAllDropdowns();
    }
  });

  // Escape key closes open dropdowns and mobile nav drawer
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') { return; }
    closeAllDropdowns();
    var burger = getBurger();
    var nav = getNav();
    if (nav && nav.classList.contains('open')) {
      nav.classList.remove('open');
      if (burger) {
        burger.setAttribute('aria-expanded', 'false');
        burger.focus();
      }
    }
  });

  function boot() {
    injectComponent('#header-placeholder', '/components/header.html', syncActiveNavAndYear);
    injectComponent('#footer-placeholder', '/components/footer.html', syncActiveNavAndYear);
    syncActiveNavAndYear();
    initHeroSlider();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Fade-in on scroll
  var items = document.querySelectorAll('.fade-in');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (items.length && 'IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('visible');
          io.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.08 });
    for (var j = 0; j < items.length; j++) {
      items[j].classList.add('fade-ready');
      io.observe(items[j]);
    }
  }
}());