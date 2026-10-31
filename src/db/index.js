'use strict';

// Conexión a la base de datos con libSQL (compatible con SQLite):
// - En tu computadora usa un archivo local (file:data/lealtad.sqlite).
// - En Vercel usa Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN), porque Vercel no guarda archivos.

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@libsql/client');
const config = require('../config');
const migrations = require('./migrations');

let client;
let ready;

function getClient() {
  if (client) return client;
  if (config.db.url.startsWith('file:')) {
    fs.mkdirSync(path.dirname(config.db.url.slice('file:'.length)), { recursive: true });
  }
  client = createClient({ url: config.db.url, authToken: config.db.authToken });
  return client;
}

function toPlain(result) {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((c, i) => [c, row[i]])));
}

const clean = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a));

/** Métodos de consulta sobre el cliente o sobre una transacción. */
function wrap(executor) {
  return {
    async get(sql, ...args) {
      return toPlain(await executor.execute({ sql, args: clean(args) }))[0];
    },
    async all(sql, ...args) {
      return toPlain(await executor.execute({ sql, args: clean(args) }));
    },
    async run(sql, ...args) {
      const r = await executor.execute({ sql, args: clean(args) });
      return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid === undefined ? null : Number(r.lastInsertRowid) };
    },
  };
}

/** Prepara la base (migraciones) una sola vez por proceso. */
function init() {
  if (!ready) {
    ready = migrate(getClient()).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

async function migrate(conn) {
  if (config.db.url.startsWith('file:')) {
    await conn.execute('PRAGMA journal_mode = WAL');
    await conn.execute('PRAGMA busy_timeout = 5000');
  }
  await conn.execute('PRAGMA foreign_keys = ON');
  await conn.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(toPlain(await conn.execute('SELECT version FROM schema_migrations')).map((r) => r.version));
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    const statements = m.sql
      .split(/;\s*$/m)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    await conn.batch(
      [...statements, { sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', args: [m.version, now()] }],
      'write'
    );
  }
  const pending = toPlain(await conn.execute("SELECT id, name FROM customers WHERE name_search = ''"));
  for (const row of pending) {
    await conn.execute({ sql: 'UPDATE customers SET name_search = ? WHERE id = ?', args: [foldText(row.name), row.id] });
  }
}

const db = {
  get: async (...a) => wrap(getClient()).get(...a),
  all: async (...a) => wrap(getClient()).all(...a),
  run: async (...a) => wrap(getClient()).run(...a),
};

/**
 * Ejecuta fn(t) dentro de una transacción de escritura; revierte si lanza un error.
 * Las escrituras se serializan, así que dos sellos simultáneos no pueden duplicarse.
 */
async function tx(fn) {
  const t = await getClient().transaction('write');
  try {
    const result = await fn(wrap(t));
    await t.commit();
    return result;
  } catch (err) {
    await t.rollback().catch(() => {});
    throw err;
  } finally {
    t.close();
  }
}

function now() {
  return new Date().toISOString();
}

/** Minúsculas y sin acentos, para búsquedas. */
function foldText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function close() {
  if (client) client.close();
  client = null;
  ready = null;
}

module.exports = { db, tx, init, now, foldText, close };
