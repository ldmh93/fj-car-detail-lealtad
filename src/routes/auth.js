'use strict';

const express = require('express');
const v = require('../services/validation');
const customers = require('../services/customers');
const businessUsers = require('../services/business-users');
const audit = require('../services/audit');
const { verifyPassword, dummyVerify } = require('../services/passwords');
const { login, logout, safeNext } = require('../middleware/auth');
const { loginLimiter, signupLimiter } = require('../middleware/rate-limit');

const router = express.Router();

// ---------- Registro de clientes (enlace que comparte el negocio) ----------

router.get('/registro', (req, res) => {
  if (req.customer) return res.redirect('/mi-tarjeta');
  res.render('customer/register', { title: 'Crea tu tarjeta', values: {}, errors: {} });
});

router.post('/registro', signupLimiter, async (req, res, next) => {
  try {
    const name = v.name(req.body.name);
    const phone = v.phone(req.body.phone);
    const password = v.password(req.body.password);
    const errors = {};
    if (name.error) errors.name = name.error;
    if (phone.error) errors.phone = phone.error;
    if (password.error) errors.password = password.error;
    else if (req.body.password !== req.body.password2) errors.password2 = 'Las contraseñas no coinciden.';
    const values = { name: req.body.name, phone: req.body.phone };
    if (Object.keys(errors).length) {
      return res.status(422).render('customer/register', { title: 'Crea tu tarjeta', values, errors });
    }
    const result = await customers.create({ name: name.value, phone: phone.value, password: password.value });
    if (result.error === 'phone_taken') {
      errors.phone = 'Ya existe una cuenta con este teléfono. Inicia sesión o pide ayuda en el negocio.';
      return res.status(409).render('customer/register', { title: 'Crea tu tarjeta', values, errors, phoneTaken: true });
    }
    await login(req, { customerId: result.customer.id });
    req.flash('success', '¡Listo! Tu tarjeta está creada. Muéstrala en cada visita para recibir tu sello.');
    res.redirect('/mi-tarjeta');
  } catch (err) {
    next(err);
  }
});

// ---------- Inicio de sesión de clientes ----------

router.get('/entrar', (req, res) => {
  if (req.customer) return res.redirect(safeNext(req.query.next, '/mi-tarjeta'));
  res.render('customer/login', {
    title: 'Entrar a mi tarjeta',
    values: {},
    error: null,
    next: safeNext(req.query.next, ''),
    sessionEnded: req.query.motivo === 'sesion',
  });
});

router.post('/entrar', loginLimiter, async (req, res, next) => {
  try {
    const phone = v.phone(req.body.phone);
    const customer = phone.value ? await customers.findByPhone(phone.value) : null;
    const ok = customer
      ? customer.status === 'active' && (await verifyPassword(String(req.body.password || ''), customer.password_hash))
      : await dummyVerify(req.body.password);
    if (!ok) {
      return res.status(401).render('customer/login', {
        title: 'Entrar a mi tarjeta',
        values: { phone: req.body.phone },
        error: 'Teléfono o contraseña incorrectos.',
        next: safeNext(req.body.next, ''),
        sessionEnded: false,
      });
    }
    await login(req, { customerId: customer.id });
    res.redirect(safeNext(req.body.next, '/mi-tarjeta'));
  } catch (err) {
    next(err);
  }
});

router.post('/salir', async (req, res) => {
  await logout(req, 'customer');
  res.redirect('/entrar');
});

// ---------- Inicio de sesión del negocio ----------

router.get('/negocio/entrar', async (req, res) => {
  if (req.businessUser) return res.redirect(safeNext(req.query.next, '/panel'));
  res.render('business/login', {
    title: 'Acceso del negocio',
    values: {},
    error: null,
    next: safeNext(req.query.next, ''),
    expired: req.query.motivo === 'vencida',
    noUsers: (await businessUsers.count()) === 0,
  });
});

router.post('/negocio/entrar', loginLimiter, async (req, res, next) => {
  try {
    const username = v.username(req.body.username);
    const user = username.value ? await businessUsers.findByUsername(username.value) : null;
    const ok = user
      ? user.status === 'active' && (await verifyPassword(String(req.body.password || ''), user.password_hash))
      : await dummyVerify(req.body.password);
    if (!ok) {
      return res.status(401).render('business/login', {
        title: 'Acceso del negocio',
        values: { username: req.body.username },
        error: 'Usuario o contraseña incorrectos.',
        next: safeNext(req.body.next, ''),
        expired: false,
        noUsers: false,
      });
    }
    await login(req, { businessUserId: user.id });
    await businessUsers.touchLogin(user.id);
    await audit.log({ userId: user.id, action: 'business_login' });
    res.redirect(safeNext(req.body.next, '/panel'));
  } catch (err) {
    next(err);
  }
});

router.post('/negocio/salir', async (req, res) => {
  await logout(req, 'business');
  res.redirect('/negocio/entrar');
});

module.exports = router;
