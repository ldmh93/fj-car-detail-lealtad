'use strict';

const config = require('../config');
const businessUsers = require('../services/business-users');
const customers = require('../services/customers');

const BUSINESS_MAX_MS = config.businessSessionHours * 60 * 60 * 1000;
const CUSTOMER_MAX_MS = config.customerSessionDays * 24 * 60 * 60 * 1000;

/** Carga el usuario del negocio y/o el cliente de la sesión en req y res.locals. */
async function loadUsers(req, res, next) {
  const s = req.session;
  if (s.businessUserId) {
    const user = await businessUsers.findById(s.businessUserId);
    const expired = !s.businessLoginAt || Date.now() - s.businessLoginAt > BUSINESS_MAX_MS;
    if (user && user.status === 'active' && !expired) {
      req.businessUser = user;
    } else {
      delete s.businessUserId;
      delete s.businessLoginAt;
      if (expired) s.businessExpired = true;
    }
  }
  if (s.customerId) {
    const customer = await customers.findById(s.customerId);
    if (customer && customer.status === 'active') req.customer = customer;
    else delete s.customerId;
  }
  res.locals.businessUser = req.businessUser || null;
  res.locals.customer = req.customer || null;
  next();
}

/**
 * Inicia sesión regenerando el identificador de sesión (evita fijación de sesión).
 * Conserva la otra identidad si existe (p. ej. el dueño probando como cliente en su teléfono).
 */
function login(req, { businessUserId, customerId }) {
  const keep = {
    businessUserId: req.session.businessUserId,
    businessLoginAt: req.session.businessLoginAt,
    customerId: req.session.customerId,
  };
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      const s = req.session;
      if (businessUserId) {
        s.businessUserId = businessUserId;
        s.businessLoginAt = Date.now();
      } else if (keep.businessUserId) {
        s.businessUserId = keep.businessUserId;
        s.businessLoginAt = keep.businessLoginAt;
      }
      s.customerId = customerId || keep.customerId;
      s.cookie.maxAge = s.customerId ? CUSTOMER_MAX_MS : BUSINESS_MAX_MS;
      s.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

function logout(req, which) {
  return new Promise((resolve) => {
    if (which === 'business') {
      delete req.session.businessUserId;
      delete req.session.businessLoginAt;
    } else {
      delete req.session.customerId;
    }
    if (!req.session.businessUserId && !req.session.customerId) return req.session.destroy(() => resolve());
    req.session.save(() => resolve());
  });
}

function safeNext(value, fallback) {
  return typeof value === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) ? value : fallback;
}

function wantsJson(req) {
  return req.xhr || (req.get('accept') || '').includes('application/json');
}

function requireBusiness(req, res, next) {
  if (req.businessUser) return next();
  if (wantsJson(req)) return res.status(401).json({ error: 'session_expired' });
  const motivo = req.session.businessExpired ? '&motivo=vencida' : '';
  delete req.session.businessExpired;
  res.redirect(`/negocio/entrar?next=${encodeURIComponent(req.originalUrl)}${motivo}`);
}

function requireOwner(req, res, next) {
  if (req.businessUser && req.businessUser.role === 'owner') return next();
  res.status(403).render('error', {
    title: 'Acción no permitida',
    message: 'Solo el dueño del negocio puede hacer esta acción.',
    back: '/panel',
  });
}

function requireCustomer(req, res, next) {
  if (req.customer) return next();
  if (wantsJson(req)) return res.status(401).json({ error: 'session_expired' });
  res.redirect(`/entrar?motivo=sesion&next=${encodeURIComponent(req.originalUrl)}`);
}

module.exports = { loadUsers, login, logout, safeNext, requireBusiness, requireOwner, requireCustomer };
