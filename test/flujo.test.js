'use strict';

// Prueba de punta a punta con una base de datos temporal: registro, QR, sellos,
// recompensa, canje, corrección, NFC y protecciones. Ejecuta: npm test

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lealtad-test-'));
process.env.DATABASE_PATH = path.join(tmp, 'test.sqlite');
// Nunca usar la base real de Turso aunque esté configurada en .env.
process.env.TURSO_DATABASE_URL = '';
process.env.TURSO_AUTH_TOKEN = '';
process.env.SESSION_SECRET = 'x'.repeat(48);
process.env.BASE_URL = 'https://lealtad.ejemplo.com';
process.env.NODE_ENV = 'test';

const { createApp } = require('../src/server');
const { db, init, close } = require('../src/db');
const businessUsers = require('../src/services/business-users');

let server;
let base;

class Browser {
  constructor() {
    this.cookie = '';
  }
  async req(method, url, form) {
    const headers = { cookie: this.cookie };
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(base + url, { method, headers, body, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text };
  }
  get(url) {
    return this.req('GET', url);
  }
  async csrf(url) {
    const page = await this.get(url);
    const m = page.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(m, `sin token CSRF en ${url}`);
    return { token: m[1], page };
  }
  async post(fromUrl, action, fields = {}) {
    const { token } = await this.csrf(fromUrl);
    return this.req('POST', action, { _csrf: token, ...fields });
  }
}

const hidden = (html, name) => (html.match(new RegExp(`name="${name}" value="([^"]*)"`)) || [])[1];
const card = (customerId) => db.get('SELECT * FROM loyalty_cards WHERE customer_id = ?', customerId);

before(async () => {
  await init();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await businessUsers.create({ username: 'dueno', displayName: 'Dueño', password: 'clave-segura-123', role: 'owner' });
  await businessUsers.create({ username: 'ayudante', displayName: 'Ayudante', password: 'clave-segura-456', role: 'staff' });
});

after(() => {
  server.close();
  close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const cliente = new Browser();
const dueno = new Browser();
const ayudante = new Browser();
let customerId;

test('el cliente se registra y ve su tarjeta con 0 sellos y QR sin datos personales', async () => {
  const res = await cliente.post('/registro', '/registro', {
    name: '  Ana   Pérez ',
    phone: '(55) 1234-5678',
    password: 'secreta1',
    password2: 'secreta1',
  });
  assert.equal(res.status, 302);
  assert.equal(res.location, '/mi-tarjeta');
  const c = (await db.get('SELECT * FROM customers WHERE phone = ?', '5512345678'));
  assert.equal(c.name, 'Ana Pérez');
  assert.ok(c.password_hash.startsWith('scrypt$'));
  assert.ok(!c.password_hash.includes('secreta1'));
  customerId = c.id;
  assert.equal((await card(customerId)).stamps, 0);

  const page = await cliente.get('/mi-tarjeta');
  assert.equal(page.status, 200);
  assert.match(page.text, /Aún no tienes sellos/);
  assert.match(page.text, /<svg/);
  assert.ok((await card(customerId)).qr_token.length >= 20);
});

test('no se puede registrar dos veces el mismo teléfono', async () => {
  const otro = new Browser();
  const res = await otro.post('/registro', '/registro', { name: 'Otra', phone: '5512345678', password: 'secreta1', password2: 'secreta1' });
  assert.equal(res.status, 409);
});

test('el cliente no puede agregarse sellos ni entrar al panel', async () => {
  const res = await cliente.post('/mi-tarjeta', `/panel/cliente/${customerId}/sello`, {
    request_id: 'a'.repeat(24),
    expected_stamps: '0',
  });
  assert.equal(res.status, 302);
  assert.match(res.location, /^\/negocio\/entrar/);
  assert.equal((await card(customerId)).stamps, 0);
});

test('peticiones sin token CSRF se rechazan', async () => {
  const res = await cliente.req('POST', '/salir', {});
  assert.equal(res.status, 403);
});

test('inicio de sesión del negocio', async () => {
  const bad = await dueno.post('/negocio/entrar', '/negocio/entrar', { username: 'dueno', password: 'incorrecta' });
  assert.equal(bad.status, 401);
  const ok = await dueno.post('/negocio/entrar', '/negocio/entrar', { username: 'dueno', password: 'clave-segura-123' });
  assert.equal(ok.location, '/panel');
  const panel = await dueno.get('/panel');
  assert.equal(panel.status, 200);
  assert.match(panel.text, /https:\/\/lealtad\.ejemplo\.com\/registro/);
  await ayudante.post('/negocio/entrar', '/negocio/entrar', { username: 'ayudante', password: 'clave-segura-456' });
});

test('el QR solo identifica: abre la confirmación y no agrega sellos', async () => {
  const url = `https://lealtad.ejemplo.com/c/${(await card(customerId)).qr_token}`;
  const res = await dueno.get(`/panel/identificar?codigo=${encodeURIComponent(url)}`);
  assert.equal(res.location, `/panel/cliente/${customerId}/sello?via=qr`);
  const direct = await dueno.get(`/c/${(await card(customerId)).qr_token}`);
  assert.equal(direct.location, `/panel/cliente/${customerId}/sello?via=qr`);
  assert.equal((await card(customerId)).stamps, 0);

  const anon = await new Browser().get(`/c/${(await card(customerId)).qr_token}`);
  assert.equal(anon.status, 200);
  assert.doesNotMatch(anon.text, /Ana/);
  assert.doesNotMatch(anon.text, /5678/);

  const bad = await dueno.get('/panel/identificar?codigo=hola');
  assert.match(bad.location, /error=formato/);
});

test('confirmar agrega un solo sello aunque se envíe dos veces', async () => {
  const page = await dueno.get(`/panel/cliente/${customerId}/sello?via=qr`);
  assert.match(page.text, /Ana Pérez/);
  const fields = {
    _csrf: hidden(page.text, '_csrf'),
    request_id: hidden(page.text, 'request_id'),
    expected_stamps: hidden(page.text, 'expected_stamps'),
    via: 'qr',
  };
  const first = await dueno.req('POST', `/panel/cliente/${customerId}/sello`, fields);
  const second = await dueno.req('POST', `/panel/cliente/${customerId}/sello`, fields);
  assert.equal(first.status, 302);
  assert.equal(second.status, 302);
  assert.equal((await card(customerId)).stamps, 1);

  // Otra pestaña abierta antes del sello (expected_stamps viejo) no suma de más.
  const stale = await dueno.req('POST', `/panel/cliente/${customerId}/sello`, {
    ...fields,
    request_id: 'b'.repeat(24),
  });
  assert.equal(stale.status, 302);
  assert.equal((await card(customerId)).stamps, 1);

  const ev = (await db.all("SELECT * FROM stamp_events WHERE customer_id = ? AND type = 'stamp'", customerId));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].source, 'qr');
  assert.ok(ev[0].business_user_id);
});

async function stamp(browser) {
  const page = await browser.get(`/panel/cliente/${customerId}/sello`);
  return browser.req('POST', `/panel/cliente/${customerId}/sello`, {
    _csrf: hidden(page.text, '_csrf'),
    request_id: hidden(page.text, 'request_id'),
    expected_stamps: hidden(page.text, 'expected_stamps'),
    via: 'manual',
  });
}

test('el décimo sello emite una sola recompensa y bloquea más sellos', async () => {
  for (let i = 0; i < 9; i++) await stamp(i % 2 ? dueno : ayudante);
  assert.equal((await card(customerId)).stamps, 10);
  assert.equal((await card(customerId)).status, 'reward_pending');
  const rewards = (await db.all('SELECT * FROM rewards WHERE customer_id = ?', customerId));
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].status, 'available');

