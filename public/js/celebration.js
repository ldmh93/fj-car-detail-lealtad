// Pantalla de celebración al completar los 10 sellos: confeti y fuegos artificiales
// en un solo <canvas>, con pocas partículas y duración limitada para no cargar el celular.
(function () {
  'use strict';

  var COLORS = ['#4a93cc', '#8cc3ef', '#2f7ab8', '#d4a44a', '#f5d08a', '#ffffff'];
  var DURATION = 4200; // ms de animación; después se libera el canvas

  function show(opts) {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var previousFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'celebration';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'celebration-title');

    var canvas = null;
    if (!reduceMotion && document.createElement('canvas').getContext) {
      canvas = document.createElement('canvas');
      canvas.className = 'celebration-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      overlay.appendChild(canvas);
    }

    var box = document.createElement('div');
    box.className = 'celebration-box';
    box.innerHTML =
      '<img src="/images/logo.png" alt="" width="84" height="101">' +
      '<h2 id="celebration-title">¡Felicidades, completaste tus sellos!</h2>' +
      '<p class="celebration-reward-label">Tu recompensa</p>' +
      '<p class="celebration-reward"></p>' +
      '<p class="celebration-help"></p>' +
      '<button type="button" class="btn btn-reward btn-lg btn-block">Ver mi tarjeta</button>';
    box.querySelector('.celebration-reward').textContent = capitalize(opts.reward);
    box.querySelector('.celebration-help').textContent =
      'Presenta tu tarjeta en ' + opts.business + ' en tu próxima visita. El personal la marcará como canjeada y empezarás una tarjeta nueva.';
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var stop = canvas ? animate(canvas) : function () {};
    var button = box.querySelector('button');
    button.focus();

    function close() {
      stop();
      overlay.classList.add('closing');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { overlay.remove(); }, 300);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    }
    function onKey(ev) {
      if (ev.key === 'Escape') close();
      if (ev.key === 'Tab') { ev.preventDefault(); button.focus(); }
    }
    button.addEventListener('click', close);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay || ev.target === canvas) close(); });
    document.addEventListener('keydown', onKey);
  }

  function capitalize(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function animate(canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    function resize() {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    var rand = function (a, b) { return a + Math.random() * (b - a); };
    var pick = function () { return COLORS[(Math.random() * COLORS.length) | 0]; };

    // Confeti: cae desde arriba con giro y balanceo
    var confetti = [];
    var CONFETTI = w < 500 ? 90 : 140;
    for (var i = 0; i < CONFETTI; i++) {
      confetti.push({
        x: rand(0, w), y: rand(-h * 0.6, -10),
        vx: rand(-0.6, 0.6), vy: rand(1.6, 3.4),
        size: rand(5, 10), rot: rand(0, Math.PI * 2), vr: rand(-0.15, 0.15),
        sway: rand(0, Math.PI * 2), color: pick(),
      });
    }

    // Fuegos artificiales: cohetes que suben y estallan en chispas
    var rockets = [];
    var sparks = [];
    var launches = [200, 650, 1150, 1650, 2150];
    function launch() {
      var tx = rand(w * 0.15, w * 0.85);
      rockets.push({ x: tx + rand(-30, 30), y: h + 10, tx: tx, ty: rand(h * 0.12, h * 0.38), color: pick() });
    }
    function explode(r) {
      var n = 36;
      var gold = Math.random() < 0.45;
      for (var k = 0; k < n; k++) {
        var a = (Math.PI * 2 * k) / n + rand(-0.08, 0.08);
        var speed = rand(1.8, 4.2);
        sparks.push({
          x: r.x, y: r.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          life: 1, decay: rand(0.012, 0.02),
          color: gold ? (k % 3 ? '#f5d08a' : '#ffffff') : (k % 3 ? r.color : '#ffffff'),
        });
      }
    }

    var start = performance.now();
    var last = start;
    var raf = 0;
    var stopped = false;
    var launched = 0;

    function frame(now) {
      if (stopped) return;
      var t = now - start;
      var dt = Math.min((now - last) / 16.67, 3); // normaliza a ~60 fps y evita saltos
      last = now;
      ctx.clearRect(0, 0, w, h);

      while (launched < launches.length && t >= launches[launched]) { launch(); launched++; }

      // Cohetes
      for (var i = rockets.length - 1; i >= 0; i--) {
        var r = rockets[i];
        r.y -= 7 * dt;
        r.x += (r.tx - r.x) * 0.04 * dt;
        ctx.fillStyle = r.color;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(r.x - 1.5, r.y, 3, 10);
        if (r.y <= r.ty) { explode(r); rockets.splice(i, 1); }
      }

      // Chispas
      for (var j = sparks.length - 1; j >= 0; j--) {
        var s = sparks[j];
        s.vx *= Math.pow(0.97, dt); s.vy = s.vy * Math.pow(0.97, dt) + 0.06 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life -= s.decay * dt;
        if (s.life <= 0) { sparks.splice(j, 1); continue; }
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Confeti (se desvanece al final)
      var fade = t > DURATION - 900 ? Math.max(0, (DURATION - t) / 900) : 1;
      for (var c = 0; c < confetti.length; c++) {
        var p = confetti[c];
        p.sway += 0.05 * dt;
        p.x += (p.vx + Math.sin(p.sway) * 0.8) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > h + 20) continue;
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (t < DURATION || sparks.length || rockets.length) raf = requestAnimationFrame(frame);
      else finish();
    }

    function onVisibility() {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else if (!stopped) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    document.addEventListener('visibilitychange', onVisibility);

    function finish() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.remove();
    }

    raf = requestAnimationFrame(frame);
    return function () { if (!stopped) finish(); };
  }

  window.fjCelebration = { show: show };
})();
