// Mientras el cliente muestra su tarjeta, revisa cada pocos segundos si cambió
// (por ejemplo, cuando el negocio registra el sello) y recarga la página.
(function () {
  'use strict';
  var el = document.querySelector('[data-card-status]');
  if (!el || !window.fetch) return;
  var current = el.dataset.stamps + '|' + el.dataset.status + '|' + el.dataset.cycle;
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
  setInterval(check, 8000);
  document.addEventListener('visibilitychange', check);
})();
