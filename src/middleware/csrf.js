'use strict';

const crypto = require('node:crypto');

// Protección CSRF con token por sesión: todos los formularios POST incluyen
// un campo oculto _csrf (o el encabezado X-CSRF-Token en peticiones fetch).
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('base64url');
  res.locals.csrfToken = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const a = Buffer.from(String(sent));
  const b = Buffer.from(req.session.csrf);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();

  // Casi siempre ocurre porque la sesión venció o el formulario se abrió hace mucho.
  res.status(403).render('error', {
    title: 'La página expiró',
    message: 'Tu sesión venció o la página estuvo abierta mucho tiempo. Vuelve a intentarlo.',
    back: req.get('referer') && req.get('referer').startsWith(`${req.protocol}://${req.get('host')}`) ? req.get('referer') : '/',
  });
}

module.exports = csrf;
