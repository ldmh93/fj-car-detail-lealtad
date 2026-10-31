'use strict';

const { rateLimit } = require('express-rate-limit');

function limiter({ windowMinutes, limit, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method !== 'POST',
    handler: (req, res) =>
      res.status(429).render('error', { title: 'Demasiados intentos', message, back: req.originalUrl }),
  });
}

module.exports = {
  loginLimiter: limiter({
    windowMinutes: 15,
    limit: 10,
    message: 'Hubo demasiados intentos de inicio de sesión. Espera 15 minutos e inténtalo de nuevo.',
  }),
  signupLimiter: limiter({
    windowMinutes: 60,
    limit: 20,
    message: 'Se crearon demasiadas cuentas desde esta conexión. Inténtalo más tarde.',
  }),
};
