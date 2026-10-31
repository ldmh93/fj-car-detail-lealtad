'use strict';

const express = require('express');
const v = require('../services/validation');
const customers = require('../services/customers');
const loyalty = require('../services/loyalty');
const nfc = require('../services/nfc');
const audit = require('../services/audit');
const { newToken, isToken, nfcUrl, parseScannedCode } = require('../services/tokens');
const { verifyPassword } = require('../services/passwords');
const { requireBusiness, requireOwner } = require('../middleware/auth');
const loadCustomer = require('../middleware/load-customer');

const router = express.Router();
router.param('id', loadCustomer);

const SOURCES = ['qr', 'nfc', 'manual'];

// ---------- Enlaces abiertos desde el QR (/c/...) o la etiqueta NFC (/t/...) ----------
// Identifican la tarjeta, pero nunca agregan sellos por sí solos.

function openFromToken(kind) {
  return async (req, res) => {
    const token = req.params.token;
    const customer = isToken(token)
      ? kind === 'qr'
        ? await customers.findByCardToken(token)
        : await nfc.findCustomerByToken(token)
      : null;

    if (req.businessUser) {
      if (!customer) {
        return res.status(404).render('error', {
          title: 'Código no válido',
          message: 'Este código no corresponde a ninguna tarjeta activa. Puede que haya sido reemplazado. Busca al cliente por nombre o teléfono.',
          back: '/panel/clientes',
        });
      }
      return res.redirect(`/panel/cliente/${customer.id}/sello?via=${kind}`);
    }
    if (customer && req.customer && req.customer.id === customer.id) return res.redirect('/mi-tarjeta');
    // A cualquier otra persona no se le muestra ningún dato del cliente.
    res.render('scan-info', { title: 'Tarjeta de lealtad', next: req.originalUrl, valid: Boolean(customer) });
  };
}

router.get('/c/:token', openFromToken('qr'));
router.get('/t/:token', openFromToken('nfc'));

router.use('/panel', requireBusiness);

// Recibe el texto leído por la cámara o el lector NFC del panel.
router.get('/panel/identificar', async (req, res) => {
  const parsed = parseScannedCode(req.query.codigo);
  const customer = parsed
    ? parsed.kind === 'qr'
      ? await customers.findByCardToken(parsed.token)
      : await nfc.findCustomerByToken(parsed.token)
    : null;
  if (!customer) {
    return res.redirect('/panel/escanear?error=' + (parsed ? 'desconocido' : 'formato'));
  }
  res.redirect(`/panel/cliente/${customer.id}/sello?via=${parsed.kind}`);
});

// ---------- Agregar sello (siempre con confirmación) ----------

router.get('/panel/cliente/:id/sello', async (req, res) => {
  res.set('Cache-Control', 'no-store').render('business/confirm-stamp', {
    title: 'Confirmar visita',
    via: SOURCES.includes(req.query.via) ? req.query.via : 'manual',
    requestId: newToken(),
    reward: await loyalty.getAvailableReward(req.card.id),
  });
});

router.post('/panel/cliente/:id/sello', async (req, res) => {
  const requestId = v.requestId(req.body.request_id);
  const expected = v.int(req.body.expected_stamps, { min: 0, max: loyalty.MAX });
  if (requestId.error || expected.error) {
    req.flash('error', 'No se pudo registrar el sello. Vuelve a intentarlo.');
    return res.redirect(`/panel/cliente/${req.target.id}/sello`);
  }
  const outcome = await loyalty.addStamp(req.target.id, {
    userId: req.businessUser.id,
    requestId: requestId.value,
    expectedStamps: expected.value,
    source: SOURCES.includes(req.body.via) ? req.body.via : 'manual',
  });
  const name = req.target.name;
  switch (outcome.result) {
    case 'ok':
      if (outcome.rewardIssued) {
        req.flash('reward', `¡${name} completó su tarjeta! Ya tiene una recompensa disponible.`);
      } else {
        req.flash('success', `Sello agregado a ${name}. Lleva ${outcome.card.stamps} de ${loyalty.MAX}.`);
      }
      break;
    case 'duplicate':
      req.flash('info', 'Este sello ya se había registrado. No se agregó otro.');
      break;
    case 'stale':
      req.flash('error', 'La tarjeta cambió mientras confirmabas (quizá alguien más registró la visita). Revisa el historial antes de agregar otro sello.');
      break;
    case 'reward_pending':
      req.flash('info', 'Este cliente tiene una recompensa pendiente. Canjéala para iniciar una nueva tarjeta.');
      break;
  }
  res.redirect(`/panel/cliente/${req.target.id}`);
});

// ---------- Canjear recompensa ----------

router.get('/panel/cliente/:id/canjear', async (req, res) => {
  const reward = await loyalty.getAvailableReward(req.card.id);
  if (!reward) {
    req.flash('info', 'Este cliente no tiene una recompensa disponible.');
    return res.redirect(`/panel/cliente/${req.target.id}`);
  }
  res.set('Cache-Control', 'no-store').render('business/redeem', { title: 'Canjear recompensa', reward, requestId: newToken() });
});

