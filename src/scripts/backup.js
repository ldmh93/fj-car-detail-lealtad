'use strict';

// Respaldo de todas las tablas en un archivo JSON (funciona con Turso y con el archivo local).
//   npm run respaldo                → respaldos/lealtad-AAAA-MM-DD-HHMM.json
//   npm run respaldo -- --destino /ruta/a/carpeta
// No incluye la tabla de sesiones (son temporales).

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { db, init, close } = require('../db');
const { args } = require('./prompt');

const TABLES = ['business_users', 'customers', 'loyalty_cards', 'stamp_events', 'rewards', 'nfc_tags', 'audit_log', 'schema_migrations'];

async function main() {
  await init();
  const a = args();
  const dir = path.resolve(a.destino || path.join(config.root, 'respaldos'));
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const file = path.join(dir, `lealtad-${stamp}.json`);

  const data = { created_at: new Date().toISOString(), tables: {} };
  for (const table of TABLES) data.tables[table] = await db.all(`SELECT * FROM ${table} ORDER BY rowid`);
  fs.writeFileSync(file, JSON.stringify(data, null, 1), { mode: 0o600 });

  const counts = TABLES.map((t) => `${t}: ${data.tables[t].length}`).join(', ');
  console.log(`Respaldo guardado en: ${file}\n${counts}`);
  console.log('Contiene datos de clientes y hashes de contraseñas: guárdalo en un lugar privado.');
}

main()
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(close);
