'use strict';

// Crea una cuenta del negocio (dueño o personal) o restablece su contraseña.
//   npm run crear-usuario
//   npm run crear-usuario -- --usuario ana --nombre "Ana López" --rol staff
//   npm run crear-usuario -- --usuario ana --restablecer
// Para automatizar se puede pasar la contraseña en la variable NEW_USER_PASSWORD.

const v = require('../services/validation');
const businessUsers = require('../services/business-users');
const { init, close } = require('../db');
const { ask, args } = require('./prompt');

const MIN_PASSWORD = 10;

async function askPassword() {
  if (process.env.NEW_USER_PASSWORD) {
    const p = v.password(process.env.NEW_USER_PASSWORD, { min: MIN_PASSWORD });
    if (p.error) throw new Error(p.error);
    return p.value;
  }
  for (;;) {
    const p = v.password(await ask(`Contraseña (mínimo ${MIN_PASSWORD} caracteres): `, { hidden: true }), { min: MIN_PASSWORD });
    if (p.error) {
      console.log(p.error);
      continue;
    }
    if ((await ask('Repite la contraseña: ', { hidden: true })) !== p.value) {
      console.log('Las contraseñas no coinciden. Intenta de nuevo.');
      continue;
    }
    return p.value;
  }
}

async function main() {
  await init();
  const a = args();
  const isFirst = (await businessUsers.count()) === 0;
  console.log(isFirst ? '\nCrear la primera cuenta del negocio (dueño)\n' : '\nCuenta del negocio\n');

  let username;
  for (;;) {
    username = v.username(a.usuario || (await ask('Usuario para iniciar sesión (ej. dueno): ')));
    if (!username.error) break;
    console.log(username.error);
    if (a.usuario) process.exit(1);
  }
  const existing = await businessUsers.findByUsername(username.value);

  if (a.restablecer) {
    if (!existing) throw new Error(`No existe el usuario "${username.value}".`);
    await businessUsers.setPassword(existing.id, await askPassword());
    console.log(`\nContraseña de "${existing.username}" actualizada.`);
    return;
  }
  if (existing) throw new Error(`El usuario "${username.value}" ya existe. Usa --restablecer para cambiar su contraseña.`);

  let displayName;
  for (;;) {
    displayName = v.name(a.nombre || (await ask('Nombre que aparecerá en el historial (ej. Luis): ')));
    if (!displayName.error) break;
    console.log(displayName.error);
    if (a.nombre) process.exit(1);
  }

  let role = a.rol || (isFirst ? 'owner' : null);
  while (!['owner', 'staff'].includes(role)) {
    const r = (await ask('Rol: [1] dueño (puede corregir sellos)  [2] personal  → ')).toLowerCase();
    role = r === '1' || r.startsWith('d') ? 'owner' : r === '2' || r.startsWith('p') ? 'staff' : null;
  }

  const user = await businessUsers.create({
    username: username.value,
    displayName: displayName.value,
    password: await askPassword(),
    role,
  });
  console.log(`\nListo: "${user.username}" (${role === 'owner' ? 'dueño' : 'personal'}) puede entrar en /negocio/entrar`);
}

main()
  .catch((err) => {
    console.error(`\nError: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(close);