router.post('/panel/cliente/:id/canjear', async (req, res) => {
  const requestId = v.requestId(req.body.request_id);
  const rewardId = v.int(req.body.reward_id, { min: 1, max: Number.MAX_SAFE_INTEGER });
  if (requestId.error || rewardId.error) {
    req.flash('error', 'No se pudo canjear. Vuelve a intentarlo.');
    return res.redirect(`/panel/cliente/${req.target.id}`);
  }
  const outcome = await loyalty.redeemReward(req.target.id, {
    userId: req.businessUser.id,
    requestId: requestId.value,
    rewardId: rewardId.value,
  });
  if (outcome.result === 'ok') req.flash('success', `Recompensa canjeada. ${req.target.name} empieza una tarjeta nueva.`);
  else req.flash('info', 'Esta recompensa ya estaba canjeada. No se hizo ningún cambio.');
  res.redirect(`/panel/cliente/${req.target.id}`);
});

// ---------- Corrección de sellos (solo dueño, con motivo y contraseña) ----------

function renderCorrection(res, { errors = {}, values = {} } = {}) {
  res.set('Cache-Control', 'no-store').render('business/correction', {
    title: 'Corregir sellos',
    requestId: newToken(),
    errors,
    values,
  });
}

router.get('/panel/cliente/:id/correccion', requireOwner, (req, res) => renderCorrection(res));

router.post('/panel/cliente/:id/correccion', requireOwner, async (req, res, next) => {
  try {
    const card = req.card;
    const delta = v.int(req.body.delta, { min: -card.stamps, max: loyalty.MAX - card.stamps });
    const reason = v.reason(req.body.reason);
    const requestId = v.requestId(req.body.request_id);
    const errors = {};
    if (delta.error || delta.value === 0) errors.delta = 'Elige cuántos sellos sumar o restar.';
    if (reason.error) errors.reason = reason.error;
    if (requestId.error) errors.form = requestId.error;
    if (!(await verifyPassword(String(req.body.password || ''), req.businessUser.password_hash))) {
      errors.password = 'Contraseña incorrecta.';
    }
    if (Object.keys(errors).length) {
      res.status(422);
      return renderCorrection(res, { errors, values: { delta: req.body.delta, reason: req.body.reason } });
    }
    const outcome = await loyalty.correctStamps(req.target.id, {
      userId: req.businessUser.id,
      requestId: requestId.value,
      delta: delta.value,
      reason: reason.value,
    });
    if (outcome.result === 'ok') {
      req.flash('success', `Corrección guardada. La tarjeta queda con ${outcome.card.stamps} de ${loyalty.MAX} sellos.`);
      if (outcome.rewardIssued) req.flash('reward', 'Con esta corrección se completó la tarjeta: hay una recompensa disponible.');
    } else if (outcome.result === 'duplicate') {
      req.flash('info', 'Esta corrección ya se había guardado.');
    } else {
      req.flash('error', 'La corrección no es válida para el número actual de sellos.');
    }
    res.redirect(`/panel/cliente/${req.target.id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- QR: regenerar si el cliente cree que alguien más lo tiene ----------

router.post('/panel/cliente/:id/qr/regenerar', async (req, res) => {
  await customers.regenerateQrToken(req.target.id);
  await audit.log({ userId: req.businessUser.id, customerId: req.target.id, action: 'qr_regenerated' });
  req.flash('success', 'Se generó un QR nuevo. El anterior ya no funciona; el cliente verá el nuevo al abrir su tarjeta.');
  res.redirect(`/panel/cliente/${req.target.id}`);
});

// ---------- NFC ----------

router.get('/panel/cliente/:id/nfc', async (req, res) => {
  res.render('business/nfc', { title: 'Etiquetas NFC', tags: await nfc.listForCustomer(req.target.id), nfcUrl });
});

router.post('/panel/cliente/:id/nfc', async (req, res) => {
  const label = v.label(req.body.label);
  const tag = await nfc.create(req.target.id, { label: label.value, userId: req.businessUser.id });
  await audit.log({ userId: req.businessUser.id, customerId: req.target.id, action: 'nfc_linked', details: `Etiqueta #${tag.id}` });
  res.redirect(`/panel/cliente/${req.target.id}/nfc/${tag.id}/grabar`);
});

async function loadTag(req, res, next) {
  const tag = /^\d{1,12}$/.test(req.params.tagId) ? await nfc.findById(req.target.id, Number(req.params.tagId)) : null;
  if (!tag) {
    req.flash('error', 'No encontramos esa etiqueta.');
    return res.redirect(`/panel/cliente/${req.target.id}/nfc`);
  }
  req.tag = tag;
  next();
}

router.get('/panel/cliente/:id/nfc/:tagId/grabar', loadTag, (req, res) => {
  if (req.tag.status !== 'active') {
    req.flash('error', 'Esa etiqueta fue revocada. Vincula una nueva.');
    return res.redirect(`/panel/cliente/${req.target.id}/nfc`);
  }
  res.set('Cache-Control', 'no-store').render('business/nfc-write', {
    title: 'Grabar etiqueta NFC',
    tag: req.tag,
    url: nfcUrl(req.tag.token),
  });
});

router.post('/panel/cliente/:id/nfc/:tagId/revocar', loadTag, async (req, res) => {
  if (await nfc.revoke(req.target.id, req.tag.id, req.businessUser.id)) {
    await audit.log({ userId: req.businessUser.id, customerId: req.target.id, action: 'nfc_revoked', details: `Etiqueta #${req.tag.id}` });
    req.flash('success', 'Etiqueta revocada. Si alguien la acerca, ya no identificará a este cliente.');
  }
  res.redirect(`/panel/cliente/${req.target.id}/nfc`);
});

module.exports = router;