  const page = await dueno.get(`/panel/cliente/${customerId}/sello`);
  assert.doesNotMatch(page.text, /name="request_id"/);
  assert.match(page.text, /Canjear recompensa/);

  const mine = await cliente.get('/mi-tarjeta');
  assert.match(mine.text, /Completaste tu tarjeta/);
});

test('la recompensa se canjea una sola vez y empieza un nuevo ciclo', async () => {
  const page = await ayudante.get(`/panel/cliente/${customerId}/canjear`);
  const fields = {
    _csrf: hidden(page.text, '_csrf'),
    request_id: hidden(page.text, 'request_id'),
    reward_id: hidden(page.text, 'reward_id'),
  };
  await ayudante.req('POST', `/panel/cliente/${customerId}/canjear`, fields);
  await ayudante.req('POST', `/panel/cliente/${customerId}/canjear`, { ...fields, request_id: 'c'.repeat(24) });
  const c = await card(customerId);
  assert.equal(c.stamps, 0);
  assert.equal(c.cycle, 2);
  const rewards = (await db.all('SELECT * FROM rewards WHERE customer_id = ?', customerId));
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].status, 'redeemed');
  assert.ok(rewards[0].redeemed_by);
  assert.equal((await db.get("SELECT COUNT(*) n FROM stamp_events WHERE type = 'reward_redeemed'")).n, 1);
});

