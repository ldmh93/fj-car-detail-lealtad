'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const config = require('./config');
const { init } = require('./db');
const DbSessionStore = require('./db/session-store');
const format = require('./services/format');
const { loadUsers } = require('./middleware/auth');
const csrf = require('./middleware/csrf');
const flash = require('./middleware/flash');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.secureCookies ? [] : null,
        },
      },
      // Permite usar la cámara en esta misma app (para escanear QR).
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use((req, res, next) => {
    res.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });

  app.use(express.static(path.join(config.root, 'public'), { maxAge: config.isProduction ? '7d' : 0 }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));

  // La base de datos (migraciones) se prepara una vez por proceso antes de la primera petición.
  app.use(async (req, res, next) => {
    await init();
    next();
  });

  app.use(
    session({
      name: 'lealtad.sid',
      secret: config.sessionSecret,
      store: new DbSessionStore(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        maxAge: config.businessSessionHours * 60 * 60 * 1000,
      },
    })
  );

  app.use((req, res, next) => {
    res.locals.config = config;
    res.locals.fmt = format;
    res.locals.path = req.path;
    res.locals.title = config.businessName;
    res.locals.businessUser = null;
    res.locals.customer = null;
    res.locals.csrfToken = '';
    next();
  });
  app.use(flash);
  app.use(csrf);
  app.use(loadUsers);

  app.get('/', (req, res) => {
    if (req.businessUser) return res.redirect('/panel');
    if (req.customer) return res.redirect('/mi-tarjeta');
    res.render('home', { title: config.businessName });
  });

  app.use(require('./routes/auth'));
  app.use(require('./routes/customer'));
  app.use(require('./routes/business'));
  app.use(require('./routes/loyalty'));

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Página no encontrada',
      message: 'La dirección no existe o cambió.',
      back: '/',
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', {
      title: 'Algo salió mal',
      message: 'Ocurrió un error inesperado. Vuelve a intentarlo en un momento.',
      back: '/',
    });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Tarjetas de lealtad funcionando en http://localhost:${config.port}`);
    console.log(`Enlace público configurado (BASE_URL): ${config.baseUrl}`);
    console.log(`Base de datos: ${config.db.url.startsWith('file:') ? config.db.url.slice(5) : config.db.url}`);
  });
}

module.exports = { createApp };
