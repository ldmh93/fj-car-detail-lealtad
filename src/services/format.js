'use strict';

const config = require('../config');
const { formatPhone, maskPhone } = require('./customers');

const dateTimeFmt = new Intl.DateTimeFormat('es-MX', {
  timeZone: config.timeZone,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat('es-MX', { timeZone: config.timeZone, day: 'numeric', month: 'long', year: 'numeric' });

const shortFmt = new Intl.DateTimeFormat('es-MX', { timeZone: config.timeZone, day: 'numeric', month: 'short' });
const shortDate = (iso) => (iso ? shortFmt.format(new Date(iso)) : '—');
const dateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');
const date = (iso) => (iso ? dateFmt.format(new Date(iso)) : '—');

/** Inicio del día actual en la zona horaria del negocio, como ISO UTC. */
function startOfTodayIso() {
  const nowDate = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: config.timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(nowDate)
      .map((p) => [p.type, Number(p.value)])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = asUtc - Math.floor(nowDate.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offset).toISOString();
}

// Etiquetas para el historial. "forCustomer" usa un lenguaje más sencillo.
function eventLabel(e, { forCustomer = false } = {}) {
  switch (e.type) {
    case 'stamp':
      return forCustomer ? 'Visita registrada (+1 sello)' : `Sello agregado${e.source ? ` (${sourceLabel(e.source)})` : ''}`;
    case 'correction':
      return forCustomer
        ? `Ajuste del negocio (${e.delta > 0 ? '+' : ''}${e.delta})`
        : `Corrección ${e.delta > 0 ? '+' : ''}${e.delta}`;
    case 'reward_issued':
      return forCustomer ? '¡Completaste tu tarjeta! Recompensa disponible' : 'Recompensa emitida';
    case 'reward_redeemed':
      return forCustomer ? 'Recompensa canjeada. Nueva tarjeta iniciada' : 'Recompensa canjeada';
    case 'reward_voided':
      return forCustomer ? 'Recompensa anulada por ajuste' : 'Recompensa anulada';
    default:
      return e.type;
  }
}

function sourceLabel(source) {
  return { qr: 'QR', nfc: 'NFC', manual: 'búsqueda' }[source] || source;
}

module.exports = { dateTime, date, shortDate, startOfTodayIso, eventLabel, formatPhone, maskPhone };