test('la corrección es solo del dueño, pide motivo y contraseña y deja rastro', async () => {
  const denied = await ayudante.get(`/panel/cliente/${customerId}/correccion`);
  assert.equal(denied.status, 403);

  const page = await dueno.get(`/panel/cliente/${customerId}/correccion`);
  const base = { _csrf: hidden(page.text, '_csrf'), request_id: hidden(page.text, 'request_id') };
  const noReason = await dueno.req('POST', `/panel/cliente/${customerId}/correccion`, {
    ...base,
    delta: '2',
    reason: '',
    password: 'clave-segura-123',
  });
  assert.equal(noReason.status, 422);
  const badPass = await dueno.req('POST', `/panel/cliente/${customerId}/correccion`, {
    ...base,
    delta: '2',
    reason: 'Visitas de la semana pasada',
    password: 'mala',
  });
  assert.equal(badPass.status, 422);
  assert.equal((await card(customerId)).stamps, 0);

  const ok = await dueno.req('POST', `/panel/cliente/${customerId}/correccion`, {
    ...base,
    delta: '2',
    reason: 'Visitas de la semana pasada',
    password: 'clave-segura-123',
  });
  assert.equal(ok.status, 302);
  assert.equal((await card(customerId)).stamps, 2);
  const ev = (await db.get("SELECT * FROM stamp_events WHERE type = 'correction'"));
  assert.equal(ev.reason, 'Visitas de la semana pasada');
  assert.equal(ev.delta, 2);

  const outOfRange = await dueno.post(`/panel/cliente/${customerId}/correccion`, `/panel/cliente/${customerId}/correccion`, {
    request_id: 'd'.repeat(24),
    delta: '-5',
    reason: 'Prueba fuera de rango',
    password: 'clave-segura-123',
  });
  assert.equal(outOfRange.status, 422);
  assert.equal((await card(customerId)).stamps, 2);
});

test('NFC: vincular, identificar y revocar', async () => {
  const created = await dueno.post(`/panel/cliente/${customerId}/nfc`, `/panel/cliente/${customerId}/nfc`, { label: 'Llavero' });
  assert.equal(created.status, 302);
  const tag = (await db.get('SELECT * FROM nfc_tags WHERE customer_id = ?', customerId));
  const write = await dueno.get(created.location);
  assert.match(write.text, new RegExp(`https://lealtad.ejemplo.com/t/${tag.token}`));
  assert.doesNotMatch(write.text.match(/data-url="([^"]+)"/)[1], /Ana|5678/);

  const viaTag = await dueno.get(`/t/${tag.token}`);
  assert.equal(viaTag.location, `/panel/cliente/${customerId}/sello?via=nfc`);
  const viaReader = await dueno.get(`/panel/identificar?codigo=${encodeURIComponent(`https://lealtad.ejemplo.com/t/${tag.token}`)}`);
  assert.equal(viaReader.location, `/panel/cliente/${customerId}/sello?via=nfc`);

  await dueno.post(`/panel/cliente/${customerId}/nfc`, `/panel/cliente/${customerId}/nfc/${tag.id}/revocar`);
  const revoked = await dueno.get(`/t/${tag.token}`);
  assert.equal(revoked.status, 404);
});

test('reemplazar el QR invalida el anterior', async () => {
  const old = (await card(customerId)).qr_token;
  await dueno.post(`/panel/cliente/${customerId}`, `/panel/cliente/${customerId}/qr/regenerar`);
  assert.notEqual((await card(customerId)).qr_token, old);
  const res = await dueno.get(`/c/${old}`);
  assert.equal(res.status, 404);
});

test('búsqueda por nombre y por teléfono', async () => {
  const byName = await dueno.get('/panel/clientes?q=ana');
  assert.match(byName.text, /Ana Pérez/);
  const noAccent = await dueno.get('/panel/clientes?q=PEREZ');
  assert.match(noAccent.text, /Ana Pérez/);
  const byPhone = await dueno.get('/panel/clientes?q=5678');
  assert.match(byPhone.text, /Ana Pérez/);
  const none = await dueno.get('/panel/clientes?q=%25');
  assert.doesNotMatch(none.text, /Ana Pérez/);
});

test('el cliente ve su historial y puede entrar de nuevo con teléfono y contraseña', async () => {
  const hist = await cliente.get('/mi-tarjeta/historial');
  assert.match(hist.text, /Recompensa canjeada/);
  await cliente.post('/mi-tarjeta', '/salir');
  const nuevo = new Browser();
  const res = await nuevo.post('/entrar', '/entrar', { phone: '55 1234 5678', password: 'secreta1' });
  assert.equal(res.location, '/mi-tarjeta');
});
