'use strict';

// Punto de entrada para Vercel: todas las rutas que no son archivos de public/ llegan aquí.
const { createApp } = require('../src/server');

module.exports = createApp();
