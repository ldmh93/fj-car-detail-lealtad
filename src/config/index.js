'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const ROOT = path.join(__dirname, '..', '..');
const isProduction = process.env.NODE_ENV === 'production';
const onVercel = Boolean(process.env.VERCEL);

function resolveDbUrl() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  if (url) return url;
  if (onVercel) {
    throw new Error('Falta TURSO_DATABASE_URL en las variables de entorno de Vercel. Revisa el README.');
  }
  // Sin Turso: archivo SQLite local (solo para usar la app en tu computadora).
  const p = process.env.DATABASE_PATH || 'data/lealtad.sqlite';
  return 'file:' + (path.isAbsolute(p) ? p : path.join(ROOT, p));
}

function resolveBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `http://localhost:${Number(process.env.PORT) || 3000}`;
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProduction || onVercel) {
    throw new Error('Falta SESSION_SECRET (mínimo 32 caracteres) en las variables de entorno. Revisa el README.');
  }
  // En desarrollo se genera uno temporal: las sesiones se cierran al reiniciar.
  sessionSecret = crypto.randomBytes(48).toString('hex');
  console.warn('Aviso: SESSION_SECRET no está configurado; se usa uno temporal (solo para desarrollo).');
}

const config = {
  root: ROOT,
  isProduction,
  onVercel,
  port: Number(process.env.PORT) || 3000,
  // URL pública con la que los clientes abren la app (se usa en el enlace de registro, QR y NFC).
  baseUrl: resolveBaseUrl().replace(/\/+$/, ''),
  businessName: process.env.BUSINESS_NAME || 'FJ Car Detail',
  rewardText: process.env.REWARD_TEXT || 'un lavado gratis',
  timeZone: process.env.TIME_ZONE || 'America/Mexico_City',
  db: {
    url: resolveDbUrl(),
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  },
  sessionSecret,
  trustProxy: onVercel || process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  secureCookies: process.env.SECURE_COOKIES ? process.env.SECURE_COOKIES === 'true' : isProduction || onVercel,
  stampsPerCard: 10,
  businessSessionHours: 12,
  customerSessionDays: 60,
};

module.exports = config;
