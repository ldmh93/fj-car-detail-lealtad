// Graba en una etiqueta NFC solo el enlace con el código aleatorio del cliente (Web NFC).
(function () {
  'use strict';
  var root = document.querySelector('[data-nfc-write]');
  if (!root) return;
  var supported = root.querySelector('[data-nfc-supported]');
  var unsupported = root.querySelector('[data-nfc-unsupported]');
  if (!('NDEFReader' in window) || !window.isSecureContext) {
    unsupported.hidden = false;
    return;
  }
  supported.hidden = false;
  var btn = root.querySelector('[data-nfc-write-start]');
  var status = root.querySelector('[data-nfc-status]');
  var pulse = root.querySelector('[data-nfc-pulse]');

  btn.addEventListener('click', function () {
    var writer = new window.NDEFReader();
    btn.disabled = true;
    pulse.classList.add('active');
    status.textContent = 'Acerca la etiqueta a la parte trasera del teléfono…';
    writer.write({ records: [{ recordType: 'url', data: root.dataset.url }] }, { overwrite: true }).then(function () {
      pulse.classList.remove('active');
      status.textContent = '¡Etiqueta grabada! Ya puedes usarla para identificar al cliente.';
      btn.textContent = 'Grabar otra vez';
      btn.disabled = false;
      if (navigator.vibrate) navigator.vibrate(80);
    }).catch(function (err) {
      pulse.classList.remove('active');
      btn.disabled = false;
      status.textContent = err && err.name === 'NotAllowedError'
        ? 'Se necesita permiso para usar NFC. Acéptalo y revisa que el NFC del teléfono esté activado.'
        : 'No se pudo grabar. Mantén la etiqueta quieta junto al teléfono e inténtalo de nuevo. Si está bloqueada (solo lectura), usa otra.';
    });
  });
})();
