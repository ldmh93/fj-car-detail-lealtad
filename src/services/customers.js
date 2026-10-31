'use strict';

const { db, tx, now, foldText } = require('../db');
const { newToken } = require('./tokens');
const { hashPassword } = require('./passwords');

function findById(id, conn = db) {
  return conn.get('SELECT * FROM customers WHERE id = ?', id);
}

function findByPhone(phone, conn = db) {
  return conn.get('SELECT * FROM customers WHERE phone = ?', phone);
}

/** Crea el cliente y su tarjeta (0 sellos) en una sola transacción. */
async function create({ name, phone, password }) {
  const passwordHash = await hashPassword(password);
  return tx(async (t) => {
    if (await findByPhone(phone, t)) return { error: 'phone_taken' };
    const ts = now();
    const { lastInsertRowid } = await t.run(
      'INSERT INTO customers (name, name_search, phone, password_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      name, foldText(name), phone, passwordHash, 'active', ts
    );
    await t.run(
      'INSERT INTO loyalty_cards (customer_id, stamps, status, cycle, qr_token, qr_token_created_at, created_at, updated_at) VALUES (?, 0, ?, 1, ?, ?, ?, ?)',
      lastInsertRowid, 'active', newToken(), ts, ts, ts
    );
    return { customer: await findById(lastInsertRowid, t) };
  });
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

/** Busca por nombre (sin importar acentos) o por teléfono (cualquier parte de los dígitos). */
function search(query, { limit = 50 } = {}) {
  const q = String(query || '').trim().slice(0, 60);
  const base = `SELECT c.id, c.name, c.phone, c.status, c.created_at, k.stamps, k.status AS card_status
                FROM customers c JOIN loyalty_cards k ON k.customer_id = c.id`;
  if (!q) return db.all(`${base} ORDER BY k.updated_at DESC LIMIT ?`, limit);
  const digits = q.replace(/\D/g, '');
  const nameLike = `%${escapeLike(foldText(q))}%`;
  const phoneLike = digits.length >= 3 ? `%${digits}%` : null;
  return db.all(
    `${base} WHERE c.name_search LIKE ? ESCAPE '\\' OR (? IS NOT NULL AND c.phone LIKE ?)
     ORDER BY c.name COLLATE NOCASE LIMIT ?`,
    nameLike, phoneLike, phoneLike, limit
  );
}

function findByCardToken(token) {
  return db.get('SELECT c.* FROM loyalty_cards k JOIN customers c ON c.id = k.customer_id WHERE k.qr_token = ?', token);
}

async function regenerateQrToken(customerId) {
  const token = newToken();
  await db.run(
    'UPDATE loyalty_cards SET qr_token = ?, qr_token_created_at = ?, updated_at = ? WHERE customer_id = ?',
    token, now(), now(), customerId
  );
  return token;
}

async function setPassword(customerId, password) {
  await db.run('UPDATE customers SET password_hash = ? WHERE id = ?', await hashPassword(password), customerId);
}

/** Muestra solo los últimos 4 dígitos (para confirmar identidad sin exponer el número). */
function maskPhone(phone) {
  return phone ? `•••• ${phone.slice(-4)}` : '';
}

function formatPhone(phone) {
  if (!phone) return '';
  if (phone.length === 10) return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
  return `+${phone}`;
}

module.exports = {
  findById,
  findByPhone,
  create,
  search,
  findByCardToken,
  regenerateQrToken,
  setPassword,
  maskPhone,
  formatPhone,
};
