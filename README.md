# Tarjetas de lealtad · FJ Car Detail

Tarjeta de lealtad digital para un negocio de detallado y lavado de autos. Cada cliente crea su cuenta desde un enlace, recibe una tarjeta con QR y junta **10 sellos**. Al completarla obtiene una recompensa (por ejemplo, un lavado gratis) que el negocio marca como canjeada.

- **Clientes:** se registran con nombre, teléfono y contraseña. No instalan ninguna app; usan la tarjeta desde el navegador del celular.
- **Negocio:** tiene un panel privado para escanear el QR o leer una etiqueta NFC, buscar clientes, confirmar visitas, canjear recompensas y ver el historial.

Tecnología: Node.js + Express, plantillas EJS y base de datos SQLite/libSQL: un archivo local en tu computadora y **Turso** cuando se publica en **Vercel**.

---

## 1. Requisitos

- **Node.js 20 o más reciente** (recomendado: la versión LTS desde <https://nodejs.org>). Para comprobarlo, abre la terminal y escribe `node -v`.
- Para usar la cámara y el NFC en un teléfono, la app debe abrirse con **https://**. Vercel ya lo incluye (ver la sección 7).

## 2. Instalación

En la terminal, dentro de la carpeta del proyecto:

```bash
npm install
cp .env.example .env
```

Abre `.env` y ajusta:

| Variable | Qué es |
|---|---|
| `BUSINESS_NAME` | Nombre que ven los clientes (`FJ Car Detail`). |
| `REWARD_TEXT` | La recompensa, como se lee en “recibe …” (ej. `un lavado gratis`). |
| `BASE_URL` | Dirección pública de la app, **sin** `/` al final. Se usa en el enlace de registro, los QR y las etiquetas NFC. |
| `SESSION_SECRET` | Texto aleatorio de 32 caracteres o más. Genera uno con el comando de abajo. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Base de datos en Turso. Obligatorias en Vercel; en tu computadora puedes dejarlas vacías. |
| `DATABASE_PATH` | Archivo SQLite local que se usa cuando no hay Turso (por defecto `data/lealtad.sqlite`). |
| `TIME_ZONE` | Zona horaria para las fechas (por defecto `America/Mexico_City`). |
| `NODE_ENV`, `TRUST_PROXY` | Solo si publicas fuera de Vercel (ver la sección 7). |

Para generar `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> El archivo `.env` contiene secretos: no lo compartas ni lo subas a Git (ya está en `.gitignore`).

## 3. Crear la cuenta del negocio

La app no trae usuarios ni contraseñas predeterminados. Crea la primera cuenta (dueño) desde la terminal. La cuenta se guarda en la base configurada en `.env`: si tiene los datos de Turso, queda lista para la app publicada en Vercel.

```bash
npm run crear-usuario
```

Te pedirá el usuario (ej. `dueno`), el nombre que aparecerá en el historial y una contraseña de 10 caracteres o más. La primera cuenta siempre es **dueño**.

Otros usos:

```bash
# Cuenta para un empleado (puede agregar sellos y canjear, pero no corregir)
npm run crear-usuario -- --usuario ana --nombre "Ana" --rol staff

# Olvidaste la contraseña de una cuenta del negocio
npm run crear-usuario -- --usuario dueno --restablecer
```

| Rol | Puede |
|---|---|
| Dueño (`owner`) | Todo, incluida la **corrección de sellos** (pide motivo y su contraseña). |
| Personal (`staff`) | Identificar clientes, agregar sellos, canjear recompensas y gestionar NFC. |

## 4. Iniciar el servidor

```bash
npm start        # uso normal
npm run dev      # desarrollo: se reinicia solo al cambiar archivos
```

Abre <http://localhost:3000>:

- Clientes: `http://localhost:3000/` → crear tarjeta o entrar.
- Negocio: `http://localhost:3000/negocio/entrar` → panel en `/panel`.

Para revisar que todo funciona, ejecuta las pruebas automáticas (usan una base temporal, no tocan tus datos):

```bash
npm test
```

## 5. Compartir el enlace de registro

En el panel (**Inicio** o **Compartir**) verás el enlace de registro, que es:

```
<BASE_URL>/registro          por ejemplo  https://tarjetas.fjcardetail.com/registro
```

- **Copiar:** botón “Copiar” para pegarlo en redes o en tu estado.
- **WhatsApp:** botón “Enviar por WhatsApp” con un mensaje listo.
- **En el local:** “QR para el local” muestra un cartel con QR para imprimir y pegar en el mostrador.

Asegúrate de que `BASE_URL` sea la dirección pública real antes de compartir el enlace o imprimir el cartel.

## 6. Uso diario

**Cliente**
1. Abre el enlace y crea su tarjeta (nombre, teléfono, contraseña). Empieza con 0 sellos.
2. En cada visita muestra su QR (en “Mi tarjeta”). La tarjeta se actualiza sola cuando el negocio registra el sello.
3. En “Ver mi historial” consulta sus visitas y su recompensa.

**Negocio**
1. **Escanear** → “Abrir cámara” y apuntar al QR del cliente (o “Leer etiqueta” con NFC, o buscar por nombre/teléfono).
2. Se muestra el nombre y los últimos 4 dígitos del teléfono: **confirma que es el cliente correcto** y toca “Confirmar y agregar 1 sello”.
3. Al décimo sello aparece “Recompensa disponible”. Cuando entregues el servicio gratuito, toca **Canjear recompensa → Marcar como canjeada**. La tarjeta vuelve a 0 y empieza un nuevo ciclo.
4. Si un cliente olvidó su contraseña: ficha del cliente → **Más opciones → Dar contraseña temporal**.

### Reglas del programa

- Una visita confirmada = 1 sello. Al registrarse no se dan sellos.
- Al llegar a 10 se emite **una** recompensa. Mientras esté pendiente no se agregan más sellos; el siguiente ciclo empieza al canjearla.
- Una recompensa no se puede canjear dos veces.
- Se evitan duplicados por doble toque, recarga o reenvío del formulario: cada confirmación lleva un identificador único y se verifica que la tarjeta no haya cambiado mientras se confirmaba.
- El servidor calcula los sellos; nunca usa un número enviado por el navegador.
- Cada sello, corrección y canje queda en el historial con fecha, hora y la persona que lo hizo. La corrección es exclusiva del dueño, pide motivo y su contraseña. Si deja la tarjeta debajo de 10 con una recompensa pendiente, esa recompensa se anula.

## 7. Publicar en Vercel con Turso

Vercel ya da HTTPS, que la cámara y el NFC necesitan. Como Vercel no guarda archivos, los datos de los clientes se guardan en **Turso** (SQLite en la nube, con plan gratuito).

### 7.1 Crear la base de datos en Turso
1. Crea una cuenta en <https://turso.tech>.
2. Instala la herramienta de Turso e inicia sesión:
   ```bash
   brew install tursodatabase/tap/turso     # o: curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   ```
3. Crea la base y obtén sus dos valores:
   ```bash
   turso db create fj-car-detail-lealtad
   turso db show fj-car-detail-lealtad --url      # → TURSO_DATABASE_URL (libsql://…)
   turso db tokens create fj-car-detail-lealtad   # → TURSO_AUTH_TOKEN
   ```
   También puedes hacerlo desde el panel web de Turso (*Create Database* → *Connect*).
4. Pega ambos valores en tu `.env` local. Las tablas se crean solas la primera vez que la app o un script se conecta.
5. Crea la cuenta del dueño directamente en Turso:
   ```bash
   npm run crear-usuario
   ```

> El token de Turso da acceso total a los datos: nunca lo subas a GitHub ni lo compartas. Si se filtra, revócalo con `turso db tokens invalidate fj-car-detail-lealtad` y crea otro.

### 7.2 Publicar en Vercel
1. Entra a <https://vercel.com>, elige **Add New → Project** e importa el repositorio de GitHub `fj-car-detail-lealtad`.
2. Deja el *Framework Preset* en **Other**. No hace falta comando de build.
3. En **Environment Variables** agrega:

   | Nombre | Valor |
   |---|---|
   | `TURSO_DATABASE_URL` | la URL `libsql://…` |
   | `TURSO_AUTH_TOKEN` | el token |
   | `SESSION_SECRET` | un valor aleatorio largo (genera uno nuevo, distinto al de tu `.env`) |
   | `BUSINESS_NAME` | `FJ Car Detail` |
   | `REWARD_TEXT` | `un lavado gratis` |
   | `BASE_URL` | la dirección final, ej. `https://fj-car-detail-lealtad.vercel.app` o tu dominio |

4. Pulsa **Deploy**. Cada vez que subas cambios a GitHub, Vercel publica una versión nueva.
5. Si después conectas un dominio propio (*Settings → Domains*), cambia `BASE_URL` por ese dominio y vuelve a publicar (*Deployments → Redeploy*). Hazlo **antes** de imprimir carteles o grabar etiquetas NFC, porque esos enlaces usan `BASE_URL`.

### 7.3 Probar en el teléfono sin publicar (opcional)
Con la app corriendo en tu computadora, `cloudflared tunnel --url http://localhost:3000` crea una dirección `https://….trycloudflare.com` temporal. Ponla en `BASE_URL`, agrega `TRUST_PROXY=true` y `SECURE_COOKIES=true`, y reinicia. No la compartas con clientes: cambia cada vez.

### Otras opciones
La app también funciona en cualquier servidor con Node (Railway, Render, un VPS): usa `npm start`, `NODE_ENV=production`, `TRUST_PROXY=true` y Turso o un disco persistente para el archivo SQLite.

### Límites conocidos en Vercel
- El límite de intentos de inicio de sesión se cuenta por instancia del servidor, así que en Vercel es menos estricto que en un servidor único.
- La primera visita después de un rato sin uso tarda un poco más (arranque en frío).

## 8. Probar el QR

1. Crea un cliente de prueba con datos ficticios:
   ```bash
   npm run cliente-prueba                # tarjeta en 0 sellos
   npm run cliente-prueba -- --sellos 9  # le falta 1 sello para la recompensa
   ```
   Muestra el teléfono y la contraseña de prueba (los teléfonos de prueba empiezan con `000`).
2. En una computadora o teléfono, entra como ese cliente en `/entrar` y abre “Mi tarjeta”.
3. En el **teléfono** del negocio (con HTTPS), entra al panel → **Escanear → Abrir cámara** y apunta al QR. Debe abrir “¿Es este cliente?”. Confirma y verás el sello en ambas pantallas.
4. Sin cámara: también puedes abrir el enlace del QR (`/c/…`) con la sesión del panel iniciada, o buscar al cliente por nombre.

El QR solo contiene `BASE_URL/c/<código aleatorio>`: no incluye nombre, teléfono ni sellos. Si alguien que no es del negocio lo abre, ve una página genérica sin datos. Si un cliente cree que su QR se compartió, en su ficha → **Más opciones → Reemplazar QR**; el anterior deja de funcionar.

## 9. NFC con una etiqueta real

### Qué necesitas
- Etiquetas **NFC NTAG213, NTAG215 o NTAG216** (llaveros o stickers; son las más comunes y baratas). Las etiquetas “MIFARE Classic” no son compatibles con muchos teléfonos.
- Para **grabar y leer desde el panel**: un teléfono **Android con NFC** y **Google Chrome** (versión 89 o más reciente), con la app abierta en **https://**.
- Para solo **usar** una etiqueta ya grabada: casi cualquier teléfono con NFC, incluido iPhone XS o más reciente (lee la etiqueta en segundo plano y abre el enlace en el navegador).

### Limitaciones conocidas
- **Web NFC no funciona en todos los teléfonos ni navegadores.** Hoy solo está disponible en Chrome para Android. No funciona en iPhone/iPad (ningún navegador), ni en Firefox, Samsung Internet u otros navegadores de Android, ni en computadoras. La app detecta si el dispositivo lo admite y, si no, muestra la alternativa.
- El NFC del teléfono debe estar activado y la pantalla desbloqueada.
- Una etiqueta bloqueada como “solo lectura” no se puede regrabar.

### Asociar y grabar una etiqueta
1. Panel → ficha del cliente → **Etiquetas NFC** → (opcional) nombre, como “Llavero azul” → **Crear y grabar etiqueta**.
2. **Si el teléfono es compatible:** toca **Grabar etiqueta** y acerca la etiqueta a la parte trasera del teléfono hasta ver “¡Etiqueta grabada!”.
3. **Si no es compatible:** copia el enlace mostrado y grábalo con una app gratuita como **NFC Tools** (Android o iPhone): *Escribir → Agregar un registro → URL/URI*, pega el enlace, *Escribir* y acerca la etiqueta.

La etiqueta guarda solo `BASE_URL/t/<código aleatorio>`: no contiene nombre, teléfono, sellos ni recompensas.

### Probar la etiqueta
- **Android + Chrome:** panel → **Escanear → Leer etiqueta** → acerca la etiqueta. Debe abrir “¿Es este cliente?”.
- **Cualquier teléfono con NFC:** con la sesión del panel iniciada en el navegador, acerca la etiqueta con la pantalla desbloqueada. El teléfono abre el enlace y muestra la confirmación del cliente.
- En ambos casos, **la etiqueta no agrega sellos por sí sola**: siempre se confirma en el panel.

### Etiqueta perdida
Ficha del cliente → **Etiquetas NFC** → **Revocar**. A partir de ese momento la etiqueta ya no identifica a nadie. Para darle otra, vincula una nueva.

## 10. Base de datos y respaldos

- **Publicada (Vercel):** los datos viven en Turso. Puedes verlos con `turso db shell fj-car-detail-lealtad`.
- **En tu computadora sin Turso:** un archivo `data/lealtad.sqlite` (con `-wal` y `-shm` junto a él, es normal). La carpeta `data/` está excluida de Git.

**Hacer un respaldo** (de la base configurada en `.env`, sea Turso o el archivo local):

```bash
npm run respaldo                               # → respaldos/lealtad-AAAA-MM-DD-HHMM.json
npm run respaldo -- --destino "/Volumes/USB/respaldos"
```

El archivo JSON contiene todas las tablas (clientes, tarjetas, historial, recompensas, NFC). Guárdalo en un lugar privado: incluye teléfonos y hashes de contraseñas. La carpeta `respaldos/` está excluida de Git.

Turso además guarda su propio historial y permite restaurar la base a un momento anterior (*point-in-time recovery*) desde su panel o con `turso db create nueva --from-db fj-car-detail-lealtad --timestamp …`. Para una copia SQL completa: `turso db shell fj-car-detail-lealtad .dump > respaldo.sql`.

## 11. Seguridad y privacidad

- Contraseñas guardadas con **scrypt** y sal aleatoria; nunca en texto plano.
- Sesiones con identificador aleatorio, cookie `HttpOnly` y `SameSite`, `Secure` en producción; se regeneran al iniciar sesión. Las del negocio vencen a las 12 horas; las de clientes, tras 60 días sin uso.
- Protección CSRF en todos los formularios, límites de intentos de inicio de sesión y registro, y encabezados de seguridad (Helmet, CSP).
- Los QR y las etiquetas NFC usan códigos aleatorios de 144 bits, se pueden revocar y no contienen datos personales.
- Solo se pide nombre, teléfono y contraseña al cliente.

## 12. Estructura

```text
src/
├── server.js              arranque de Express
├── config/                variables de entorno
├── db/                    conexión libSQL (archivo local o Turso), migraciones y sesiones
├── middleware/            sesión, permisos, CSRF, mensajes, límites
├── routes/                auth, customer, business, loyalty
├── services/              reglas de sellos y recompensas, QR/NFC, contraseñas, validación
├── scripts/               crear usuario, cliente de prueba, respaldo
└── views/                 plantillas EJS
api/index.js               entrada para Vercel
vercel.json                configuración de Vercel
public/                    CSS, JS del navegador e imágenes (logo recortado con fondo transparente)
logo/                      logo original (sin modificar)
test/                      prueba automática de punta a punta
```

Tablas principales: `business_users`, `customers`, `loyalty_cards`, `stamp_events`, `rewards`, `nfc_tags` y `audit_log` (operaciones administrativas como NFC, reemplazo de QR y contraseñas temporales).
