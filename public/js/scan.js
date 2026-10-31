// Escaneo de QR con la cámara y lectura de etiquetas NFC (Web NFC) en el panel.
// El código leído se envía al servidor, que lo valida; nunca agrega sellos por sí solo.
(function () {
  'use strict';

  function identify(text) {
    window.location.href = '/panel/identificar?codigo=' + encodeURIComponent(text);
  }

  // ---------- QR ----------
  var box = document.querySelector('[data-scanner]');
  var video = box && box.querySelector('video');
  var statusEl = document.querySelector('[data-scanner-status]');
  var startBtn = document.querySelector('[data-scan-start]');
  var stopBtn = document.querySelector('[data-scan-stop]');
  var unavailable = document.querySelector('[data-camera-unavailable]');
  var stream = null;
  var running = false;
  var detector = null;
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  function showUnavailable(msg) {
    unavailable.textContent = msg;
    unavailable.hidden = false;
    startBtn.hidden = true;
  }

  var cameraPossible = window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (!cameraPossible) {
    showUnavailable(
      window.isSecureContext
        ? 'Este navegador no permite usar la cámara. Busca al cliente por nombre o teléfono abajo.'
        : 'La cámara solo funciona cuando la app se abre con https://. Mientras tanto, busca al cliente por nombre o teléfono abajo.'
    );
  }

  function setupDetector() {
    if (!('BarcodeDetector' in window)) return Promise.resolve(null);
    return window.BarcodeDetector.getSupportedFormats()
      .then(function (formats) { return formats.indexOf('qr_code') >= 0 ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null; })
      .catch(function () { return null; });
  }

  function stop() {
    running = false;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    box.hidden = true;
    stopBtn.hidden = true;
    startBtn.hidden = false;
  }

  function found(text) {
    statusEl.textContent = 'Código leído. Abriendo…';
    if (navigator.vibrate) navigator.vibrate(80);
    stop();
    identify(text);
  }

  function tick() {
    if (!running) return;
    if (video.readyState < 2) return requestAnimationFrame(tick);
    if (detector) {
      detector.detect(video).then(function (codes) {
        if (codes.length) return found(codes[0].rawValue);
        setTimeout(tick, 150);
      }, function () { detector = null; setTimeout(tick, 150); });
      return;
    }
    if (window.jsQR) {
      var w = video.videoWidth, h = video.videoHeight;
      var scale = Math.min(1, 640 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) return found(code.data);
    }
    setTimeout(tick, 120);
  }

  if (cameraPossible) {
    startBtn.addEventListener('click', function () {
      startBtn.hidden = true;
      unavailable.hidden = true;
      setupDetector().then(function (d) {
        detector = d;
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      }).then(function (s) {
        stream = s;
        video.srcObject = s;
        box.hidden = false;
        stopBtn.hidden = false;
        statusEl.textContent = 'Apunta al código del cliente…';
        return video.play();
      }).then(function () {
        running = true;
        tick();
      }).catch(function (err) {
        stop();
        var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        unavailable.textContent = denied
          ? 'No se dio permiso para usar la cámara. Actívalo en la configuración del navegador o busca al cliente abajo.'
          : 'No se pudo abrir la cámara en este dispositivo. Busca al cliente por nombre o teléfono abajo.';
        unavailable.hidden = false;
      });
    });
    stopBtn.addEventListener('click', stop);
    document.addEventListener('visibilitychange', function () { if (document.hidden && running) stop(); });
  }

  // ---------- NFC ----------
  var nfcSupported = document.querySelector('[data-nfc-supported]');
  var nfcUnsupported = document.querySelector('[data-nfc-unsupported]');
  var nfcStatus = document.querySelector('[data-nfc-status]');
  var nfcPulse = document.querySelector('[data-nfc-pulse]');
  var nfcBtn = document.querySelector('[data-nfc-start]');

  if (!('NDEFReader' in window) || !window.isSecureContext) {
    nfcUnsupported.hidden = false;
    return;
  }
  nfcSupported.hidden = false;

  function recordText(record) {
    try {
      var decoder = new TextDecoder(record.encoding || 'utf-8');
      return decoder.decode(record.data);
    } catch (e) {
      return '';
    }
  }

  nfcBtn.addEventListener('click', function () {
    var reader = new window.NDEFReader();
    var controller = new AbortController();
    reader.scan({ signal: controller.signal }).then(function () {
      nfcBtn.hidden = true;
      nfcPulse.classList.add('active');
      nfcStatus.textContent = 'Acerca la etiqueta a la parte trasera del teléfono…';
      reader.onreadingerror = function () {
        nfcStatus.textContent = 'No se pudo leer la etiqueta. Sepárala y vuelve a acercarla.';
      };
      reader.onreading = function (event) {
        var text = '';
        event.message.records.forEach(function (r) {
          if (!text && (r.recordType === 'url' || r.recordType === 'text' || r.recordType === 'absolute-url')) text = recordText(r);
        });
        if (!text) {
          nfcStatus.textContent = 'Esta etiqueta no está grabada para este negocio. Grábala desde la ficha del cliente.';
          return;
        }
        controller.abort();
        nfcStatus.textContent = 'Etiqueta leída. Abriendo…';
        if (navigator.vibrate) navigator.vibrate(80);
        identify(text);
      };
    }).catch(function (err) {
      nfcPulse.classList.remove('active');
      nfcBtn.hidden = false;
      nfcStatus.textContent = err && err.name === 'NotAllowedError'
        ? 'Se necesita permiso para usar NFC. Acéptalo cuando el navegador lo pida y revisa que el NFC del teléfono esté activado.'
        : 'No se pudo iniciar la lectura. Revisa que el NFC del teléfono esté activado.';
    });
  });
})();
