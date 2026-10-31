'use strict';

const crypto = require('node:crypto');
const express = require('express');
const QRCode = require('qrcode');
const config = require('../config');
const customers = require('../services/customers');
const loyalty = require('../services/loyalty');
const nfc = require('../services/nfc');
const audit = require('../services/audit');
const { requireBusiness } = require('../middleware/auth');
const loadCustomer = require('../middleware/load-customer');

const router = express.Router();

router.use('/panel', requireBusiness);
router.param('id', loadCustomer);

const signupUrl = () => `${config.baseUrl}/registro`;

function shareText() {
  return `Obtén tu tarjeta de lealtad de ${config.businessName}: junta 10 sellos y recibe ${config.rewardText}. Regístrate aquí: ${signupUrl()}`;
}

router.get('/panel', async (req, res) => {
  res.render('business/dashboard', {
    title: 'Panel',
    summary: await loyalty.dashboardSummary(),
    pendingRewards: await loyalty.customersWithReward(),
    activity: await loyalty.recentActivity(12),
    signupUrl: signupUrl(),
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(shareText())}`,
  });
});

router.get('/panel/compartir', async (req, res, next) => {
  try {
    const qrSvg = await QRCode.toString(signupUrl(), { type: 'svg', margin: 2, color: { dark: '#10324f', light: '#ffffff' } });
    res.render('business/share', { title: 'Compartir registro', signupUrl: signupUrl(), qrSvg, shareText: shareText() });
  } catch (err) {
    next(err);
  }
});

router.get('/panel/clientes', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.render('business/customers', { title: 'Clientes', q, results: await customers.search(q) });
});

router.get('/panel/escanear', (req, res) => {
  res.render('business/scan', { title: 'Identificar cliente', error: req.query.error || null });
});

async function renderCustomer(req, res, { tempPassword = null } = {}) {
  const id = req.target.id;
  res.render('business/customer', {
    title: req.target.name,
    reward: await loyalty.getAvailableReward(req.card.id),
    stats: await loyalty.stats(id),
    events: await loyalty.history(id, { limit: 50 }),
    rewards: await loyalty.rewardsFor(id),
    activeTags: await nfc.countActive(id),
    adminLog: await audit.forCustomer(id, 20),
    tempPassword,
  });
}

router.get('/panel/cliente/:id', (req, res) => renderCustomer(req, res));

// El cliente olvidó su contraseña: se genera una temporal que el negocio le dicta.
router.post('/panel/cliente/:id/contrasena', async (req, res, next) => {
  try {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const temp = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
    await customers.setPassword(req.target.id, temp);
    await audit.log({ userId: req.businessUser.id, customerId: req.target.id, action: 'customer_password_reset' });
    res.set('Cache-Control', 'no-store');
    await renderCustomer(req, res, { tempPassword: temp });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
