'use strict';

// Reglas del programa de lealtad. El servidor es la única autoridad sobre
// sellos y recompensas: nunca se usa un número de sellos enviado por el navegador.
//
// Ciclo de una tarjeta:
//   0..9 sellos (status 'active') → el décimo sello emite una recompensa
//   'available' y la tarjeta queda en 'reward_pending' con 10 sellos.
//   Mientras haya recompensa pendiente no se agregan sellos.
//   Al canjear, la recompensa pasa a 'redeemed' y la tarjeta vuelve a 0 sellos
//   en el siguiente ciclo.

const { db, tx, now } = require('../db');
const config = require('../config');
const { startOfTodayIso } = require('./format');

const MAX = config.stampsPerCard;

function getCard(customerId, conn = db) {
  return conn.get('SELECT * FROM loyalty_cards WHERE customer_id = ?', customerId);
}

function getAvailableReward(cardId, conn = db) {
  return conn.get("SELECT * FROM rewards WHERE card_id = ? AND status = 'available'", cardId);
}

function insertEvent(t, card, { type, delta = 0, stampsAfter, reason = null, source = null, userId = null, requestId = null }) {
  return t.run(
    `INSERT INTO stamp_events (customer_id, card_id, type, delta, stamps_after, cycle, reason, source, business_user_id, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    card.customer_id, card.id, type, delta, stampsAfter, card.cycle, reason, source, userId, requestId, now()
  );
}

async function requestAlreadyProcessed(t, requestId) {
  return Boolean(requestId && (await t.get('SELECT 1 AS ok FROM stamp_events WHERE request_id = ?', requestId)));
}

function setStamps(t, card, stamps, status) {
  return t.run('UPDATE loyalty_cards SET stamps = ?, status = ?, updated_at = ? WHERE id = ?', stamps, status, now(), card.id);
}

async function issueReward(t, card, userId) {
  await t.run(
    `INSERT INTO rewards (card_id, customer_id, cycle, status, issued_at, issued_by) VALUES (?, ?, ?, 'available', ?, ?)`,
    card.id, card.customer_id, card.cycle, now(), userId
  );
  await setStamps(t, card, MAX, 'reward_pending');
  await insertEvent(t, card, { type: 'reward_issued', stampsAfter: MAX, userId });
}

/**
 * Agrega un sello por una visita confirmada.
 * - requestId evita duplicados por doble clic o reenvío del formulario.
 * - expectedStamps evita sumar dos veces si la tarjeta cambió mientras se confirmaba.
 */
function addStamp(customerId, { userId, requestId, expectedStamps, source }) {
  return tx(async (t) => {
    const card = await getCard(customerId, t);
    if (!card) return { result: 'not_found' };
    if (await requestAlreadyProcessed(t, requestId)) return { result: 'duplicate', card };
    if (card.status === 'reward_pending') return { result: 'reward_pending', card };
    if (Number.isInteger(expectedStamps) && expectedStamps !== card.stamps) return { result: 'stale', card };

    const stamps = card.stamps + 1;
    await setStamps(t, card, stamps, 'active');
    await insertEvent(t, card, { type: 'stamp', delta: 1, stampsAfter: stamps, source, userId, requestId });

    const rewardIssued = stamps >= MAX;
    if (rewardIssued) await issueReward(t, card, userId);
    return { result: 'ok', card: await getCard(customerId, t), rewardIssued };
  });
}

/** Marca como canjeada la recompensa disponible. Una recompensa solo se canjea una vez. */
function redeemReward(customerId, { userId, requestId, rewardId }) {
  return tx(async (t) => {
    const card = await getCard(customerId, t);
    if (!card) return { result: 'not_found' };
    if (await requestAlreadyProcessed(t, requestId)) return { result: 'duplicate', card };
    const reward = await getAvailableReward(card.id, t);
    if (!reward || (rewardId && reward.id !== rewardId)) return { result: 'no_reward', card };

    const { changes } = await t.run(
      "UPDATE rewards SET status = 'redeemed', redeemed_at = ?, redeemed_by = ? WHERE id = ? AND status = 'available'",
      now(), userId, reward.id
    );
    if (changes !== 1) return { result: 'no_reward', card };

    await insertEvent(t, card, { type: 'reward_redeemed', delta: -card.stamps, stampsAfter: 0, userId, requestId });
    await t.run("UPDATE loyalty_cards SET stamps = 0, status = 'active', cycle = cycle + 1, updated_at = ? WHERE id = ?", now(), card.id);
    return { result: 'ok', card: await getCard(customerId, t), reward };
  });
}

/**
 * Corrección manual (solo dueño, con motivo). Si la corrección deja la tarjeta
 * debajo de 10 con una recompensa pendiente, esa recompensa se anula; si llega
 * a 10, se emite la recompensa como en una visita normal.
 */
function correctStamps(customerId, { userId, requestId, delta, reason }) {
  return tx(async (t) => {
    const card = await getCard(customerId, t);
    if (!card) return { result: 'not_found' };
    if (await requestAlreadyProcessed(t, requestId)) return { result: 'duplicate', card };
    const stamps = card.stamps + delta;
    if (delta === 0 || stamps < 0 || stamps > MAX) return { result: 'out_of_range', card };

    if (card.status === 'reward_pending' && stamps < MAX) {
      const reward = await getAvailableReward(card.id, t);
      if (reward) {
        await t.run("UPDATE rewards SET status = 'voided' WHERE id = ?", reward.id);
        await insertEvent(t, card, { type: 'reward_voided', stampsAfter: card.stamps, reason, userId });
      }
    }
    await setStamps(t, card, stamps, 'active');
    await insertEvent(t, card, { type: 'correction', delta, stampsAfter: stamps, reason, userId, requestId });
    const rewardIssued = stamps === MAX;
    if (rewardIssued) await issueReward(t, card, userId);
    return { result: 'ok', card: await getCard(customerId, t), rewardIssued };
  });
}

function history(customerId, { limit = 50 } = {}) {
  return db.all(
    `SELECT e.*, u.display_name AS user_name
     FROM stamp_events e LEFT JOIN business_users u ON u.id = e.business_user_id
     WHERE e.customer_id = ? ORDER BY e.id DESC LIMIT ?`,
    customerId, limit
  );
}

function rewardsFor(customerId) {
  return db.all(
    `SELECT r.*, u.display_name AS redeemed_by_name FROM rewards r
     LEFT JOIN business_users u ON u.id = r.redeemed_by
     WHERE r.customer_id = ? ORDER BY r.id DESC`,
    customerId
  );
}

function stats(customerId) {
  return db.get(
    `SELECT
       (SELECT COUNT(*) FROM stamp_events WHERE customer_id = ? AND type = 'stamp') AS visits,
       (SELECT COUNT(*) FROM rewards WHERE customer_id = ? AND status = 'redeemed') AS redeemed,
       (SELECT MAX(created_at) FROM stamp_events WHERE customer_id = ? AND type = 'stamp') AS last_visit`,
    customerId, customerId, customerId
  );
}

function dashboardSummary() {
  const today = startOfTodayIso();
  return db.get(
    `SELECT
       (SELECT COUNT(*) FROM stamp_events WHERE type = 'stamp' AND created_at >= ?) AS stamps_today,
       (SELECT COUNT(*) FROM rewards WHERE status = 'available') AS rewards_available,
       (SELECT COUNT(*) FROM rewards WHERE status = 'redeemed' AND redeemed_at >= ?) AS redeemed_today,
       (SELECT COUNT(*) FROM customers) AS customers_total`,
    today, today
  );
}

function recentActivity(limit = 15) {
  return db.all(
    `SELECT e.*, c.name AS customer_name, u.display_name AS user_name
     FROM stamp_events e
     JOIN customers c ON c.id = e.customer_id
     LEFT JOIN business_users u ON u.id = e.business_user_id
     ORDER BY e.id DESC LIMIT ?`,
    limit
  );
}

function customersWithReward() {
  return db.all(
    `SELECT c.id, c.name, c.phone, r.issued_at FROM rewards r JOIN customers c ON c.id = r.customer_id
     WHERE r.status = 'available' ORDER BY r.issued_at`
  );
}

module.exports = {
  MAX,
  getCard,
  getAvailableReward,
  addStamp,
  redeemReward,
  correctStamps,
  history,
  rewardsFor,
  stats,
  dashboardSummary,
  recentActivity,
  customersWithReward,
};
