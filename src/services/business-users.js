'use strict';

const { db, now } = require('../db');
const { hashPassword } = require('./passwords');

function findById(id) {
  return db.get('SELECT * FROM business_users WHERE id = ?', id);
}

function findByUsername(username) {
  return db.get('SELECT * FROM business_users WHERE username = ?', username);
}

async function count() {
  return (await db.get('SELECT COUNT(*) AS n FROM business_users')).n;
}

async function create({ username, displayName, password, role }) {
  const hash = await hashPassword(password);
  const { lastInsertRowid } = await db.run(
    'INSERT INTO business_users (username, display_name, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    username, displayName, hash, role, 'active', now()
  );
  return findById(lastInsertRowid);
}

async function setPassword(id, password) {
  await db.run('UPDATE business_users SET password_hash = ? WHERE id = ?', await hashPassword(password), id);
}

function touchLogin(id) {
  return db.run('UPDATE business_users SET last_login_at = ? WHERE id = ?', now(), id);
}

module.exports = { findById, findByUsername, count, create, setPassword, touchLogin };
