'use strict';

// Normalización y validación de datos recibidos. Todas las funciones devuelven
// { value } si el dato es válido o { error } con un mensaje para mostrar al usuario.

function str(v) {
  return typeof v === 'string' ? v : '';
}

function name(input) {
  const value = str(input)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length < 2) return { error: 'Escribe tu nombre (al menos 2 letras).' };
  if (value.length > 60) return { error: 'El nombre es demasiado largo (máximo 60 caracteres).' };
  return { value };
}

function phone(input) {
  const digits = str(input).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return { error: 'Escribe un teléfono válido de 10 dígitos (puedes incluir lada internacional).' };
  }
  return { value: digits };
}

function password(input, { min = 6 } = {}) {
  const value = str(input);
  if (value.length < min) return { error: `La contraseña debe tener al menos ${min} caracteres.` };
  if (value.length > 200) return { error: 'La contraseña es demasiado larga.' };
  return { value };
}

function username(input) {
  const value = str(input).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(value)) {
    return { error: 'El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.' };
  }
  return { value };
}

function reason(input) {
  const value = str(input).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (value.length < 5) return { error: 'Explica el motivo (al menos 5 caracteres).' };
  if (value.length > 200) return { error: 'El motivo es demasiado largo (máximo 200 caracteres).' };
  return { value };
}

function label(input) {
  const value = str(input).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return { value: value || null };
}

function int(input, { min, max }) {
  const n = Number.parseInt(str(String(input ?? '')), 10);
  if (!Number.isInteger(n) || n < min || n > max) return { error: 'Número no válido.' };
  return { value: n };
}

function requestId(input) {
  const value = str(input);
  return /^[A-Za-z0-9_-]{16,64}$/.test(value) ? { value } : { error: 'Solicitud no válida. Recarga la página.' };
}

module.exports = { name, phone, password, username, reason, label, int, requestId };
