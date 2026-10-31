'use strict';

// Etiquetas NFC: cada etiqueta guarda solo un enlace /t/TOKEN. El token es
// aleatorio, se puede revocar y no contiene datos personales ni sellos.

const { db, now } = require('../db');
const { newToken } = require('./tokens');

function listForCustomer(customerId) {
  return db.all(
    `SELECT t.*, u.display_name AS created_by_name FROM nfc_tags t
     LEFT JOIN business_users u ON u.id = t.created_by
     WHERE t.customer_id = ? ORDER BY t.status = 'active' DESC, t.id DESC`,
    customerId
  );
}

async function countActive(customerId) {
  return (await db.get("SELECT COUNT(*) AS n FROM nfc_tags WHERE customer_id = ? AND status = 'active'", customerId)).n;
}

async function create(customerId, { label, userId }) {
  const { lastInsertRowid } = await db.run(
    'INSERT INTO nfc_tags (customer_id, token, label, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    customerId, newToken(), label, 'active', now(), userId
  );
  return db.get('SELECT * FROM nfc_tags WHERE id = ?', lastInsertRowid);
}

function findById(customerId, tagId) {
  return db.get('SELECT * FROM nfc_tags WHERE id = ? AND customer_id = ?', tagId, customerId);
}

async function revoke(customerId, tagId, userId) {
  const { changes } = await db.run(
    "UPDATE nfc_tags SET status = 'revoked', revoked_at = ?, revoked_by = ? WHERE id = ? AND customer_id = ? AND status = 'active'",
    now(), userId, tagId, customerId
  );
  return changes === 1;
}

function findCustomerByToken(token) {
  return db.get(
    "SELECT c.* FROM nfc_tags t JOIN customers c ON c.id = t.customer_id WHERE t.token = ? AND t.status = 'active'",
    token
  );
}

module.exports = { listForCustomer, countActive, create, findById, revoke, findCustomerByToken };
