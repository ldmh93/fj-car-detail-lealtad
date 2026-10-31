'use strict';

const crypto = require('node:crypto');
const config = require('../config');

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/** Token opaco de 144 bits: no contiene datos del cliente y no se puede adivinar. */
function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function isToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

const cardUrl = (token) => `${config.baseUrl}/c/${token}`;
const nfcUrl = (token) => `${config.baseUrl}/t/${token}`;

/**
 * Interpreta lo que leyó la cámara o la etiqueta NFC: un enlace .../c/TOKEN,
 * .../t/TOKEN o el token solo. Devuelve { kind: 'qr' | 'nfc', token } o null.
 */
function parseScannedCode(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > 300) return null;
  const match = text.match(/\/(c|t)\/([A-Za-z0-9_-]{20,64})\/?(?:[?#].*)?$/);
  if (match) return { kind: match[1] === 'c' ? 'qr' : 'nfc', token: match[2] };
  if (isToken(text)) return { kind: 'qr', token: text };
  return null;
}

module.exports = { newToken, isToken, cardUrl, nfcUrl, parseScannedCode };
