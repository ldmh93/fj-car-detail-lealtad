// Comportamientos comunes: evitar doble envío, confirmar acciones, copiar y compartir.
(function () {
  'use strict';

  // Evita dobles clics: el formulario solo se envía una vez.
  document.querySelectorAll('form[data-busy], form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (ev) {
      if (form.dataset.sent) return ev.preventDefault();
      if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return ev.preventDefault();
      form.dataset.sent = '1';
      form.querySelectorAll('button[type=submit]').forEach(function (b) {
        b.classList.add('is-busy');
        b.setAttribute('aria-disabled', 'true');
      });
    });
  });

  // Si la página se restaura desde el historial (botón Atrás), permite enviar de nuevo.
  window.addEventListener('pageshow', function (ev) {
    if (!ev.persisted) return;
    document.querySelectorAll('form[data-sent]').forEach(function (f) {
      delete f.dataset.sent;
      f.querySelectorAll('.is-busy').forEach(function (b) { b.classList.remove('is-busy'); b.removeAttribute('aria-disabled'); });
    });
  });

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.querySelector(btn.dataset.copy);
      var label = btn.querySelector('span') || btn;
      var original = label.textContent;
      function done(ok) {
        label.textContent = ok ? '¡Copiado!' : 'Selecciona y copia';
        setTimeout(function () { label.textContent = original; }, 2000);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(input.value).then(function () { done(true); }, function () { fallback(); });
      } else {
        fallback();
      }
      function fallback() {
        input.focus();
        input.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        done(ok);
      }
    });
  });

  document.querySelectorAll('[data-share]').forEach(function (btn) {
    if (!navigator.share) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      navigator.share({ text: btn.dataset.shareText, url: btn.dataset.shareUrl }).catch(function () {});
    });
  });

  document.querySelectorAll('[data-print]').forEach(function (btn) {
    btn.addEventListener('click', function () { window.print(); });
  });
})();
