'use strict';

const express = require('express');
const QRCode = require('qrcode');
const loyalty = require('../services/loyalty');
const { cardUrl } = require('../services/tokens');
const { requireCustomer } = require('../middleware/auth');

const router = express.Router();

router.use('/mi-tarjeta', requireCustomer);

router.get('/mi-tarjeta', async (req, res, next) => {
  try {
    const card = await loyalty.getCard(req.customer.id);
    // El QR solo contiene un enlace con un identificador aleatorio; nada personal.
    const qrSvg = await QRCode.toString(cardUrl(card.qr_token), {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: { dark: '#10324f', light: '#ffffff' },
    });
    res.render('customer/card', {
      title: 'Mi tarjeta',
      card,
      reward: await loyalty.getAvailableReward(card.id),
      stats: await loyalty.stats(req.customer.id),
      qrSvg,
    });
  } catch (err) {
    next(err);
  }
});

// Estado mínimo para que la tarjeta se actualice sola mientras el cliente la muestra.
router.get('/mi-tarjeta/estado', async (req, res) => {
  const card = await loyalty.getCard(req.customer.id);
  res.set('Cache-Control', 'no-store').json({ stamps: card.stamps, status: card.status, cycle: card.cycle });
});

router.get('/mi-tarjeta/historial', async (req, res) => {
  res.render('customer/history', {
    title: 'Mi historial',
    events: await loyalty.history(req.customer.id, { limit: 100 }),
    rewards: await loyalty.rewardsFor(req.customer.id),
    stats: await loyalty.stats(req.customer.id),
  });
});

module.exports = router;
