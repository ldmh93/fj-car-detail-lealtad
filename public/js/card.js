// Tarjeta del cliente:
// 1) Mientras está abierta, revisa cada pocos segundos si cambió (por ejemplo, cuando
//    el negocio registra el sello) y recarga la página.
// 2) Al cargar, compara con lo último que vio este teléfono y anima los sellos nuevos.
(function () {
  'use strict';
  var el = document.querySelector('[data-card-status]');
  if (!el) return;

  var stamps = Number(el.dataset.stamps);
  var status = el.dataset.status;
  var cycle = Number(el.dataset.cycle);
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'fj-card-seen';

  // ---------- Animación de sellos nuevos ----------
  var prev = null;
  try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { prev = null; }
  try { localStorage.setItem(KEY, JSON.stringify({ cycle: cycle, stamps: stamps })); } catch (e) {}

  var completed = status === 'reward_pending';
  var animatedStamps = Boolean(prev && prev.cycle === cycle && stamps > prev.stamps);
  if (animatedStamps) celebrate(prev.stamps, stamps, completed);

  // Pantalla de felicitación: una sola vez por recompensa (ciclo de tarjeta) en este teléfono.
  var CELEBRATED = 'fj-celebrated-cycle';
  var celebrated = null;
  try { celebrated = localStorage.getItem(CELEBRATED); } catch (e) { celebrated = String(cycle); }
  if (completed && celebrated !== String(cycle) && window.fjCelebration) {
    try { localStorage.setItem(CELEBRATED, String(cycle)); } catch (e) {}
    // Espera a que termine la animación de los sellos (sin animación, aparece casi de inmediato).
    var wait = animatedStamps && !reduceMotion ? (stamps - prev.stamps - 1) * 180 + 1300 : 400;
    setTimeout(function () {
      window.fjCelebration.show({ reward: el.dataset.reward, business: el.dataset.business });
    }, wait);
  }

  function celebrate(from, to, completed) {
    var items = el.querySelectorAll('.stamps .stamp');
    var added = to - from;
    for (var i = from; i < to; i++) {
      var stamp = items[i];
      if (!stamp) continue;
      stamp.style.setProperty('--d', (i - from) * 0.18 + 0.3 + 's');
      stamp.classList.add('just-stamped');
    }
    var last = items[to - 1];
    if (completed && last && !reduceMotion) {
      setTimeout(function () { sparkle(last); }, (added - 1) * 180 + 700);
    }
    var left = 10 - to;
    // Al completar la tarjeta, la pantalla de felicitación sustituye al aviso.
    if (completed) {
      vibrate([60, 60, 120]);
      return;
    }
    var text = added > 1
        ? '¡' + added + ' sellos nuevos! Llevas ' + to + ' de 10.'
        : '¡Nuevo sello! Llevas ' + to + ' de 10' + (left === 1 ? '. ¡Te falta 1!' : '.');
    toast(text);
    vibrate(60);
  }

  // El navegador solo permite vibrar si la persona ya tocó la pantalla.
  function vibrate(pattern) {
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(pattern);
  }

  function toast(text) {
    var t = document.createElement('div');
    t.className = 'stamp-toast';
    t.setAttribute('role', 'status');
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 3200);
    setTimeout(function () { t.remove(); }, 3800);
  }

  function sparkle(target) {
    var burst = document.createElement('span');
    burst.className = 'sparkles';
    burst.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 14; i++) {
      var s = document.createElement('i');
      var angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.3;
      var dist = 34 + Math.random() * 26;
      s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      s.style.animationDelay = Math.random() * 0.12 + 's';
      burst.appendChild(s);
    }
    target.appendChild(burst);
    setTimeout(function () { burst.remove(); }, 1400);
  }

  // ---------- Actualización en vivo ----------
  if (!window.fetch) return;
  var current = stamps + '|' + status + '|' + cycle;
  var note = document.querySelector('[data-live-note]');
  if (note) note.hidden = false;

  function check() {
    if (document.hidden) return;
    fetch('/mi-tarjeta/estado', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { window.location.href = '/entrar?motivo=sesion'; return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data) return;
        if (data.stamps + '|' + data.status + '|' + data.cycle !== current) window.location.reload();
      })
      .catch(function () {});
  }
  setInterval(check, 6000);
  document.addEventListener('visibilitychange', check);
})();
