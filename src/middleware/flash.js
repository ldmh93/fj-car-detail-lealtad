'use strict';

// Mensajes de una sola vez (éxito, error, aviso) que sobreviven a una redirección.
function flash(req, res, next) {
  res.locals.flash = req.session.flash || [];
  delete req.session.flash;
  req.flash = (type, message) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, message });
  };
  next();
}

module.exports = flash;
