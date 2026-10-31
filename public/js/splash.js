// Pantalla de bienvenida con el logo: se muestra una vez por visita (sesión del navegador).
// Se carga en <head> para decidir antes de dibujar la página y evitar parpadeos.
(function () {
  'use strict';
  var seen = false;
  try { seen = sessionStorage.getItem('fj-splash') === '1'; } catch (e) { seen = true; }
  if (seen) return;
  try { sessionStorage.setItem('fj-splash', '1'); } catch (e) {}
  document.documentElement.classList.add('show-splash');
  window.addEventListener('DOMContentLoaded', function () {
    var el = document.querySelector('.splash');
    if (!el) return;
    el.addEventListener('animationend', function (ev) {
      if (ev.target === el) el.remove();
    });
  });
})();
