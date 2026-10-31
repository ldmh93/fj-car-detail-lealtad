'use strict';

// Crea un cliente de prueba con datos ficticios (sin datos reales).
//   npm run cliente-prueba
//   npm run cliente-prueba -- --sellos 9     (para probar la recompensa con un solo sello más)
// Los teléfonos de prueba empiezan con 000 para distinguirlos.

const crypto = require('node:crypto');
const customers = require('../services/customers');
const { db, init, close, now } = require('../db');
const { args } = require('./prompt');

async function main() {
  await init();
  const a = args();
  const stamps = Math.max(0, Math.min(9, Number.parseInt(a.sellos || '0', 10) || 0));
  let phone;
  do {
    phone = '000' + String(crypto.randomInt(0, 10_000_000)).padStart(7, '0');
  } while (await customers.findByPhone(phone));
  const suffix = phone.slice(-4);
  const password = 'prueba-' + crypto.randomBytes(3).toString('hex');

  const { customer } = await customers.create({ name: `Cliente de Prueba ${suffix}`, phone, password });
  if (stamps) {
    await db.run('UPDATE loyalty_cards SET stamps = ?, updated_at = ? WHERE customer_id = ?', stamps, now(), customer.id);
    const card = await db.get('SELECT * FROM loyalty_cards WHERE customer_id = ?', customer.id);
    await db.run(
      `INSERT INTO stamp_events (customer_id, card_id, type, delta, stamps_after, cycle, reason, created_at)
       VALUES (?, ?, 'correction', ?, ?, 1, 'Sellos iniciales de prueba', ?)`,
      customer.id, card.id, stamps, stamps, now()
    );
  }

  console.log('\nCliente de prueba creado (datos ficticios):');
  console.log(`  Nombre:     ${customer.name}`);
  console.log(`  Teléfono:   ${phone}`);
  console.log(`  Contraseña: ${password}`);
  console.log(`  Sellos:     ${stamps}`);
  console.log('\nEntra como cliente en /entrar con ese teléfono y contraseña.');
}

main()
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(close);
